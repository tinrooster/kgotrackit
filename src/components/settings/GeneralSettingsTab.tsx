import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Camera } from 'lucide-react';
import {
  DEMO_BROADCAST_ON_AIR_TEMPLATE,
  EMPTY_MAINTENANCE_ON_AIR_SCHEDULE,
  mergeMaintenanceScheduleForApply,
  normalizeMaintenanceTimeListInput,
  type DefaultSettings,
} from '@/lib/settingsService';
import { CAMERA_DEVICE_ID_KEY, CAMERA_SETTINGS_UPDATED_EVENT } from "@/components/CameraSettingsDialog";

interface GeneralSettingsTabProps {
  onOpenCameraSettings: () => void;
  settings: DefaultSettings;
  onSettingsChange: (updates: Partial<DefaultSettings>) => void;
  currentUsername: string;
  canEditAssetTagPrefix: boolean;
  canEditAdminNotificationEmail: boolean;
  /** When set, Apply org template prefers cloud-stored org schedule; otherwise uses {@link DEMO_BROADCAST_ON_AIR_TEMPLATE}. */
  organizationMaintenanceTemplate?: DefaultSettings['maintenanceOnAirSchedule'] | null;
  activeOrganizationId?: string | null;
}

export function GeneralSettingsTab({
  onOpenCameraSettings,
  settings,
  onSettingsChange,
  currentUsername,
  canEditAssetTagPrefix,
  canEditAdminNotificationEmail,
  organizationMaintenanceTemplate = null,
  activeOrganizationId = null,
}: GeneralSettingsTabProps) {
  const scheduleToApplyFromOrg = mergeMaintenanceScheduleForApply(
    organizationMaintenanceTemplate ?? null,
    DEMO_BROADCAST_ON_AIR_TEMPLATE,
  );
  const scheduleDayLabels: Array<{ key: keyof DefaultSettings['maintenanceOnAirSchedule']; label: string }> = [
    { key: 'sunday', label: 'Sunday' },
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
  ];

  const confirmDeletesEnabled = settings.deleteConfirmationByUser?.[currentUsername] ?? true;
  const undoEnabled = settings.undoByUser?.[currentUsername] ?? true;
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance Window Cautions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">Enable maintenance cautions</p>
              <p className="text-xs text-muted-foreground">
                Warn planners when cut-over is scheduled during your selected caution window type.
              </p>
            </div>
            <Switch
              checked={settings.maintenanceCautionsEnabled}
              onCheckedChange={(checked) => onSettingsChange({ maintenanceCautionsEnabled: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance-caution-mode">Caution trigger</Label>
            <Select
              value={settings.maintenanceCautionMode}
              onValueChange={(value: 'on-air' | 'off-air') => onSettingsChange({ maintenanceCautionMode: value })}
            >
              <SelectTrigger id="maintenance-caution-mode" className="w-full md:w-72">
                <SelectValue placeholder="Select caution mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on-air">Warn during ON-AIR windows</SelectItem>
                <SelectItem value="off-air">Warn during OFF-AIR windows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance-programming-block-minutes">Programming block length</Label>
            <Select
              value={String(settings.maintenanceProgrammingBlockMinutes ?? 60)}
              onValueChange={(value) => onSettingsChange({ maintenanceProgrammingBlockMinutes: Number(value) })}
            >
              <SelectTrigger id="maintenance-programming-block-minutes" className="w-full md:w-64">
                <SelectValue placeholder="Select block duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Defaults to 1 hour. Each ON-AIR start time opens a caution window for this duration.
            </p>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">ON-AIR schedule (15-minute format)</p>
            <p className="text-xs text-muted-foreground">
              Enter comma-separated times per day in HH:mm (examples: 05:00, 11:00, 23:00). Values are normalized and invalid entries are ignored.
            </p>
            {activeOrganizationId && !organizationMaintenanceTemplate ? (
              <p className="text-xs text-amber-700 dark:text-amber-500/90">
                No organization template saved yet—Apply org template uses the anonymous demo pattern (Settings → Organization).
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSettingsChange({ maintenanceOnAirSchedule: scheduleToApplyFromOrg })}
              >
                Apply org template
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSettingsChange({ maintenanceOnAirSchedule: { ...EMPTY_MAINTENANCE_ON_AIR_SCHEDULE } })}
              >
                Clear all windows
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {scheduleDayLabels.map((day) => (
                <div key={day.key} className="space-y-1.5">
                  <Label htmlFor={`maintenance-${day.key}`}>{day.label}</Label>
                  <Input
                    id={`maintenance-${day.key}`}
                    value={(settings.maintenanceOnAirSchedule?.[day.key] ?? []).join(', ')}
                    placeholder="05:00, 11:00, 18:00"
                    onChange={(event) =>
                      onSettingsChange({
                        maintenanceOnAirSchedule: {
                          ...settings.maintenanceOnAirSchedule,
                          [day.key]: normalizeMaintenanceTimeListInput(event.target.value),
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
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
