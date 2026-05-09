import type { ProductionProgressSnapshot } from '@/lib/productionProgressMetrics';
import { cn } from '@/lib/utils';

export type { ProductionProgressSnapshot };

const RING_CONFIG = [
  {
    key: 'checklist',
    label: 'Checklist',
    radius: 27,
    strokeClass: 'stroke-sky-500 dark:stroke-sky-400',
    trackClass: 'stroke-sky-500/18 dark:stroke-sky-400/15',
  },
  {
    key: 'packlists',
    label: 'Packlists',
    radius: 19,
    strokeClass: 'stroke-violet-500 dark:stroke-violet-400',
    trackClass: 'stroke-violet-500/18 dark:stroke-violet-400/15',
  },
  {
    key: 'crew',
    label: 'Crew',
    radius: 11,
    strokeClass: 'stroke-emerald-500 dark:stroke-emerald-400',
    trackClass: 'stroke-emerald-500/18 dark:stroke-emerald-400/15',
  },
] as const;

function ringDash(percent: number, radius: number): string {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = (clamped / 100) * circumference;
  return `${filled} ${circumference}`;
}

export function ConcentricProductionRings({
  metrics,
  className,
  sizeClassName = 'h-[4.5rem] w-[4.5rem]',
}: {
  metrics: ProductionProgressSnapshot;
  className?: string;
  sizeClassName?: string;
}) {
  const percents = {
    checklist: metrics.checklist.percent,
    packlists: metrics.packlists.percent,
    crew: metrics.crew.percent,
  };

  return (
    <svg
      viewBox="-34 -34 68 68"
      className={cn('shrink-0', sizeClassName, className)}
      aria-hidden
    >
      <g transform="rotate(-90)">
        {RING_CONFIG.map((ring) => {
          const dash = ringDash(percents[ring.key as keyof typeof percents], ring.radius);
          return (
            <g key={ring.key}>
              <circle
                r={ring.radius}
                cx={0}
                cy={0}
                fill="none"
                strokeWidth={3.25}
                className={ring.trackClass}
                strokeDasharray={`${2 * Math.PI * ring.radius}`}
              />
              <circle
                r={ring.radius}
                cx={0}
                cy={0}
                fill="none"
                strokeWidth={3.25}
                strokeLinecap="round"
                className={ring.strokeClass}
                strokeDasharray={dash}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

const FUSED_SEGMENTS = [
  {
    key: 'checklist',
    short: 'Ck',
    long: 'Checklist',
    barClass: 'bg-sky-500 dark:bg-sky-400',
  },
  {
    key: 'packlists',
    short: 'Pk',
    long: 'Packlists',
    barClass: 'bg-violet-500 dark:bg-violet-400',
  },
  {
    key: 'crew',
    short: 'Cr',
    long: 'Crew',
    barClass: 'bg-emerald-500 dark:bg-emerald-400',
  },
] as const;

/** Matches input placeholder weight: `placeholder:text-muted-foreground/70` */
const LABEL_PILL =
  'rounded-sm bg-muted/55 px-1.5 py-0.5 text-muted-foreground/70 backdrop-blur-[1px] dark:bg-muted/45';

export function ProductionFusedStripProgress({
  metrics,
  className,
  density = 'comfortable',
  showLegend = true,
}: {
  metrics: ProductionProgressSnapshot;
  className?: string;
  density?: 'comfortable' | 'compact';
  /** When true, labels and counts are drawn on the bars (no separate legend block). */
  showLegend?: boolean;
}) {
  const percents = {
    checklist: metrics.checklist.percent,
    packlists: metrics.packlists.percent,
    crew: metrics.crew.percent,
  };

  const rows = [
    {
      key: 'checklist' as const,
      fraction:
        metrics.checklist.total > 0
          ? `${metrics.checklist.done}/${metrics.checklist.total}`
          : '—',
    },
    {
      key: 'packlists' as const,
      fraction:
        metrics.packlists.total > 0
          ? `${metrics.packlists.done}/${metrics.packlists.total}`
          : '—',
    },
    {
      key: 'crew' as const,
      fraction:
        metrics.crew.crewCount > 0
          ? `${metrics.crew.scheduled}/${metrics.crew.crewCount}`
          : '—',
    },
  ];

  const contentMinHeight = density === 'compact' ? 'min-h-[1.5rem]' : 'min-h-[1.75rem]';
  const underlineClass = density === 'compact' ? 'h-0.5' : 'h-[3px]';
  const gapClass = density === 'compact' ? 'gap-1.5' : 'gap-2';
  const labelClass = density === 'compact' ? 'text-[10px] leading-tight' : 'text-[11px] leading-tight';

  if (!showLegend) {
    return (
      <div className={cn('flex', gapClass, className)}>
        {FUSED_SEGMENTS.map((s) => {
          const pct = percents[s.key];
          return (
            <div key={s.key} className="min-w-0 flex-1">
              <div className={cn('overflow-hidden rounded-md bg-muted-foreground/15', underlineClass)}>
                <div
                  className={cn('h-full transition-[width] rounded-sm', s.barClass)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('flex', gapClass, className)}>
      {FUSED_SEGMENTS.map((s, i) => {
        const pct = percents[s.key];
        const fraction = rows[i].fraction;
        const label = density === 'compact' ? s.short : s.long;
        const title = `${label} — ${fraction} (${pct}%)`;

        return (
          <div key={s.key} className="min-w-0 flex-1" title={title}>
            <div className="flex flex-col overflow-hidden rounded-md bg-muted">
              <div
                className={cn(
                  'flex w-full flex-1 items-center justify-between gap-1.5 px-2 py-1',
                  contentMinHeight,
                  labelClass,
                )}
              >
                <span className={cn('min-w-0 flex-1 truncate font-medium', LABEL_PILL)}>{label}</span>
                <span className={cn('shrink-0 tabular-nums font-medium', LABEL_PILL)}>{fraction}</span>
              </div>
              <div
                className={cn(
                  'w-full shrink-0 overflow-hidden bg-muted-foreground/20 dark:bg-muted-foreground/25',
                  underlineClass,
                )}
              >
                <div
                  className={cn('h-full max-w-full transition-[width]', s.barClass)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dashboard / detail header: fused strip with overlaid legend. */
export function ProductionDashboardProgress({
  metrics,
  className,
}: {
  metrics: ProductionProgressSnapshot;
  className?: string;
}) {
  return <ProductionFusedStripProgress metrics={metrics} density="comfortable" className={className} />;
}
