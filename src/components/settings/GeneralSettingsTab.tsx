import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Camera } from 'lucide-react';
import type { DefaultSettings } from '@/lib/settingsService';
import { CAMERA_DEVICE_ID_KEY, CAMERA_SETTINGS_UPDATED_EVENT } from "@/components/CameraSettingsDialog";

interface GeneralSettingsTabProps {
  onOpenCameraSettings: () => void;
  settings: DefaultSettings;
  onSettingsChange: (updates: Partial<DefaultSettings>) => void;
  currentUsername: string;
  canEditAssetTagPrefix: boolean;
  canEditAdminNotificationEmail: boolean;
}

export function GeneralSettingsTab({
  onOpenCameraSettings,
  settings,
  onSettingsChange,
  currentUsername,
  canEditAssetTagPrefix,
  canEditAdminNotificationEmail,
}: GeneralSettingsTabProps) {
  const confirmDeletesEnabled = settings.deleteConfirmationByUser?.[currentUsername] ?? true;
  const undoEnabled = settings.undoByUser?.[currentUsername] ?? true;
  const confirmPlannerListDeletes =
    settings.confirmPlannerListDeletesByUser?.[currentUsername] ?? true;
  const [cameraSummary, setCameraSummary] = React.useState('Checking available cameras...');
  const refreshCameraSummary = React.useCallback(async () => {
    const selectedDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || '';
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraSummary('Camera APIs are unavailable in this environment.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
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
      setCameraSummary('Could not read camera devices. Open Configure Camera to refresh permission.');
    }
  }, []);

  React.useEffect(() => {
    const handleCameraUpdated = () => {
      void refreshCameraSummary();
    };
    void refreshCameraSummary();
    window.addEventListener(CAMERA_SETTINGS_UPDATED_EVENT, handleCameraUpdated);

    return () => {
      window.removeEventListener(CAMERA_SETTINGS_UPDATED_EVENT, handleCameraUpdated);
    };
  }, [refreshCameraSummary]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="theme-follow-system">Follow system appearance</Label>
                <p className="text-xs text-muted-foreground">
                  When off, use the light/dark switch below. When on, match this device’s light/dark mode.
                </p>
              </div>
              <Switch
                id="theme-follow-system"
                checked={settings.theme === 'system'}
                onCheckedChange={(on) => {
                  if (on) {
                    onSettingsChange({ theme: 'system' });
                  } else {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    onSettingsChange({ theme: prefersDark ? 'dark' : 'light' });
                  }
                }}
              />
            </div>
            {settings.theme !== 'system' ? (
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <div className="space-y-0.5">
                  <Label htmlFor="theme-dark-manual">Dark appearance</Label>
                  <p className="text-xs text-muted-foreground">Fixed light or dark theme for this browser.</p>
                </div>
                <Switch
                  id="theme-dark-manual"
                  checked={settings.theme === 'dark'}
                  onCheckedChange={(on) => onSettingsChange({ theme: on ? 'dark' : 'light' })}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">Condensed view</p>
              <p className="text-xs text-muted-foreground">Reduce row height and padding in inventory tables.</p>
            </div>
            <Switch
              checked={settings.condensedView}
              onCheckedChange={(checked) => onSettingsChange({ condensedView: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">Mobile / tablet layout</p>
              <p className="text-xs text-muted-foreground">
                Optimise touch targets and navigation for smartphones and tablets.
              </p>
            </div>
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

          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">Confirm production list deletes</p>
              <p className="text-xs text-muted-foreground">
                Ask before deleting checklist sections, packlist lines, crew rows, or schedule entries in the planner and
                production sheet.
              </p>
            </div>
            <Switch
              checked={confirmPlannerListDeletes}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  confirmPlannerListDeletesByUser: {
                    ...(settings.confirmPlannerListDeletesByUser ?? {}),
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
              onChange={(event) =>
                onSettingsChange({
                  assetIdPrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                })
              }
              className="w-full md:w-64"
              placeholder="AST"
              maxLength={12}
              disabled={!canEditAssetTagPrefix}
            />
            <p className="text-xs text-muted-foreground">
              {canEditAssetTagPrefix
                ? 'Admin setting. Updates affect shared asset tag generation rules.'
                : 'Admin only. Contact an administrator to change global asset tag prefix rules.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-notification-email">Admin notification email</Label>
            <Input
              id="admin-notification-email"
              type="email"
              value={settings.adminNotificationEmail || ''}
              onChange={(event) =>
                onSettingsChange({
                  adminNotificationEmail: event.target.value.trim().toLowerCase(),
                })
              }
              className="w-full md:w-80"
              placeholder="admin-notify@example.com"
              disabled={!canEditAdminNotificationEmail}
            />
            <p className="text-xs text-muted-foreground">
              {canEditAdminNotificationEmail
                ? 'Used for admin-change notification target metadata.'
                : 'Admin only. You can view this value but cannot edit it.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
