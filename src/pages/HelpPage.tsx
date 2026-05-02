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

const navLinkClass =
  'text-sm font-medium text-primary underline-offset-4 hover:underline';

export default function HelpPage() {
  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Help & Documentation
        </h1>
      </div>

      <Card className="sticky top-16 z-20 border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <CardHeader className="py-3">
          <CardTitle className="text-base">In this page</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-4 gap-y-2 pt-0 text-sm">
          <a className={navLinkClass} href="#lookup-lists">Lookup lists</a>
          <a className={navLinkClass} href="#settings-saving">Settings & saving</a>
          <a className={navLinkClass} href="#financial-codes">Financial codes</a>
          <a className={navLinkClass} href="#reconciliation">Reconciliation</a>
          <a className={navLinkClass} href="#overview">Overview</a>
          <a className={navLinkClass} href="#inventory">Inventory</a>
          <a className={navLinkClass} href="#quick-add">Quick add</a>
          <a className={navLinkClass} href="#reports">Reports</a>
          <a className={navLinkClass} href="#logging">Logging</a>
          <a className={navLinkClass} href="#backup">Backup & restore</a>
        </CardContent>
      </Card>

      <section id="lookup-lists" className={cn('scroll-mt-24 space-y-3')}>
        <h2 className="text-lg font-semibold text-foreground">Lookup lists</h2>
        <p className="text-sm text-muted-foreground">
          Values used in inventory fields (categories, units, locations, suppliers, projects, and more) are edited under
          Settings → Lookup Lists. Pick a list from the bar at the top of that section—the bar stays visible while you
          edit.
        </p>
      </section>

      <section id="settings-saving" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Settings & saving</h2>
        <p className="text-sm text-muted-foreground">
          Edits to lookup lists and General preferences usually save as you make them. Use <strong>Sync to storage</strong>{' '}
          in Settings to force-write the current screen state to storage. You can download a portable settings snapshot
          from <strong>Data Management → Backup &amp; Restore</strong>.
        </p>
      </section>

      <section id="financial-codes" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Financial codes (expense types &amp; cost centers)</h2>
        <p className="text-sm text-muted-foreground">
          Code and description are stored separately. Use the Expense Codes area under Lookup Lists to maintain expense
          types and cost center / allocation rows.
        </p>
      </section>

      <section id="reconciliation" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          If inventory rows still reference lookup values that no longer exist (for example after list cleanup), use{' '}
          <strong>Fix unreconciled</strong> next to Sync on the Settings page while viewing the relevant list. That clears
          or repairs those references according to the list type. Group-level reconciliation is available under Data
          Management where applicable.
        </p>
      </section>

      <Card id="overview" className="scroll-mt-24">
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

      <Card id="inventory" className="scroll-mt-24">
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

      <Card id="quick-add" className="scroll-mt-24">
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

      <Card id="reports" className="scroll-mt-24">
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

      <Card id="logging" className="scroll-mt-24">
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

      <Card id="backup" className="scroll-mt-24">
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
    </div>
  );
}
