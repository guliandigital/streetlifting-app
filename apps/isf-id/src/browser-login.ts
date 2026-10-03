import { loginLogo, loginFonts } from './login-brand.js';
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

export function browserLoginCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    'img-src data:',
    'font-src data:',
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

function browserJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function renderBrowserLoginPage(
  party: IsfIdRelyingParty,
  nonce: string,
  authorizationUrl?: string,
): string {
  const config = browserJson({
    audience: party.audience,
    returnTo: party.returnTo,
    authorizationUrl,
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ISF ID — International Streetlifting Federation</title><meta name="description" content="Sign in to ISF Passport, the account for International Streetlifting Federation services."><style>
${loginFonts}
:root{color-scheme:dark;--bg:#04101f;--surface:#0a2039;--ink:#f2f6fb;--muted:#c7d3e2;--gold:#f5b323;--line:#ffffff1a}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(800px 500px at 90% 0%,#37c7df18,transparent),var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,sans-serif}a{color:inherit;text-underline-offset:4px}header,footer{max-width:1160px;margin:auto;padding:24px 28px}.identity{display:flex;align-items:center;gap:16px;text-decoration:none;width:fit-content}.identity img{width:58px;height:58px;object-fit:contain}.identity strong{display:block;font-size:18px}.identity small{color:var(--muted);font-size:12px}.layout{max-width:1160px;margin:7vh auto;display:grid;grid-template-columns:1fr 440px;gap:88px;padding:0 28px;align-items:start}.intro{padding:20px 0}.eyebrow,.brand{color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}h1,h2{font-family:Oswald,'Arial Narrow',sans-serif;line-height:1.15;font-weight:600}h1{font-size:clamp(36px,4.5vw,58px);text-transform:uppercase;margin:18px 0 24px}h2{font-size:30px;margin:8px 0 14px}p{color:var(--muted);margin:12px 0}.intro p{max-width:520px}.services{list-style:none;padding:0;margin:28px 0;border-top:1px solid var(--line)}.services li{padding:12px 0;border-bottom:1px solid var(--line);color:var(--muted)}.services strong{color:var(--ink);display:block}.card{padding:32px;border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:18px;background:var(--surface);box-shadow:0 24px 60px #0004}label{display:block;margin:20px 0 6px;font-weight:600;font-size:14px}input{width:100%;min-height:50px;padding:12px;border:1px solid #55708d;border-radius:8px;background:var(--bg);color:inherit;font:inherit}button{width:100%;min-height:48px;margin-top:24px;padding:12px;border:0;border-radius:8px;background:var(--gold);color:var(--bg);font:700 15px Inter,system-ui,sans-serif;cursor:pointer}button:hover{background:#ffd36a}button:disabled{opacity:.6;cursor:wait}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid #37c7df;outline-offset:3px}.hidden{display:none}.error{color:#ffb4ab;overflow-wrap:anywhere}.error:empty{display:none}.hint{font-size:13px;font-weight:400}.help{font-size:13px;margin-top:24px;padding-top:18px;border-top:1px solid var(--line)}#restart-button{background:transparent;border:1px solid #55708d;color:var(--ink);margin-top:12px}footer{border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;font-size:13px;color:var(--muted)}@media(max-width:800px){.layout{grid-template-columns:1fr;gap:28px;margin:24px auto 40px;max-width:560px}.intro{padding:0}.services{display:none}h1{font-size:36px;margin:12px 0}.card{padding:24px}header,footer{padding:20px 24px}footer{flex-wrap:wrap}.identity small{display:block;max-width:250px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><header><a class="identity" href="https://streetlifting.pro/"><img src="${loginLogo}" alt="ISF — International Streetlifting Federation"><span><strong>ISF WORLD</strong><small>International Streetlifting Federation</small></span></a></header><main class="layout"><section class="intro" aria-labelledby="federation-title"><div class="eyebrow">International Streetlifting Federation</div><h1 id="federation-title">Your federation.<br>Your ISF Passport.</h1><p>ISF is the international governing body for streetlifting: competition rules, referee standards, records and national federations.</p><p>ISF ID is your account for federation services, whether you are an athlete, referee, competition secretary or organizer.</p><ul class="services"><li><strong>Learn and certify</strong>Courses, examinations and your certificates.</li><li><strong>Manage your federation profile</strong>Your Passport, applications and documents.</li></ul><a href="https://streetlifting.pro/about/">About the federation →</a></section><section class="card" aria-labelledby="login-title"><div class="brand">ISF ID / Passport</div><h2 id="login-title">Sign in to your Passport</h2><p>Enter your email. We will send you a six-digit sign-in code. No password needed.</p>
<form id="start-form"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><label for="name">Name <span class="hint">(for a new account)</span></label><input id="name" name="name" type="text" autocomplete="name" maxlength="120"><button id="start-button">Send code</button></form>
<form id="verify-form" class="hidden"><p id="sent-to"></p><label for="code">Six-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button id="verify-button">Continue</button><button id="restart-button" type="button">Use another email</button></form><p id="message" class="error" role="alert"></p><p class="help">New to ISF? Your account is created when you verify your email. The name field is only needed for a new account.</p><p class="hint">Need help? <a href="mailto:info@streetlifting.pro">Contact ISF</a></p></section></main><footer><span>International Streetlifting Federation</span><a href="https://streetlifting.pro/">Visit the official website →</a></footer>
<script nonce="${nonce}">(() => { const config=${config}; const startForm=document.getElementById('start-form'); const verifyForm=document.getElementById('verify-form'); const email=document.getElementById('email'); const name=document.getElementById('name'); const code=document.getElementById('code'); const message=document.getElementById('message'); const sentTo=document.getElementById('sent-to'); const startButton=document.getElementById('start-button'); const verifyButton=document.getElementById('verify-button'); const restartButton=document.getElementById('restart-button'); const setMessage=(value)=>{message.textContent=value||''}; const setBusy=(button,busy)=>{button.disabled=busy}; const failure=async(response)=>{try{const body=await response.json();return body?.error?.message||'Unable to continue right now.'}catch{return 'Unable to continue right now.'}}; const request=async(path,options)=>fetch(path,{...options,credentials:'same-origin',headers:{'content-type':'application/json',...(options?.headers||{})}}); const complete=async()=>{if(config.authorizationUrl){window.location.replace(config.authorizationUrl);return;}const response=await request('/sso/launch',{method:'POST',body:JSON.stringify({audience:config.audience})});if(!response.ok)throw new Error(await failure(response));const body=await response.json();const destination=new URL(config.returnTo);destination.hash='isf_assertion='+encodeURIComponent(body.token);window.location.replace(destination.toString())}; const bootstrap=async()=>{if(config.authorizationUrl){const response=await request('/auth/me',{method:'GET'});if(response.ok)await complete();return;}await complete();}; void bootstrap().catch(()=>{}); startForm.addEventListener('submit',async(event)=>{event.preventDefault();setMessage('');setBusy(startButton,true);try{const response=await request('/auth/email/start',{method:'POST',body:JSON.stringify({email:email.value.trim(),displayName:name.value.trim()||undefined})});if(!response.ok)throw new Error(await failure(response));startForm.classList.add('hidden');verifyForm.classList.remove('hidden');sentTo.textContent='We sent a code to '+email.value.trim()+'.';code.focus()}catch(error){setMessage(error instanceof Error?error.message:'Unable to send a code.')}finally{setBusy(startButton,false)}});verifyForm.addEventListener('submit',async(event)=>{event.preventDefault();setMessage('');setBusy(verifyButton,true);try{const response=await request('/auth/email/verify',{method:'POST',body:JSON.stringify({email:email.value.trim(),code:code.value.trim(),displayName:name.value.trim()||undefined})});if(!response.ok)throw new Error(await failure(response));await response.json();await complete()}catch(error){setMessage(error instanceof Error?error.message:'Unable to continue.')}finally{setBusy(verifyButton,false)}});restartButton.addEventListener('click',()=>{verifyForm.classList.add('hidden');startForm.classList.remove('hidden');code.value='';setMessage('');email.focus()}) })();</script></body></html>`;
}
