import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { normalizeImageFileToDataUrl, estimateDataUrlBytes } from "@/lib/imageNormalization";

const TARGET_PHOTO_BYTES = 1_800_000;

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
                  void normalizeImageFileToDataUrl(file, {
                    targetBytes: TARGET_PHOTO_BYTES,
                  })
                    .then((normalizedDataUrl) => {
                      const finalBytes = estimateDataUrlBytes(normalizedDataUrl);
                      if (finalBytes > TARGET_PHOTO_BYTES) {
                        toast.error("Image is still too large after compression. Try a smaller photo.");
                        return;
                      }
                      field.onChange(normalizedDataUrl);
                    })
                    .catch(() => {
                      toast.error("Could not process the selected image.");
                    });
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
