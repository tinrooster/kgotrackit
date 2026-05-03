import { toast } from 'sonner';
import { getItems, saveItems } from '@/lib/storageService';
import type { ItemWithSubcategories } from '@/types/inventory';

const RECONCILE_PANELS = ['categories', 'suppliers', 'units', 'locations', 'projects'] as const;
export type LookupReconcilePanel = (typeof RECONCILE_PANELS)[number];

export function panelSupportsListReconcile(panel: string): panel is LookupReconcilePanel {
  return (RECONCILE_PANELS as readonly string[]).includes(panel);
}

export function fixUnreconciledCategories(categories: ItemWithSubcategories[]): void {
  const items = getItems();
  const validCategories = categories.map((cat) => cat.name);
  const itemsWithInvalidCategories = items.filter(
    (item) => item.category && !validCategories.includes(item.category)
  );
  if (itemsWithInvalidCategories.length === 0) {
    toast.info('No inventory items with invalid categories found');
    return;
  }
  const fixedItems = items.map((item) => {
    if (item.category && !validCategories.includes(item.category)) {
      const newItem = { ...item };
      newItem.customFields = { ...newItem.customFields, previousCategory: item.category };
      delete newItem.category;
      return newItem;
    }
    return item;
  });
  saveItems(fixedItems);
  toast.success(`Fixed ${itemsWithInvalidCategories.length} items with invalid categories`);
}

export function fixUnreconciledSuppliers(suppliers: ItemWithSubcategories[]): void {
  const items = getItems();
  const validSuppliers = suppliers.map((sup) => sup.name);
  const itemsWithInvalidSuppliers = items.filter(
    (item) => item.supplier && !validSuppliers.includes(item.supplier)
  );
  if (itemsWithInvalidSuppliers.length === 0) {
    toast.info('No inventory items with invalid suppliers found');
    return;
  }
  const fixedItems = items.map((item) => {
    if (item.supplier && !validSuppliers.includes(item.supplier)) {
      const newItem = { ...item };
      newItem.customFields = { ...newItem.customFields, previousSupplier: item.supplier };
      delete newItem.supplier;
      return newItem;
    }
    return item;
  });
  saveItems(fixedItems);
  toast.success(`Fixed ${itemsWithInvalidSuppliers.length} items with invalid suppliers`);
}

export function fixUnreconciledUnits(units: ItemWithSubcategories[]): void {
  const items = getItems();
  const validUnits = units.map((u) => u.name);
  const itemsWithInvalidUnits = items.filter((item) => item.unit && !validUnits.includes(item.unit));
  if (itemsWithInvalidUnits.length === 0) {
    toast.info('No inventory items with invalid units found');
    return;
  }
  const defaultUnit = validUnits.length > 0 ? validUnits[0] : 'each';
  const fixedItems = items.map((item) => {
    if (item.unit && !validUnits.includes(item.unit)) {
      const newItem = { ...item };
      newItem.customFields = { ...newItem.customFields, previousUnit: item.unit };
      newItem.unit = defaultUnit;
      return newItem;
    }
    return item;
  });
  saveItems(fixedItems);
  toast.success(`Fixed ${itemsWithInvalidUnits.length} items with invalid units`);
}

export function fixUnreconciledLocations(locations: ItemWithSubcategories[]): void {
  const items = getItems();
  const validLocations = locations.map((loc) => loc.name);
  const itemsWithInvalidLocations = items.filter(
    (item) => item.location && !validLocations.includes(item.location)
  );
  if (itemsWithInvalidLocations.length === 0) {
    toast.info('No inventory items with invalid locations found');
    return;
  }
  const fixedItems = items.map((item) => {
    if (item.location && !validLocations.includes(item.location)) {
      const newItem = { ...item };
      newItem.customFields = { ...newItem.customFields, previousLocation: item.location };
      delete newItem.location;
      return newItem;
    }
    return item;
  });
  saveItems(fixedItems);
  toast.success(`Fixed ${itemsWithInvalidLocations.length} items with invalid locations`);
}

export function fixUnreconciledProjects(projects: ItemWithSubcategories[]): void {
  const items = getItems();
  const validProjects = projects.map((proj) => proj.name);
  const itemsWithInvalidProjects = items.filter(
    (item) => item.project && !validProjects.includes(item.project)
  );
  if (itemsWithInvalidProjects.length === 0) {
    toast.info('No inventory items with invalid projects found');
    return;
  }
  const fixedItems = items.map((item) => {
    if (item.project && !validProjects.includes(item.project)) {
      const newItem = { ...item };
      newItem.customFields = { ...newItem.customFields, previousProject: item.project };
      delete newItem.project;
      return newItem;
    }
    return item;
  });
  saveItems(fixedItems);
  toast.success(`Fixed ${itemsWithInvalidProjects.length} items with invalid projects`);
}

export function fixUnreconciledForLookupPanel(
  panel: 'categories' | 'suppliers' | 'units' | 'locations' | 'projects',
  settings: {
    categories: ItemWithSubcategories[];
    suppliers: ItemWithSubcategories[];
    units: ItemWithSubcategories[];
    locations: ItemWithSubcategories[];
    projects: ItemWithSubcategories[];
  }
): void {
  switch (panel) {
    case 'categories':
      fixUnreconciledCategories(settings.categories);
      break;
    case 'suppliers':
      fixUnreconciledSuppliers(settings.suppliers);
      break;
    case 'units':
      fixUnreconciledUnits(settings.units);
      break;
    case 'locations':
      fixUnreconciledLocations(settings.locations);
      break;
    case 'projects':
      fixUnreconciledProjects(settings.projects);
      break;
    default:
      break;
  }
}
