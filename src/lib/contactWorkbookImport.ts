import * as XLSX from 'xlsx';
import { normalizeUsPhoneForStorage } from '@/lib/phoneNormalization';
import { canonicalNameKey, parseContactDisplayName } from '@/lib/contactName';

export interface ParsedContactCandidate {
  fullName: string;
  phone?: string;
  extension?: string;
  email?: string;
  /** Department / bureau from workbook (e.g. "Transmission") */
  department?: string;
  functionalArea?: string;
  jobTitle?: string;
  notes?: string;
  preferredVehicle?: string;
  /** Truck / photog auxiliary columns merged with header labels */
  vehicleNotes?: string;
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

type PrimaryHeaderField =
  | 'fullName'
  | 'workPhone'
  | 'mobilePhone'
  | 'extension'
  | 'email'
  | 'department'
  | 'jobTitle'
  | 'functionalArea'
  | 'notes'
  | 'preferredVehicle';

type PrimaryHeaderMap = Partial<Record<PrimaryHeaderField, number>>;

type HeaderDetection = {
  headerRowIndex: number;
  primaryMap: PrimaryHeaderMap;
  /** Extra Photog / truck columns (not the primary truck-id column) */
  vehicleAuxColumns: Array<{ columnIndex: number; label: string }>;
  headerLabels: string[];
};

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

function classifyHeaderCell(raw: string): PrimaryHeaderField | 'vehicleAux' | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;

  if (v.includes('photogtruckids') || /^truck\s*ids?$/.test(v)) return 'preferredVehicle';

  if (
    /\bmobile\b|\bcell\b|\bpager\b/.test(v) &&
    !/\bhome\b|\bwork\b|\boffice\b|\bdesk\b/.test(v)
  ) {
    return 'mobilePhone';
  }
  if (/\bwork\s*phone\b|\bworkphone\b|\boffice\b|\bdesk\b|\bbusiness\s*phone\b/.test(v)) {
    return 'workPhone';
  }

  if (/\bphotog\b|\bphotographer\b|\btruck\b/.test(v)) {
    return 'vehicleAux';
  }

  if (/\bphone\b|\btelephone\b|\btel\b|\bfax\b/.test(v)) return 'workPhone';
  if (/^ext(ension)?\b|\bextension\b|^x$/.test(v)) return 'extension';
  if (/\be-?mail\b|^email$|\bmail\b/.test(v)) return 'email';
  if (/\bdepartment\b|\bdept\b|\bbureau\b/.test(v)) return 'department';
  if (/\btitle\b|\brole\b|\bposition\b|\bjob\b|\bduty\b/.test(v)) return 'jobTitle';
  if (/\bfunctional\b|\bassignment\b|\bunit\b/.test(v)) return 'functionalArea';
  if (/\bnotes?\b|\bcomment\b|\bremark\b/.test(v)) return 'notes';

  if (/^name$|full\s*name|employee|staff\s*name|contact\s*name/.test(v)) return 'fullName';
  if (/\bname\b/.test(v) && !/\bnickname\b|\buser\s*name\b/.test(v)) return 'fullName';

  return null;
}

