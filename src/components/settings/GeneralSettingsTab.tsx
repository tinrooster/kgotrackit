import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Camera } from 'lucide-react';
import type { DefaultSettings } from '@/lib/settingsService';
import { CAMERA_DEVICE_ID_KEY } from "@/components/CameraSettingsDialog";

interface GeneralSettingsTabProps {
  onOpenCameraSettings: () => void;
  settings: DefaultSettings;
  onSettingsChange: (updates: Partial<DefaultSettings>) => void;
  currentUsername: string;
}

export function GeneralSettingsTab({ onOpenCameraSettings, settings, onSettingsChange, currentUsername }: GeneralSettingsTabProps) {
  const confirmDeletesEnabled = settings.deleteConfirmationByUser?.[currentUsername] ?? true;
  const undoEnabled = settings.undoByUser?.[currentUsername] ?? true;
  const [cameraSummary, setCameraSummary] = React.useState('Checking available cameras...');

  React.useEffect(() => {
    let isCancelled = false;

    const refreshCameraSummary = async () => {
      const selectedDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || '';
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameraSummary('Camera APIs are unavailable in this environment.');
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (isCancelled) return;
        const videoInputs = devices.filter((device) => device.kind === 'videoinput');
        if (videoInputs.length === 0) {
          setCameraSummary('No cameras detected. Check permissions and connected devices.');
          return;
        }
        if (!selectedDeviceId) {
          setCameraSummary(`No camera selected. ${videoInputs.length} camera device(s) available.`);
          return;
        }
        const selectedDevice = videoInputs.find((device) => device.deviceId === selectedDeviceId);
        if (!selectedDevice) {
          setCameraSummary(
            `Saved camera is unavailable. ${videoInputs.length} camera device(s) currently detected.`,
          );
          return;
        }
        const selectedLabel = selectedDevice.label || 'Selected camera';
        setCameraSummary(`${selectedLabel} (${videoInputs.length} camera device(s) detected).`);
      } catch {
        if (!isCancelled) {
          setCameraSummary('Could not read camera devices. Open Configure Camera to refresh permission.');
        }
      }
    };

    void refreshCameraSummary();
    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="theme-mode">Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(value: 'light' | 'dark' | 'system') => onSettingsChange({ theme: value })}
            >
              <SelectTrigger id="theme-mode" className="w-full md:w-64">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <p className="font-medium">Condensed view</p>
            <Switch
              checked={settings.condensedView}
              onCheckedChange={(checked) => onSettingsChange({ condensedView: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <p className="font-medium">Mobile / tablet layout</p>
            <Switch
              checked={settings.mobileTabletUi}
              onCheckedChange={(checked) => onSettingsChange({ mobileTabletUi: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Action Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-4">
            <p className="font-medium">Confirm Deletes</p>
            <Switch
              checked={confirmDeletesEnabled}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  deleteConfirmationByUser: {
                    ...(settings.deleteConfirmationByUser ?? {}),
                    [currentUsername]: checked,
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-4">
            <p className="font-medium">Enable Undo</p>
            <Switch
              checked={undoEnabled}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  undoByUser: {
                    ...(settings.undoByUser ?? {}),
                    [currentUsername]: checked,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camera Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{cameraSummary}</p>
          <Button onClick={onOpenCameraSettings} variant="outline">
            <Camera className="h-4 w-4 mr-2" />
            Configure Camera
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset-code-mode">Code Type</Label>
            <Select
              value={settings.assetCodeMode}
              onValueChange={(value: 'qr' | 'barcode' | 'both' | 'none') => onSettingsChange({ assetCodeMode: value })}
            >
              <SelectTrigger id="asset-code-mode" className="w-full md:w-72">
                <SelectValue placeholder="Select code type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qr">QR only</SelectItem>
                <SelectItem value="both">QR + Barcode</SelectItem>
                <SelectItem value="barcode">Barcode only</SelectItem>
                <SelectItem value="none">No code</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-4">
            <p className="font-medium">Auto-assign asset tags</p>
            <Switch
              checked={settings.autoAssignAssetId}
              onCheckedChange={(checked) => onSettingsChange({ autoAssignAssetId: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-id-prefix">Asset tag prefix</Label>
            <Input
              id="asset-id-prefix"
              value={settings.assetIdPrefix || 'AST'}
              onChange={(event) => onSettingsChange({ assetIdPrefix: event.target.value.toUpperCase() })}
              className="w-full md:w-64"
              placeholder="AST"
              maxLength={12}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
