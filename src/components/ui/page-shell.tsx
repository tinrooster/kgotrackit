import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const statusToneClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  accent: 'bg-ti-accent-soft text-ti-accent-ink border-primary/25',
  success: 'bg-ti-success-soft text-ti-success border-ti-success',
  warning: 'bg-ti-warning-soft text-ti-warning border-ti-warning',
  danger: 'bg-ti-danger-soft text-destructive border-destructive/25',
  info: 'bg-ti-info-soft text-ti-info border-ti-info',
};

const statusDotClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  accent: 'bg-primary',
  success: 'bg-ti-success',
  warning: 'bg-ti-warning',
  danger: 'bg-destructive',
  info: 'bg-ti-info',
};

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? <div className="shrink-0 text-muted-foreground">{icon}</div> : null}
          <h1 className="truncate text-2xl font-semibold leading-tight tracking-[-0.018em] sm:text-[28px]">
            {title}
          </h1>
          {meta ? <div className="shrink-0 text-xs text-muted-foreground" data-mono>{meta}</div> : null}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: StatusTone;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  tone = 'neutral',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b px-4 py-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-foreground/80">
          <StatusDot tone={tone} size="sm" />
          <span className="truncate">{title}</span>
        </div>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

interface StatusDotProps {
  tone?: StatusTone;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusDot({ tone = 'neutral', size = 'md', className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded-full',
        size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
        statusDotClasses[tone],
        className,
      )}
    />
  );
}

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function StatTile({
  label,
  value,
  delta,
  tone = 'neutral',
  icon,
  className,
  onClick,
}: StatTileProps) {
  const content = (
    <>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <StatusDot tone={tone} size="sm" />
        <span className="truncate">{label}</span>
        {icon ? <span className="ml-auto text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="font-cond text-3xl font-semibold leading-none tracking-[-0.025em]">{value}</span>
        {delta ? <span className="pb-0.5 text-[11px] text-muted-foreground" data-mono>{delta}</span> : null}
      </div>
    </>
  );

  const classNames = cn(
    'rounded-lg border bg-card p-4 text-left text-card-foreground shadow-ti-sm transition-colors',
    onClick && 'hover:bg-muted/60',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classNames}>
        {content}
      </button>
    );
  }

  return (
    <div className={classNames}>
      {content}
    </div>
  );
}

interface StatusPillProps {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ tone = 'neutral', children, dot, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium tracking-[0.02em]',
        statusToneClasses[tone],
        className,
      )}
    >
      {dot ? <StatusDot tone={tone} size="sm" /> : null}
      {children}
    </span>
  );
}

interface SegmentedControlOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentedControlOption[];
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: SegmentedControlProps) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg border bg-muted p-1 shadow-ti-sm', className)}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
              isActive ? 'bg-card text-foreground shadow-ti-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
