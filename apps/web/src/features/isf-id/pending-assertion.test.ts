import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPendingIsfAssertion,
  pendingIsfAssertion,
  savePendingIsfAssertion,
} from './pending-assertion.js';

describe('pending ISF assertion', () => {
  afterEach(() => clearPendingIsfAssertion());

  it('keeps the one-time assertion only for the current browser session', () => {
    savePendingIsfAssertion('assertion-value');

    expect(pendingIsfAssertion()).toBe('assertion-value');

    clearPendingIsfAssertion();
    expect(pendingIsfAssertion()).toBeNull();
  });
});
