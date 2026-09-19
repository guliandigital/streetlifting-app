const PENDING_ASSERTION_KEY = 'streetlifting.isf.pending-assertion.v1';

export function savePendingIsfAssertion(assertion: string): void {
  window.sessionStorage.setItem(PENDING_ASSERTION_KEY, assertion);
}

export function pendingIsfAssertion(): string | null {
  return window.sessionStorage.getItem(PENDING_ASSERTION_KEY)?.trim() || null;
}

export function clearPendingIsfAssertion(): void {
  window.sessionStorage.removeItem(PENDING_ASSERTION_KEY);
}
