import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A valid access token for a Gmail channel, refreshing it if it's expired.
export async function getGmailToken(channel: any): Promise<string | null> {
  const db = admin()
  const stillValid = channel.token_expires_at && new Date(channel.token_expires_at).getTime() > Date.now() + 60_000
  if (stillValid && channel.access_token) return channel.access_token
  if (!channel.refresh_token) return null

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: channel.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    await db.from('email_channels')
      .update({ sync_error: 'Google connection expired — please reconnect.' })
      .eq('id', channel.id)
    return null
  }

  const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()
  await db.from('email_channels')
    .update({ access_token: tok.access_token, token_expires_at: expiresAt, sync_error: null })
    .eq('id', channel.id)
  return tok.access_token
}

// Should this sender's email be brought into Colvy?
// Block always beats Allow. If sync_all is off, only Allowed senders come in.
export async function passesRules(db: any, channel: any, fromEmail: string): Promise<boolean> {
  const addr = (fromEmail || '').toLowerCase()
  const domain = addr.split('@')[1] || ''

  const { data: rules } = await db.from('email_rules')
    .select('rule_type, pattern').eq('email_channel_id', channel.id).eq('is_enabled', true)

  const matches = (p: string) => {
    const pat = String(p).toLowerCase().trim()
    return pat === addr || pat === domain
  }

  const blocked = (rules || []).some((r: any) => r.rule_type === 'block' && matches(r.pattern))
  if (blocked) return false

  const allowed = (rules || []).some((r: any) => r.rule_type === 'allow' && matches(r.pattern))
  if (allowed) return true

  // No explicit rule: bring it in only if the mailbox syncs everything.
  return channel.sync_all !== false
}

// Decode a base64url Gmail body part.
function decodeB64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch { return '' }
}

