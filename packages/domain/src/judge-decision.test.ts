import { describe, expect, it } from 'vitest';
import { resolveJudgeMajority } from './judge-decision.js';

describe('resolveJudgeMajority', () => {
  it('resolves a three-judge majority immediately', () => {
    expect(resolveJudgeMajority(3, ['white', 'white'])).toBe('good_lift');
    expect(resolveJudgeMajority(3, ['red', 'red'])).toBe('no_lift');
  });

  it('keeps the attempt pending while the majority is undecided', () => {
    expect(resolveJudgeMajority(3, ['white'])).toBe('pending');
    expect(resolveJudgeMajority(2, ['white'])).toBe('pending');
  });
});
