import * as XLSX from 'xlsx';
import { canonicalNameKey, parseContactDisplayName } from '@/lib/contactName';

export interface ParsedContactCandidate {
  fullName: string;
  phone?: string;
  extension?: string;
  email?: string;
  functionalArea?: string;
  sourceFile: string;
  sourceSheet: string;
}

export interface ContactWorkbookParseResult {
  contacts: ParsedContactCandidate[];
  sheetsScanned: number;
  rowsScanned: number;
  sheetSummaries: Array<{
    sheetName: string;
    candidatesFound: number;
  }>;
}

export interface ContactWorkbookParseProgress {
  sheetName: string;
  sheetIndex: number;
  totalSheets: number;
}

type HeaderField = 'fullName' | 'phone' | 'extension' | 'email' | 'functionalArea';
type HeaderMap = Partial<Record<HeaderField, number>>;

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isLikelyPersonName(value: string): boolean {
  const cleaned = value.trim();
  if (!cleaned) return false;
  if (/\d/.test(cleaned)) return false;
  const lower = cleaned.toLowerCase();
  const blockedFragments = [
    'office',
    'manager',
    'maintenance',
    'mail room',
    'travel',
    'reservation',
    'janitorial',
    'security',
    'tie lines',
    'fax',
    'cell for emergencies',
    'building',
  ];
  if (blockedFragments.some((fragment) => lower.includes(fragment))) return false;
  if (cleaned.includes(',')) {
    const [lastName, firstName] = cleaned.split(',', 2).map((part) => part.trim());
    return Boolean(lastName && firstName);
  }
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((token) => /^[A-Z][A-Za-z'.-]*$/.test(token));
}

function isLikelyPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7;
}

function isLikelyEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function cleanExtension(value: string): string {
  const cleaned = value.replace(/^(ext\.?|extension)\s*/i, '').trim();
  const digits = cleaned.replace(/[^\d]/g, '');
  return digits || cleaned;
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
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

function scoreHeaderCell(value: string): Partial<Record<HeaderField, number>> {
  const v = value.trim().toLowerCase();
  if (!v) return {};
  const score: Partial<Record<HeaderField, number>> = {};
  if (/(name|employee|person|staff|contact)/.test(v)) score.fullName = 2;
  if (/(home phone|phone|telephone|tel|mobile|cell)/.test(v)) score.phone = 2;
  if (/(ext|extension|x$)/.test(v)) score.extension = 2;
  if (/(email|e-mail|mail)/.test(v)) score.email = 2;
  if (/(department|dept|team|group|division|unit|assignment|show)/.test(v)) score.functionalArea = 2;
  return score;
}

function detectHeaderMap(rows: string[][]): { headerRowIndex: number; headerMap: HeaderMap } | null {
  let best: { rowIndex: number; map: HeaderMap; score: number } | null = null;
  const maxScan = Math.min(rows.length, 30);
  for (let rowIndex = 0; rowIndex < maxScan; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const map: HeaderMap = {};
    let rowScore = 0;
    row.forEach((cellValue, colIndex) => {
      const score = scoreHeaderCell(cellValue);
      for (const [field, points] of Object.entries(score) as Array<[HeaderField, number]>) {
        if (points <= 0) continue;
        if (map[field] === undefined) {
          map[field] = colIndex;
          rowScore += points;
        }
      }
    });
    if (rowScore >= 2 && map.fullName !== undefined) {
      if (!best || rowScore > best.score) {
        best = { rowIndex, map, score: rowScore };
      }
    }
  }
  return best ? { headerRowIndex: best.rowIndex, headerMap: best.map } : null;
}

function candidateFromRow(
  row: string[],
  headerMap: HeaderMap,
  sourceFile: string,
  sourceSheet: string,
): ParsedContactCandidate | null {
  const fallbackNameCell = row.find((value) => /[a-z]/i.test(value) && value.length >= 3) ?? '';
  const fullName = normalizeCellValue(
    headerMap.fullName !== undefined ? row[headerMap.fullName] : fallbackNameCell,
  );
  const parsedFullName = parseContactDisplayName(fullName);
  if (!parsedFullName || !/[a-z]/i.test(parsedFullName)) return null;

  const rawPhone = normalizeCellValue(
    headerMap.phone !== undefined ? row[headerMap.phone] : '',
  );
  const rawExtension = normalizeCellValue(
    headerMap.extension !== undefined ? row[headerMap.extension] : '',
  );
  const rawEmail = normalizeCellValue(
    headerMap.email !== undefined ? row[headerMap.email] : '',
  );
  const rawFunctionalArea = normalizeCellValue(
    headerMap.functionalArea !== undefined ? row[headerMap.functionalArea] : '',
  );

  const phone = rawPhone && isLikelyPhone(rawPhone) ? normalizePhone(rawPhone) : '';
  const extension = rawExtension ? cleanExtension(rawExtension) : '';
  const email = rawEmail && isLikelyEmail(rawEmail) ? rawEmail : '';

  return {
    fullName: parsedFullName,
    phone: phone || undefined,
    extension: extension || undefined,
    email: email || undefined,
    functionalArea: rawFunctionalArea || undefined,
    sourceFile,
    sourceSheet,
  };
}

export async function parseContactWorkbookFile(
  file: File,
  options?: {
    onProgress?: (progress: ContactWorkbookParseProgress) => void;
  },
): Promise<ContactWorkbookParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const candidates: ParsedContactCandidate[] = [];
  let rowsScanned = 0;
  const sheetSummaries: Array<{ sheetName: string; candidatesFound: number }> = [];

  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const sheetName = workbook.SheetNames[sheetIndex];
    options?.onProgress?.({
      sheetName,
      sheetIndex: sheetIndex + 1,
      totalSheets: workbook.SheetNames.length,
    });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    }) as unknown[][];
    const normalizedRows = rows.map((row) => row.map((cell) => normalizeCellValue(cell)));
    rowsScanned += normalizedRows.length;

    const detected = detectHeaderMap(normalizedRows);
    const beforeCount = candidates.length;
    if (detected) {
      const headerMap: HeaderMap = detected.headerMap;
      const startIndex = detected.headerRowIndex + 1;
      for (let rowIndex = startIndex; rowIndex < normalizedRows.length; rowIndex += 1) {
        const row = normalizedRows[rowIndex];
        if (!row || row.every((value) => !value)) continue;
        const candidate = candidateFromRow(row, headerMap, file.name, sheetName);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    } else {
      const pendingNameByPairColumn = new Map<number, string>();
      for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex += 1) {
        const row = normalizedRows[rowIndex];
        if (!row || row.every((value) => !value)) continue;
        for (let columnIndex = 0; columnIndex < row.length; columnIndex += 2) {
          const nameCell = normalizeCellValue(row[columnIndex]);
          const infoCell = normalizeCellValue(row[columnIndex + 1]);
          if (isLikelyPersonName(nameCell)) {
            const phone = isLikelyPhone(infoCell) ? normalizePhone(infoCell) : '';
            const extension = !phone && infoCell ? cleanExtension(infoCell) : '';
            candidates.push({
              fullName: parseContactDisplayName(nameCell),
              phone: phone || undefined,
              extension: extension || undefined,
              sourceFile: file.name,
              sourceSheet: sheetName,
            });
            pendingNameByPairColumn.set(columnIndex, nameCell);
            continue;
          }
          const pendingName = pendingNameByPairColumn.get(columnIndex);
          if (!nameCell && pendingName && infoCell && isLikelyPhone(infoCell)) {
            candidates.push({
              fullName: parseContactDisplayName(pendingName),
              phone: normalizePhone(infoCell),
              sourceFile: file.name,
              sourceSheet: sheetName,
            });
          }
        }
      }
    }
    const candidatesFound = candidates.length - beforeCount;
    sheetSummaries.push({ sheetName, candidatesFound });
  }

  const mergedByName = new Map<string, ParsedContactCandidate>();
  for (const candidate of candidates) {
    const key = canonicalNameKey(candidate.fullName);
    if (!key) continue;
    const existing = mergedByName.get(key);
    if (!existing) {
      mergedByName.set(key, candidate);
      continue;
    }
    mergedByName.set(key, {
      ...existing,
      phone: existing.phone || candidate.phone,
      extension: existing.extension || candidate.extension,
      email: existing.email || candidate.email,
      functionalArea: existing.functionalArea || candidate.functionalArea,
    });
  }

  return {
    contacts: Array.from(mergedByName.values()),
    sheetsScanned: workbook.SheetNames.length,
    rowsScanned,
    sheetSummaries,
  };
}
