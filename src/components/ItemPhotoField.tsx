import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { normalizeImageFileToDataUrl, estimateDataUrlBytes } from "@/lib/imageNormalization";
import { QuickCapturePhotoDialog } from "@/components/QuickCapturePhotoDialog";

const TARGET_PHOTO_BYTES = 1_800_000;

interface ItemPhotoFieldProps {
  form: UseFormReturn<any>;
  name?: string;
  className?: string;
}

export function ItemPhotoField({ form, name = "photoUrl", className }: ItemPhotoFieldProps) {
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <QuickCapturePhotoDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCapture={(dataUrl) => {
          form.setValue(name, dataUrl, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
        }}
        onFallbackToFiles={() => galleryInputRef.current?.click()}
      />
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className={className}>
            <FormLabel>Photo</FormLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
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
                      form.setValue(name, normalizedDataUrl, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                    })
                    .catch(() => {
                      toast.error("Could not process the selected image.");
                    });
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setCaptureOpen(true)}>
                <Camera className="mr-1.5 h-4 w-4" />
                Take photo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => galleryInputRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" />
                Upload file
              </Button>
              <FormControl>
                <Input {...field} type="hidden" />
              </FormControl>
              {field.value ? (
                <>
                  <img
                    src={field.value}
                    alt=""
                    className="h-16 w-16 rounded border object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => form.setValue(name, "", { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
