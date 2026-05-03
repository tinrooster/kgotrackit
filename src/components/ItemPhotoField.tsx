import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_FILE_BYTES = 1_800_000;

interface ItemPhotoFieldProps {
  form: UseFormReturn<any>;
  name?: string;
  className?: string;
}

export function ItemPhotoField({ form, name = "photoUrl", className }: ItemPhotoFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>Photo</FormLabel>
          <div className="flex flex-wrap items-center gap-3">
            <FormControl>
              <Input
                type="file"
                accept="image/*"
                className="max-w-xs cursor-pointer"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > MAX_FILE_BYTES) {
                    toast.error("Image is too large (max ~1.7 MB).");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result;
                    field.onChange(typeof result === "string" ? result : "");
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </FormControl>
            {field.value ? (
              <>
                <img
                  src={field.value}
                  alt=""
                  className="h-16 w-16 rounded border object-cover"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => field.onChange("")}>
                  Remove
                </Button>
              </>
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
