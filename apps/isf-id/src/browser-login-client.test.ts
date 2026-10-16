import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBrowserLoginPage } from './browser-login.js';

class ElementStub {
  value = '';
  disabled = false;
  textContent = '';
  hiddenClasses = new Set<string>();
  listeners = new Map<string, (event: { preventDefault(): void }) => unknown>();
  classList = {
    add: (name: string) => this.hiddenClasses.add(name),
    remove: (name: string) => this.hiddenClasses.delete(name),
    contains: (name: string) => this.hiddenClasses.has(name),
  };
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => unknown) {
    this.listeners.set(type, listener);
  }
  setAttribute() {}
  focus() {}
  reportValidity() {
    return this.value.includes('@');
  }
  emit(type: string) {
    return this.listeners.get(type)?.({ preventDefault() {} });
  }
}

function response(status: number, body: unknown, retryAfter?: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (key: string) => (key === 'retry-after' ? (retryAfter ?? null) : null) },
    json: () => Promise.resolve(body),
  } as Response;
}

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const authorizationUrl = '/oauth/authorize?state=original-state&code_challenge=original-challenge';

function boot(fetch: ReturnType<typeof vi.fn>, oauth = true) {
  const elements = new Map<string, ElementStub>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, new ElementStub());
    return elements.get(id)!;
  };
  element('verify-form').classList.add('hidden');
  const replace = vi.fn();
  const html = renderBrowserLoginPage(
    { audience: 'streetlifting-pro', returnTo: 'https://streetlifting.pro/passport/callback/' },
    'test',
    oauth ? authorizationUrl : undefined,
  );
  const script = html.match(/<script nonce="test">([\s\S]+?)<\/script>/)?.[1];
  if (!script) throw new Error('Login script missing');
  runInNewContext(script, {
    document: { getElementById: element },
    window: { location: { replace } },
    fetch,
    AbortController,
    URL,
    Date,
    setTimeout,
    clearTimeout,
  });
  return { element, replace, html };
}

