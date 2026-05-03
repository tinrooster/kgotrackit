import type { ItemWithSubcategories } from "@/types/inventory";
import { resolveLocationDisplay } from "@/lib/resolveLocationLabel";

const FALLBACK_PALETTE = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
] as const;

function hashHue(label: string): string {
  const seed = label.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return FALLBACK_PALETTE[seed % FALLBACK_PALETTE.length];
}

const MUTED = "hsl(var(--muted-foreground) / 0.9)";

export function accentColorForLocation(
  value: string | undefined,
  locations: ItemWithSubcategories[]
): string {
  if (!value) {
    return MUTED;
  }
  for (const loc of locations) {
    if (loc.id === value) {
      return loc.color || hashHue(loc.name);
    }
    for (const sub of loc.children || []) {
      const composite = `${loc.id}/${sub.id}`;
      if (composite === value || sub.id === value) {
        return sub.color || loc.color || hashHue(`${loc.name}/${sub.name}`);
      }
    }
  }
  return hashHue(resolveLocationDisplay(value, locations));
}

function walkProjects(
  nodes: ItemWithSubcategories[],
  parentPath = "",
  inherited?: string
): { id: string; namePath: string; color?: string }[] {
  return nodes.flatMap((node) => {
    const namePath = parentPath ? `${parentPath}/${node.name}` : node.name;
    const color = node.color || inherited;
    const current = { id: node.id, namePath, color };
    const children = Array.isArray(node.children)
      ? walkProjects(node.children as ItemWithSubcategories[], namePath, color)
      : [];
    return [current, ...children];
  });
}

export function accentColorForProject(
  value: string | undefined,
  projects: ItemWithSubcategories[]
): string {
  if (!value) {
    return MUTED;
  }
  const flat = walkProjects(projects);
  const byId = flat.find((e) => e.id === value);
  if (byId?.color) {
    return byId.color;
  }
  const byPath = flat.find((e) => e.namePath === value);
  if (byPath?.color) {
    return byPath.color;
  }
  const top = projects.find((p) => p.id === value || p.name === value);
  if (top?.color) {
    return top.color;
  }
  return hashHue(value);
}
