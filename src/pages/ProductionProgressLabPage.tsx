import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  ConcentricProductionRings,
  ProductionDashboardProgress,
  ProductionFusedStripProgress,
} from '@/components/dashboard/ProductionDashboardProgress';
import type { ProductionProgressSnapshot } from '@/lib/productionProgressMetrics';
import { PageHeader } from '@/components/ui/page-shell';

function buildMetrics(
  checklistPct: number,
  packlistsPct: number,
  crewPct: number,
): ProductionProgressSnapshot {
  const cDone = Math.round((checklistPct / 100) * 20);
  const pDone = Math.round((packlistsPct / 100) * 6);
  const crewSched = Math.round((crewPct / 100) * 21);
  return {
    checklist: { done: cDone, total: 20, percent: checklistPct },
    packlists: { done: pDone, total: 6, percent: packlistsPct },
    crew: { scheduled: crewSched, crewCount: 21, percent: crewPct },
  };
}

function MiniDonutsRow({ metrics }: { metrics: ProductionProgressSnapshot }) {
  const items = [
    { label: 'Ck', pct: metrics.checklist.percent, stroke: 'stroke-sky-500 dark:stroke-sky-400' },
    { label: 'Pk', pct: metrics.packlists.percent, stroke: 'stroke-violet-500 dark:stroke-violet-400' },
    { label: 'Cr', pct: metrics.crew.percent, stroke: 'stroke-emerald-500 dark:stroke-emerald-400' },
  ];
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center justify-center gap-4">
      {items.map((item) => {
        const dash = `${(item.pct / 100) * c} ${c}`;
        return (
          <div key={item.label} className="flex flex-col items-center gap-0.5">
            <svg viewBox="-18 -18 36 36" className="h-11 w-11" aria-hidden>
              <g transform="rotate(-90)">
                <circle r={r} cx={0} cy={0} fill="none" strokeWidth={3} className="stroke-muted" strokeDasharray={c} />
                <circle
                  r={r}
                  cx={0}
                  cy={0}
                  fill="none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  className={item.stroke}
                  strokeDasharray={dash}
                />
              </g>
            </svg>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {item.label} {item.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TightLinearBars({ metrics }: { metrics: ProductionProgressSnapshot }) {
  const rows = [
    { label: 'Checklist', pct: metrics.checklist.percent },
    { label: 'Packlists', pct: metrics.packlists.percent },
    { label: 'Crew', pct: metrics.crew.percent },
  ];
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-[4.5rem] shrink-0 text-[10px] text-muted-foreground">{row.label}</span>
          <Progress value={row.pct} className="h-1 flex-1" />
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{row.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ProductionProgressLabPage() {
  const [checklistPct, setChecklistPct] = useState(60);
  const [packlistsPct, setPacklistsPct] = useState(0);
  const [crewPct, setCrewPct] = useState(71);

  const metrics = useMemo(
    () => buildMetrics(checklistPct, packlistsPct, crewPct),
    [checklistPct, packlistsPct, crewPct],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        eyebrow="Lab"
        title="Production progress - layout lab"
        description="Adjust the sliders to preview how each pattern behaves. The dashboard and production screens use the fused strip (variant A)."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sample data</CardTitle>
          <CardDescription>Percentages drive both the rings and the example counts (20 / 6 / 21).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Checklist</span>
              <span className="tabular-nums text-muted-foreground">{checklistPct}%</span>
            </div>
            <Slider value={[checklistPct]} min={0} max={100} step={1} onValueChange={(v) => setChecklistPct(v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Packlists</span>
              <span className="tabular-nums text-muted-foreground">{packlistsPct}%</span>
            </div>
            <Slider value={[packlistsPct]} min={0} max={100} step={1} onValueChange={(v) => setPacklistsPct(v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Crew</span>
              <span className="tabular-nums text-muted-foreground">{crewPct}%</span>
            </div>
            <Slider value={[crewPct]} min={0} max={100} step={1} onValueChange={(v) => setCrewPct(v[0])} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A — Fused strip (dashboard & productions)</CardTitle>
            <CardDescription>Three tracks; label and done/total use hint-style translucency; % only in the tooltip.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductionDashboardProgress metrics={metrics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">B — Rings only (larger)</CardTitle>
            <CardDescription>Hero size for dense headers or modals.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-2">
            <ConcentricProductionRings metrics={metrics} sizeClassName="h-28 w-28" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">C — Fused strip</CardTitle>
            <CardDescription>Very short vertically; relative mix at a glance (not weighted by work).</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductionFusedStripProgress metrics={metrics} density="compact" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">D — Three mini donuts</CardTitle>
            <CardDescription>Scannable row; more horizontal space than A.</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniDonutsRow metrics={metrics} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">E — Tight linear bars</CardTitle>
            <CardDescription>Previous metaphor, reduced padding and label width.</CardDescription>
          </CardHeader>
          <CardContent>
            <TightLinearBars metrics={metrics} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
