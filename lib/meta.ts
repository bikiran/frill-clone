// Shared helpers for Meta (Facebook Messenger + Instagram DM) integration.
//
// One Meta app (option A). Businesses connect via Facebook Login; we exchange
// the returned user token for long-lived Page tokens, one per Page, and store
// them. Inbound DMs arrive on a single webhook keyed by Page / IG account id.
//
// NOTE: nothing here works with real customers until the Meta app passes App
// Review. Before that, only accounts added as testers in the dev app work.

const GRAPH = 'https://graph.facebook.com/v21.0'

export const META_APP_ID = process.env.META_APP_ID || ''
export const META_APP_SECRET = process.env.META_APP_SECRET || ''
export const META_REDIRECT_URI = process.env.META_REDIRECT_URI || ''
// A random string you also enter in the Meta webhook config.
export const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'colvy-meta-verify'

// Permissions we request. Each must be approved in App Review before it works
// for non-test accounts.
export const META_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
  'business_management',
].join(',')

export function isMetaConfigured(): boolean {
  return !!(META_APP_ID && META_APP_SECRET && META_REDIRECT_URI)
}

// Step 1: the Facebook Login dialog URL. `state` carries our company id.
export function metaLoginUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    state,
    scope: META_SCOPES,
    response_type: 'code',
  })
  return `https://www.facebook.com/v21.0/dialog/oauth?${p.toString()}`
}

// Step 2: exchange the code for a short-lived user token.
export async function exchangeCodeForToken(code: string): Promise<{ token?: string; error?: string }> {
  const p = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: META_REDIRECT_URI,
    code,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`)
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Token exchange failed' }
  return { token: data.access_token }
}

// Step 3: upgrade to a long-lived user token (~60 days).
export async function longLivedToken(shortToken: string): Promise<{ token?: string; error?: string }> {
  const p = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`)
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Long-lived exchange failed' }
  return { token: data.access_token }
}

// Step 4: the Pages this user manages, each with its own long-lived Page token
// and (if present) the linked Instagram business account.
export async function listManagedPages(userToken: string): Promise<{ pages?: any[]; error?: string }> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
  )
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Could not list Pages' }
  return { pages: data.data || [] }
}

// Subscribe a Page to messaging webhooks (so its DMs reach our webhook).
export async function subscribePageWebhooks(pageId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: ['messages', 'messaging_postbacks', 'message_reactions'],
      access_token: pageToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data?.error?.message || 'Webhook subscription failed' }
  return { ok: true }
}

// Send a message via the Send API. Works for both Messenger (PSID) and
// Instagram (IGSID) — same endpoint, keyed by the Page.
export async function sendMetaMessage(
  pageId: string, pageToken: string, recipientId: string, text: string
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${GRAPH}/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',   // a reply within the 24h window
      access_token: pageToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Send failed' }
  return { id: data.message_id }
}

// Send a media attachment (image / video / audio / file) by URL. Meta fetches
// the URL and delivers it to the customer.
export async function sendMetaAttachment(
  pageId: string, pageToken: string, recipientId: string, url: string, kind: string
): Promise<{ id?: string; error?: string }> {
  const type = kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'file'
  const res = await fetch(`${GRAPH}/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type, payload: { url, is_reusable: true } } },
      messaging_type: 'RESPONSE',
      access_token: pageToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data?.error?.message || 'Attachment send failed' }
  return { id: data.message_id }
}

// Fetch a sender's profile (name, avatar) so the contact isn't just an opaque id.
export async function fetchMetaProfile(
  userId: string, pageToken: string, platform: 'facebook' | 'instagram'
): Promise<{ name?: string; avatar?: string }> {
  try {
    const fields = platform === 'instagram' ? 'name,username,profile_pic' : 'first_name,last_name,profile_pic'
    const res = await fetch(`${GRAPH}/${userId}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`)
    if (!res.ok) return {}
    const d = await res.json()
    const name = platform === 'instagram'
      ? (d.name || d.username)
      : [d.first_name, d.last_name].filter(Boolean).join(' ')
    return { name: name || undefined, avatar: d.profile_pic || undefined }
  } catch { return {} }
}
