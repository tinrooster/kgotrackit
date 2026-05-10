/**
 * US-focused phone formatting for directory, crew, and workbook import.
 * Non‑US or ambiguous values are returned trimmed as typed when we cannot normalize.
 */

export function normalizeUsPhoneForStorage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^x\d+$/i.test(trimmed) || /^ext\.?\s*\d+$/i.test(trimmed)) {
    return '';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1);
    return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return trimmed;
}

/** Accept empty, (xxx) xxx-xxxx, or +1 (xxx) xxx-xxxx after normalization. */
export function isStandardUsPhoneStored(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  return /^\(\d{3}\)\s\d{3}-\d{4}$/.test(t) || /^\+1\s\(\d{3}\)\s\d{3}-\d{4}$/.test(t);
}
