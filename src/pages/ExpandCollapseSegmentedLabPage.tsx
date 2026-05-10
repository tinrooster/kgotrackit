import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ListExpandAllSwitch } from '@/components/ui/list-expand-all-switch';

function FakeToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="h-8 min-w-[min(100%,12rem)] flex-1 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30"
          aria-hidden
        />
        {children}
      </div>
    </div>
  );
}

/**
 * Dev-only: compare label placement for the same Switch interaction model as settings
 * (single control, one tap flips state).
 */
export default function ExpandCollapseSegmentedLabPage() {
  const [expanded, setExpanded] = useState(false);
  const idA = useId();
  const idB = useId();
  const idC = useId();
  const idD = useId();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expand all: switch layouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Production toolbars use the same pattern as <strong className="font-medium text-foreground">Confirm deletes</strong>
            : one <code className="rounded bg-muted px-1 py-0.5 text-xs">Switch</code>, tap to flip. No segmented “two links +
            overlay”.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dev">← Developer menu</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shared demo state</CardTitle>
          <CardDescription>Preview only—does not control a real list.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={!expanded ? 'default' : 'outline'} onClick={() => setExpanded(false)}>
              Force OFF (collapsed)
            </Button>
            <Button type="button" size="sm" variant={expanded ? 'default' : 'outline'} onClick={() => setExpanded(true)}>
              Force ON (expanded)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipped component</CardTitle>
          <CardDescription>
            <code className="text-xs">ListExpandAllSwitch</code> — label + switch, same as checklist / packlists / crew
            toolbars.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-card p-4">
            <ListExpandAllSwitch
              id={`${idD}-shipped`}
              label="Expand all"
              allExpanded={expanded}
              onExpandAll={() => setExpanded(true)}
              onCollapseAll={() => setExpanded(false)}
            />
          </div>
          <FakeToolbar>
            <ListExpandAllSwitch
              className="sm:ml-auto"
              id={`${idD}-toolbar`}
              label="Expand all"
              allExpanded={expanded}
              onExpandAll={() => setExpanded(true)}
              onCollapseAll={() => setExpanded(false)}
            />
          </FakeToolbar>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Layout options (raw Switch)</CardTitle>
          <CardDescription>Same interaction; only label position and density differ.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A — Label left (default)</p>
            <div className="flex items-center gap-2 rounded-md border p-4">
              <Label htmlFor={idA} className="cursor-pointer text-sm text-muted-foreground">
                Expand all
              </Label>
              <Switch id={idA} checked={expanded} onCheckedChange={setExpanded} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">B — Switch first</p>
            <div className="flex items-center gap-2 rounded-md border p-4">
              <Switch id={idB} checked={expanded} onCheckedChange={setExpanded} />
              <Label htmlFor={idB} className="cursor-pointer text-sm text-muted-foreground">
                Expand all
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">C — Settings-style row</p>
            <div className="flex items-center justify-between gap-3 rounded-md border p-4">
              <div className="space-y-0.5">
                <p className="font-medium">Expand all sections</p>
                <p className="text-xs text-muted-foreground">Show every group in this list at once.</p>
              </div>
              <Switch id={idC} checked={expanded} onCheckedChange={setExpanded} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
