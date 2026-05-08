import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
import { EditItemForm } from "./EditItemForm";
import { InventoryItem, ItemWithSubcategories, CategoryNode } from "@/types/inventory";
import { Cabinet } from "@/types/cabinets";
import { useState } from "react";
import { toast } from "sonner";
import * as React from "react";
import { FinancialCodeEntry } from '@/lib/financialSettingsService';
import { cn } from '@/lib/utils';

interface EditItemDialogProps {
  item: InventoryItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItemData: InventoryItem) => void;
  categories: CategoryNode[];
  units: ItemWithSubcategories[];
  locations: { id: string; name: string; }[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
  cabinets: Cabinet[];
  existingItems: InventoryItem[];
  showMaintenanceCutoverCautions?: boolean;
}

export function EditItemDialog({
  item,
  isOpen,
  onClose,
  onSave,
  categories,
  units,
  locations,
  suppliers,
  projects,
  expenseTypes = [],
  costCenters = [],
  cabinets,
  existingItems,
  showMaintenanceCutoverCautions = true,
}: EditItemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: any) => {
    try {
      setIsSubmitting(true);
      
      // Log the location ID and name for debugging
      const locationObj = locations.find(loc => loc.id === item.location);
      console.log('FORM SUBMIT - Original location:', { 
        id: item.location, 
        name: locationObj?.name
      });
      console.log('FORM SUBMIT - New location value:', values.location);
      
      // If we have a cabinet, get its details
      if (item.cabinet || values.cabinet) {
        const cabinetObj = cabinets.find(cab => cab.id === (values.cabinet || item.cabinet));
        console.log('FORM SUBMIT - Cabinet info:', { 
          id: values.cabinet || item.cabinet,
          name: cabinetObj?.name,
          locationId: cabinetObj?.locationId,
          matchesLocation: cabinetObj?.locationId === values.location
        });
      }
      
      // Create a clean updated item object
      const updatedItem: InventoryItem = {
        ...item, // Start with all original values
        // Carefully merge updates, preserving original values if new values are empty/undefined
        name: values.name ?? item.name,
        description: values.description ?? item.description,
        category: values.category ?? item.category,
        subcategory: values.subcategory ?? item.subcategory,
        unit: values.unit ?? item.unit,
        location: values.location ?? item.location,
        cabinet: values.cabinet ?? item.cabinet,
        quantity: values.quantity !== undefined ? Number(values.quantity) : item.quantity,
        supplier: values.supplier ?? item.supplier,
        supplierWebsite: values.supplierWebsite ?? item.supplierWebsite,
        project: values.project ?? item.project,
        recordId: item.recordId,
        assetId: item.assetId,
        companyAssetTag:
          typeof values.companyAssetTag === "string"
            ? values.companyAssetTag.trim() || undefined
            : item.companyAssetTag,
        assetStatus: values.assetStatus ?? item.assetStatus,
        expenseCode: values.expenseCode ?? item.expenseCode,
        expenseTypeCode: values.expenseTypeCode ?? item.expenseTypeCode,
        expenseTypeDescription: values.expenseTypeDescription ?? item.expenseTypeDescription,
        costCenterCode: values.costCenterCode ?? item.costCenterCode,
        costCenterDescription: values.costCenterDescription ?? item.costCenterDescription,
        assetTrackingMode: values.assetTrackingMode ?? item.assetTrackingMode,
        assetTagEnd: values.assetTagEnd ?? item.assetTagEnd,
        notes:
          typeof values.additionalNotes === "string"
            ? values.additionalNotes.trim() || undefined
            : item.notes,
        manufacturerNotes:
          typeof values.manufacturerNotes === "string"
            ? values.manufacturerNotes.trim() || undefined
            : item.manufacturerNotes,
        additionalNotes:
          typeof values.additionalNotes === "string"
            ? values.additionalNotes.trim() || undefined
            : item.additionalNotes,
        orderStatus: values.orderStatus ?? item.orderStatus,
        deliveryPercentage: values.deliveryPercentage !== undefined ? Number(values.deliveryPercentage) : item.deliveryPercentage,
        expectedDeliveryDate: values.expectedDeliveryDate ?? item.expectedDeliveryDate,
        minQuantity: values.minQuantity !== undefined ? Number(values.minQuantity) : (item.minQuantity ?? 0),
        costPerUnit: values.costPerUnit !== undefined ? Number(values.costPerUnit) : (item.costPerUnit ?? 0),
        barcode: values.barcode ?? item.barcode,
        serialNumber: values.serialNumber ?? item.serialNumber,
        manufacturer: values.manufacturer ?? item.manufacturer,
        modelNumber: values.modelNumber ?? item.modelNumber,
        dateInService: values.dateInService ?? item.dateInService,
        maintenanceNotes: values.maintenanceNotes ?? item.maintenanceNotes,
        unitSubcategory: values.unitSubcategory ?? item.unitSubcategory,
        photoUrl: typeof values.photoUrl === "string" ? values.photoUrl.trim() || undefined : item.photoUrl,
        rackLocation:
          typeof values.rackLocation === "string" ? values.rackLocation.trim() || undefined : item.rackLocation,
        decomEOLDate:
          typeof values.decomEOLDate === "string" ? values.decomEOLDate.trim() || undefined : item.decomEOLDate,
        decomCutoverDate:
          typeof values.decomCutoverDate === "string"
            ? values.decomCutoverDate.trim() || undefined
            : item.decomCutoverDate,
        decomNotes:
          typeof values.decomNotes === "string" ? values.decomNotes.trim() || undefined : item.decomNotes,
        cableColor:
          typeof values.cableColor === "string" ? values.cableColor.trim() || undefined : item.cableColor,
        fiberMode:
          values.fiberMode === "sm" || values.fiberMode === "mm" || values.fiberMode === "mtp_mpo"
            ? values.fiberMode
            : undefined,
        connectorType:
          typeof values.connectorType === "string" ? values.connectorType.trim() || undefined : item.connectorType,
        cableLotNumber:
          typeof values.cableLotNumber === "string"
            ? values.cableLotNumber.trim() || undefined
            : item.cableLotNumber,
        deviceLibraryId:
          typeof values.deviceLibraryId === "string" ? values.deviceLibraryId.trim() || undefined : item.deviceLibraryId,
        lastUpdated: new Date()
      };

      console.log('Original item:', item);
      console.log('Form values:', values);
      console.log('Updated item:', updatedItem);

      await onSave(updatedItem);
      onClose();
    } catch (error) {
      console.error("Error updating item:", error);
      toast.error("Failed to update item");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DraggableDialogContent
        className={cn(
          "w-[min(calc(100vw-1rem),900px)] gap-0 p-0",
          "h-[min(92vh,820px)]",
        )}
        minWidth={360}
        minHeight={300}
      >
        <div className="shrink-0 border-b px-6 pb-4 pt-6">
          <DialogHeader className="space-y-0 p-0 text-left">
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>
              {"Make changes to your inventory item here. Click save when you're done."}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <EditItemForm
            key={item.id}
            item={item}
            onSubmit={handleSubmit}
            onCancel={onClose}
            categories={categories}
            units={units}
            locations={locations}
            suppliers={suppliers}
            projects={projects}
            expenseTypes={expenseTypes}
            costCenters={costCenters}
            cabinets={cabinets}
            isSubmitting={isSubmitting}
            existingItems={existingItems}
            showMaintenanceCutoverCautions={showMaintenanceCutoverCautions}
          />
        </div>
      </DraggableDialogContent>
    </Dialog>
  );
}