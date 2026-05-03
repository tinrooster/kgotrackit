import type { InventoryItem } from '@/types/inventory';
import { saveItems } from '@/lib/storageService';

const MAX_STACK = 40;

const undoStack: InventoryItem[][] = [];
const redoStack: InventoryItem[][] = [];

function cloneItems(items: InventoryItem[]): InventoryItem[] {
  return JSON.parse(JSON.stringify(items)) as InventoryItem[];
}

export function recordInventorySnapshotBeforeChange(currentItems: InventoryItem[]): void {
  undoStack.push(cloneItems(currentItems));
  if (undoStack.length > MAX_STACK) {
    undoStack.shift();
  }
  redoStack.length = 0;
}

export function undoInventoryMutation(currentItems: InventoryItem[]): InventoryItem[] | null {
  const previous = undoStack.pop();
  if (!previous) {
    return null;
  }
  redoStack.push(cloneItems(currentItems));
  return previous;
}

export function redoInventoryMutation(currentItems: InventoryItem[]): InventoryItem[] | null {
  const next = redoStack.pop();
  if (!next) {
    return null;
  }
  undoStack.push(cloneItems(currentItems));
  return next;
}

export function applyInventoryState(items: InventoryItem[], setItems: (items: InventoryItem[]) => void): boolean {
  setItems(items);
  return saveItems(items);
}

export function canUndoInventory(): boolean {
  return undoStack.length > 0;
}

export function canRedoInventory(): boolean {
  return redoStack.length > 0;
}
