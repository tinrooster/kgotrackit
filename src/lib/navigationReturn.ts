/**
 * Session keys and helpers so leaving Settings / Inventory does not erase the last
 * productions/planner (or field checklist) URL — nav links can return to the same project + tab.
 */

export const LAST_ROUTE_STORAGE_KEY = 'trackit:last-route';

/** Planner workspace persists this for backwards compatibility; prefer {@link getProductionsNavPath}. */
export const LAST_PLANNER_ROUTE_STORAGE_KEY = 'trackit:last-planner-route';

const ROUTES_THAT_SKIP_LAST_ROUTE_UPDATE = new Set(['/settings', '/inventory']);

/** When false, App should not overwrite {@link LAST_ROUTE_STORAGE_KEY} (keep prior workbench URL). */
export function shouldPersistLastVisitedRoute(pathname: string): boolean {
  if (pathname === '/login') return false;
  if (ROUTES_THAT_SKIP_LAST_ROUTE_UPDATE.has(pathname)) return false;
  return true;
}

export function getLastVisitedAppPath(): string | null {
  try {
    return sessionStorage.getItem(LAST_ROUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getProductionsNavPath(): string {
  const last = getLastVisitedAppPath();
  if (last?.startsWith('/productions')) return last;
  try {
    const planner = sessionStorage.getItem(LAST_PLANNER_ROUTE_STORAGE_KEY);
    if (planner?.startsWith('/productions/planner')) return planner;
  } catch {
    /* ignore */
  }
  return '/productions';
}

export function getFieldChecklistNavPath(): string {
  const last = getLastVisitedAppPath();
  if (last?.startsWith('/field-checklist')) return last;
  return '/field-checklist';
}
