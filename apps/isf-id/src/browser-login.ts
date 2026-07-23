import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findRelyingParty, type IsfIdRelyingParty } from './relying-parties.js';

const BrowserLoginQuery = z
  .object({
    audience: z.string().trim().min(1).max(255),
    return_to: z.string().trim().url().max(2048),
  })
  .strict();

export function registerBrowserLogin(
  app: FastifyInstance,
  relyingParties: readonly IsfIdRelyingParty[],
): void {
  app.get('/login', async (req, reply) => {
    const parsed = BrowserLoginQuery.safeParse(req.query);
    const party = parsed.success
      ? findRelyingParty(relyingParties, parsed.data.audience, parsed.data.return_to)
      : null;
    if (!party) {
      return reply
        .code(400)
        .type('text/plain; charset=utf-8')
        .send('Unknown ISF ID relying party.');
    }

    const nonce = randomBytes(16).toString('base64');
    reply
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', browserLoginCsp(nonce))
      .type('text/html; charset=utf-8');
    return reply.send(renderBrowserLoginPage(party, nonce));
  });
}

function browserLoginCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "img-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

function browserJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function renderBrowserLoginPage(party: IsfIdRelyingParty, nonce: string): string {
  const config = browserJson({ audience: party.audience, returnTo: party.returnTo });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ISF ID</title><style>
*{box-sizing:border-box}body{margin:0;background:#08110d;color:#f2f7f2;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}.card{max-width:440px;margin:8vh auto;padding:32px;border:1px solid #335044;border-radius:16px;background:#102218;box-shadow:0 18px 60px #0008}h1{margin:0 0 8px;font-size:30px}p{color:#bfd0c3}label{display:block;margin:16px 0 6px;font-weight:600}input{width:100%;padding:12px;border:1px solid #557360;border-radius:8px;background:#07110b;color:inherit;font:inherit}button{width:100%;margin-top:22px;padding:12px;border:0;border-radius:8px;background:#b9eb74;color:#12200e;font:700 16px system-ui;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.hidden{display:none}.error{min-height:24px;color:#ffb4ab}.hint{font-size:14px}.brand{color:#b9eb74;font-weight:700;letter-spacing:.08em;font-size:13px}
</style></head><body><main class="card"><div class="brand">ISF ID</div><h1>Continue to your Passport</h1><p>Use one ISF ID in all Streetlifting services.</p>
<form id="start-form"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required><label for="name">Name <span class="hint">(for a new account)</span></label><input id="name" name="name" type="text" autocomplete="name" maxlength="120"><button id="start-button">Send code</button></form>
<form id="verify-form" class="hidden"><p id="sent-to"></p><label for="code">Six-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button id="verify-button">Continue</button><button id="restart-button" type="button">Use another email</button></form><p id="message" class="error" role="alert"></p></main>
<script nonce="${nonce}">(() => { const config=${config}; const storageKey='isf-id.browser-session.v1'; const startForm=document.getElementById('start-form'); const verifyForm=document.getElementById('verify-form'); const email=document.getElementById('email'); const name=document.getElementById('name'); const code=document.getElementById('code'); const message=document.getElementById('message'); const sentTo=document.getElementById('sent-to'); const startButton=document.getElementById('start-button'); const verifyButton=document.getElementById('verify-button'); const restartButton=document.getElementById('restart-button'); const setMessage=(value)=>{message.textContent=value||''}; const setBusy=(button,busy)=>{button.disabled=busy}; const failure=async(response)=>{try{const body=await response.json();return body?.error?.message||'Unable to continue right now.'}catch{return 'Unable to continue right now.'}}; const request=async(path,options)=>fetch(path,{...options,headers:{'content-type':'application/json',...(options?.headers||{})}}); const launch=async(token)=>{const response=await request('/sso/launch',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({audience:config.audience})});if(!response.ok)throw new Error(await failure(response));const body=await response.json();const destination=new URL(config.returnTo);destination.hash='isf_assertion='+encodeURIComponent(body.token);window.location.replace(destination.toString())}; const existing=sessionStorage.getItem(storageKey);if(existing){setMessage('Signing you in…');launch(existing).catch(()=>{sessionStorage.removeItem(storageKey);setMessage('Please enter your email to continue.')})} startForm.addEventListener('submit',async(event)=>{event.preventDefault();setMessage('');setBusy(startButton,true);try{const response=await request('/auth/email/start',{method:'POST',body:JSON.stringify({email:email.value.trim(),displayName:name.value.trim()||undefined})});if(!response.ok)throw new Error(await failure(response));startForm.classList.add('hidden');verifyForm.classList.remove('hidden');sentTo.textContent='We sent a code to '+email.value.trim()+'.';code.focus()}catch(error){setMessage(error instanceof Error?error.message:'Unable to send a code.')}finally{setBusy(startButton,false)}});verifyForm.addEventListener('submit',async(event)=>{event.preventDefault();setMessage('');setBusy(verifyButton,true);try{const response=await request('/auth/email/verify',{method:'POST',body:JSON.stringify({email:email.value.trim(),code:code.value.trim(),displayName:name.value.trim()||undefined})});if(!response.ok)throw new Error(await failure(response));const body=await response.json();sessionStorage.setItem(storageKey,body.accessToken);await launch(body.accessToken)}catch(error){setMessage(error instanceof Error?error.message:'Unable to continue.')}finally{setBusy(verifyButton,false)}});restartButton.addEventListener('click',()=>{verifyForm.classList.add('hidden');startForm.classList.remove('hidden');code.value='';setMessage('');email.focus()}) })();</script></body></html>`;
}
