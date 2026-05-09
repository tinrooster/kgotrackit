import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { OrganizationSummary } from '@/lib/supabase/organizationData';
import {
  fetchOrganizationRow,
  updateOrganizationRecord,
  type OrganizationBrandingProfile,
} from '@/lib/supabase/organizationData';

interface OrganizationMasterPanelProps {
  authBackend: string;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationRole: OrganizationSummary['role'] | null;
  loading: boolean;
  selectOrganization: (organizationId: string | null) => void;
  refreshOrganizations: () => Promise<void>;
}

function readProfile(branding: Record<string, unknown>): OrganizationBrandingProfile {
  const raw = branding.profile;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const p = raw as Record<string, unknown>;
  return {
    address: typeof p.address === 'string' ? p.address : '',
    adminInfo: typeof p.adminInfo === 'string' ? p.adminInfo : '',
  };
}

export function OrganizationMasterPanel({
  authBackend,
  organizations,
  activeOrganizationId,
  activeOrganizationName,
  activeOrganizationRole,
  loading,
  selectOrganization,
  refreshOrganizations,
}: OrganizationMasterPanelProps) {
  const { currentUser } = useAuth();
  const [nameDraft, setNameDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');
  const [adminDraft, setAdminDraft] = useState('');
  const [rowLoading, setRowLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEditIdentity = activeOrganizationRole === 'admin';
  const sortedOrgs = useMemo(
    () => [...organizations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [organizations],
  );
  const activeOrgRow = activeOrganizationId
    ? sortedOrgs.find((o) => o.organizationId === activeOrganizationId)
    : undefined;
  const activeOrgIsOwner = !!currentUser?.id && activeOrgRow?.ownerUserId === currentUser.id;

  const loadRow = useCallback(async () => {
    if (!activeOrganizationId || authBackend !== 'supabase') {
      setNameDraft('');
      setAddressDraft('');
      setAdminDraft('');
      return;
    }
    setRowLoading(true);
    try {
      const row = await fetchOrganizationRow(activeOrganizationId);
      if (row) {
        setNameDraft(row.name);
        const profile = readProfile(row.branding);
        setAddressDraft(profile.address ?? '');
        setAdminDraft(profile.adminInfo ?? '');
      } else {
        setNameDraft(activeOrganizationName ?? '');
        setAddressDraft('');
        setAdminDraft('');
      }
    } finally {
      setRowLoading(false);
    }
  }, [activeOrganizationId, activeOrganizationName, authBackend]);

  useEffect(() => {
    void loadRow();
  }, [loadRow]);

  const handleSaveIdentity = async () => {
    if (!activeOrganizationId || !canEditIdentity) return;
    setSaving(true);
    try {
      await updateOrganizationRecord(activeOrganizationId, {
        name: nameDraft,
        brandingProfile: {
          address: addressDraft.trim() || undefined,
          adminInfo: adminDraft.trim() || undefined,
        },
      });
      toast.success('Organization updated');
      await refreshOrganizations();
      await loadRow();
    } catch (error) {
      toast.error('Could not update organization', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  if (authBackend !== 'supabase') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master organization</p>
          <CardTitle className="text-xl">Sign in with Supabase</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Organization name and shared libraries apply when you use team workspaces with Supabase.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master organization</p>
          <CardTitle className="text-2xl font-semibold tracking-tight">Loading…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master organization</p>
          <CardTitle className="text-xl">No organizations yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Create a workspace to provision an organization, or ask an admin to invite you to one.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-gradient-to-b from-muted/40 to-background">
        <CardHeader className="space-y-3 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master organization</p>
              <CardTitle className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                <span className="min-w-0 truncate">{activeOrganizationName ?? 'Select an organization'}</span>
                {activeOrganizationId ? (
                  activeOrgIsOwner ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-emerald-500/50 bg-emerald-500/10 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200"
                      title="You created this organization (owner in organizations.owner_user_id)."
                    >
                      Owner
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-xs font-semibold uppercase tracking-wide"
                      title="Another account owns this organization; you were added as a member."
                    >
                      Shared
                    </Badge>
                  )
                ) : null}
              </CardTitle>
              {activeOrganizationId ? (
                <p className="font-mono text-[11px] text-muted-foreground/90" title="Organization id">
                  {activeOrganizationId}
                </p>
              ) : null}
            </div>
            {activeOrganizationRole ? (
              <Badge variant="secondary" className="shrink-0 capitalize">
                Your role: {activeOrganizationRole}
              </Badge>
            ) : null}
          </div>

          {sortedOrgs.length > 1 ? (
            <div className="space-y-2 border-t border-border/50 pt-3">
              <p className="text-xs font-medium text-muted-foreground">Switch master org</p>
              <div className="flex flex-wrap gap-2">
                {sortedOrgs.map((org) => {
                  const rowOwner = !!currentUser?.id && org.ownerUserId === currentUser.id;
                  return (
                    <Button
                      key={org.organizationId}
                      type="button"
                      size="sm"
                      variant={org.organizationId === activeOrganizationId ? 'default' : 'outline'}
                      className="max-w-[20rem] justify-start gap-1.5 truncate"
                      title={org.organizationId}
                      onClick={() => {
                        if (org.organizationId !== activeOrganizationId) {
                          selectOrganization(org.organizationId);
                        }
                      }}
                    >
                      <span className="truncate">{org.name}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase opacity-90">
                        {rowOwner ? '· Owner' : '· Shared'}
                      </span>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                The header shows whichever org is selected. Workspace context may also align the active org when you
                open a workspace tied to that org.
              </p>
            </div>
          ) : null}
        </CardHeader>
      </Card>

      {activeOrganizationId ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Organization identity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Display name is primary. Optional fields are stored on the organization record for admins and editors to
              reference (not shown to viewers in this panel).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-display-name">Organization name</Label>
              <Input
                id="org-display-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={!canEditIdentity || rowLoading || saving}
                placeholder="e.g. KGO-TV Org"
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-address">Address / location notes (optional)</Label>
              <Textarea
                id="org-address"
                value={addressDraft}
                onChange={(e) => setAddressDraft(e.target.value)}
                disabled={!canEditIdentity || rowLoading || saving}
                rows={3}
                placeholder="Mailing or facility address, time zone notes, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-admin-info">Admin / billing notes (optional)</Label>
              <Textarea
                id="org-admin-info"
                value={adminDraft}
                onChange={(e) => setAdminDraft(e.target.value)}
                disabled={!canEditIdentity || rowLoading || saving}
                rows={3}
                placeholder="Internal reference: cost center, primary contact, contract id, …"
              />
            </div>
            {canEditIdentity ? (
              <Button type="button" onClick={() => void handleSaveIdentity()} disabled={saving || rowLoading}>
                {saving ? 'Saving…' : 'Save organization profile'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Only organization admins can edit the name and profile fields.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
