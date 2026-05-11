import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Settings2,
  Database,
  ListChecks,
  ShieldCheck,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-shell';

const navLinkClass =
  'block rounded-md px-2 py-1.5 text-sm font-medium text-primary underline-offset-4 hover:bg-muted/40 hover:underline';

export default function HelpPage() {
  const sectionItems = useMemo(
    () => [
      { id: 'lookup-lists', label: 'Lookup lists' },
      { id: 'settings-saving', label: 'Settings & saving' },
      { id: 'team-workspace', label: 'Team workspace data' },
      { id: 'org-vs-workspace', label: 'Organization vs. workspace' },
      { id: 'financial-codes', label: 'Financial codes' },
      { id: 'reconciliation', label: 'Reconciliation' },
      { id: 'planner-workspace', label: 'Planner workspace' },
      { id: 'call-sheets', label: 'Call sheets & exports' },
      { id: 'organization-branding', label: 'Organization branding' },
      { id: 'overview', label: 'Overview' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'quick-add', label: 'Quick add' },
      { id: 'reports', label: 'Reports' },
      { id: 'logging', label: 'Logging' },
      { id: 'backup', label: 'Backup & restore' },
    ],
    [],
  );
  const [activeSectionId, setActiveSectionId] = useState(sectionItems[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);
        if (visible.length === 0) return;
        setActiveSectionId(visible[0].target.id);
      },
      {
        root: null,
        threshold: [0.2, 0.4, 0.6],
        rootMargin: '-15% 0px -55% 0px',
      },
    );

    sectionItems.forEach((section) => {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [sectionItems]);

  const sectionClass = (sectionId: string) =>
    cn(
      'scroll-mt-24 rounded-md border border-transparent p-3 transition-colors',
      activeSectionId === sectionId ? 'border-border/70 bg-muted/35' : 'bg-transparent',
    );

  return (
    <div className="container max-w-5xl py-4 space-y-6">
      <PageHeader
        eyebrow="Reference"
        title="Help & Documentation"
        description="Operational notes for inventory, planner, settings, reporting, backups, and team workspaces."
        icon={<BookOpen className="h-6 w-6" aria-hidden />}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <Card className="border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <CardHeader className="py-3">
              <CardTitle className="text-base">In this page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-sm">
              {sectionItems.map((section) => (
                <a
                  key={section.id}
                  className={cn(
                    navLinkClass,
                    activeSectionId === section.id && 'bg-muted text-foreground no-underline',
                  )}
                  href={`#${section.id}`}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  {section.label}
                </a>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-6">
      <section id="lookup-lists" className={cn(sectionClass('lookup-lists'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Lookup lists</h2>
        <p className="text-sm text-muted-foreground">
          Values used in inventory fields (categories, units, locations, suppliers, projects, and more) are edited under
          Settings → Lookup Lists. Pick a list from the bar at the top of that section—the bar stays visible while you
          edit.
        </p>
      </section>

      <section id="settings-saving" className={cn(sectionClass('settings-saving'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Settings & saving</h2>
        <p className="text-sm text-muted-foreground">
          Edits to lookup lists and General preferences usually save as you make them. You can download a portable settings snapshot
          from <strong>Data Management → Backup &amp; Restore</strong>.
        </p>
      </section>

      <section id="team-workspace" className={cn(sectionClass('team-workspace'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Team workspace data</h2>
        <p className="text-sm text-muted-foreground">
          Personal mode stores data in your user row. Team mode uses a shared workspace row, and access is controlled by
          workspace membership roles (admin, editor, viewer).
        </p>
        <p className="text-sm text-muted-foreground">
          If team switching fails, refresh the workspace list in Settings → Data Management and verify your membership in
          that workspace.
        </p>
      </section>

      <section id="org-vs-workspace" className={cn(sectionClass('org-vs-workspace'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Organization vs. workspace</h2>
        <p className="text-sm text-muted-foreground">
          A <span className="font-medium text-foreground">workspace</span> is the team bucket for shared inventory, productions,
          and planner data. Inviting someone under <span className="font-medium text-foreground">Settings → Users</span> (cloud) or{' '}
          <span className="font-medium text-foreground">Settings → Workspaces → Manage workspaces</span> adds them to that
          workspace only, with a workspace role (admin, editor, or viewer).
        </p>
        <p className="text-sm text-muted-foreground">
          An <span className="font-medium text-foreground">organization</span> is the company-wide layer: directory contacts,
          organization branding, master crew, and related org settings live under{' '}
          <span className="font-medium text-foreground">Settings → Organization</span>. Workspace membership and organization
          roster are separate in this app: workspace access does not automatically add someone to the organization directory or
          grant organization admin by itself.
        </p>
        <p className="text-sm text-muted-foreground">
          Workspaces can be linked to an organization; when they are, you may see the organization name next to your active
          workspace. That link shares org-level configuration across teams; it does not merge the two invite flows.
        </p>
      </section>

      <section id="financial-codes" className={cn(sectionClass('financial-codes'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Financial codes (expense types &amp; cost centers)</h2>
        <p className="text-sm text-muted-foreground">
          Code and description are stored separately. Use the Expense Codes area under Lookup Lists to maintain expense
          types and cost center / allocation rows.
        </p>
      </section>

      <section id="reconciliation" className={cn(sectionClass('reconciliation'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          If inventory rows still reference lookup values that no longer exist (for example after list cleanup), use{' '}
          <strong>Fix unreconciled</strong> next to Sync on the Settings page while viewing the relevant list. That clears
          or repairs those references according to the list type. Group-level reconciliation is available under Data
          Management where applicable.
        </p>
      </section>

      <section id="planner-workspace" className={cn(sectionClass('planner-workspace'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Planner workspace</h2>
        <p className="text-sm text-muted-foreground">
          Open Productions → Planner Workspace to manage Checklist, Vehicle Packlists, Schedule, Crew, and Overview in one
          place. The planner restores your last route context (production, tab, and schedule day).
        </p>
        <p className="text-sm text-muted-foreground">
          Schedule supports Day Board editing, day locking with override confirmation, conflict detection (including
          availability checks), and quick day copy.
        </p>
        <p className="text-sm text-muted-foreground">
          Use the Simple/Detailed switch in Schedule tabs to reduce UI density for day-of operations.
        </p>
        <p className="text-sm text-muted-foreground">
          On Checklist and Vehicle Packlists, checkboxes record completion or packed state only. Section or vehicle rows use a
          chevron control and also respond to double-click on the header row (outside inputs and buttons). Rename checklist
          sections from their ⋯ menu.
        </p>
      </section>

      <section id="call-sheets" className={cn(sectionClass('call-sheets'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Call sheets &amp; exports</h2>
        <p className="text-sm text-muted-foreground">
          In Planner Workspace → Schedule, use Export actions for CSV, text call sheet, and printable HTML.
        </p>
        <p className="text-sm text-muted-foreground">
          Open Preview to access Call Sheet Options: include/exclude notes/resources/warnings, choose Simple/Detailed/Branded
          template, limit to filtered rows, and customize headers (title/show/venue/producer).
        </p>
        <p className="text-sm text-muted-foreground">
          Printable HTML preview is rendered in-app and matches download output, including branded header and logo when set.
        </p>
      </section>

      <section id="organization-branding" className={cn(sectionClass('organization-branding'), 'space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Organization branding</h2>
        <p className="text-sm text-muted-foreground">
          Branding upload is organization-scoped: Settings → Organization → Overview → Organization Branding.
        </p>
        <p className="text-sm text-muted-foreground">
          Configure app name plus separate light and dark logos. Theme auto-switch applies the correct logo variant
          across navigation, login, and branded call sheet exports.
        </p>
      </section>

      <Card id="overview" className={sectionClass('overview')}>
        <CardHeader>
          <CardTitle className="text-lg">Quick navigation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p><strong>Dashboard:</strong> high-level status, counts, and quick visual health check.</p>
          <p><strong>Inventory:</strong> create/edit items, batch actions, labels, and exports.</p>
          <p><strong>Checkout:</strong> secure cabinet item movement tracking.</p>
          <p><strong>Reports:</strong> production-focused exports and custom report definitions.</p>
          <p><strong>Settings:</strong> lookup lists, users, financial coding, and system logs.</p>
          <p><strong>About:</strong> product profile and build notes.</p>
        </CardContent>
      </Card>

      <Card id="lookup-lists-card" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5" />
            Lookup lists &amp; settings behavior
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Categories, units, locations, suppliers, projects, and expense-code definitions are treated as shared references.
          </p>
          <p>
            Renaming or removing values can cascade to existing inventory records. Use reconciliation prompts to replace or clear values safely.
          </p>
          <p>
            Best practice: run exports/backups before structural list edits and keep a dated archive outside the app path.
          </p>
        </CardContent>
      </Card>

      <Card id="inventory" className={sectionClass('inventory')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="h-5 w-5" />
            Inventory workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1) Create item or template-based item with category, location, unit, and optional financial coding.</p>
          <p>2) On Inventory, use <strong>Quick add</strong> (lightning icon) for a fast mobile-oriented flow—see the Quick add section below.</p>
          <p>3) Use bulk edit for location/project/cabinet/categorization updates at scale.</p>
          <p>4) Use secure checkout for cabinet movement, not for administrative edits.</p>
          <p>5) Print single or bulk labels with selected Avery geometry and code options.</p>
          <p>6) Review logs/reports for audit and operational analysis.</p>
          <p>
            When <strong>Enable Undo</strong> is on in General settings, Inventory provides Undo/Redo for recent changes made
            on that page (including batch operations), stored in memory for the session.
          </p>
        </CardContent>
      </Card>

      <Card id="quick-add" className={sectionClass('quick-add')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5" />
            Quick add (Inventory)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Open <strong>Quick add</strong> from the Inventory toolbar to capture items quickly. The dialog is tuned for phones
            and small screens: scroll within a single panel, with primary actions fixed at the bottom.
          </p>
          <p>
            <strong>Current selection</strong> shows your location, category, unit, and project. Tap a tile to jump to that
            section (collapsed lists open automatically). <strong>Go to</strong> jumps to Name, Shortcuts, Details, Unit, or
            Project.
          </p>
          <p>
            <strong>Name</strong> is highlighted at the top for typing; optional <strong>voice</strong> (mic) and{' '}
            <strong>Last name</strong> (reuses the last successfully saved item name) speed up entry. <strong>Shortcuts</strong>{' '}
            includes &quot;Same as last&quot; (location, category, unit, project, and saved unit size when applicable) and{' '}
            <strong>Often used</strong> chips for frequent locations and categories.
          </p>
          <p>
            <strong>Details</strong> (collapsible) holds barcode scan or type, photo via live camera or gallery, and quantity.
            Camera uses a live preview when the browser allows it; otherwise pick an image from disk.
          </p>
          <p>
            <strong>All locations</strong>, <strong>All categories</strong>, <strong>Unit</strong>, <strong>Project</strong>, and{' '}
            <strong>Details</strong> are collapsible to save space; each has a filter when expanded. Tap the header to expand
            or collapse.
          </p>
          <p>
            <strong>Units with sizes:</strong> If a unit type has sub-sizes in Settings (for example <em>Spools</em> with
            multiple roll widths), pick the parent unit first, then choose a size in the <strong>Sizes</strong> row below the
            dashed line—same pattern as locations with sub-areas. The saved item stores both the unit and the size.
          </p>
          <p>
            <strong>Projects</strong> lists <strong>None</strong> first, then specific projects under a dashed separator.
            Preferences and &quot;last add&quot; selections are stored on this device for the next Quick add.
          </p>
        </CardContent>
      </Card>

      <Card id="reports" className={sectionClass('reports')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            Reports &amp; exports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Use filters first, then select report type. Preview verifies field selection before export.</p>
          <p>CSV is lightweight for ingestion; Excel includes structured tabs and formulas for analysis handoff.</p>
          <p>Custom reports persist and can be deleted when no longer needed.</p>
        </CardContent>
      </Card>

      <Card id="logging" className={sectionClass('logging')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Logging, audit, and security notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Audit logs prioritize state-changing operations (item create/edit/delete, check-in/out, user/config changes).</p>
          <p>Performance logs cover heavy operations (report export and bulk actions).</p>
          <p>Security logs cover authentication and user management actions.</p>
          <p>System Logs view can be compact or detailed, supports CSV/JSON export, and keeps durable records.</p>
        </CardContent>
      </Card>

      <Card id="backup" className={sectionClass('backup')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Backup &amp; restore
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use Settings → Data Management for import/export, Backup &amp; Restore (including <strong>.backup</strong>{' '}
            restore and settings snapshot JSON), and Reconciliation (group inventory fix with on-screen report).
          </p>
          <p>
            Create a backup before large imports, merges, taxonomy changes, or mass edits.
          </p>
          <p>Store backup files in versioned folders with date + operator name for easier rollback traceability.</p>
        </CardContent>
      </Card>
        </main>
      </div>
    </div>
  );
}
