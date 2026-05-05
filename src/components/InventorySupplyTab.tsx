import * as React from 'react';
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemWithSubcategories } from "@/types/inventory";
import { SupplierWebsiteStatusBlock } from "@/components/SupplierWebsiteStatusBlock";
import { ReqAsterisk } from "@/components/forms/ReqAsterisk";

interface InventorySupplyTabProps {
  form: UseFormReturn<any>;
  units: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
}

export function InventorySupplyTab({ form, units, suppliers }: InventorySupplyTabProps) {
  // Get unit subcategories when a main unit is selected
  const unitSubcategories = React.useMemo(() => {
    const selectedUnit = form.watch('unit');
    const unitItem = units.find(u => u.name === selectedUnit);
    return unitItem?.children || [];
  }, [form.watch('unit'), units]);

  return (
    <div className="mx-auto w-full max-w-[56rem] space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Quantity on left, unit on right */}
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Quantity
                <ReqAsterisk />
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={field.value ?? 0}
                  onFocus={(event) => {
                    // Prevent leading-zero editing (0 + typed digits -> 015) by replacing current value.
                    event.currentTarget.select();
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    field.onChange(raw === '' ? 0 : Number(raw));
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Unit
                <ReqAsterisk />
              </FormLabel>
              <Select
                onValueChange={(value) => {
                  if (value !== field.value) {
                    field.onChange(value);
                    // Clear unit subcategory when main unit changes
                    form.setValue('unitSubcategory', '');
                  }
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.name} value={unit.name}>
                      {unit.name}
                      {unit.children && unit.children.length > 0 && ' (Has Subcategories)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Unit subcategory and minimum quantity */}
        {unitSubcategories.length > 0 && (
          <FormField
            control={form.control}
            name="unitSubcategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Size</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ''}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit size" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {unitSubcategories.map((subUnit: ItemWithSubcategories) => (
                      <SelectItem key={subUnit.name} value={subUnit.name}>
                        {subUnit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="minQuantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minimum Quantity</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  min="0"
                  step="1"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                    field.onChange(val);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Supplier fields */}
        <FormField
          control={form.control}
          name="supplier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supplier</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup.name} value={sup.name}>
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <SupplierWebsiteStatusBlock form={form} suppliers={suppliers} />
      </div>
    </div>
  );
} 