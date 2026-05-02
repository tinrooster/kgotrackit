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

const CAMERA_DEVICE_ID_KEY = "selectedCameraDeviceId";

export function CameraSettingsDialog({ isOpen, onClose }: CameraSettingsDialogProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    const loadDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          toast.error("Camera access is not supported in this environment.");
          setDevices([]);
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          return;
        }
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        stream.getTracks().forEach((t) => t.stop());
        stream = null;

        if (cancelled) return;

        const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoDevices);

        const savedDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || "";
        const stillValid = savedDeviceId && videoDevices.some((d) => d.deviceId === savedDeviceId);
        if (stillValid) {
          setSelectedDeviceId(savedDeviceId);
        } else if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        } else {
          setSelectedDeviceId("");
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
        toast.error("Could not access cameras. Check browser permissions and HTTPS (or localhost).");
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
  }, [isOpen]);

  const handleSave = () => {
    if (!selectedDeviceId) {
      toast.error("Select a camera first.");
      return;
    }
    localStorage.setItem(CAMERA_DEVICE_ID_KEY, selectedDeviceId);
    toast.success("Camera setting saved.");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Camera Settings</DialogTitle>
          <DialogDescription>
            Choose the camera used for barcode and QR scanning in the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="camera-select">Select Camera</Label>
            {devices.length > 0 ? (
              <Select value={selectedDeviceId || undefined} onValueChange={setSelectedDeviceId}>
                <SelectTrigger id="camera-select">
                  <SelectValue placeholder="Select a camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device, index) => (
                    <SelectItem key={device.deviceId || `cam-${index}`} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No cameras found or permission was denied. Allow camera access for this site and try again.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={devices.length === 0 || !selectedDeviceId}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
