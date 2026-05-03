import * as React from 'react';
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryNode, ItemWithSubcategories } from "@/types/inventory";
import { Cabinet } from "@/types/cabinets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import { flattenProjectOptions } from "@/lib/projectOptions";
import {
  getRackOptionsForFlatLocationLabel,
  RACK_LOCATIONS_UPDATED_EVENT,
} from "@/lib/rackLocationsConfig";
import { findLocationByFlatId } from "@/lib/locationOptions";
import { ReqAsterisk } from "@/components/forms/ReqAsterisk";

interface BasicDetailsTabProps {
  form: UseFormReturn<any>;
  categories: CategoryNode[];
  locations: ItemWithSubcategories[];
  cabinets: Cabinet[];
  projects: ItemWithSubcategories[];
  /** When true, item name is not required (e.g. templates — name is set when the template is used). */
  itemNameOptional?: boolean;
  /** Durable inventory record ID (next value on add, or saved `recordId` when editing). */
  inventoryRecordLine?: string | null;
  /** Physical asset tag pattern preview or saved tag (`assetId`). */
  assetTagLine?: string | null;
}

export function BasicDetailsTab({ 
  form, 
  categories = [], 
  locations = [], 
  cabinets = [],
  projects = [],
  itemNameOptional = false,
  inventoryRecordLine = null,
  assetTagLine = null,
}: BasicDetailsTabProps) {
  // Function to get flattened category options with subcategories inline
  const getFlattenedCategoryOptions = React.useMemo(() => {
    const options: { id: string; name: string }[] = [];
    
    categories.forEach(category => {
      // Add the main category
      options.push({ id: category.name, name: category.name });
      
      // Add subcategories if they exist
      if (category.children && category.children.length > 0) {
        category.children.forEach(child => {
          options.push({ 
            id: `${category.name}/${child.name}`, 
            name: `${category.name}/${child.name}` 
          });
        });
      }
    });
    
    return options;
  }, [categories]);

  // Function to get flattened location options with subcategories inline
  const getFlattenedLocationOptions = React.useMemo(() => {
    const options: { id: string; name: string }[] = [];
    
    locations.forEach(location => {
      // Add the main location
      options.push({ id: location.id, name: location.name });
      
      // Add subcategories if they exist
      if (location.children && location.children.length > 0) {
        location.children.forEach(subcat => {
          options.push({ 
            id: `${location.id}/${subcat.id}`, 
            name: `${location.name}/${subcat.name}` 
          });
        });
      }
    });
    
    return options;
  }, [locations]);

  // Filter cabinets based on selected location (handling both direct and subcategory locations)
  const availableCabinets = React.useMemo(() => {
    const locationId = form.watch('location')?.split('/')[0]; // Get the parent location ID
    return cabinets?.filter(cabinet => cabinet.locationId === locationId) || [];
  }, [form.watch('location'), cabinets]);

  const watchedLocationId = form.watch("location");
  const flatLocationLabel = React.useMemo(() => {
    const opt = getFlattenedLocationOptions.find((o) => o.id === watchedLocationId);
    return opt?.name ?? "";
  }, [watchedLocationId, getFlattenedLocationOptions]);
  const [rackConfigEpoch, setRackConfigEpoch] = React.useState(0);
  React.useEffect(() => {
    const onUpdate = () => setRackConfigEpoch((n) => n + 1);
    window.addEventListener(RACK_LOCATIONS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(RACK_LOCATIONS_UPDATED_EVENT, onUpdate);
  }, []);

  const selectedLocationRow = React.useMemo(
    () => findLocationByFlatId(locations, watchedLocationId),
    [locations, watchedLocationId],
  );
  const presetRackOptions = React.useMemo(
    () => getRackOptionsForFlatLocationLabel(flatLocationLabel),
    [flatLocationLabel, rackConfigEpoch],
  );
  const useCustomRacks = selectedLocationRow?.rackLocationEnabled === true;
  const customRackSlots = React.useMemo(() => {
    if (!useCustomRacks || !Array.isArray(selectedLocationRow?.rackSlots)) {
      return null as string[] | null;
    }
    return selectedLocationRow!.rackSlots!.map((s) => String(s).trim()).filter(Boolean);
  }, [useCustomRacks, selectedLocationRow]);
  const rackOptions = React.useMemo(() => {
    if (useCustomRacks) {
      return customRackSlots ?? [];
    }
    return presetRackOptions;
  }, [useCustomRacks, customRackSlots, presetRackOptions]);
  const showRackField = useCustomRacks || presetRackOptions.length > 0;

  const locationComboboxOptions = React.useMemo(
    () =>
      getFlattenedLocationOptions.map((o) => ({
        label: o.name,
        value: o.id,
      })),
    [getFlattenedLocationOptions]
  );

  const rackComboboxOptions = React.useMemo(
    () => rackOptions.map((o) => ({ label: o, value: o })),
    [rackOptions]
  );
  const flattenedProjectOptions = React.useMemo(() => flattenProjectOptions(projects), [projects]);
  const projectComboboxOptions = React.useMemo(
    () => flattenedProjectOptions.map((o) => ({ label: o.name, value: o.id })),
    [flattenedProjectOptions],
  );

  const categoryComboboxOptions = React.useMemo(
    () =>
      getFlattenedCategoryOptions.map((o) => ({
        label: o.name,
        value: o.id,
      })),
    [getFlattenedCategoryOptions],
  );

  return (
    <div className="mx-auto w-full max-w-[56rem] space-y-4">
      {inventoryRecordLine || assetTagLine ? (
        <div className="space-y-1 border-b border-border/40 pb-3 text-xs text-muted-foreground/90">
          {inventoryRecordLine ? (
            <p>
              <span className="font-medium text-muted-foreground">Record ID:</span> {inventoryRecordLine}
            </p>
          ) : null}
          {assetTagLine ? (
            <p>
              <span className="font-medium text-muted-foreground">Asset tag:</span> {assetTagLine}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Name and Description */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {itemNameOptional ? "Item name" : "Name"}
              {!itemNameOptional ? <ReqAsterisk /> : null}
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder="Enter item name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea 
                {...field} 
                placeholder="Enter item description"
                className="min-h-[80px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tablet-friendly: single column on narrow viewports, two columns from md up */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left Column - Category and Project */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Category
                  <ReqAsterisk />
                </FormLabel>
                <Combobox
                  options={categoryComboboxOptions}
                  value={field.value || ""}
                  onChange={(value) => field.onChange(value)}
                  placeholder="Select category"
                  emptyText="No category matches."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="project"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project</FormLabel>
                <Combobox
                  options={[{ label: "None", value: "__none__" }, ...projectComboboxOptions]}
                  value={field.value ? field.value : "__none__"}
                  onChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                  placeholder="Select project"
                  emptyText="No project matches."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assetStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="hot_spare">Hot Spare</SelectItem>
                    <SelectItem value="cold_spare">Cold Spare</SelectItem>
                    <SelectItem value="in_service">In Service</SelectItem>
                    <SelectItem value="ready_decommission">Ready to Decommission</SelectItem>
                    <SelectItem value="slated_removal">Slated for Removal</SelectItem>
                    <SelectItem value="cut_over_pending">Cut-over pending</SelectItem>
                    <SelectItem value="ewaste">E-Waste</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assetTrackingMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground font-normal">Units & tagging</FormLabel>
                <FormControl>
                  <div
                    className="flex flex-col gap-1.5 sm:flex-row sm:gap-2"
                    role="group"
                    aria-label="Single or multiple unit record IDs"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "line_item" ? "secondary" : "ghost"}
                      className={cn(
                        "h-8 justify-start px-3 text-xs font-normal",
                        field.value === "line_item" && "bg-muted"
                      )}
                      onClick={() => field.onChange("line_item")}
                    >
                      Single unit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "per_unit" ? "secondary" : "ghost"}
                      className={cn(
                        "h-8 justify-start px-3 text-xs font-normal",
                        field.value === "per_unit" && "bg-muted"
                      )}
                      onClick={() => field.onChange("per_unit")}
                    >
                      Multiple units
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Right Column - Location and Cabinet */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Location
                  <ReqAsterisk />
                </FormLabel>
                <Combobox
                  options={locationComboboxOptions}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue("cabinet", "");
                    form.setValue("rackLocation", "");
                  }}
                  placeholder="Select location"
                  emptyText="No location matches."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {availableCabinets.length > 0 && (
            <FormField
              control={form.control}
              name="cabinet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cabinet</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select cabinet" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {availableCabinets.map((cabinet) => (
                        <SelectItem key={cabinet.id} value={cabinet.id}>
                          {cabinet.name} {cabinet.isSecure && '🔒'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {showRackField && (
            <FormField
              control={form.control}
              name="rackLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rack location</FormLabel>
                  <Combobox
                    options={rackComboboxOptions}
                    value={field.value || ""}
                    onChange={(v) => field.onChange(v)}
                    placeholder="Select rack or type…"
                    emptyText="No rack matches."
                    allowCustomValue
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
} 