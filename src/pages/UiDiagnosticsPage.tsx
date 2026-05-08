import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function UiDiagnosticsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">UI Diagnostics</h1>
      <p className="text-sm text-muted-foreground">
        Developer-only workspace for visual checks and interaction diagnostics.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Diagnostics page is enabled and routed.</p>
          <p className="text-muted-foreground">
            Add targeted checks here as needed (focus rings, contrast, spacing, mobile touch targets, and modal layering).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

