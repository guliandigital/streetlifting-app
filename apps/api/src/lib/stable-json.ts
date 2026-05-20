import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  const out: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    out[key] = normalize(entryValue);
  }
  return out;
}

function normalizeExportChecksum(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeExportChecksum);

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(
      ([key, entryValue]) =>
        entryValue !== undefined && key !== 'generatedAt' && key !== 'exportedAt',
    )
    .sort(([left], [right]) => left.localeCompare(right));

  const out: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    out[key] = normalizeExportChecksum(entryValue);
  }
  return out;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableSha256(value: unknown): string {
  return sha256Hex(stableJsonStringify(value));
}

export function stableExportSha256(value: unknown): string {
  return sha256Hex(JSON.stringify(normalizeExportChecksum(value)));
}
