import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Camera } from 'lucide-react';
import type { DefaultSettings } from '@/lib/settingsService';

interface GeneralSettingsTabProps {
  onOpenCameraSettings: () => void;
  settings: DefaultSettings;
  onSettingsChange: (updates: Partial<DefaultSettings>) => void;
  currentUsername: string;
}

export function GeneralSettingsTab({ onOpenCameraSettings, settings, onSettingsChange, currentUsername }: GeneralSettingsTabProps) {
  const confirmDeletesEnabled = settings.deleteConfirmationByUser?.[currentUsername] ?? true;
  const undoEnabled = settings.undoByUser?.[currentUsername] ?? true;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
          <CardDescription>Configure density and theme behavior across the app.</CardDescription>
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

          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium">Condensed View</p>
              <p className="text-sm text-muted-foreground">
                Reduce row height and spacing in list/table-heavy screens.
              </p>
            </div>
            <Switch
              checked={settings.condensedView}
              onCheckedChange={(checked) => onSettingsChange({ condensedView: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Action Preferences</CardTitle>
          <CardDescription>Preferences for @{currentUsername}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium">Confirm Deletes</p>
              <p className="text-sm text-muted-foreground">
                Ask for confirmation before delete actions.
              </p>
            </div>
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
            <div>
              <p className="font-medium">Enable Undo</p>
              <p className="text-sm text-muted-foreground">
                Show undo actions where supported.
              </p>
            </div>
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
          <CardDescription>Configure camera settings for scanning QR codes</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onOpenCameraSettings} variant="outline">
            <Camera className="h-4 w-4 mr-2" />
            Configure Camera
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asset Identification</CardTitle>
          <CardDescription>Configure code format and auto-generated asset IDs.</CardDescription>
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
                <SelectItem value="both">QR + Barcode</SelectItem>
                <SelectItem value="qr">QR only</SelectItem>
                <SelectItem value="barcode">Barcode only</SelectItem>
                <SelectItem value="none">No code</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium">Auto-assign Asset ID</p>
              <p className="text-sm text-muted-foreground">
                Generate unique IDs for each inventory unit.
              </p>
            </div>
            <Switch
              checked={settings.autoAssignAssetId}
              onCheckedChange={(checked) => onSettingsChange({ autoAssignAssetId: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-id-prefix">Asset ID Prefix</Label>
            <Input
              id="asset-id-prefix"
              value={settings.assetIdPrefix || 'AST'}
              onChange={(event) => onSettingsChange({ assetIdPrefix: event.target.value.toUpperCase() })}
              className="w-full md:w-64"
              placeholder="AST"
              maxLength={8}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 