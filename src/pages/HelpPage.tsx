import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Settings2, Database, ListChecks, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <p className="text-muted-foreground mt-2">
          End-user and admin reference for daily operation, data safety, and platform workflows.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">Quick Navigation</CardTitle>
          <CardDescription>Jump to the right module quickly.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p><strong>Dashboard:</strong> high-level status, counts, and quick visual health check.</p>
          <p><strong>Inventory:</strong> create/edit items, batch actions, labels, and exports.</p>
          <p><strong>Checkout:</strong> secure cabinet item movement tracking.</p>
          <p><strong>Reports:</strong> production-focused exports and custom report definitions.</p>
          <p><strong>Settings:</strong> user-defined lists, users, financial coding, and system logs.</p>
          <p><strong>About:</strong> product profile and build notes.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5" />
            User-defined Items & Settings Behavior
          </CardTitle>
          <CardDescription>
            How list changes affect existing inventory.
          </CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="h-5 w-5" />
            Inventory Workflow
          </CardTitle>
          <CardDescription>
            Recommended item lifecycle for clean tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1) Create item or template-based item with category, location, unit, and optional financial coding.</p>
          <p>2) Use bulk edit for location/project/cabinet/categorization updates at scale.</p>
          <p>3) Use secure checkout for cabinet movement, not for administrative edits.</p>
          <p>4) Print single or bulk labels with selected Avery geometry and code options.</p>
          <p>5) Review logs/reports for audit and operational analysis.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            Reports & Exports
          </CardTitle>
          <CardDescription>Built-in and custom report guidance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Use filters first, then select report type. Preview verifies field selection before export.</p>
          <p>CSV is lightweight for ingestion; Excel includes structured tabs and formulas for analysis handoff.</p>
          <p>Custom reports persist and can be deleted when no longer needed.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Logging, Audit, and Security Notes
          </CardTitle>
          <CardDescription>What is tracked and how to use it effectively.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Audit logs prioritize state-changing operations (item create/edit/delete, check-in/out, user/config changes).</p>
          <p>Performance logs cover heavy operations (report export and bulk actions).</p>
          <p>Security logs cover authentication and user management actions.</p>
          <p>System Logs view can be compact or detailed, supports CSV/JSON export, and keeps durable records.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Backup & Restore
          </CardTitle>
          <CardDescription>Data Management tab overview.</CardDescription>
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
