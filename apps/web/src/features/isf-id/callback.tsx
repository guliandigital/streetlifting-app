import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { api, ApiClientError } from '../../lib/api-client.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { clearPendingIsfAssertion, savePendingIsfAssertion } from './pending-assertion.js';

const ASSERTION_HASH_KEY = 'isf_assertion';

function assertionFromHash(): string | null {
  const value = new URLSearchParams(window.location.hash.slice(1)).get(ASSERTION_HASH_KEY);
  return value?.trim() || null;
}

export default function IsfIdCallbackFeature() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [assertion] = useState(assertionFromHash);

  useEffect(() => {
    // The assertion is a one-time credential. Remove it from browser history
    // before making any API request, so it cannot leak through copied URLs.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!assertion) {
      setError('ISF ID did not return a sign-in assertion. Please start again.');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await api.isf.session(assertion);
        if (cancelled) return;
        clearPendingIsfAssertion();
        useAuthStore.getState().setSession(session.user, session.accessToken, session.refreshToken);
        try {
          const me = await api.me();
          if (!cancelled) useAuthStore.getState().setUser(me.user);
        } catch {
          // The Passport can safely load the lightweight user if enrichment is delayed.
        }
        if (!cancelled) await navigate({ to: '/me', replace: true });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.code === 'isf_identity_link_required') {
          savePendingIsfAssertion(assertion);
          setError(
            'This email already has a Passport account. Sign in with its password once; ISF ID will be linked automatically.',
          );
          return;
        }
        clearPendingIsfAssertion();
        setError('ISF ID sign-in was not accepted. Please start again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assertion, navigate]);

  return (
    <div className="max-w-sm mx-auto mt-16 px-6">
      <Card>
        <CardHeader>
          <CardTitle>{error ? 'Unable to open Passport' : 'Opening your Passport'}</CardTitle>
          <CardDescription>
            {error ?? 'ISF ID is securely creating your Streetlifting session…'}
          </CardDescription>
        </CardHeader>
        {error ? (
          <CardContent>
            <Button asChild>
              <Link to="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
