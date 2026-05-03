import type { ItemWithSubcategories } from "@/types/inventory";

export interface ProjectOption {
  id: string;
  name: string;
}

/** Flatten projects and one child level into stable path ids. */
export function flattenProjectOptions(projects: ItemWithSubcategories[]): ProjectOption[] {
  const options: ProjectOption[] = [];
  projects.forEach((project) => {
    options.push({ id: project.id, name: project.name });
    (project.children || []).forEach((child) => {
      options.push({
        id: `${project.id}/${child.id}`,
        name: `${project.name}/${child.name}`,
      });
    });
  });
  return options;
}

/** Resolve legacy name/id storage to current flattened id for form select values. */
export function resolveProjectValue(
  rawValue: string | undefined,
  projects: ItemWithSubcategories[]
): string {
  if (!rawValue) return "";
  const options = flattenProjectOptions(projects);
  const matchById = options.find((option) => option.id === rawValue);
  if (matchById) return matchById.id;
  const matchByName = options.find((option) => option.name === rawValue);
  if (matchByName) return matchByName.id;
  return rawValue;
}
