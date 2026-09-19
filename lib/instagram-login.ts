// Instagram API with **Instagram Login** (distinct from the Facebook-Login flow
// in lib/meta.ts). Here the business signs in with Instagram directly at
// instagram.com — no Facebook Page required — and we get an Instagram *User*
// access token scoped to the `instagram_business_*` permissions.
//
// It uses its OWN app credentials: the Instagram app id/secret shown under
// App → Instagram → API setup with Instagram login (NOT the Facebook app
// id/secret). Set these in the environment:
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI
//
// Flow: authorize (instagram.com) → code → short-lived token (api.instagram.com)
// → long-lived token (graph.instagram.com, ~60 days) → profile.

const IG_GRAPH = 'https://graph.instagram.com'

export const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || ''
export const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || ''
export const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || ''

// The Instagram-Login permissions Colvy uses: read the account, and read/reply
// to comments and DMs. Publishing and insights are deliberately omitted (Colvy
// doesn't post to Instagram or read insights, so we don't request them).
export const IG_LOGIN_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
]

export function isInstagramLoginConfigured(): boolean {
  return !!(INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET && INSTAGRAM_REDIRECT_URI)
}

// Step 1 — the authorization window. `state` carries our company id + origin.
export function instagramLoginUrl(state: string, scopes: string[] = IG_LOGIN_SCOPES): string {
  const p = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`
}

// Step 2 — exchange the returned code for a SHORT-lived user token (~1 hour).
// The token endpoint is form-encoded and returns { access_token, user_id, permissions }.
export async function exchangeInstagramCode(code: string): Promise<{ token?: string; userId?: string; error?: string }> {
  try {
    const body = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code,
    })
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error_message || data?.error?.message || `token exchange failed (${res.status})` }
    return { token: data.access_token, userId: data.user_id != null ? String(data.user_id) : undefined }
  } catch (e: any) {
    return { error: e?.message || 'token exchange failed' }
  }
}

// Step 3 — swap the short-lived token for a LONG-lived one (~60 days).
export async function instagramLongLivedToken(shortToken: string): Promise<{ token?: string; expiresIn?: number; error?: string }> {
  try {
    const p = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: INSTAGRAM_APP_SECRET,
      access_token: shortToken,
    })
    const res = await fetch(`${IG_GRAPH}/access_token?${p.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || `long-lived exchange failed (${res.status})` }
    return { token: data.access_token, expiresIn: data.expires_in }
  } catch (e: any) {
    return { error: e?.message || 'long-lived exchange failed' }
  }
}

// Step 4 — the connected account's profile (id + username + type).
export async function getInstagramProfile(token: string): Promise<{ id?: string; username?: string; accountType?: string; error?: string }> {
  try {
    const p = new URLSearchParams({ fields: 'user_id,username,account_type', access_token: token })
    const res = await fetch(`${IG_GRAPH}/me?${p.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || `profile fetch failed (${res.status})` }
    return { id: data.user_id != null ? String(data.user_id) : (data.id != null ? String(data.id) : undefined), username: data.username, accountType: data.account_type }
  } catch (e: any) {
    return { error: e?.message || 'profile fetch failed' }
  }
}

const IG_GRAPH_V = 'https://graph.instagram.com/v23.0'

// Is this meta_channels row an Instagram-Login connection (vs a Page-linked one)?
// Identified by the synthetic page_id the callback writes.
export function isIgLoginChannel(channel: { page_id?: string | null } | null | undefined): boolean {
  return typeof channel?.page_id === 'string' && channel.page_id.startsWith('iglogin:')
}

// Subscribe this Instagram account to the app's webhooks (messages + comments)
// so inbound DMs/comments are delivered. Called once at connect time.
export async function subscribeInstagramWebhooks(igId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = new URLSearchParams({ subscribed_fields: 'messages,comments', access_token: token })
    const res = await fetch(`${IG_GRAPH_V}/${igId}/subscribed_apps?${p.toString()}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message || 'subscription failed' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'subscription failed' }
  }
}

