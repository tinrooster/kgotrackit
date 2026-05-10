import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  DEMO_BROADCAST_ON_AIR_TEMPLATE,
  EMPTY_MAINTENANCE_ON_AIR_SCHEDULE,
  mergeMaintenanceScheduleForApply,
  normalizeMaintenanceTimeListInput,
  type DefaultSettings,
} from '@/lib/settingsService';

export interface MaintenanceCautionsSettingsCardProps {
  settings: DefaultSettings;
  onSettingsChange: (updates: Partial<DefaultSettings>) => void;
  organizationMaintenanceTemplate?: DefaultSettings['maintenanceOnAirSchedule'] | null;
  activeOrganizationId?: string | null;
}

const scheduleDayLabels: Array<{ key: keyof DefaultSettings['maintenanceOnAirSchedule']; label: string }> = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
];

export function MaintenanceCautionsSettingsCard({
  settings,
  onSettingsChange,
  organizationMaintenanceTemplate = null,
  activeOrganizationId = null,
}: MaintenanceCautionsSettingsCardProps) {
  const scheduleToApplyFromOrg = mergeMaintenanceScheduleForApply(
    organizationMaintenanceTemplate ?? null,
    DEMO_BROADCAST_ON_AIR_TEMPLATE,
  );

  return (
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
            Enter comma-separated times per day in HH:mm (examples: 05:00, 11:00, 23:00). Values are normalized and
            invalid entries are ignored.
          </p>
          {activeOrganizationId && !organizationMaintenanceTemplate ? (
            <p className="text-xs text-amber-700 dark:text-amber-500/90">
              No organization template saved yet—Apply org template uses the anonymous demo pattern (Settings →
              Organization).
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
  );
}
