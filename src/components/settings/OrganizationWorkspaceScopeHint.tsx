import { Badge } from '@/components/ui/badge';
import { Building2, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OrganizationWorkspaceScopeHintProps {
  /** Workspace the invite / member list applies to. */
  workspaceName?: string | null;
  /** Organization linked to that workspace in Supabase (when loaded). */
  linkedOrganizationName?: string | null;
  className?: string;
}

/**
 * Clarifies that workspace invites are not the same as organization-wide roster / org settings.
 */
export function OrganizationWorkspaceScopeHint({
  workspaceName,
  linkedOrganizationName,
  className,
}: OrganizationWorkspaceScopeHintProps) {
  const label = workspaceName?.trim() || 'this workspace';

  return (
    <div
      className={cn(
        'space-y-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
      role="note"
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
          <UsersRound className="h-3 w-3" aria-hidden />
          Workspace
        </Badge>
        <p>
          Invites and roles on this screen apply to{' '}
          <span className="font-medium text-foreground">{label}</span> only (shared inventory, productions, and other
          workspace data for that team).
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Badge variant="outline" className="shrink-0 gap-1 font-normal">
          <Building2 className="h-3 w-3" aria-hidden />
          Organization
        </Badge>
        <p>
          Directory, org branding, and master crew are under{' '}
          <span className="font-medium text-foreground">Settings → Organization</span>. That scope is separate from the
          workspace member list: adding someone here does not place them in the organization directory or grant org admin
          by itself.
          {linkedOrganizationName ? (
            <>
              {' '}
              This workspace is linked to{' '}
              <span className="font-medium text-foreground">{linkedOrganizationName}</span>.
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
