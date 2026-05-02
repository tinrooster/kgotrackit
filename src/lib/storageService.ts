import { InventoryItem, CategoryNode, ItemWithSubcategories } from '@/types/inventory';
import { ItemTemplate } from '@/types/templates';

declare global {
  interface Window {
    electronStore: {
      getData: (key: string) => any;
      setData: (key: string, value: any) => void;
      deleteData: (key: string) => void;
    };
  }
}

// Constants for storage keys
export const STORAGE_KEYS = {
  CATEGORIES: 'inventory-categories',
  UNITS: 'inventory-units',
  LOCATIONS: 'inventory-locations',
  SUPPLIERS: 'inventory-suppliers',
  PROJECTS: 'inventory-projects',
  EXPENSE_CODES: 'inventory-expense-codes',
  ITEMS: 'inventoryItems',
  HISTORY: 'inventory-history',
  TEMPLATES: 'inventory-templates',
  GENERAL_SETTINGS: 'inventory-general-settings',
  USERS: 'users',
};

export const SETTINGS_UPDATED_EVENT = 'trackit:settings-updated';

// Helper function to parse dates in items
const parseItemDates = (item: any): InventoryItem => ({
  ...item,
  lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date(),
  expectedDeliveryDate: item.expectedDeliveryDate ? new Date(item.expectedDeliveryDate) : undefined
});

// Get items from store
export const getItems = (): InventoryItem[] => {
  try {
    const electronItems = window.electronStore.getData(STORAGE_KEYS.ITEMS) as InventoryItem[] | undefined;

    if (electronItems && electronItems.length > 0) {
      const parsedElectronItems = electronItems.map(parseItemDates);
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(parsedElectronItems));
      return parsedElectronItems;
    }

    const localItems = localStorage.getItem(STORAGE_KEYS.ITEMS);
    if (!localItems) {
      return [];
    }

    return JSON.parse(localItems).map(parseItemDates);
  } catch (error) {
    console.error('Error getting items from store:', error);
    try {
      const localItems = localStorage.getItem(STORAGE_KEYS.ITEMS);
      return localItems ? JSON.parse(localItems).map(parseItemDates) : [];
    } catch {
      return [];
    }
  }
};

// Save items to store
export const saveItems = (items: InventoryItem[]): void => {
  try {
    const itemsToSave = items.map(item => ({
      ...item,
      lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : new Date().toISOString(),
      expectedDeliveryDate: item.expectedDeliveryDate instanceof Date ? item.expectedDeliveryDate.toISOString() : undefined,
    }));
    window.electronStore.setData(STORAGE_KEYS.ITEMS, itemsToSave);
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(itemsToSave));
  } catch (error) {
    console.error('Error saving items to store:', error);
    try {
      const itemsToSave = items.map(item => ({
        ...item,
        lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : new Date().toISOString(),
        expectedDeliveryDate: item.expectedDeliveryDate instanceof Date ? item.expectedDeliveryDate.toISOString() : undefined,
      }));
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(itemsToSave));
    } catch {
      // no-op fallback
    }
  }
};

export interface Settings {
  categories: CategoryNode[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseCodes: ItemWithSubcategories[];
}

// Get settings from store
export const getSettings = (): Settings => {
  try {
    const settings: Settings = {
      categories: [],
      units: [],
      locations: [],
      suppliers: [],
      projects: [],
      expenseCodes: []
    };

    // Load each setting
    Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
      if (['CATEGORIES', 'UNITS', 'LOCATIONS', 'SUPPLIERS', 'PROJECTS', 'EXPENSE_CODES'].includes(key)) {
        const electronValues = window.electronStore?.getData?.(storageKey);
        const localValuesRaw = localStorage.getItem(storageKey);
        const localValues = localValuesRaw ? JSON.parse(localValuesRaw) : undefined;
        const values = electronValues ?? localValues;
        if (values) {
          // Convert old string[] format to ItemWithSubcategories[]
          if (Array.isArray(values)) {
            if (values.length > 0) {
              if (typeof values[0] === 'string') {
                // Convert old string[] format to new format
                const newFormat = values.map((name: string) => ({
                  id: crypto.randomUUID(),
                  name,
                  subcategories: []
                }));
                settings[key.toLowerCase() as keyof Settings] = newFormat;
                // Save in new format
                window.electronStore.setData(storageKey, newFormat);
                localStorage.setItem(storageKey, JSON.stringify(newFormat));
              } else {
                // Already in new format
                settings[key.toLowerCase() as keyof Settings] = values;
                localStorage.setItem(storageKey, JSON.stringify(values));
              }
            }
          }
        }
      }
    });

    return settings;
  } catch (error) {
    console.error('Error getting settings from store:', error);
    return {
      categories: [],
      units: [],
      locations: [],
      suppliers: [],
      projects: [],
      expenseCodes: []
    };
  }
};

// Save settings to store
export const saveSettings = (settings: Settings): void => {
  try {
    Object.entries(settings).forEach(([key, values]) => {
      const storageKey = STORAGE_KEYS[key.toUpperCase() as keyof typeof STORAGE_KEYS];
      if (storageKey) {
        try {
          window.electronStore.setData(storageKey, values);
        } catch {
          // Use localStorage fallback when electron store bridge is unavailable.
        }
        localStorage.setItem(storageKey, JSON.stringify(values));
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: settings }));
    }
  } catch (error) {
    console.error('Error saving settings to store:', error);
  }
};

// Save templates to store
export const saveTemplates = (templates: ItemTemplate[]): void => {
  try {
    console.log('Saving templates:', templates);
    if (!Array.isArray(templates)) {
      console.error('Templates must be an array');
      return;
    }
    
    // Ensure we're saving valid template data
    const validTemplates = templates.filter(template => 
      template && 
      typeof template === 'object' && 
      template.templateId && 
      template.templateName
    );
    
    window.electronStore.setData(STORAGE_KEYS.TEMPLATES, validTemplates);
    console.log('Templates saved successfully');
  } catch (error) {
    console.error('Error saving templates to store:', error);
    throw error;
  }
};

// Get templates from store
export const getTemplates = (): ItemTemplate[] => {
  try {
    const templates = window.electronStore.getData(STORAGE_KEYS.TEMPLATES) as ItemTemplate[];
    console.log('Templates loaded from store:', templates);
    
    if (!templates) {
      console.log('No templates found in storage');
      return [];
    }
    
    if (!Array.isArray(templates)) {
      console.error('Stored templates is not an array');
      return [];
    }
    
    // Validate template structure
    const validTemplates = templates.filter(template => 
      template && 
      typeof template === 'object' && 
      template.templateId && 
      template.templateName
    );
    
    console.log('Valid templates loaded:', validTemplates);
    return validTemplates;
  } catch (error) {
    console.error('Error getting templates from store:', error);
    return [];
  }
};