// Send a DM reply from an Instagram-Login account (Instagram Send API on
// graph.instagram.com, keyed by the account's own token — `me/messages`).
export async function sendInstagramMessage(token: string, recipientId: string, text: string, tag?: string): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${IG_GRAPH_V}/me/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : {}), access_token: token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || 'Send failed' }
    return { id: data.message_id }
  } catch (e: any) {
    return { error: e?.message || 'Send failed' }
  }
}

// Send a media attachment from an Instagram-Login account.
export async function sendInstagramAttachment(token: string, recipientId: string, url: string, kind: string, tag?: string): Promise<{ id?: string; error?: string }> {
  const type = kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'file'
  try {
    const res = await fetch(`${IG_GRAPH_V}/me/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { attachment: { type, payload: { url } } }, ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : {}), access_token: token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || 'Attachment send failed' }
    return { id: data.message_id }
  } catch (e: any) {
    return { error: e?.message || 'Attachment send failed' }
  }
}

// Reply to a comment on an Instagram-Login account's media.
export async function replyInstagramComment(token: string, commentId: string, message: string): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${IG_GRAPH_V}/${commentId}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || 'Comment reply failed' }
    return { id: data.id }
  } catch (e: any) {
    return { error: e?.message || 'Comment reply failed' }
  }
}

// Privately reply to a commenter via DM (Instagram Send API keyed by comment_id).
export async function sendInstagramCommentPrivateReply(token: string, commentId: string, text: string): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${IG_GRAPH_V}/me/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text }, access_token: token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || 'Could not send the DM' }
    return { id: data.message_id }
  } catch (e: any) {
    return { error: e?.message || 'Could not send the DM' }
  }
}

// Hide/unhide a comment on an Instagram-Login account's media (IG uses `hide`).
export async function hideInstagramComment(token: string, commentId: string, hidden: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_GRAPH_V}/${commentId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hide: hidden, access_token: token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message || 'Could not update the comment' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not update the comment' }
  }
}

// Fetch a single comment's author + text on an Instagram-Login account. The
// real-time `comments` webhook payload often omits the commenter's username, so
// we hydrate it from the Graph API (graph.instagram.com) with the account token.
export async function fetchInstagramComment(commentId: string, token: string): Promise<{ name?: string; message?: string } | null> {
  try {
    const p = new URLSearchParams({ fields: 'from,username,text', access_token: token })
    const res = await fetch(`${IG_GRAPH_V}/${commentId}?${p.toString()}`)
    if (!res.ok) return null
    const d = await res.json()
    return { name: d.from?.username || d.username || undefined, message: d.text || undefined }
  } catch { return null }
}

// Look up a DM sender's profile (name, avatar) on an Instagram-Login account.
export async function fetchInstagramUserProfile(igsid: string, token: string): Promise<{ name?: string; avatar?: string }> {
  try {
    const p = new URLSearchParams({ fields: 'name,username,profile_pic', access_token: token })
    const res = await fetch(`${IG_GRAPH_V}/${igsid}?${p.toString()}`)
    if (!res.ok) return {}
    const d = await res.json().catch(() => ({}))
    return { name: d.name || d.username || undefined, avatar: d.profile_pic || undefined }
  } catch { return {} }
}

// Refresh a long-lived token before it expires (extends another ~60 days).
export async function refreshInstagramToken(longToken: string): Promise<{ token?: string; expiresIn?: number; error?: string }> {
  try {
    const p = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: longToken })
    const res = await fetch(`${IG_GRAPH}/refresh_access_token?${p.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.error?.message || `refresh failed (${res.status})` }
    return { token: data.access_token, expiresIn: data.expires_in }
  } catch (e: any) {
    return { error: e?.message || 'refresh failed' }
  }
}
