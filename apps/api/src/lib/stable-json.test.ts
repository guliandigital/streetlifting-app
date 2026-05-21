import { describe, expect, it } from 'vitest';
import { stableExportSha256, stableSha256 } from './stable-json.js';

describe('stable export checksums', () => {
  it('ignores volatile export timestamps while keeping data changes significant', () => {
    const first = {
      generatedAt: '2026-05-20T00:00:00.000Z',
      items: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          updatedAt: '2026-05-19T00:00:00.000Z',
          provenance: { exportedAt: '2026-05-20T00:00:00.000Z' },
        },
      ],
    };
    const second = {
      generatedAt: '2026-05-20T01:00:00.000Z',
      items: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          updatedAt: '2026-05-19T00:00:00.000Z',
          provenance: { exportedAt: '2026-05-20T01:00:00.000Z' },
        },
      ],
    };
    const changed = {
      ...second,
      items: [{ ...second.items[0], updatedAt: '2026-05-20T02:00:00.000Z' }],
    };

    expect(stableSha256(first)).not.toBe(stableSha256(second));
    expect(stableExportSha256(first)).toBe(stableExportSha256(second));
    expect(stableExportSha256(first)).not.toBe(stableExportSha256(changed));
  });
});
