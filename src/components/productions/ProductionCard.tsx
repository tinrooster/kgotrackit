import { CalendarDays, MapPin, User, CheckSquare } from 'lucide-react';
import { Production, PRODUCTION_STATUS_LABELS, ProductionStatus } from '@/types/productions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<ProductionStatus, string> = {
  planning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

interface ProductionCardProps {
  production: Production;
  onClick: (production: Production) => void;
}

function countChecklistProgress(production: Production): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const group of production.checklistGroups) {
    for (const item of group.items) {
      total++;
      if (item.completed) done++;
    }
  }
  return { done, total };
}

function formatDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate && !endDate) return null;
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return fmt(startDate);
  if (endDate) return `Until ${fmt(endDate)}`;
  return null;
}

export function ProductionCard({ production, onClick }: ProductionCardProps) {
  const { done, total } = countChecklistProgress(production);
  const dateRange = formatDateRange(production.startDate, production.endDate);
  const crewCount = production.crew.length;
  const vehicleCount = production.vehiclePacklists.length;

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onClick(production)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">{production.name}</CardTitle>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_VARIANT[production.status]
            )}
          >
            {PRODUCTION_STATUS_LABELS[production.status]}
          </span>
        </div>
        {production.client && (
          <p className="text-sm text-muted-foreground">{production.client}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {dateRange && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>{dateRange}</span>
          </div>
        )}
        {production.location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{production.location}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3 pt-1">
          {total > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckSquare className="h-3.5 w-3.5 shrink-0" />
              <span>
                {done}/{total} items
              </span>
            </div>
          )}
          {crewCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>
                {crewCount} crew
              </span>
            </div>
          )}
          {vehicleCount > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 text-xs">
              {vehicleCount} vehicle{vehicleCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
