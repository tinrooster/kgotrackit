import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
}

function createReaderElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `trackit-qr-${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `trackit-qr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function BarcodeScannerDialog({ open, onOpenChange, onScan }: BarcodeScannerDialogProps) {
  const readerElementIdRef = useRef(createReaderElementId());
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);

  onScanRef.current = onScan;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) {
      return;
    }

    const elementId = readerElementIdRef.current;
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      const host = document.getElementById(elementId);
      if (!host) {
        toast.error("Scanner could not start (missing camera area). Try again.");
        onOpenChangeRef.current(false);
        return;
      }

      try {
        const scanner = new Html5QrcodeScanner(
          elementId,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );
        scannerRef.current = scanner;
        scanner.render(
          (decodedText: string) => {
            try {
              scanner.clear();
            } catch {
              // ignore teardown errors
            }
            scannerRef.current = null;
            onScanRef.current(decodedText);
            onOpenChangeRef.current(false);
          },
          () => {
            // Frequent while framing; do not toast.
          }
        );
      } catch (error) {
        console.error("BarcodeScannerDialog:", error);
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Could not start camera scanner.", {
          description: message || "Check permissions and HTTPS, then retry.",
        });
        onOpenChangeRef.current(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try {
        scannerRef.current?.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
      const host = document.getElementById(elementId);
      if (host) host.innerHTML = "";
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissOnOutsidePointer className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Scan code</DialogTitle>
          <DialogDescription>Allow camera access when prompted. Point at a QR or barcode.</DialogDescription>
        </DialogHeader>
        <div
          id={readerElementIdRef.current}
          className="min-h-[280px] w-full overflow-hidden rounded-md border bg-muted/30"
        />
      </DialogContent>
    </Dialog>
  );
}
