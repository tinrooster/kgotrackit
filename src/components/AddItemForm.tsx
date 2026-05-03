"use client";

import * as React from 'react';
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InventoryItem, OrderStatus, CategoryNode, ItemWithSubcategories } from "@/types/inventory";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { BasicDetailsTab } from "@/components/BasicDetailsTab";
import { InventorySupplyTab } from "@/components/InventorySupplyTab";
import { AdditionalInfoTab } from "@/components/AdditionalInfoTab";
import { DecommissioningTab } from "@/components/DecommissioningTab";
import { Cabinet } from "@/types/cabinets";
import { ensureUrlProtocol } from "@/utils/url";
import { FinancialCodeEntry } from '@/lib/financialSettingsService';
import { getFirstTabWithErrors } from "@/lib/inventoryFormTabs";
import { getTodayDateInputValue, resolveDefaultUnitName } from "@/lib/inventoryFormDefaults";
import type { FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { previewNextRecordId, previewNextAssetTags } from "@/lib/inventoryIdGeneration";

// Define the form schema
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  quantity: z.number().min(0, "Quantity must be 0 or greater"),
  unit: z.string().min(1, "Unit is required"),
  unitSubcategory: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  locationSubcategory: z.string().optional(),
  cabinet: z.string().optional(),
  project: z.string().optional(),
  minQuantity: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  barcode: z.string().optional(),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  dateInService: z.string().optional(),
  manufacturerNotes: z.string().optional(),
  maintenanceNotes: z.string().optional(),
  additionalNotes: z.string().optional(),
  supplier: z.string().optional(),
  supplierWebsite: z.union([z.string().url(), z.literal(""), z.undefined()]).optional(),
  assetStatus: z.string().optional(),
  expenseCode: z.string().optional(),
  expenseTypeCode: z.string().optional(),
  expenseTypeDescription: z.string().optional(),
  costCenterCode: z.string().optional(),
  costCenterDescription: z.string().optional(),
  companyAssetTag: z.string().optional(),
  assetTrackingMode: z.enum(['line_item', 'per_unit']).default('line_item'),
  assetTagEnd: z.string().optional(),
  photoUrl: z.string().optional(),
  rackLocation: z.string().optional(),
  decomEOLDate: z.string().optional(),
  decomCutoverDate: z.string().optional(),
  decomLastAuditAt: z.string().optional(),
  decomNotes: z.string().optional(),
  cableColor: z.string().optional(),
  fiberMode: z.enum(['sm', 'mm', 'na', 'mtp_mpo']).default('na'),
  connectorType: z.string().optional(),
  cableLotNumber: z.string().optional(),
  deviceLibraryId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Location extends ItemWithSubcategories {
  id: string;
  name: string;
}

interface AddItemFormProps {
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  categories: CategoryNode[];
  units: ItemWithSubcategories[];
  locations: Location[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
  cabinets: Cabinet[];
  isSubmitting?: boolean;
  initialValues?: Partial<FormValues>;
  existingItems?: InventoryItem[];
  existingManufacturers?: string[];
  existingSuppliers?: string[];
  existingProjects?: string[];
}

export function AddItemForm({
  onSubmit,
  onCancel,
  categories,
  units,
  locations,
  suppliers,
  projects,
  expenseTypes = [],
  costCenters = [],
  cabinets,
  isSubmitting = false,
  initialValues,
  existingItems = [],
  existingManufacturers = [],
  existingSuppliers = [],
  existingProjects = []
}: AddItemFormProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const defaultUnit = React.useMemo(() => resolveDefaultUnitName(units), [units]);
  const todayDate = React.useMemo(() => getTodayDateInputValue(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...(initialValues?.expenseCode && !initialValues?.expenseTypeCode
        ? {
            expenseTypeCode: String(initialValues.expenseCode).split(' - ')[0] || "",
            expenseTypeDescription: String(initialValues.expenseCode).split(' - ').slice(1).join(' - ') || "",
          }
        : {}),
      name: initialValues?.name || "",
      description: initialValues?.description || "",
      category: initialValues?.category || "",
      quantity: initialValues?.quantity ?? 1,
      unit: initialValues?.unit || defaultUnit,
      unitSubcategory: initialValues?.unitSubcategory || "",
      location: initialValues?.location || "",
      locationSubcategory: initialValues?.locationSubcategory || "",
      cabinet: initialValues?.cabinet || "",
      project: initialValues?.project || "",
      minQuantity: initialValues?.minQuantity || 0,
      costPerUnit: initialValues?.costPerUnit || 0,
      barcode: initialValues?.barcode || "",
      serialNumber: initialValues?.serialNumber || "",
      manufacturer: initialValues?.manufacturer || "",
      modelNumber: initialValues?.modelNumber || "",
      dateInService:
        initialValues?.dateInService !== undefined && initialValues.dateInService !== ""
          ? String(initialValues.dateInService).slice(0, 10)
          : todayDate,
      manufacturerNotes: initialValues?.manufacturerNotes || "",
      maintenanceNotes: initialValues?.maintenanceNotes || "",
      additionalNotes: initialValues?.additionalNotes || "",
      supplier: initialValues?.supplier || "",
      supplierWebsite: initialValues?.supplierWebsite || "",
      assetStatus: initialValues?.assetStatus || "active",
      expenseCode: initialValues?.expenseCode || "",
      expenseTypeCode: initialValues?.expenseTypeCode || "N/A",
      expenseTypeDescription: initialValues?.expenseTypeDescription || "",
      costCenterCode: initialValues?.costCenterCode || "N/A",
      costCenterDescription: initialValues?.costCenterDescription || "",
      companyAssetTag: initialValues?.companyAssetTag || "",
      assetTrackingMode: initialValues?.assetTrackingMode || "line_item",
      assetTagEnd: initialValues?.assetTagEnd || "",
      photoUrl: initialValues?.photoUrl || "",
      rackLocation: initialValues?.rackLocation || "",
      decomEOLDate: initialValues?.decomEOLDate || "",
      decomCutoverDate: initialValues?.decomCutoverDate || "",
      decomLastAuditAt: initialValues?.decomLastAuditAt || "",
      decomNotes: initialValues?.decomNotes || "",
      cableColor: initialValues?.cableColor || "",
      fiberMode:
        initialValues?.fiberMode === 'sm' ||
        initialValues?.fiberMode === 'mm' ||
        initialValues?.fiberMode === 'na' ||
        initialValues?.fiberMode === 'mtp_mpo'
          ? initialValues.fiberMode
          : 'na',
      connectorType: initialValues?.connectorType || "",
      cableLotNumber: initialValues?.cableLotNumber || "",
      deviceLibraryId: initialValues?.deviceLibraryId || "",
    },
  });

  const quantityW = useWatch({ control: form.control, name: "quantity" });
  const trackingW = useWatch({ control: form.control, name: "assetTrackingMode" });
  const dateInServiceW = useWatch({ control: form.control, name: "dateInService" });
  const inventoryRecordLine = previewNextRecordId();
  const assetTagLine = React.useMemo(() => {
    const q = typeof quantityW === "number" && !Number.isNaN(quantityW) ? quantityW : 1;
    const mode = trackingW === "per_unit" ? "per_unit" : "line_item";
    return previewNextAssetTags(
      dateInServiceW !== undefined && dateInServiceW !== ""
        ? String(dateInServiceW).slice(0, 10)
        : undefined,
      q,
      mode
    ).line;
  }, [quantityW, trackingW, dateInServiceW]);

  const handleScanResult = (result: string) => {
    form.setValue("barcode", result);
    toast.success(`Barcode scanned: ${result}`);
    setIsScannerOpen(false);
  };

  const onSubmitForm = async (values: FormValues) => {
    try {
      const processedValues = {
        ...values,
        supplierWebsite: values.supplierWebsite ? ensureUrlProtocol(values.supplierWebsite) : "",
        companyAssetTag: values.companyAssetTag?.trim() || undefined,
        photoUrl: values.photoUrl?.trim() || undefined,
        rackLocation: values.rackLocation?.trim() || undefined,
        decomEOLDate: values.decomEOLDate?.trim() || undefined,
        decomCutoverDate: values.decomCutoverDate?.trim() || undefined,
        decomLastAuditAt: values.decomLastAuditAt?.trim() || undefined,
        decomNotes: values.decomNotes?.trim() || undefined,
        cableColor: values.cableColor?.trim() || undefined,
        fiberMode: values.fiberMode !== 'na' ? values.fiberMode : undefined,
        connectorType: values.connectorType?.trim() || undefined,
        cableLotNumber: values.cableLotNumber?.trim() || undefined,
        deviceLibraryId: values.deviceLibraryId?.trim() || undefined,
      };

      await onSubmit(processedValues);
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error("Failed to submit form");
    }
  };

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    const tab = getFirstTabWithErrors(errors);
    if (tab) {
      setActiveTab(tab);
    }
    toast.error("Check all tabs", {
      description:
        "Some required or invalid fields may be on another tab. Switched to the first tab that needs attention.",
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmitForm, onInvalid)} className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-0">
            <TabsTrigger value="details" className="px-1.5 text-xs sm:px-3 sm:text-sm">
              <span className="hidden sm:inline">Item Details</span>
              <span className="sm:hidden">Details</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="px-1.5 text-xs sm:px-3 sm:text-sm">
              <span className="hidden sm:inline">Inventory &amp; Supply</span>
              <span className="sm:hidden">Supply</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="px-1.5 text-xs sm:px-3 sm:text-sm">
              <span className="hidden sm:inline">Additional Info</span>
              <span className="sm:hidden">More</span>
            </TabsTrigger>
            <TabsTrigger value="decommissioning" className="px-1.5 text-xs sm:px-3 sm:text-sm" title="EOL / decommissioning">
              <span className="sm:hidden">EOL</span>
              <span className="hidden sm:inline">EOL · Decommissioning</span>
              <span className="sm:hidden">EOL</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <BasicDetailsTab
              form={form}
              categories={categories}
              locations={locations}
              cabinets={cabinets}
              projects={projects}
              inventoryRecordLine={inventoryRecordLine}
              assetTagLine={assetTagLine}
            />
          </TabsContent>

          <TabsContent value="inventory">
            <InventorySupplyTab 
              form={form} 
              units={units}
              suppliers={suppliers}
            />
          </TabsContent>

          <TabsContent value="additional" className="mt-4">
            <AdditionalInfoTab
              form={form}
              onScanBarcode={() => setIsScannerOpen(true)}
              expenseTypes={expenseTypes}
              costCenters={costCenters}
              supplierNames={suppliers.map((s) => s.name)}
              unitNames={units.map((u) => u.name)}
            />
          </TabsContent>

          <TabsContent value="decommissioning" className="mt-4">
            <DecommissioningTab form={form} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Item
          </Button>
        </div>
      </form>

      <BarcodeScannerDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onScan={handleScanResult}
      />
    </Form>
  );
}