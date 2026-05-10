import { cn } from '@/lib/utils';

function publicAssetUrl(pathFromPublicRoot: string): string {
  const trimmed = pathFromPublicRoot.startsWith('/') ? pathFromPublicRoot.slice(1) : pathFromPublicRoot;
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${trimmed}`.replace(/\/{2,}/g, '/');
}

/** Served from `public/maps/MarketStMap.png` (e.g. SF Pride planning asset). */
export const PRIDE_MARKET_ST_SITE_MAP_URL = publicAssetUrl('/maps/MarketStMap.png');

/** Show the Market St. / Civic Center reference map when this production matches SF Pride planning. */
export function shouldShowPrideMarketSiteMap(productionName: string, location?: string): boolean {
  if (/pride/i.test(productionName.trim())) return true;
  const loc = (location ?? '').toLowerCase();
  if (loc.includes('sansome')) return true;
  if (loc.includes('civic center')) return true;
  if (loc.includes('market') && loc.includes('civic')) return true;
  return false;
}

interface PlannerOverviewSiteMapCardProps {
  className?: string;
}

export function PlannerOverviewSiteMapCard({ className }: PlannerOverviewSiteMapCardProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-muted/20', className)}>
      <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Site map — Market St. / Civic Center
      </p>
      <div className="relative max-h-[min(70vh,560px)] overflow-auto bg-background">
        <img
          src={PRIDE_MARKET_ST_SITE_MAP_URL}
          alt="Market Street parade route and Civic Center site map"
          className="h-auto w-full max-w-4xl object-contain object-top"
          decoding="async"
        />
      </div>
    </div>
  );
}
