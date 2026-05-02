import * as React from 'react';
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryNode, ItemWithSubcategories } from "@/types/inventory";
import { Cabinet } from "@/types/cabinets";
import { FinancialCodeEntry } from '@/lib/financialSettingsService';

interface BasicDetailsTabProps {
  form: UseFormReturn<any>;
  categories: CategoryNode[];
  locations: ItemWithSubcategories[];
  cabinets: Cabinet[];
  projects: ItemWithSubcategories[];
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
}

export function BasicDetailsTab({ 
  form, 
  categories = [], 
  locations = [], 
  cabinets = [],
  projects = [],
  expenseTypes = [],
  costCenters = []
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

  return (
    <div className="space-y-4">
      {/* Name and Description */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name*</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Enter item name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="assetId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Asset Tag</FormLabel>
            <FormControl>
              <Input {...field} value={field.value || ''} placeholder="Auto-assigned asset ID" />
            </FormControl>
            <FormDescription>
              Unique identifier shown with this record.
            </FormDescription>
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

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left Column - Category and Project */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category*</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {getFlattenedCategoryOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select
                  onValueChange={field.onChange}
                  value={field.value || undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <SelectItem value="ewaste">E-Waste</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
                <FormLabel>Location*</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Clear cabinet when location changes
                    form.setValue('cabinet', '');
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {getFlattenedLocationOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <FormDescription>
                    Items in secure cabinets require checkout
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="expenseTypeCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expense Type</FormLabel>
                <Select
                  onValueChange={(value) => {
                    const selected = expenseTypes.find((entry) => entry.code === value);
                    field.onChange(value);
                    form.setValue('expenseTypeDescription', selected?.description || '');
                  }}
                  value={field.value || 'N/A'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select expense type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    {expenseTypes.map((entry) => (
                      <SelectItem key={entry.id} value={entry.code}>
                        {entry.code} - {entry.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="costCenterCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost Center / Allocation</FormLabel>
                <Select
                  onValueChange={(value) => {
                    const selected = costCenters.find((entry) => entry.code === value);
                    field.onChange(value);
                    form.setValue('costCenterDescription', selected?.description || '');
                  }}
                  value={field.value || 'N/A'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cost center" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    {costCenters.map((entry) => (
                      <SelectItem key={entry.id} value={entry.code}>
                        {entry.code} - {entry.description}
                      </SelectItem>
                    ))}
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
                <FormLabel>Asset Tagging Mode</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'line_item'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tagging mode" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="line_item">Single tag for this inventory line (box/case)</SelectItem>
                    <SelectItem value="per_unit">Tag each unit individually</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Use single-tag mode for consumables like tape boxes; per-unit for devices.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
} 