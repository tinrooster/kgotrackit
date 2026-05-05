import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";

interface CameraSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CAMERA_DEVICE_ID_KEY = "selectedCameraDeviceId";

export function CameraSettingsDialog({ isOpen, onClose }: CameraSettingsDialogProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    const loadDevices = async () => {
      try {
        setLoadError(null);
        if (!navigator.mediaDevices?.enumerateDevices) {
          setLoadError("Camera access is not supported in this environment.");
          setDevices([]);
          return;
        }

        // Enumerate first so we can still show camera count if permission is currently blocked.
        let allDevices = await navigator.mediaDevices.enumerateDevices();
        let videoDevices = allDevices.filter((d) => d.kind === "videoinput");

        // If labels/ids are missing, try permission once to unlock full device metadata.
        const needsPermissionRefresh = videoDevices.some((device) => !device.label || !device.deviceId);
        if (needsPermissionRefresh) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            allDevices = await navigator.mediaDevices.enumerateDevices();
            videoDevices = allDevices.filter((d) => d.kind === "videoinput");
          } catch (permissionError) {
            console.warn("Camera permission not granted yet:", permissionError);
            setLoadError(
              "Cameras were detected, but permission is required to select a specific camera. Allow camera access and reopen this dialog.",
            );
          } finally {
            if (stream) {
              stream.getTracks().forEach((t) => t.stop());
              stream = null;
            }
          }
        }

        if (cancelled) return;

        setDevices(videoDevices);
        const selectableDevices = videoDevices.filter((device) => !!device.deviceId);

        const savedDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || "";
        const stillValid = savedDeviceId && selectableDevices.some((d) => d.deviceId === savedDeviceId);
        if (stillValid) {
          setSelectedDeviceId(savedDeviceId);
        } else if (selectableDevices.length > 0) {
          setSelectedDeviceId(selectableDevices[0].deviceId);
        } else {
          setSelectedDeviceId("");
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
        setLoadError("Could not access cameras. Check browser permissions and HTTPS (or localhost).");
        setDevices([]);
        setSelectedDeviceId("");
      } finally {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
      }
    };

    void loadDevices();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, reloadToken]);

  const handleSave = () => {
    if (!selectedDeviceId) {
      toast.error("Select a camera first.");
      return;
    }
    if (!devices.some((device) => device.deviceId === selectedDeviceId)) {
      toast.error("Selected camera is no longer available. Reopen camera settings and select again.");
      return;
    }
    localStorage.setItem(CAMERA_DEVICE_ID_KEY, selectedDeviceId);
    toast.success("Camera setting saved.");
    onClose();
  };

  const selectableDevices = devices.filter((device) => !!device.deviceId);
  const hasDetectedButNotSelectable = devices.length > 0 && selectableDevices.length === 0;
  const shouldShowRetry = !!loadError || hasDetectedButNotSelectable || selectableDevices.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-0.75rem)] sm:w-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Camera Settings</DialogTitle>
          <DialogDescription>
            Choose the camera used for barcode and QR scanning in the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="camera-select">Select Camera</Label>
            {selectableDevices.length > 0 ? (
              <Select value={selectedDeviceId || undefined} onValueChange={setSelectedDeviceId}>
                <SelectTrigger id="camera-select">
                  <SelectValue placeholder="Select a camera" />
                </SelectTrigger>
                <SelectContent>
                  {selectableDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasDetectedButNotSelectable
                  ? "Cameras are detected, but permission is required before a camera can be selected."
                  : loadError ?? "No cameras found or permission was denied. Allow camera access for this site and try again."}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          {shouldShowRetry ? (
            <Button
              variant="ghost"
              onClick={() => setReloadToken((previousValue) => previousValue + 1)}
            >
              Retry / Grant Permission
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={selectableDevices.length === 0 || !selectedDeviceId}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
