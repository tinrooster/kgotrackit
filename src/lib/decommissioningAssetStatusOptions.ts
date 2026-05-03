import type { InventoryItem } from '@/types/inventory';

export type AssetStatusValue = NonNullable<InventoryItem['assetStatus']>;

/** Grouped options for the EOL / decommissioning tab (same `assetStatus` field as Details). */
export const ASSET_STATUS_GROUPS_FOR_EOL_TAB: {
  label: string;
  options: { value: AssetStatusValue; label: string }[];
}[] = [
  {
    label: 'Operational',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'hot_spare', label: 'Hot spare' },
      { value: 'cold_spare', label: 'Cold spare' },
      { value: 'in_service', label: 'In service' },
    ],
  },
  {
    label: 'EOL / decommissioning',
    options: [
      { value: 'ready_decommission', label: 'Ready to decommission' },
      { value: 'slated_removal', label: 'Slated for removal' },
      { value: 'cut_over_pending', label: 'Cut-over pending' },
      { value: 'ewaste', label: 'E-waste' },
      { value: 'other', label: 'Other' },
    ],
  },
];
