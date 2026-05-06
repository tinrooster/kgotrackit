import { ChecklistItem, Production } from '@/types/productions';
import { getItems, saveItems, STORAGE_KEYS } from '@/lib/storageService';
import { requestCloudSync } from '@/lib/cloudSyncEvents';
import { logger } from '@/lib/logging';

export const PRODUCTIONS_UPDATED_EVENT = 'trackit:productions-updated';
export const INVENTORY_PRODUCTION_ALLOCATION_UPDATED_EVENT = 'trackit:inventory-production-allocation-updated';

export interface InventoryProductionAllocation {
  reserved: number;
  checkedOut: number;
}

export type InventoryProductionAllocationMap = Record<string, InventoryProductionAllocation>;

export type ProductionInventoryAction = 'reserve' | 'checkout' | 'checkin';

function dispatchProductionsUpdated(productions: Production[]): void {
  window.dispatchEvent(new CustomEvent(PRODUCTIONS_UPDATED_EVENT, { detail: productions }));
  window.dispatchEvent(new CustomEvent(INVENTORY_PRODUCTION_ALLOCATION_UPDATED_EVENT));
}

function normalizeChecklistQuantity(item: ChecklistItem): number {
  const parsed = Number(item.quantity ?? 1);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function normalizeProductionChecklistGroupIds(production: Production): Production {
  return {
    ...production,
    checklistGroups: production.checklistGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        quantity: normalizeChecklistQuantity(item),
        reservedQuantity: Number(item.reservedQuantity ?? 0) || 0,
        checkedOutQuantity: Number(item.checkedOutQuantity ?? 0) || 0,
      })),
    })),
  };
}

export function getProductions(): Production[] {
  try {
    const electronValue = window.electronStore?.getData?.(STORAGE_KEYS.PRODUCTIONS) as Production[] | undefined;
    if (electronValue && Array.isArray(electronValue) && electronValue.length > 0) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTIONS, JSON.stringify(electronValue));
      return electronValue.map(normalizeProductionChecklistGroupIds);
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Production[]).map(normalizeProductionChecklistGroupIds) : [];
  } catch {
    return [];
  }
}

export function saveProductions(productions: Production[]): void {
  try {
    window.electronStore?.setData?.(STORAGE_KEYS.PRODUCTIONS, productions);
  } catch {
    // ignore — electron may not be present
  }
  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTIONS, JSON.stringify(productions));
  } catch {
    // quota or private mode
  }
  dispatchProductionsUpdated(productions);
  requestCloudSync();
}

export function createProduction(
  data: Omit<Production, 'id' | 'createdAt' | 'updatedAt'>,
  createdBy?: string
): Production {
  const now = new Date().toISOString();
  const production: Production = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdBy: createdBy ?? data.createdBy,
    crewSchedule: data.crewSchedule ?? [],
  };
  const productions = getProductions();
  saveProductions([...productions, production]);
  return production;
}

export function updateProduction(id: string, updates: Partial<Omit<Production, 'id' | 'createdAt'>>): Production | null {
  const productions = getProductions();
  const index = productions.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: Production = normalizeProductionChecklistGroupIds({
    ...productions[index],
    ...updates,
    id,
    createdAt: productions[index].createdAt,
    updatedAt: new Date().toISOString(),
  });
  productions[index] = updated;
  saveProductions(productions);
  return updated;
}

export function deleteProduction(id: string): void {
  const productions = getProductions().filter((p) => p.id !== id);
  saveProductions(productions);
}

export function getInventoryProductionAllocationMap(productions: Production[] = getProductions()): InventoryProductionAllocationMap {
  const map: InventoryProductionAllocationMap = {};
  for (const production of productions) {
    for (const group of production.checklistGroups) {
      for (const item of group.items) {
        if (!item.inventoryItemId) continue;
        const key = item.inventoryItemId;
        if (!map[key]) {
          map[key] = { reserved: 0, checkedOut: 0 };
        }
        map[key].reserved += Number(item.reservedQuantity ?? 0) || 0;
        map[key].checkedOut += Number(item.checkedOutQuantity ?? 0) || 0;
      }
    }
  }
  return map;
}

function recordCheckoutRecentActivity(
  production: Production,
  itemName: string,
  quantity: number,
  action: 'ITEM_CHECKOUT' | 'ITEM_CHECKIN',
  username?: string
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    type: 'audit',
    message: action,
    details: {
      itemName,
      quantity,
      cabinetName: `Production: ${production.name}`,
      cabinetId: `production:${production.id}`,
      performedBy: username || 'unknown',
      source: 'productions-module',
    },
    component: 'ProductionDetail',
  };
  try {
    const raw = localStorage.getItem('checkout-recent-activities');
    const existing = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(existing) ? [...existing, entry] : [entry];
    localStorage.setItem('checkout-recent-activities', JSON.stringify(next.slice(-500)));
  } catch {
    // ignore recent activity persistence failures
  }
}

