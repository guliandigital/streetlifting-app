export const ISF_FORBIDDEN_EXPORT_KEYS = new Set([
  'paymentStatus',
  'paidAmountKopecks',
  'paymentMethod',
  'paymentComment',
  'paidAt',
  'email',
  'phone',
  'telegramHandle',
  'passwordHash',
  'session',
  'refreshToken',
  'refreshTokens',
  'consent',
  'consents',
  'textShown',
  'grantedFromIp',
  'grantedFromUserAgent',
  'ip',
  'userAgent',
  'notes',
  'attachments',
  'storagePath',
]);

export function findForbiddenExportKeys(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenExportKeys(item, `${path}[${index}]`));
  }

  const findings: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (ISF_FORBIDDEN_EXPORT_KEYS.has(key)) findings.push(childPath);
    findings.push(...findForbiddenExportKeys(child, childPath));
  }
  return findings;
}

export function assertNoForbiddenExportKeys(value: unknown): void {
  const findings = findForbiddenExportKeys(value);
  if (findings.length > 0) {
    throw new Error(`ISF export contains forbidden keys: ${findings.join(', ')}`);
  }
}
