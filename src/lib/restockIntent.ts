/**
 * Pure helpers for “one-click restock” style flows (cable spools, converters, TVs).
 *
 * Typical wiring:
 * - **Package increment** comes from a device-library row (`restockPackageQuantity`), a template default, or a stored “per spool” metadata field on the item.
 * - **Target** is often `max(reorderLevel, minQuantity)` when those exist.
 * - UI calls `quantityDeltaToReachTarget` (or `singlePackageRestockDelta`) and then applies `saveItems` / checkout with the user’s confirmation.
 *
 * This module does not read storage or mutate inventory — only arithmetic you can call from Inventory, Restock, or a future “Restock +1” action.
 */

export interface ReachTargetRestockInput {
  currentQuantity: number;
  /** Desired minimum on-hand (e.g. reorder level or par stock). */
  targetQuantity: number;
  /** Stock kept in whole multiples (feet per spool, one TV, one case). */
  packageIncrement: number;
}

/** Whole-package delta so `currentQuantity + delta >= targetQuantity` (or 0 if already there / invalid). */
export function quantityDeltaToReachTarget(input: ReachTargetRestockInput): number {
  const { currentQuantity, targetQuantity, packageIncrement } = input;
  if (packageIncrement <= 0 || !Number.isFinite(currentQuantity) || !Number.isFinite(targetQuantity)) {
    return 0;
  }
  if (currentQuantity >= targetQuantity) {
    return 0;
  }
  const gap = targetQuantity - currentQuantity;
  return Math.ceil(gap / packageIncrement) * packageIncrement;
}

/** Adds exactly one stocking increment (e.g. “+1 spool” regardless of par math). */
export function singlePackageRestockDelta(packageIncrement: number): number {
  if (packageIncrement <= 0 || !Number.isFinite(packageIncrement)) {
    return 0;
  }
  return packageIncrement;
}