function detectHeaderMap(rows: string[][]): HeaderDetection | null {
  let best: { rowIndex: number; primaryMap: PrimaryHeaderMap; vehicleAux: HeaderDetection['vehicleAuxColumns']; score: number } | null =
    null;
  const maxScan = Math.min(rows.length, 35);

  for (let rowIndex = 0; rowIndex < maxScan; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const primaryMap: PrimaryHeaderMap = {};
    const vehicleAux: Array<{ columnIndex: number; label: string }> = [];
    let rowScore = 0;

    row.forEach((cellValue, colIndex) => {
      const label = normalizeCellValue(cellValue);
      const field = classifyHeaderCell(label);
      if (!field) return;
      if (field === 'vehicleAux') {
        vehicleAux.push({ columnIndex: colIndex, label: label || `Column ${colIndex + 1}` });
        rowScore += 1;
        return;
      }
      if (primaryMap[field] !== undefined) return;
      primaryMap[field] = colIndex;
      rowScore += 2;
    });

    if (rowScore >= 2 && primaryMap.fullName !== undefined) {
      if (!best || rowScore > best.score) {
        best = { rowIndex, primaryMap, vehicleAux, score: rowScore };
      }
    }
  }

  if (!best) return null;

  const headerLabels = (rows[best.rowIndex] ?? []).map((c) => normalizeCellValue(c));

  return {
    headerRowIndex: best.rowIndex,
    primaryMap: best.primaryMap,
    vehicleAuxColumns: best.vehicleAux,
    headerLabels,
  };
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

function cellAt(row: string[], map: PrimaryHeaderMap, field: PrimaryHeaderField): string {
  const index = map[field];
  if (index === undefined) return '';
  return normalizeCellValue(row[index]);
}

function candidateFromRow(
  row: string[],
  detection: HeaderDetection,
  sourceFile: string,
  sourceSheet: string,
): ParsedContactCandidate | null {
  const { primaryMap: headerMap, vehicleAuxColumns } = detection;

  const fallbackNameCell = row.find((value) => /[a-z]/i.test(value) && value.length >= 3) ?? '';
  const fullNameRaw = cellAt(row, headerMap, 'fullName') || fallbackNameCell;
  const parsedFullName = parseContactDisplayName(fullNameRaw);
  if (!parsedFullName || !/[a-z]/i.test(parsedFullName)) return null;

  const rawWork = cellAt(row, headerMap, 'workPhone');
  const rawMobile = cellAt(row, headerMap, 'mobilePhone');
  const rawExtension = cellAt(row, headerMap, 'extension');
  const rawEmail = cellAt(row, headerMap, 'email');
  const rawNotes = cellAt(row, headerMap, 'notes');
  const rawDept = cellAt(row, headerMap, 'department');
  const rawFunctional = cellAt(row, headerMap, 'functionalArea');
  const rawJobTitle = cellAt(row, headerMap, 'jobTitle');
  const rawPreferredVehicle = cellAt(row, headerMap, 'preferredVehicle');

  let workPhone =
    rawWork && isLikelyPhone(rawWork) ? normalizeUsPhoneForStorage(rawWork) : '';
  let mobilePhone =
    rawMobile && isLikelyPhone(rawMobile) ? normalizeUsPhoneForStorage(rawMobile) : '';

  const noteFragments: string[] = [];
  if (rawNotes) noteFragments.push(rawNotes);

  if (!workPhone && mobilePhone) {
    workPhone = mobilePhone;
    mobilePhone = '';
  } else if (workPhone && mobilePhone && mobilePhone !== workPhone) {
    noteFragments.push(`Mobile: ${mobilePhone}`);
  }

  const phone = workPhone || undefined;
  const extension = rawExtension ? cleanExtension(rawExtension) : '';
  const email = rawEmail && isLikelyEmail(rawEmail) ? rawEmail : '';

  const department = rawDept || undefined;
  const functionalArea = rawFunctional || rawDept || undefined;
  const jobTitle = rawJobTitle || undefined;

  const preferredVehicle = rawPreferredVehicle || undefined;

  const vehicleDetailParts: string[] = [];
  for (const { columnIndex, label } of vehicleAuxColumns) {
    const value = normalizeCellValue(row[columnIndex]);
    if (value) {
      vehicleDetailParts.push(`${label}: ${value}`);
    }
  }
  const vehicleNotes = vehicleDetailParts.length > 0 ? vehicleDetailParts.join(' | ') : undefined;

  const notesCombined =
    noteFragments.length > 0 ? noteFragments.filter(Boolean).join(' | ') : undefined;

  return {
    fullName: parsedFullName,
    phone,
    extension: extension || undefined,
    email: email || undefined,
    department,
    functionalArea,
    jobTitle,
    notes: notesCombined,
    preferredVehicle,
    vehicleNotes,
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
      const startIndex = detected.headerRowIndex + 1;
      for (let rowIndex = startIndex; rowIndex < normalizedRows.length; rowIndex += 1) {
        const row = normalizedRows[rowIndex];
        if (!row || row.every((value) => !value)) continue;
        const candidate = candidateFromRow(row, detected, file.name, sheetName);
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
            const ph = isLikelyPhone(infoCell) ? normalizeUsPhoneForStorage(infoCell) : '';
            const ext = !ph && infoCell ? cleanExtension(infoCell) : '';
            candidates.push({
              fullName: parseContactDisplayName(nameCell),
              phone: ph || undefined,
              extension: ext || undefined,
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
              phone: normalizeUsPhoneForStorage(infoCell),
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
      department: existing.department || candidate.department,
      jobTitle: existing.jobTitle || candidate.jobTitle,
      notes: existing.notes || candidate.notes,
      preferredVehicle: existing.preferredVehicle || candidate.preferredVehicle,
      vehicleNotes: existing.vehicleNotes || candidate.vehicleNotes,
    });
  }

  return {
    contacts: Array.from(mergedByName.values()),
    sheetsScanned: workbook.SheetNames.length,
    rowsScanned,
    sheetSummaries,
  };
}
