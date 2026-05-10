/** Stable HSL accent for section / vehicle headers (matches checklist packlists). */
export function getStableGroupAccentHex(title: string): string {
  const key = title.trim().toLowerCase() || 'group';
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 58%)`;
}