// Turn an HTML email into readable text.
//
// The old version did `.replace(/<[^>]+>/g, ' ')` — which removes TAGS but
// leaves the CONTENTS of <style> and <script> behind, so the agent was reading
// raw CSS ("body { width: 100% !important; ... }") instead of the message. Kill
// those blocks entirely first, then unwrap the markup.
export function htmlToText(html: string): string {
  if (!html) return ''
  let t = html
  // Drop anything that isn't prose.
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  t = t.replace(/<head[\s\S]*?<\/head>/gi, ' ')
  t = t.replace(/<!--[\s\S]*?-->/g, ' ')
  t = t.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ' ')
  // Keep the shape of the message: block elements become line breaks.
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
  t = t.replace(/<li[^>]*>/gi, '• ')
  // Now remove the remaining tags.
  t = t.replace(/<[^>]+>/g, '')
  // Decode the common entities (&amp; was showing up literally in the thread).
  const ENT: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
    lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  }
  t = t.replace(/&([a-z]+);/gi, (m, e) => ENT[String(e).toLowerCase()] ?? m)
  t = t.replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
  t = t.replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
  // Tidy the whitespace without flattening paragraphs into one blob.
  t = t.replace(/[ \t\u00a0]+/g, ' ')
  t = t.replace(/ ?\n ?/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

// Pull the readable body out of a Gmail payload.
// Prefers text/plain ANYWHERE in the tree before falling back to HTML — the old
// code walked parts in order and could grab an HTML part even when a clean
// plain-text alternative existed further along.
function findPart(payload: any, mime: string): string {
  if (!payload) return ''
  if (payload.mimeType === mime && payload.body?.data) return decodeB64(payload.body.data)
  for (const p of payload.parts || []) {
    const found = findPart(p, mime)
    if (found) return found
  }
  return ''
}

function extractBody(payload: any): string {
  const plain = findPart(payload, 'text/plain')
  if (plain.trim()) return plain
  const html = findPart(payload, 'text/html')
  if (html.trim()) return htmlToText(html)
  return ''
}

function header(headers: any[], name: string): string {
  const h = (headers || []).find((x: any) => (x.name || '').toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

function parseAddress(raw: string): { name: string | null; email: string } {
  const m = String(raw).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: String(raw).trim().toLowerCase() }
}

// Strip quoted history so the thread shows only what's new.
function stripQuoted(text: string): string {
  if (!text) return ''
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(On .+ wrote:|-{2,}\s*Original Message|_{5,}|From:\s)/i.test(line)) break
    if (/^\s*>/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim() || text.trim()
}

// ── Is this a real customer email, or bulk noise? ───────────────────────────
// A shared mailbox is mostly newsletters, receipts from vendors, shipping
// notices and auto-replies. Pulling all of it into the inbox buries the actual
// enquiries. This filters on the SAME signals a mail client uses — the standard
// bulk-mail headers, which marketing senders are obliged to set — rather than
// guessing from wording.
//
// Returns a reason string when the mail should be skipped, or null to keep it.
export function junkReason(headers: any[], fromEmail: string, subject: string, opts: any = {}): string | null {
  const h = (n: string) => header(headers, n).toLowerCase()
  const addr = (fromEmail || '').toLowerCase()
  const local = addr.split('@')[0] || ''
  const subj = (subject || '').toLowerCase()

  // Automated senders that can't receive a reply anyway.
  if (opts.ignore_noreply !== false) {
    if (/^(no-?reply|do-?not-?reply|donotreply|bounce|mailer-daemon|postmaster|notifications?|alerts?)/.test(local)) {
      return 'no-reply sender'
    }
  }

  // Auto-replies / out-of-office / vacation responders.
  if (opts.ignore_autoreply !== false) {
    const autoSubmitted = h('auto-submitted')          // RFC 3834
    if (autoSubmitted && autoSubmitted !== 'no') return 'auto-reply'
    if (h('x-autoreply') || h('x-autorespond') || h('x-auto-response-suppress')) return 'auto-reply'
    if (/^(auto(matic)?[ -]?(reply|response)|out of (the )?office|away from|vacation|thank you for (contacting|your email))/i.test(subj)) {
      return 'auto-reply'
    }
  }

  // Newsletters and marketing. List-Unsubscribe is the giveaway: transactional
  // mail a customer actually needs (order confirmations, shipping) does not
  // carry it, but every legitimate bulk sender must.
  if (opts.ignore_newsletters !== false) {
    if (h('list-unsubscribe') || h('list-id')) return 'newsletter / bulk mail'
    const prec = h('precedence')
    if (prec === 'bulk' || prec === 'list' || prec === 'junk') return 'bulk mail'
    if (h('x-campaign-id') || h('x-mailer-campaign') || h('feedback-id')) return 'marketing campaign'
  }

  if (opts.ignore_marketing !== false) {
    if (/^(marketing|newsletter|promo|promotions?|offers?|deals?|news|updates?|info|hello|hi|team)@/.test(addr + '@')) {
      // only when combined with a bulk signal above; a plain info@ can be a real
      // customer, so this alone is NOT enough to bin it.
    }
    if (/(unsubscribe|% off|sale ends|limited time|black friday|newsletter)/i.test(subj)) return 'marketing'
  }

  return null
}

/**
 * Pull new mail from a connected Gmail mailbox into Colvy.
 * Only inbound messages are imported (never our own sent mail), and each Gmail
 * message id is recorded so nothing is imported twice.
 */
export async function syncGmailChannel(channelId: string): Promise<{ imported: number; skipped?: number; error?: string }> {
  const db = admin()
  const { data: channel } = await db.from('email_channels').select('*').eq('id', channelId).maybeSingle()
  if (!channel || channel.provider !== 'gmail') return { imported: 0, error: 'Not a Gmail channel' }

  const token = await getGmailToken(channel)
  if (!token) return { imported: 0, error: 'Google connection expired — reconnect the account.' }

  const auth = { Authorization: `Bearer ${token}` }

  // Only look at the inbox, and only since the last sync (default: last 7 days).
  const since = channel.last_synced_at
    ? Math.floor(new Date(channel.last_synced_at).getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000)

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`in:inbox after:${since}`)}&maxResults=25`,
    { headers: auth }
  )
  const list = await listRes.json()
  if (!listRes.ok) {
    const msg = list?.error?.message || 'Gmail list failed'
    await db.from('email_channels').update({ sync_error: msg }).eq('id', channelId)
    return { imported: 0, error: msg }
  }

  let imported = 0
  let skipped = 0

  for (const m of list.messages || []) {
    // Skip anything we already have.
    const { data: seen } = await db.from('messages').select('id').eq('gmail_message_id', m.id).maybeSingle()
    if (seen) continue

    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: auth })
    if (!msgRes.ok) continue
    const full = await msgRes.json()

    const headers = full.payload?.headers || []
    const from = parseAddress(header(headers, 'From'))
    const subject = header(headers, 'Subject') || '(no subject)'
    const messageId = header(headers, 'Message-ID') || null
    const inReplyTo = header(headers, 'In-Reply-To') || null

    // Never import our own outgoing mail back in as a customer message.
    if (from.email === String(channel.inbound_address).toLowerCase()) continue

    // Respect the mailbox's allow/block rules.
    if (!(await passesRules(db, channel, from.email))) continue

    // Bin the bulk noise — unless an explicit ALLOW rule named this sender, in
    // which case the business has said they want it.
    const { data: allowRules } = await db.from('email_rules')
      .select('pattern').eq('email_channel_id', channel.id).eq('rule_type', 'allow').eq('is_enabled', true)
    const explicitlyAllowed = (allowRules || []).some((r: any) => {
      const pat = String(r.pattern).toLowerCase().trim()
      return pat === from.email || pat === (from.email.split('@')[1] || '')
    })
    if (!explicitlyAllowed) {
      const reason = junkReason(headers, from.email, subject, channel.filter_settings || {})
      if (reason) {
        skipped++
        continue
      }
    }

    const content = stripQuoted(extractBody(full.payload)) || full.snippet || ''
    const companyId = channel.company_id

    // Find-or-create the contact.
    let contact: any = null
    const { data: existingContacts } = await db.from('contacts').select('*')
      .eq('company_id', companyId).ilike('email', from.email).limit(1)
    contact = existingContacts?.[0] || null
    if (!contact) {
      const { data: created } = await db.from('contacts').insert({
        company_id: companyId, name: from.name || from.email, email: from.email, source: 'email',
      }).select().maybeSingle()
      contact = created
    }

    // Thread into an existing conversation where possible.
    let conv: any = null
    if (full.threadId) {
      const { data: byThread } = await db.from('conversations').select('*')
        .eq('company_id', companyId).eq('email_message_id', full.threadId).limit(1)
      conv = byThread?.[0] || null
    }
    if (!conv && contact?.id) {
      const { data: recent } = await db.from('conversations').select('*')
        .eq('company_id', companyId).eq('contact_id', contact.id).eq('channel', 'email')
        .order('last_message_at', { ascending: false }).limit(1)
      conv = recent?.[0] || null
    }
    if (!conv) {
      const { data: newConv } = await db.from('conversations').insert({
        company_id: companyId, channel: 'email', subject,
        email_subject: subject,
        email_message_id: full.threadId || messageId,
        email_channel_id: channel.id,
        assigned_location_id: channel.location_id || null,
        contact_id: contact?.id || null, status: 'open',
        is_unread: true, unread_count: 1,
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).select().maybeSingle()
      conv = newConv
    } else {
      await db.from('conversations').update({
        status: 'open', is_unread: true,
        email_channel_id: channel.id,
        unread_count: (conv.unread_count || 0) + 1,
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).eq('id', conv.id)
    }
    if (!conv) continue

    await db.from('messages').insert({
      conversation_id: conv.id, company_id: companyId,
      sender_type: 'visitor',
      sender_name: from.name || from.email,
      sender_email: from.email,
      content,
      delivery_channel: 'email',
      email_message_id: messageId,
      email_in_reply_to: inReplyTo,
      gmail_message_id: m.id,
    })

    imported++
  }

  await db.from('email_channels').update({
    last_synced_at: new Date().toISOString(),
    sync_error: null,
  }).eq('id', channelId)

  return { imported, skipped }
}

// Send a reply through Gmail (so it appears in the business's Sent folder and
// threads correctly on the customer's side).
export async function sendGmail(channel: any, opts: {
  to: string
  subject: string
  body: string
  inReplyTo?: string | null
  threadId?: string | null
}): Promise<{ id?: string; error?: string }> {
  const token = await getGmailToken(channel)
  if (!token) return { error: 'Google connection expired — reconnect the account.' }

  const lines = [
    `To: ${opts.to}`,
    `From: ${channel.from_name ? `${channel.from_name} <${channel.inbound_address}>` : channel.inbound_address}`,
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
  ]
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`)
    lines.push(`References: ${opts.inReplyTo}`)
  }
  lines.push('', opts.body)

  const raw = Buffer.from(lines.join('\r\n'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, ...(opts.threadId ? { threadId: opts.threadId } : {}) }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Gmail send failed' }
  return { id: data.id }
}
