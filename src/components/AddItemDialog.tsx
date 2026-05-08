import { useEffect, useRef, useState } from "react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
import { AddItemForm } from "@/components/AddItemForm";
import { InventoryItem, CategoryNode, ItemWithSubcategories } from "@/types/inventory";
import { getTemplates } from "@/lib/storageService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ItemTemplate } from "@/types/templates";
import { FinancialCodeEntry } from "@/lib/financialSettingsService";
import { Cabinet } from "@/types/cabinets";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveProjectValue } from "@/lib/projectOptions";

interface AddItemDialogProps {
  onSubmit: (item: Omit<InventoryItem, "id" | "lastUpdated">) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryNode[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
  selectedTemplate?: ItemTemplate | null;
  existingItems: InventoryItem[];
  cabinets?: Cabinet[];
  showMaintenanceCutoverCautions?: boolean;
}

function buildValuesFromTemplate(
  selected: ItemTemplate,
  suppliers: ItemWithSubcategories[],
  locations: ItemWithSubcategories[],
  units: ItemWithSubcategories[],
  projects: ItemWithSubcategories[]
): Partial<Omit<InventoryItem, "id" | "lastUpdated">> {
  const supplierMatch = suppliers.find((s) => s.name === selected.supplier);
  const locationMatch = locations.find((l) => l.id === selected.location);
  const unitMatch = units.find((u) => u.name === selected.unit);
  return {
    name: selected.name,
    description: selected.description,
    quantity: 0,
    minQuantity: selected.minQuantity,
    unit: unitMatch ? unitMatch.name : "",
    costPerUnit: selected.costPerUnit,
    category: selected.category,
    location: locationMatch ? locationMatch.id : "",
    supplier: supplierMatch ? supplierMatch.name : "",
    supplierWebsite: selected.supplierWebsite,
    project: resolveProjectValue(selected.project, projects),
    dateInService: selected.dateInService
      ? String(selected.dateInService).slice(0, 10)
      : undefined,
    assetStatus: selected.assetStatus,
    expenseCode: selected.expenseCode,
    expenseTypeCode: selected.expenseTypeCode,
    expenseTypeDescription: selected.expenseTypeDescription,
    costCenterCode: selected.costCenterCode,
    costCenterDescription: selected.costCenterDescription,
    assetTrackingMode: selected.assetTrackingMode,
    assetTagEnd: selected.assetTagEnd,
    companyAssetTag: selected.companyAssetTag,
    photoUrl: selected.photoUrl,
    notes: selected.notes,
    orderStatus: selected.orderStatus,
    deliveryPercentage: selected.deliveryPercentage,
    cableColor: selected.cableColor,
    fiberMode: selected.fiberMode,
    connectorType: selected.connectorType,
    cableLotNumber: selected.cableLotNumber,
  };
}

export function AddItemDialog({
  open,
  onOpenChange,
  onSubmit,
  categories,
  units,
  locations,
  suppliers,
  projects,
  expenseTypes = [],
  costCenters = [],
  selectedTemplate: externalSelectedTemplate,
  existingItems,
  cabinets = [],
  showMaintenanceCutoverCautions = true,
}: AddItemDialogProps) {
  const [templates, setTemplates] = useState<ItemTemplate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<
    Partial<Omit<InventoryItem, "id" | "lastUpdated">> | undefined
  >(undefined);
  const [formInstanceKey, setFormInstanceKey] = useState(0);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplateName, setPendingTemplateName] = useState<string>("");

  useEffect(() => {
    if (!open) {
      return;
    }
    try {
      const loadedTemplates = getTemplates();
      if (Array.isArray(loadedTemplates)) {
        const validTemplates = loadedTemplates
          .map((template) => {
            if (typeof template === "object" && template !== null && template.templateName) {
              return template as ItemTemplate;
            }
            return null;
          })
          .filter((t): t is ItemTemplate => t !== null);
        setTemplates(validTemplates);
      } else {
        setTemplates([]);
      }
    } catch {
      toast.error("Failed to load templates");
      setTemplates([]);
    }
  }, [open]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setPendingTemplateName("");
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      if (externalSelectedTemplate) {
        setFormValues(
          buildValuesFromTemplate(externalSelectedTemplate, suppliers, locations, units, projects)
        );
      } else {
        setFormValues(undefined);
      }
      setFormInstanceKey((k) => k + 1);
      setTemplatePickerOpen(false);
    }

    setPendingTemplateName((prev) => {
      if (prev && templates.some((t) => t.templateName === prev)) {
        return prev;
      }
      return templates[0]?.templateName ?? "";
    });
  }, [open, externalSelectedTemplate, suppliers, locations, units, projects, templates]);

  const applySelectedTemplate = () => {
    const picked = templates.find((t) => t.templateName === pendingTemplateName);
    if (!picked) {
      toast.error("Choose a template first");
      return;
    }
    const newFormValues = buildValuesFromTemplate(picked, suppliers, locations, units, projects);
    setFormValues(newFormValues);
    setFormInstanceKey((k) => k + 1);
    setTemplatePickerOpen(false);
    toast.success(`Template "${picked.templateName}" applied to the form below.`);
  };

  const handleSubmit = async (values: Omit<InventoryItem, "id" | "lastUpdated">) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to add item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDialogOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setTemplatePickerOpen(false);
      setPendingTemplateName("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange} modal={false}>
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
            <DialogTitle>Add New Inventory Item</DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20">
              <button
                type="button"
                onClick={() => setTemplatePickerOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
              >
                <span>Start from a template</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    templatePickerOpen && "rotate-180"
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  templatePickerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden min-h-0">
                  <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-2">
                    {templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No templates.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="template-select">Template</Label>
                          <Select
                            value={pendingTemplateName || undefined}
                            onValueChange={setPendingTemplateName}
                          >
                            <SelectTrigger id="template-select">
                              <SelectValue placeholder="Choose a template" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map((template) => (
                                <SelectItem key={template.templateId} value={template.templateName}>
                                  {template.templateName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" className="w-full sm:w-auto" onClick={applySelectedTemplate}>
                          Apply template to form
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <AddItemForm
              key={formInstanceKey}
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
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
              initialValues={formValues}
              showMaintenanceCutoverCautions={showMaintenanceCutoverCautions}
            />
          </div>
        </div>
      </DraggableDialogContent>
    </Dialog>
  );
}
