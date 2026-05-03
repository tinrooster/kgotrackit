/** Client-side validation and human-readable summaries for backup / snapshot JSON (no I/O). */

export type FullBackupValidation =
  | {
      ok: true;
      version: string;
      timestamp?: string;
      summaryLines: string[];
      warnings: string[];
    }
  | { ok: false; error: string };

export type SettingsSnapshotValidation =
  | {
      ok: true;
      timestamp?: string;
      summaryLines: string[];
      warnings: string[];
    }
  | { ok: false; error: string };

function len(x: unknown): number {
  return Array.isArray(x) ? x.length : 0;
}

export function validateFullBackupJsonText(text: string): FullBackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Backup root must be a JSON object.' };
  }

  const root = parsed as Record<string, unknown>;
  if (typeof root.version !== 'string' || !root.version.trim()) {
    return { ok: false, error: 'Missing backup "version" (expected a full app backup file).' };
  }
  if (!root.data || typeof root.data !== 'object') {
    return { ok: false, error: 'Missing backup "data" object.' };
  }

  const data = root.data as Record<string, unknown>;
  const warnings: string[] = [];
  const version = root.version.trim();
  const timestamp = typeof root.timestamp === 'string' ? root.timestamp : undefined;

  const itemCount = len(data.items);
  if (version === '1.0' && itemCount === 0 && !('items' in data)) {
    warnings.push('This file uses backup format 1.0 and may not include inventory rows.');
  }

  const summaryLines: string[] = [
    `Backup format: ${version}`,
    ...(timestamp ? [`Exported: ${timestamp}`] : []),
    `Inventory items: ${itemCount}`,
    `Categories: ${len(data.categories)} · Units: ${len(data.units)} · Locations: ${len(data.locations)}`,
    `Suppliers: ${len(data.suppliers)} · Projects: ${len(data.projects)} · Expense codes: ${len(data.expenseCodes)}`,
  ];

  if (Array.isArray(data.templates) && data.templates.length > 0) {
    summaryLines.push(`Templates: ${data.templates.length}`);
  } else {
    summaryLines.push('Templates: none in file');
  }

  if (Array.isArray(data.cabinets) && data.cabinets.length > 0) {
    summaryLines.push(`Cabinets: ${data.cabinets.length}`);
  } else {
    summaryLines.push('Cabinets: none in file');
  }

  if (data.financial && typeof data.financial === 'object') {
    summaryLines.push('Financial code tables: present');
  } else {
    summaryLines.push('Financial code tables: not in file (existing values kept)');
    warnings.push('Backup has no financial block; expense type / cost center data will not be replaced from this file.');
  }

  if (data.defaultSettings && typeof data.defaultSettings === 'object') {
    summaryLines.push('UI / general defaults: present');
  } else {
    summaryLines.push('UI / general defaults: not in file (existing values kept)');
  }

  if (itemCount > 5000) {
    warnings.push('Large inventory restore may take a few seconds.');
  }

  return { ok: true, version, timestamp, summaryLines, warnings };
}

export function validateSettingsSnapshotJsonText(text: string): SettingsSnapshotValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Snapshot root must be a JSON object.' };
  }

  const snap = parsed as Record<string, unknown>;
  if (snap.version !== 'trackIT-settings-snapshot') {
    return {
      ok: false,
      error: 'Not a settings snapshot (expected "version": "trackIT-settings-snapshot").',
    };
  }

  const lists = snap.lists as Record<string, unknown> | undefined;
  if (!lists || typeof lists !== 'object') {
    return { ok: false, error: 'Snapshot is missing a "lists" object.' };
  }

  const warnings: string[] = [];
  const timestamp = typeof snap.timestamp === 'string' ? snap.timestamp : undefined;

  const summaryLines: string[] = [
    'Type: settings snapshot (lists + financial + defaults + cabinets)',
    ...(timestamp ? [`Exported: ${timestamp}`] : []),
    `Categories: ${len(lists.categories)} · Units: ${len(lists.units)} · Locations: ${len(lists.locations)}`,
    `Suppliers: ${len(lists.suppliers)} · Projects: ${len(lists.projects)} · Expense codes: ${len(lists.expenseCodes)}`,
  ];

  if (snap.financial && typeof snap.financial === 'object') {
    summaryLines.push('Financial code tables: present');
  } else {
    summaryLines.push('Financial code tables: not in file');
    warnings.push('Financial block missing; expense types / cost centers will not be updated from this file.');
  }

  if (snap.defaultSettings && typeof snap.defaultSettings === 'object') {
    summaryLines.push('UI / general defaults: present');
  } else {
    summaryLines.push('UI / general defaults: not in file');
  }

  summaryLines.push(`Cabinets: ${Array.isArray(snap.cabinets) ? snap.cabinets.length : 0} in file`);

  return { ok: true, timestamp, summaryLines, warnings };
}