export function applyProductionInventoryAction(
  productionId: string,
  action: ProductionInventoryAction,
  username?: string
): { ok: boolean; message: string } {
  const productions = getProductions();
  const index = productions.findIndex((production) => production.id === productionId);
  if (index < 0) return { ok: false, message: 'Production not found.' };
  const production = productions[index];
  const inventoryItems = getItems();
  const nextInventory = [...inventoryItems];
  let changed = 0;

  const applyToInventoryItem = (inventoryItemId: string, mutate: (quantity: number) => number): boolean => {
    const inventoryIndex = nextInventory.findIndex((item) => item.id === inventoryItemId);
    if (inventoryIndex < 0) return false;
    const item = nextInventory[inventoryIndex];
    const nextQuantity = mutate(Number(item.quantity ?? 0));
    if (nextQuantity < 0) return false;
    nextInventory[inventoryIndex] = {
      ...item,
      quantity: nextQuantity,
      lastUpdated: new Date(),
    };
    return true;
  };

  const nextProduction = normalizeProductionChecklistGroupIds({
    ...production,
    checklistGroups: production.checklistGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (!item.inventoryItemId) return item;
        const quantity = normalizeChecklistQuantity(item);
        const currentReserved = Number(item.reservedQuantity ?? 0) || 0;
        const currentCheckedOut = Number(item.checkedOutQuantity ?? 0) || 0;

        if (action === 'reserve') {
          if (currentReserved !== quantity) {
            changed += 1;
          }
          return { ...item, reservedQuantity: quantity };
        }

        if (action === 'checkout') {
          const delta = quantity - currentCheckedOut;
          if (delta <= 0) {
            return { ...item, reservedQuantity: quantity, checkedOutQuantity: quantity };
          }
          const applied = applyToInventoryItem(item.inventoryItemId, (available) => available - delta);
          if (!applied) return item;
          changed += 1;
          recordCheckoutRecentActivity(production, item.label, delta, 'ITEM_CHECKOUT', username);
          logger.info('audit', 'ITEM_CHECKOUT', {
            itemId: item.inventoryItemId,
            itemName: item.label,
            quantity: delta,
            cabinetName: `Production: ${production.name}`,
            cabinetId: `production:${production.id}`,
            performedBy: username,
            source: 'productions-module',
          }, 'ProductionDetail');
          return { ...item, reservedQuantity: quantity, checkedOutQuantity: quantity };
        }

        if (action === 'checkin') {
          const delta = currentCheckedOut;
          if (delta <= 0) return { ...item, checkedOutQuantity: 0 };
          const applied = applyToInventoryItem(item.inventoryItemId, (available) => available + delta);
          if (!applied) return item;
          changed += 1;
          recordCheckoutRecentActivity(production, item.label, delta, 'ITEM_CHECKIN', username);
          logger.info('audit', 'ITEM_CHECKIN', {
            itemId: item.inventoryItemId,
            itemName: item.label,
            quantity: delta,
            cabinetName: `Production: ${production.name}`,
            cabinetId: `production:${production.id}`,
            performedBy: username,
            source: 'productions-module',
          }, 'ProductionDetail');
          return { ...item, checkedOutQuantity: 0 };
        }

        return item;
      }),
    })),
  });

  if (action !== 'reserve') {
    const savedInventory = saveItems(nextInventory);
    if (!savedInventory) {
      return { ok: false, message: 'Could not save inventory changes.' };
    }
  }

  const nextProductions = [...productions];
  nextProductions[index] = {
    ...nextProduction,
    updatedAt: new Date().toISOString(),
  };
  saveProductions(nextProductions);

  if (!changed) {
    if (action === 'reserve') return { ok: true, message: 'All linked checklist items are already reserved.' };
    if (action === 'checkout') return { ok: true, message: 'No additional inventory to check out.' };
    return { ok: true, message: 'No checked-out quantities found to check in.' };
  }

  if (action === 'reserve') return { ok: true, message: 'Reserved linked inventory quantities for this production.' };
  if (action === 'checkout') return { ok: true, message: 'Checked out linked inventory quantities.' };
  return { ok: true, message: 'Checked in linked inventory quantities.' };
}

export function exportProductionPacklistsToPdf(production: Production): void {
  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) return;
  const escaped = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const vehicleMarkup = production.vehiclePacklists
    .map((packlist) => {
      const rows = packlist.items
        .map(
          (item) => `
            <tr>
              <td class="check-col"></td>
              <td>${escaped(item.label)}</td>
              <td>${Number(item.quantity ?? 1) || 1}</td>
              <td>${item.completed ? 'Yes' : 'No'}</td>
            </tr>
          `
        )
        .join('');
      return `
        <section class="packlist">
          <h3>${escaped(packlist.vehicleName)}</h3>
          <table>
            <thead>
              <tr><th class="check-col">Packed</th><th>Item</th><th>Qty</th><th>Done</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  popup.document.write(`
    <html>
      <head>
        <title>${escaped(production.name)} — Vehicle Packlists</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { margin: 0 0 8px; }
          .meta { color: #555; margin-bottom: 16px; }
          .packlist { margin-bottom: 18px; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; }
          .check-col { width: 72px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escaped(production.name)} — Vehicle Packlists</h1>
        <div class="meta">
          ${production.client ? `Client: ${escaped(production.client)} · ` : ''}
          ${production.location ? `Location: ${escaped(production.location)} · ` : ''}
          ${production.startDate ? `Start: ${escaped(production.startDate)} ` : ''}
          ${production.endDate ? `End: ${escaped(production.endDate)}` : ''}
        </div>
        ${vehicleMarkup || '<p>No vehicle packlists.</p>'}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  popup.document.close();
}
