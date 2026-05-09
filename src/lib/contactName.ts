const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const stripTrailingSuffixToken = (value: string): string => {
  const normalized = value.replace(/\./g, '').toLowerCase();
  return NAME_SUFFIXES.has(normalized) ? '' : value;
};

export const parseContactDisplayName = (rawValue: string): string => {
  const trimmedValue = normalizeWhitespace(rawValue.replace(/[;]+/g, ','));
  if (!trimmedValue) return '';

  if (!trimmedValue.includes(',')) {
    return trimmedValue;
  }

  const [rawLastName, rawFirstAndMiddle] = trimmedValue.split(',', 2);
  const lastName = normalizeWhitespace(rawLastName);
  const firstAndMiddle = normalizeWhitespace(rawFirstAndMiddle ?? '');
  if (!lastName || !firstAndMiddle) {
    return trimmedValue.replace(/,+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return `${firstAndMiddle} ${lastName}`.replace(/\s+/g, ' ').trim();
};

export const canonicalNameKey = (rawValue: string): string => {
  const displayName = parseContactDisplayName(rawValue);
  if (!displayName) return '';

  const cleaned = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const tokens = cleaned
    .split(' ')
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .map(stripTrailingSuffixToken)
    .filter(Boolean);

  return tokens.join(' ');
};
