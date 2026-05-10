import { cn } from '@/lib/utils';

/** ~20% softer than the previous “max” pass — shared by Dashboard + Productions. */
const productionListingTileSurface = cn(
  'overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground text-left',
  'ring-1 ring-black/[0.03] ring-offset-background',
  'shadow-md shadow-black/[0.065]',
  'dark:border-border/48 dark:bg-[hsl(220_10%_25%)] dark:ring-white/[0.055]',
  'dark:shadow-[0_11px_38px_-8px_rgba(0,0,0,0.42),0_2px_6px_-2px_rgba(0,0,0,0.28)]',
);

/** Production tiles on Dashboard “Active Productions” (wrapper; children handle clicks). */
export const productionListingTileClassName = cn(
  productionListingTileSurface,
  'transition-[box-shadow,transform,border-color] duration-200',
  'hover:-translate-y-[3px] hover:shadow-lg hover:shadow-black/[0.11] hover:ring-black/[0.055]',
  'dark:hover:shadow-[0_18px_44px_-10px_rgba(0,0,0,0.46),0_3px_11px_-3px_rgba(0,0,0,0.34)]',
  'dark:hover:ring-white/[0.072]',
);

/** Same surface + hover motion for clickable production cards (Productions page). */
export const productionListingTileInteractiveClassName = cn(
  productionListingTileClassName,
  'cursor-pointer',
);
