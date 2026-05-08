import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  DEMO_BROADCAST_ON_AIR_TEMPLATE,
  EMPTY_MAINTENANCE_ON_AIR_SCHEDULE,
  hasMaintenanceScheduleAnyTimes,
  normalizeMaintenanceTimeListInput,
  type MaintenanceOnAirSchedule,
} from '@/lib/settingsService';
import { saveOrganizationMaintenanceOnAirTemplate } from '@/lib/supabase/organizationPortability';

const DAY_LABELS: Array<{ key: keyof MaintenanceOnAirSchedule; label: string }> = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
];

interface OrgMaintenanceBroadcastTemplateSectionProps {
  organizationId: string | null;
  authBackend: string;
  storedTemplate: MaintenanceOnAirSchedule | null;
  canEdit: boolean;
  onAfterSave: () => void;
}

export function OrgMaintenanceBroadcastTemplateSection({
  organizationId,
  authBackend,
  storedTemplate,
  canEdit,
  onAfterSave,
}: OrgMaintenanceBroadcastTemplateSectionProps) {
  const [draft, setDraft] = useState<MaintenanceOnAirSchedule>(() => ({
    ...(storedTemplate ?? EMPTY_MAINTENANCE_ON_AIR_SCHEDULE),
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...(storedTemplate ?? EMPTY_MAINTENANCE_ON_AIR_SCHEDULE) });
  }, [storedTemplate, organizationId]);

  if (authBackend !== 'supabase' || !organizationId) {
    return null;
  }

  const handleSave = async () => {
    const toSave = hasMaintenanceScheduleAnyTimes(draft) ? draft : null;
    setSaving(true);
    try {
      await saveOrganizationMaintenanceOnAirTemplate(organizationId, toSave);
      toast.success(
        toSave
          ? 'Organization maintenance template saved.'
          : 'Organization template cleared. Apply org template will use the demo pattern.',
      );
      onAfterSave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save organization template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance broadcast template</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          ON-AIR program start times (HH:mm, 15-minute grid) shared for this organization. In{' '}
          <span className="text-foreground font-medium">General</span> → Maintenance Window Cautions,{' '}
          <span className="text-foreground font-medium">Apply org template</span> copies this (or the anonymous demo
          pattern if nothing is saved here).
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DAY_LABELS.map((day) => (
            <div key={day.key} className="space-y-1.5">
              <Label htmlFor={`org-maintenance-${day.key}`}>{day.label}</Label>
              <Input
                id={`org-maintenance-${day.key}`}
                value={(draft[day.key] ?? []).join(', ')}
                placeholder="05:00, 11:00, 18:00"
                readOnly={!canEdit}
                onChange={(event) =>
                  canEdit
                    ? setDraft((previous) => ({
                        ...previous,
                        [day.key]: normalizeMaintenanceTimeListInput(event.target.value),
                      }))
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save to organization'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setDraft({ ...DEMO_BROADCAST_ON_AIR_TEMPLATE })}
            >
              Load demo pattern
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setDraft({ ...EMPTY_MAINTENANCE_ON_AIR_SCHEDULE })}
            >
              Clear draft
            </Button>
          </div>
        ) : (
          <p className="text-xs">Your organization role is viewer—template is read-only.</p>
        )}
      </CardContent>
    </Card>
  );
}
