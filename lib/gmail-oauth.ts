// Gmail "Connect" flow: which Google permissions Colvy asks for, whether the
// person actually granted them, and the page we show when they didn't.
//
// Google's consent screen lists each permission with its own checkbox and
// leaves them unticked. Someone who just presses Continue grants nothing (or
// only one of the two), and the old callback saved that as a "connected"
// mailbox that then failed to sync or send. Now the callback checks the
// granted scopes first and, if either is missing, saves nothing and shows
// gmailPermissionsPage() with a Try again button.
//
// Pure (no server imports) so the tests can load it directly.

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

// The least Colvy can ask for and still bring email in and send replies:
//   gmail.readonly: list and read inbox messages (sync, attachments, inline
//     images) and read the mailbox's own address (users/me/profile). It can't
//     change or delete anything. Google classes it as RESTRICTED.
//   gmail.send: send replies from the connected address. Google classes it as
//     SENSITIVE (verification, but no security assessment).
// gmail.modify, gmail.compose and mail.google.com would also work but are
// broader, and all restricted. gmail.metadata can't read message bodies.
// userinfo.email used to be requested too, but nothing read it: the address
// comes from the Gmail profile.
export const GMAIL_SCOPES = [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE] as const

// Any of these lets Colvy read messages / send mail. A broader grant (from an
// older connection, or another Colvy feature) is accepted too.
const READS = new Set([GMAIL_READ_SCOPE, 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'])
const SENDS = new Set([GMAIL_SEND_SCOPE, 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'])

export type GmailPermission = 'read' | 'send'

export type ScopeCheck = {
  /** True when both permissions were granted (or Google didn't say, see below). */
  ok: boolean
  missing: GmailPermission[]
  /** False when the token response had no `scope` field to check. */
  known: boolean
}

/**
 * Which of Colvy's two Gmail permissions are missing from a token response's
 * `scope` (space-separated). Google always returns `scope` from the token
 * endpoint; if it's ever absent we can't tell, so we don't block the connection
 * (the mailbox's own sync error would surface any real problem).
 */
export function checkGmailScopes(granted: string | null | undefined): ScopeCheck {
  if (typeof granted !== 'string' || !granted.trim()) return { ok: true, missing: [], known: false }
  const have = new Set(granted.trim().split(/[\s,]+/).map(s => s.trim()).filter(Boolean))
  const missing: GmailPermission[] = []
  if (!Array.from(READS).some(s => have.has(s))) missing.push('read')
  if (!Array.from(SENDS).some(s => have.has(s))) missing.push('send')
  return { ok: missing.length === 0, missing, known: true }
}

/** Google's wording for each permission, as it appears on the consent screen. */
export const PERMISSION_LABEL: Record<GmailPermission, string> = {
  read: 'View your email messages and settings',
  send: 'Send email on your behalf',
}

/** Google's consent link for a signed state. */
export function gmailAuthUrl(opts: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',   // we need a refresh token
    prompt: 'consent',        // force a refresh token on reconnect, and show both boxes again
    state: opts.state,
  })
  if (opts.loginHint) params.set('login_hint', opts.loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Plain-English text for the `reason` the callback sends back to the Email page. */
export function gmailErrorMessage(reason: string | null | undefined): string {
  const r = String(reason || '').trim()
  if (r === 'access_denied') return 'Gmail wasn’t connected: Google says access was cancelled. If you saw “Google hasn’t verified this app”, choose Advanced, then Go to Colvy (unsafe), and tick both boxes on the next screen.'
  if (r === 'permissions') return 'Gmail wasn’t connected: Colvy needs both permissions (read and send email). Press Connect a Gmail account and tick both boxes on Google’s screen.'
  if (r === 'not_configured') return 'Gmail sign-in isn’t available right now. We’ve noted it; in the meantime you can forward your email to Colvy instead (see below).'
  if (r === 'missing_code' || r === 'could_not_read_address' || r === 'token_exchange_failed') return 'Google didn’t finish connecting. Please try again.'
  return `Google connection failed${r ? `: ${r}` : ''}. Please try again.`
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const tick = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'

/**
 * The page the callback shows when a permission is missing. `retryUrl` goes
 * straight back to Google's consent screen (a fresh signed state); `backUrl`
 * returns to Colvy without connecting.
 */
export function gmailPermissionsPage(opts: { missing: GmailPermission[]; retryUrl: string; backUrl: string }): string {
  const missingBoth = opts.missing.length >= 2
  const which = missingBoth
    ? 'Neither box was ticked'
    : `“${PERMISSION_LABEL[opts.missing[0] || 'read']}” wasn’t ticked`
  const row = (p: GmailPermission) => `
      <div class="row${opts.missing.includes(p) ? ' was-missing' : ''}">
        <span class="lbl">${esc(PERMISSION_LABEL[p])}</span>
        <span class="box">${tick}</span>
      </div>`
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tick both boxes to connect Gmail · Colvy</title>
<style>
  :root{--ink:#1a1a1a;--slate:#6b6b70;--border:#e5e7eb;--coral:#ff7a6b;--peach:#fff4f1;--canvas:#fafafa}
  *{box-sizing:border-box}
  body{margin:0;background:var(--canvas);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{width:100%;max-width:560px;background:#fff;border:1px solid var(--border);border-radius:18px;padding:28px 24px}
  .icon{width:44px;height:44px;border-radius:12px;background:var(--peach);color:var(--coral);display:flex;align-items:center;justify-content:center;margin-bottom:14px}
  h1{font-size:21px;line-height:1.3;margin:0 0 8px;font-weight:800}
  p{font-size:14.5px;line-height:1.6;color:var(--slate);margin:0 0 14px}
  .mock{border:1px solid var(--border);border-radius:12px;padding:6px 14px;margin:6px 0 18px;background:#fff}
  .mock .head{font-size:12px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.04em;padding:8px 0 4px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--border)}
  .row .lbl{font-size:14px;color:var(--ink)}
  .row .box{width:22px;height:22px;border-radius:5px;background:#1a73e8;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .row.was-missing .lbl{font-weight:700}
  .actions{display:flex;gap:10px;flex-wrap:wrap}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:11px;font-size:15px;font-weight:700;text-decoration:none}
  .primary{background:var(--coral);color:#fff}
  .secondary{background:#fff;color:var(--ink);border:1px solid var(--border)}
  .note{font-size:12.5px;margin:18px 0 0}
  @media (max-width:480px){.card{padding:22px 18px}.btn{width:100%}}
</style>
</head>
<body>
  <main class="card">
    <div class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></div>
    <h1>Colvy needs both permissions to read and send email</h1>
    <p>${esc(which)} on Google’s screen, so Gmail wasn’t connected and nothing was saved. Please try again and tick both boxes (or “Select all”):</p>
    <div class="mock" aria-label="Both boxes ticked">
      <div class="head">Select what Colvy can access</div>
      ${row('read')}
      ${row('send')}
    </div>
    <p>Colvy reads your inbox so customer emails appear in Colvy, and sends the replies your team writes from your Gmail address. It can’t delete or change your email.</p>
    <div class="actions">
      <a class="btn primary" href="${esc(opts.retryUrl)}">Try again</a>
      <a class="btn secondary" href="${esc(opts.backUrl)}">Back to Colvy</a>
    </div>
    <p class="note">Rather not sign in with Google? In Colvy, go to Settings, Channels, Email and forward your email to your Colvy address instead.</p>
  </main>
</body>
</html>`
}
