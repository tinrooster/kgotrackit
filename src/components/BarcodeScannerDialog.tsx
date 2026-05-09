import { useEffect, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "sonner";
import { CAMERA_DEVICE_ID_KEY } from "@/components/CameraSettingsDialog";

export interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
  /** When true, do not show the default success toast (caller may provide feedback). */
  quiet?: boolean;
}

/**
 * Same camera pipeline as SimpleBarcodeScanner: respects Settings → saved device id
 * (CAMERA_DEVICE_ID_KEY). The previous html5-qrcode implementation ignored that and
 * often re-prompted for permission inside nested dialogs.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  quiet = false,
}: BarcodeScannerDialogProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  const quietRef = useRef(quiet);
  onScanRef.current = onScan;
  onOpenChangeRef.current = onOpenChange;
  quietRef.current = quiet;

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem(CAMERA_DEVICE_ID_KEY);
    setSelectedDeviceId(saved || undefined);
  }, [open]);

  const { ref } = useZxing({
    constraints: {
      video: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        facingMode: selectedDeviceId ? undefined : "environment",
      },
    },
    paused: !open,
    onDecodeResult(result) {
      const text = result.getText();
      onScanRef.current(text);
      onOpenChangeRef.current(false);
      if (!quietRef.current) {
        toast.success(`Scanned: ${text}`);
      }
    },
    onError(error) {
      if (!error.message.includes("NotFoundException")) {
        toast.error(`Could not use camera: ${error.message}`, {
          description:
            "If you already allowed camera in Settings, try closing this scanner and opening it again. You can also pick a camera under Settings → Configure camera.",
        });
      }
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-scanner-dialog-title"
    >
      <div className="bg-background max-h-[min(90dvh,640px)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 id="barcode-scanner-dialog-title" className="text-lg font-medium">
            Scan code
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            title="Close scanner"
            aria-label="Close scanner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Point at a barcode or QR code. Uses the camera chosen in Settings.
        </p>

        <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
          <video ref={ref} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-0 border-2 border-primary/50">
            <div className="absolute left-0 right-0 top-1/2 border-t-2 border-primary/70" />
            <div className="absolute bottom-0 left-1/2 top-0 border-l-2 border-primary/70" />
          </div>
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
