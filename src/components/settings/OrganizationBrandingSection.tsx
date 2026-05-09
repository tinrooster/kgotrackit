import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  pullOrganizationAppData,
  pushOrganizationSnapshot,
  type OrganizationSnapshotPayload,
} from '@/lib/supabase/organizationData';
import {
  loadAppBranding,
  saveAppBranding,
  type AppBrandingSettings,
} from '@/lib/appBranding';

interface OrganizationBrandingSectionProps {
  organizationId: string | null;
  authBackend: string;
  canEdit: boolean;
}

interface OrganizationBrandingDraft extends AppBrandingSettings {}

function toOrganizationBrandingDraft(value: unknown): OrganizationBrandingDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return loadAppBranding();
  }
  const asRecord = value as Record<string, unknown>;
  return {
    appName: typeof asRecord.appName === 'string' && asRecord.appName.trim() ? asRecord.appName : loadAppBranding().appName,
    logoLightDataUrl: typeof asRecord.logoLightDataUrl === 'string' ? asRecord.logoLightDataUrl : '',
    logoDarkDataUrl: typeof asRecord.logoDarkDataUrl === 'string' ? asRecord.logoDarkDataUrl : '',
  };
}

export function OrganizationBrandingSection({
  organizationId,
  authBackend,
  canEdit,
}: OrganizationBrandingSectionProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<OrganizationBrandingDraft>(() => loadAppBranding());

  useEffect(() => {
    const load = async () => {
      if (authBackend !== 'supabase' || !organizationId) {
        setDraft(loadAppBranding());
        return;
      }
      setLoading(true);
      try {
        const row = await pullOrganizationAppData(organizationId);
        const branding =
          row?.branding && typeof row.branding === 'object' && !Array.isArray(row.branding)
            ? (row.branding as Record<string, unknown>)
            : {};
        const normalized = toOrganizationBrandingDraft(branding.appBranding);
        setDraft(normalized);
        saveAppBranding(normalized);
      } catch (error) {
        toast.error('Could not load organization branding.', {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [authBackend, organizationId]);

  const handleLogoUpload = (mode: 'light' | 'dark', file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value) return;
      setDraft((previous) => ({
        ...previous,
        logoLightDataUrl: mode === 'light' ? value : previous.logoLightDataUrl,
        logoDarkDataUrl: mode === 'dark' ? value : previous.logoDarkDataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const persist = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const currentRow = await pullOrganizationAppData(organizationId);
      const branding =
        currentRow?.branding && typeof currentRow.branding === 'object' && !Array.isArray(currentRow.branding)
          ? ({ ...currentRow.branding } as Record<string, unknown>)
          : {};
      branding.appBranding = {
        appName: draft.appName.trim() || 'TEd_trackIT',
        logoLightDataUrl: draft.logoLightDataUrl,
        logoDarkDataUrl: draft.logoDarkDataUrl,
      };
      await pushOrganizationSnapshot(organizationId, {
        contacts: Array.isArray(currentRow?.contacts) ? currentRow.contacts : [],
        position_templates: Array.isArray(currentRow?.position_templates) ? currentRow.position_templates : [],
        inventory_baseline: Array.isArray(currentRow?.inventory_baseline) ? currentRow.inventory_baseline : [],
        role_tags: Array.isArray(currentRow?.role_tags) ? currentRow.role_tags : [],
        branding,
        maintenance_on_air_template: currentRow?.maintenance_on_air_template ?? null,
      } as OrganizationSnapshotPayload);
      saveAppBranding({
        appName: draft.appName.trim() || 'TEd_trackIT',
        logoLightDataUrl: draft.logoLightDataUrl,
        logoDarkDataUrl: draft.logoDarkDataUrl,
      });
      toast.success('Organization branding saved.');
    } catch (error) {
      toast.error('Could not save organization branding.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  if (authBackend !== 'supabase') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization Branding</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Organization branding is available when signed in with Supabase.
        </CardContent>
      </Card>
    );
  }

  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization Branding</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select an active organization to configure shared branding.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-branding-app-name">App name</Label>
          <Input
            id="org-branding-app-name"
            className="w-full md:w-80"
            value={draft.appName}
            onChange={(event) => setDraft((previous) => ({ ...previous, appName: event.target.value }))}
            disabled={!canEdit || loading || saving}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <Label>Logo (Light mode)</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={!canEdit || loading || saving}
              onChange={(event) => handleLogoUpload('light', event.target.files?.[0] ?? null)}
            />
            {draft.logoLightDataUrl ? (
              <img src={draft.logoLightDataUrl} alt="Organization light logo" className="h-10 w-auto rounded border bg-white p-1" />
            ) : (
              <p className="text-xs text-muted-foreground">No light logo uploaded</p>
            )}
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Label>Logo (Dark mode)</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={!canEdit || loading || saving}
              onChange={(event) => handleLogoUpload('dark', event.target.files?.[0] ?? null)}
            />
            {draft.logoDarkDataUrl ? (
              <img src={draft.logoDarkDataUrl} alt="Organization dark logo" className="h-10 w-auto rounded border bg-black p-1" />
            ) : (
              <p className="text-xs text-muted-foreground">No dark logo uploaded</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void persist()} disabled={!canEdit || loading || saving}>
            {saving ? 'Saving…' : 'Save organization branding'}
          </Button>
          <p className="text-xs text-muted-foreground">Shared across the organization; light/dark logo auto-switches by theme.</p>
        </div>
      </CardContent>
    </Card>
  );
}

