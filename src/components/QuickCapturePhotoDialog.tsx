"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import { toast } from "sonner";

const MAX_DATA_URL_CHARS = 2_400_000;

interface QuickCapturePhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string) => void;
  /** If camera cannot be opened, offer to pick a file instead. */
  onFallbackToFiles?: () => void;
}

export function QuickCapturePhotoDialog({
  open,
  onOpenChange,
  onCapture,
  onFallbackToFiles,
}: QuickCapturePhotoDialogProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setReady(false);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setError("Camera API not available in this browser.");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("No usable camera or permission denied.");
          toast.error("Could not open camera. Use “Choose image” to pick a file.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [open]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("Camera not ready yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const maxW = 1280;
    let cw = vw;
    let ch = vh;
    if (vw > maxW) {
      cw = maxW;
      ch = Math.round(vh * (maxW / vw));
    }
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cw, ch);

    let quality = 0.88;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.35) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onCapture(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Take photo
          </DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
        </div>
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Align the item, then capture. If you have no camera, use{" "}
            <strong>Choose image</strong> on the quick-add form.
          </p>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full"
            disabled={!ready || !!error}
            onClick={handleCapture}
          >
            Use this photo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              onOpenChange(false);
              onFallbackToFiles?.();
            }}
          >
            Pick from files instead
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
