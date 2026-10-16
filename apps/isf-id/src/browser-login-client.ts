interface BrowserLoginConfig {
  audience: string;
  returnTo: string;
  authorizationUrl?: string;
}

/** Serialized into the login page: keep every runtime dependency inside this function. */
export function browserLoginClient(config: BrowserLoginConfig): void {
  const startForm = document.getElementById('start-form') as HTMLFormElement;
  const verifyForm = document.getElementById('verify-form') as HTMLFormElement;
  const email = document.getElementById('email') as HTMLInputElement;
  const code = document.getElementById('code') as HTMLInputElement;
  const message = document.getElementById('message') as HTMLElement;
  const sentTo = document.getElementById('sent-to') as HTMLElement;
  const startButton = document.getElementById('start-button') as HTMLButtonElement;
  const verifyButton = document.getElementById('verify-button') as HTMLButtonElement;
  const restartButton = document.getElementById('restart-button') as HTMLButtonElement;
  const enterCodeButton = document.getElementById('enter-code-button') as HTMLButtonElement;
  let revision = 0;
  let active: AbortController | undefined;
  let busy = '';
  const retryUntil = { start: 0, verify: 0 };
  const retryTimers: Partial<Record<'start' | 'verify', ReturnType<typeof setTimeout>>> = {};

  const renderButtons = () => {
    startButton.disabled = busy === 'start' || retryUntil.start > Date.now();
    verifyButton.disabled = busy === 'verify' || retryUntil.verify > Date.now();
    startButton.textContent = busy === 'start' ? 'Sending code…' : 'Send code';
    verifyButton.textContent = busy === 'verify' ? 'Checking code…' : 'Continue';
    startButton.setAttribute('aria-busy', String(busy === 'start'));
    verifyButton.setAttribute('aria-busy', String(busy === 'verify'));
  };
  const cancel = () => {
    revision++;
    active?.abort();
    active = undefined;
    busy = '';
    renderButtons();
  };
  const begin = (kind: string) => {
    cancel();
    active = new AbortController();
    busy = kind;
    renderButtons();
    return { revision, controller: active };
  };
  type Operation = ReturnType<typeof begin>;
  const current = (operation: Operation) => operation.revision === revision;
  const finish = (operation: Operation) => {
    if (!current(operation)) return;
    busy = '';
    active = undefined;
    renderButtons();
  };
  const showCode = (delivered: boolean) => {
    startForm.classList.add('hidden');
    verifyForm.classList.remove('hidden');
    sentTo.textContent = delivered
      ? 'We sent a code to ' + email.value.trim() + '.'
      : 'Enter the latest code sent to ' + email.value.trim() + '.';
    code.focus();
  };
  const throttle = (response: Response, operation: Operation) => {
    const value = response.headers.get('retry-after');
    if (response.status !== 429 || !value || !current(operation)) return;
    const seconds = /^\d+$/.test(value.trim())
      ? Number(value) * 1000
      : Date.parse(value) - Date.now();
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const kind = busy === 'verify' ? 'verify' : 'start';
    retryUntil[kind] = Date.now() + seconds;
    clearTimeout(retryTimers[kind]);
    retryTimers[kind] = setTimeout(renderButtons, Math.min(seconds, 2_147_483_647));
    renderButtons();
  };
  const request = async (
    path: string,
    options: RequestInit,
    operation: Operation,
    signedOutIsExpected = false,
  ): Promise<Record<string, unknown> | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('The request took too long. Please try again.'));
        operation.controller.abort();
      }, 20_000);
    });
    try {
      return await Promise.race([
        (async () => {
          let response: Response;
          try {
            response = await fetch(path, {
              ...options,
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json', ...options.headers },
              signal: operation.controller.signal,
            });
          } catch {
            throw new Error('Unable to connect. Check your connection and try again.');
          }
          if (signedOutIsExpected && response.status === 401) return null;
          throttle(response, operation);
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            if (response.ok) throw new Error('Unexpected sign-in response. Please try again.');
          }
          if (!response.ok) {
            if (response.status === 429) {
              const wait =
                Math.ceil(Math.max(retryUntil.start, retryUntil.verify) - Date.now()) / 1000;
              throw new Error(
                'Too many attempts. ' +
                  (wait > 0
                    ? 'Try again in ' + Math.ceil(wait) + ' seconds.'
                    : 'Please wait before trying again.'),
              );
            }
            if (response.status === 503) {
              throw new Error('Sign-in is temporarily unavailable. Please try again shortly.');
            }
            if (response.status === 401) {
              throw new Error(
                'The code is invalid or expired. Check the latest email or request a new code.',
              );
            }
            throw new Error('Unable to continue right now. Please try again.');
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('Unexpected sign-in response. Please try again.');
          }
          return body as Record<string, unknown>;
        })(),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const hasAccount = (body: Record<string, unknown> | null) => {
    const account = body?.account as { id?: unknown } | undefined;
    return typeof account?.id === 'string' && account.id.length > 0;
  };
  const complete = async (operation: Operation) => {
    if (!current(operation)) return;
    if (config.authorizationUrl) {
      window.location.replace(config.authorizationUrl);
      return;
    }
    const body = await request(
      '/sso/launch',
      {
        method: 'POST',
        body: JSON.stringify({ audience: config.audience }),
      },
      operation,
    );
    if (!body || typeof body.token !== 'string' || !body.token) {
      throw new Error('Unexpected sign-in response. Please try again.');
    }
    if (!current(operation)) return;
    const destination = new URL(config.returnTo);
    destination.hash = 'isf_assertion=' + encodeURIComponent(body.token);
    window.location.replace(destination.toString());
  };

  const bootstrap = async () => {
    const operation = begin('bootstrap');
    try {
      const body = await request('/auth/me', { method: 'GET' }, operation, true);
      if (body === null) return;
      if (!hasAccount(body)) throw new Error('Unexpected session response.');
      await complete(operation);
    } catch {
      if (current(operation)) {
        message.textContent =
          'We could not check your existing session. You can still sign in with your email.';
      }
    } finally {
      finish(operation);
    }
  };
  void bootstrap();

  startForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy === 'start' || retryUntil.start > Date.now()) return;
    const operation = begin('start');
    message.textContent = '';
    try {
      const body = await request(
        '/auth/email/start',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.value.trim() }),
        },
        operation,
      );
      if (body?.status !== 'sent')
        throw new Error('Unexpected sign-in response. Please try again.');
      if (current(operation)) showCode(true);
    } catch (error) {
      if (current(operation)) {
        message.textContent =
          (error instanceof Error
            ? error.message
            : 'Unable to send a code. Check your connection and try again.') +
          ' If a code arrived, choose “I already have a code”.';
      }
    } finally {
      finish(operation);
    }
  });
  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy === 'verify' || retryUntil.verify > Date.now()) return;
    const operation = begin('verify');
    message.textContent = '';
    try {
      const body = await request(
        '/auth/email/verify',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.value.trim(), code: code.value.trim() }),
        },
        operation,
      );
      if (!hasAccount(body)) throw new Error('Unexpected sign-in response. Please try again.');
      await complete(operation);
    } catch (error) {
      if (current(operation)) {
        message.textContent =
          error instanceof Error
            ? error.message
            : 'Unable to continue. Check your connection and try again.';
      }
    } finally {
      finish(operation);
    }
  });
  enterCodeButton.addEventListener('click', () => {
    if (!email.reportValidity()) return;
    cancel();
    message.textContent = '';
    showCode(false);
  });
  restartButton.addEventListener('click', () => {
    cancel();
    verifyForm.classList.add('hidden');
    startForm.classList.remove('hidden');
    code.value = '';
    message.textContent = '';
    email.focus();
  });
  email.addEventListener('input', () => {
    cancel();
    retryUntil.start = retryUntil.verify = 0;
    renderButtons();
    message.textContent = '';
  });
}
