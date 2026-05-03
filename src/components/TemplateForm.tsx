import * as React from "react";
import { useState } from "react";
import { useForm, SubmitHandler, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CategoryNode, ItemWithSubcategories, OrderStatus } from "@/types/inventory";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BasicDetailsTab } from "@/components/BasicDetailsTab";
import { InventorySupplyTab } from "@/components/InventorySupplyTab";
import { AdditionalInfoTab } from "@/components/AdditionalInfoTab";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Cabinet } from "@/types/cabinets";
import { ItemTemplate } from "@/types/templates";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { ensureUrlProtocol } from "@/utils/url";
import { getFirstTabWithErrors } from "@/lib/inventoryFormTabs";
import { getTodayDateInputValue, resolveDefaultUnitName } from "@/lib/inventoryFormDefaults";
import { getFinancialSettings } from "@/lib/financialSettingsService";
import { resolveProjectValue } from "@/lib/projectOptions";

const templateFormSchema = z
  .object({
    templateName: z.string().min(1, "Template name is required"),
    name: z.string(),
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
    assetTrackingMode: z.enum(["line_item", "per_unit"]).default("line_item"),
    assetTagEnd: z.string().optional(),
    photoUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name.trim().length > 0 && data.name.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "If provided, item name must be at least 2 characters",
        path: ["name"],
      });
    }
  });

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface TemplateFormProps {
  template?: ItemTemplate;
  onSubmit: (data: ItemTemplate) => void;
  onCancel: () => void;
  categories: CategoryNode[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  cabinets?: Cabinet[];
  projects?: ItemWithSubcategories[];
  isSubmitting?: boolean;
}

export function TemplateForm({
  template,
  onSubmit,
  onCancel,
  categories,
  units,
  locations,
  suppliers,
  cabinets = [],
  projects = [],
  isSubmitting = false,
}: TemplateFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("details");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { expenseTypes, costCenters } = getFinancialSettings();

  const defaultUnit = React.useMemo(() => resolveDefaultUnitName(units), [units]);
  const todayDate = React.useMemo(() => getTodayDateInputValue(), []);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      templateName: template?.templateName || "",
      name: template?.name || "",
      description: template?.description || "",
      category: template?.category || "",
      quantity: template?.quantity ?? 0,
      unit: template?.unit || defaultUnit,
      unitSubcategory: template?.unitSubcategory || "",
      location: template?.location || "",
      locationSubcategory: template?.locationSubcategory || "",
      cabinet: template?.cabinet || "",
      project: resolveProjectValue(template?.project, projects),
      minQuantity: template?.minQuantity ?? 0,
      costPerUnit: template?.costPerUnit ?? 0,
      barcode: template?.barcode || "",
      serialNumber: template?.serialNumber || "",
      manufacturer: template?.manufacturer || "",
      modelNumber: template?.modelNumber || "",
      dateInService: template?.dateInService
        ? String(template.dateInService).slice(0, 10)
        : todayDate,
      manufacturerNotes: "",
      maintenanceNotes: template?.maintenanceNotes || "",
      additionalNotes: template?.notes || "",
      supplier: template?.supplier || "",
      supplierWebsite: template?.supplierWebsite || "",
      assetStatus: template?.assetStatus || "active",
      expenseCode: template?.expenseCode || "",
      expenseTypeCode: template?.expenseTypeCode || "N/A",
      expenseTypeDescription: template?.expenseTypeDescription || "",
      costCenterCode: template?.costCenterCode || "N/A",
      costCenterDescription: template?.costCenterDescription || "",
      companyAssetTag: template?.companyAssetTag || "",
      assetTrackingMode: template?.assetTrackingMode || "line_item",
      assetTagEnd: template?.assetTagEnd || "",
      photoUrl: template?.photoUrl || "",
    },
  });

  React.useEffect(() => {
    if (!template && defaultUnit && !form.getValues("unit")) {
      form.setValue("unit", defaultUnit);
    }
  }, [defaultUnit, template, form]);

  const handleScanResult = (result: string) => {
    form.setValue("barcode", result);
    toast({
      title: "Barcode Scanned",
      description: `Successfully scanned barcode: ${result}`,
    });
    setIsScannerOpen(false);
  };

  const handleInvalid = (errors: FieldErrors<TemplateFormData>) => {
    const tab = getFirstTabWithErrors(errors);
    if (tab) {
      setActiveTab(tab);
    }
    toast({
      title: "Check all tabs",
      description:
        "Some required or invalid fields are on another tab. Switched to the first tab that needs attention.",
      variant: "destructive",
    });
  };

  const handleSubmit: SubmitHandler<TemplateFormData> = (data) => {
    const supplierWebsite = data.supplierWebsite
      ? ensureUrlProtocol(data.supplierWebsite)
      : "";

    const templateData: ItemTemplate = {
      templateId: template?.templateId || crypto.randomUUID(),
      templateName: data.templateName.trim(),
      name: data.name.trim(),
      description: data.description || "",
      category: data.category,
      unit: data.unit,
      unitSubcategory: data.unitSubcategory || "",
      quantity: data.quantity ?? 0,
      minQuantity: data.minQuantity ?? 0,
      reorderLevel: template?.reorderLevel ?? 0,
      location: data.location,
      locationSubcategory: data.locationSubcategory || "",
      cabinet: data.cabinet === "none" ? "" : data.cabinet || "",
      supplier: data.supplier || "",
      supplierWebsite,
      notes: data.additionalNotes || "",
      orderStatus: template?.orderStatus || OrderStatus.PENDING,
      costPerUnit: data.costPerUnit ?? 0,
      price: template?.price ?? 0,
      barcode: data.barcode || "",
      project: data.project === "none" ? "" : data.project || "",
      deliveryPercentage: template?.deliveryPercentage ?? 0,
      companyAssetTag: data.companyAssetTag?.trim() || "",
      assetStatus: (data.assetStatus || "active") as ItemTemplate["assetStatus"],
      expenseCode: data.expenseCode || "",
      expenseTypeCode: data.expenseTypeCode === "N/A" ? undefined : data.expenseTypeCode,
      expenseTypeDescription: data.expenseTypeDescription || "",
      costCenterCode: data.costCenterCode === "N/A" ? undefined : data.costCenterCode,
      costCenterDescription: data.costCenterDescription || "",
      assetTrackingMode: data.assetTrackingMode,
      assetTagEnd: data.assetTagEnd || "",
      serialNumber: data.serialNumber || "",
      manufacturer: data.manufacturer || "",
      modelNumber: data.modelNumber || "",
      dateInService: data.dateInService || undefined,
      maintenanceNotes: data.maintenanceNotes || "",
      photoUrl: data.photoUrl?.trim() || undefined,
      qrCode: template?.qrCode,
      customFields: template?.customFields,
    };

    onSubmit(templateData);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit, handleInvalid)}
        className="flex flex-col gap-4"
      >
        <div className="shrink-0 border-b pb-4">
          <FormField
            control={form.control}
            name="templateName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Template Name*</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter template name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            <TabsTrigger value="details">Item Details</TabsTrigger>
            <TabsTrigger value="inventory">Inventory & Supply</TabsTrigger>
            <TabsTrigger value="additional">Additional Info</TabsTrigger>
          </TabsList>

          <TabsContent
            value="details"
            className="mt-0 min-h-[min(22rem,50vh)] space-y-4"
          >
            <BasicDetailsTab
              form={form}
              categories={categories}
              locations={locations}
              cabinets={cabinets}
              projects={projects}
              itemNameOptional
            />
          </TabsContent>

          <TabsContent
            value="inventory"
            className="mt-0 min-h-[min(22rem,50vh)] space-y-4"
          >
            <InventorySupplyTab form={form} units={units} suppliers={suppliers} />
          </TabsContent>

          <TabsContent
            value="additional"
            className="mt-0 min-h-[min(22rem,50vh)] space-y-4"
          >
            <AdditionalInfoTab
              form={form}
              onScanBarcode={() => setIsScannerOpen(true)}
              expenseTypes={expenseTypes}
              costCenters={costCenters}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex shrink-0 justify-end space-x-2 border-t pt-4">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? "Update Template" : "Create Template"}
          </Button>
        </div>
      </form>

      <BarcodeScannerDialog open={isScannerOpen} onOpenChange={setIsScannerOpen} onScan={handleScanResult} />
    </Form>
  );
}
