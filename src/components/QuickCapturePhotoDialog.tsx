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
const CAMERA_DEVICE_ID_KEY = "selectedCameraDeviceId";

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
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
        if (!cancelled) {
          setError("Camera API not available in this browser.");
        }
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoInput = devices.some((device) => device.kind === "videoinput");
        if (!hasVideoInput) {
          if (!cancelled) {
            setError("No camera detected on this device.");
          }
          return;
        }
        const preferredDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY);
        const preferredConstraints: MediaStreamConstraints = preferredDeviceId
          ? {
              video: { deviceId: { exact: preferredDeviceId } },
              audio: false,
            }
          : {
              video: { facingMode: { ideal: "environment" } },
              audio: false,
            };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
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
          const errorName =
            err instanceof DOMException
              ? err.name
              : typeof err === "object" && err && "name" in err
                ? String((err as { name?: unknown }).name || "")
                : "";
          if (errorName === "NotAllowedError" || errorName === "SecurityError") {
            setError("Camera permission denied for this site. Allow camera access in browser settings.");
          } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
            setError("Camera is busy or blocked by another app. Close other camera apps and retry.");
          } else {
            setError("No usable camera in this context. You can choose an image file instead.");
          }
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
      <DialogContent
        dismissOnOutsidePointer
        className="z-[70] w-[calc(100vw-0.75rem)] gap-3 p-4 sm:w-auto sm:max-w-md"
      >
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
            {error ? "Choose image instead" : "Pick from files instead"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