describe('the rendered browser login script', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('places sign-in before the introduction in DOM order while preserving the desktop columns', () => {
    const fetch = vi.fn().mockResolvedValue(response(401, {}));
    const { html } = boot(fetch);
    expect(html.indexOf('<section class="card"')).toBeLessThan(
      html.indexOf('<section class="intro"'),
    );
    expect(html).toContain('grid-template-areas:"intro auth"');
    expect(html).toContain('.card{grid-area:auth;');
    expect(html).toContain('.intro{grid-area:intro;');
    expect(html).toContain(
      '@media(max-width:800px){.layout{grid-template-columns:1fr;grid-template-areas:"auth" "intro";',
    );
  });

  it('keeps an ordinary signed-out session quiet and permits email-only entry', async () => {
    const fetch = vi.fn().mockResolvedValue(response(401, {}));
    const { element, html } = boot(fetch);
    await flush();
    expect(element('message').textContent).toBe('');
    expect(element('start-button').disabled).toBe(false);
    expect(html).not.toContain('id="name"');
    expect(html).toContain('Your account is created when you verify your email.');
  });

  it.each(['new-account', 'existing-account'])(
    'completes the %s OTP flow without a name or extra email request',
    async (id) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(401, {}))
        .mockResolvedValueOnce(response(202, { status: 'sent' }))
        .mockResolvedValueOnce(response(200, { account: { id } }));
      const { element, replace } = boot(fetch);
      await flush();
      element('email').value = ' Person@example.test ';
      await element('start-form').emit('submit');
      expect(element('verify-form').classList.contains('hidden')).toBe(false);
      element('code').value = '123456';
      await element('verify-form').emit('submit');
      expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ email: 'Person@example.test' });
      expect(JSON.parse(fetch.mock.calls[2]![1].body)).toEqual({
        email: 'Person@example.test',
        code: '123456',
      });
      expect(replace).toHaveBeenCalledExactlyOnceWith(authorizationUrl);
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );

  it.each(['fetch', 'body'])(
    'bounds a hanging send %s, restores controls and permits code entry or a manual retry',
    async (stage) => {
      const pending = new Promise(() => {});
      const hanging =
        stage === 'fetch'
          ? pending
          : Promise.resolve({ ...response(202, {}), json: () => pending });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(401, {}))
        .mockImplementationOnce(() => hanging)
        .mockResolvedValueOnce(response(202, { status: 'sent' }));
      const { element } = boot(fetch);
      await flush();
      element('email').value = 'person@example.test';
      const task = element('start-form').emit('submit');
      expect(element('start-button').disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(20_000);
      await task;
      expect(element('message').textContent).toContain('took too long');
      expect(element('start-button').disabled).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(2);
      element('enter-code-button').emit('click');
      expect(element('verify-form').classList.contains('hidden')).toBe(false);
      element('restart-button').emit('click');
      await element('start-form').emit('submit');
      expect(element('verify-form').classList.contains('hidden')).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );

  it.each(['fetch', 'body'])(
    'bounds a hanging verification %s and permits retrying without resending',
    async (stage) => {
      const pending = new Promise(() => {});
      const hanging =
        stage === 'fetch'
          ? pending
          : Promise.resolve({ ...response(200, {}), json: () => pending });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(401, {}))
        .mockImplementationOnce(() => hanging)
        .mockResolvedValueOnce(response(200, { account: { id: 'existing-after-timeout' } }));
      const { element, replace } = boot(fetch);
      await flush();
      element('email').value = 'person@example.test';
      element('enter-code-button').emit('click');
      element('code').value = '123456';
      const task = element('verify-form').emit('submit');
      await vi.advanceTimersByTimeAsync(20_000);
      await task;
      expect(element('verify-button').disabled).toBe(false);
      expect(element('message').textContent).toContain('took too long');
      await element('verify-form').emit('submit');
      expect(replace).toHaveBeenCalledExactlyOnceWith(authorizationUrl);
      expect(fetch.mock.calls.map(([path]) => path)).not.toContain('/auth/email/start');
    },
  );

  it.each(['fetch', 'body'])(
    'makes a hanging bootstrap %s visible while keeping email sign-in usable',
    async (stage) => {
      const pending = new Promise(() => {});
      const fetch = vi
        .fn()
        .mockImplementation(() =>
          stage === 'fetch'
            ? pending
            : Promise.resolve({ ...response(200, {}), json: () => pending }),
        );
      const { element, replace } = boot(fetch);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(element('message').textContent).toContain('still sign in with your email');
      expect(element('start-button').disabled).toBe(false);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('preserves OAuth state when an existing session is found', async () => {
    const fetch = vi.fn().mockResolvedValue(response(200, { account: { id: 'known-account' } }));
    const { replace } = boot(fetch);
    await flush();
    expect(replace).toHaveBeenCalledExactlyOnceWith(authorizationUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After without hiding entry for an already delivered code', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(429, {}, '2'));
    const { element } = boot(fetch);
    await flush();
    element('email').value = 'person@example.test';
    await element('start-form').emit('submit');
    expect(element('message').textContent).toContain('2 seconds');
    expect(element('start-button').disabled).toBe(true);
    element('enter-code-button').emit('click');
    expect(element('verify-form').classList.contains('hidden')).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(element('start-button').disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([503, 401])(
    'restores the verification controls after HTTP %s without sending another code',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(401, {}))
        .mockResolvedValueOnce(response(status, {}));
      const { element, replace } = boot(fetch);
      await flush();
      element('email').value = 'person@example.test';
      element('enter-code-button').emit('click');
      element('code').value = '123456';
      await element('verify-form').emit('submit');
      expect(element('verify-button').disabled).toBe(false);
      expect(element('verify-form').classList.contains('hidden')).toBe(false);
      expect(element('message').textContent).toContain(
        status === 503 ? 'temporarily unavailable' : 'invalid or expired',
      );
      expect(replace).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([null, {}, 'not-an-object'])(
    'rejects malformed success bodies instead of advancing the flow: %j',
    async (body) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(401, {}))
        .mockResolvedValueOnce(response(202, body));
      const { element } = boot(fetch);
      await flush();
      element('email').value = 'person@example.test';
      await element('start-form').emit('submit');
      expect(element('message').textContent).toContain('Unexpected sign-in response');
      expect(element('start-button').disabled).toBe(false);
      expect(element('verify-form').classList.contains('hidden')).toBe(true);
    },
  );

  it('ignores a stale send response after the email changes, even if fetch ignores abort', async () => {
    let resolveOld!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response(202, { status: 'sent' }));
    const { element } = boot(fetch);
    await flush();
    element('email').value = 'old@example.test';
    const oldTask = element('start-form').emit('submit');
    element('email').value = 'new@example.test';
    element('email').emit('input');
    await element('start-form').emit('submit');
    resolveOld(response(503, {}));
    await oldTask;
    expect(element('message').textContent).toBe('');
    expect(element('sent-to').textContent).toContain('new@example.test');
  });

  it('does not redirect on a stale verification after choosing another email', async () => {
    let resolveOld!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          }),
      );
    const { element, replace } = boot(fetch);
    await flush();
    element('email').value = 'old@example.test';
    element('enter-code-button').emit('click');
    element('code').value = '123456';
    const task = element('verify-form').emit('submit');
    element('restart-button').emit('click');
    element('email').value = 'new@example.test';
    element('email').emit('input');
    resolveOld(response(200, { account: { id: 'old-account' } }));
    await task;
    expect(replace).not.toHaveBeenCalled();
    expect(element('start-form').classList.contains('hidden')).toBe(false);
    expect(element('verify-button').disabled).toBe(false);
  });

  it('retains the allow-listed launch return flow without an OAuth URL', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(200, { account: { id: 'known-account' } }))
      .mockResolvedValueOnce(response(200, { token: 'assertion-token' }));
    const { replace } = boot(fetch, false);
    await flush();
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      'https://streetlifting.pro/passport/callback/#isf_assertion=assertion-token',
    );
  });
});
