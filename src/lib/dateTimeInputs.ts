/** Matches native `<input type="time">` fifteen-minute stepping used across Productions UI. */
export const TIME_INPUT_STEP_SECONDS = 900;

export function normalizeDateInputValue(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function parseTimeToMinutes(value?: string, fallbackMinutes = 0): number {
  if (!value) return fallbackMinutes;
  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallbackMinutes;
  return Math.max(0, Math.min(24 * 60, hours * 60 + minutes));
}

export function minutesToTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.min(24 * 60, Math.round(minutes / 15) * 15));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function normalizeQuarterHourTime(value?: string): string {
  if (!value) return '';
  return minutesToTime(parseTimeToMinutes(value));
}

/**
 * Normalize `YYYY-MM-DDTHH:mm` / `YYYY-MM-DDTHH:mm:ss` to the nearest quarter hour.
 * Returns empty string for invalid inputs.
 */
export function normalizeQuarterHourDateTimeLocal(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return '';
  const datePart = match[1];
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const normalizedTime = minutesToTime(hours * 60 + minutes);
  return `${datePart}T${normalizedTime}`;
}
