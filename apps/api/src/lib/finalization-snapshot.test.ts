import { describe, expect, it } from 'vitest';
import { snapshotHash } from './finalization-snapshot.js';

describe('finalization snapshot hash', () => {
  it('survives JSONB key ordering at every level', () => {
    expect(snapshotHash({ b: [{ z: 1, a: null }], a: 'Я' })).toBe(
      snapshotHash({ a: 'Я', b: [{ a: null, z: 1 }] }),
    );
  });
  it('detects changed values and attempt order', () => {
    expect(snapshotHash({ attempts: [1, 2] })).not.toBe(snapshotHash({ attempts: [2, 1] }));
    expect(snapshotHash({ result: 50 })).not.toBe(snapshotHash({ result: 51 }));
  });
});
