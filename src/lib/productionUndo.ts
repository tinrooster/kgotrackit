import { saveProductions } from '@/lib/productionService';
import type { Production } from '@/types/productions';

const MAX_STACK = 40;

const undoStack: Production[][] = [];
const redoStack: Production[][] = [];

function cloneProductions(productions: Production[]): Production[] {
  return JSON.parse(JSON.stringify(productions)) as Production[];
}

export function recordProductionSnapshotBeforeChange(currentProductions: Production[]): void {
  undoStack.push(cloneProductions(currentProductions));
  if (undoStack.length > MAX_STACK) {
    undoStack.shift();
  }
  redoStack.length = 0;
}

export function undoProductionMutation(currentProductions: Production[]): Production[] | null {
  const previous = undoStack.pop();
  if (!previous) return null;
  redoStack.push(cloneProductions(currentProductions));
  return previous;
}

export function redoProductionMutation(currentProductions: Production[]): Production[] | null {
  const next = redoStack.pop();
  if (!next) return null;
  undoStack.push(cloneProductions(currentProductions));
  return next;
}

export function applyProductionState(
  productions: Production[],
  setProductions: (productions: Production[]) => void
): boolean {
  setProductions(productions);
  saveProductions(productions);
  return true;
}

export function canUndoProduction(): boolean {
  return undoStack.length > 0;
}

export function canRedoProduction(): boolean {
  return redoStack.length > 0;
}
