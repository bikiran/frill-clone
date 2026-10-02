// Server-only helpers for the Social Engagement Manager: pull Facebook posts +
// comments via the Graph API, AI-classify each comment (risk / category /
// sentiment), and act on them (reply / hide / private-reply DM).
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SOCIAL_CATEGORIES } from '@/lib/social'
import { isIgLoginChannel } from '@/lib/instagram-login'

const IG_GRAPH = 'https://graph.instagram.com/v23.0'

const GRAPH = 'https://graph.facebook.com/v25.0'

export function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// The active connected Facebook page for a company (page id + token).
export async function getFacebookChannel(db: any, companyId: string) {
  const { data } = await db.from('meta_channels').select('*')
    .eq('company_id', companyId).eq('platform', 'facebook').eq('is_active', true).limit(1)
  return data?.[0] || null
}

// ── Graph API actions ───────────────────────────────────────────────────────
export async function replyToComment(commentId: string, pageToken: string, message: string) {
  const res = await fetch(`${GRAPH}/${commentId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageToken }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d?.error?.message || 'Could not post the reply')
  return d
}

// Reply to an Instagram comment on a PAGE-LINKED IG account (Instagram Graph
// API via Facebook — IG replies live under /{comment-id}/replies).
export async function replyToIgComment(commentId: string, pageToken: string, message: string) {
  const res = await fetch(`${GRAPH}/${commentId}/replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageToken }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d?.error?.message || 'Could not post the reply')
  return d
}

// Hide/unhide an Instagram comment on a page-linked IG account (IG uses `hide`,
// not the Facebook `is_hidden`).
export async function setIgCommentHidden(commentId: string, pageToken: string, hidden: boolean) {
  const res = await fetch(`${GRAPH}/${commentId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hide: hidden, access_token: pageToken }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d?.error?.message || 'Could not update the comment')
  return d
}

export async function setCommentHidden(commentId: string, pageToken: string, hidden: boolean) {
  const res = await fetch(`${GRAPH}/${commentId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hidden: hidden, access_token: pageToken }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d?.error?.message || 'Could not update the comment')
  return d
}

// DM the commenter privately (the one-time private reply tied to a comment).
export async function privateReply(commentId: string, pageToken: string, message: string) {
  const res = await fetch(`${GRAPH}/${commentId}/private_replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageToken }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d?.error?.message || 'Could not send the DM')
  return d
}

// ── AI classification ───────────────────────────────────────────────────────
// One batched Anthropic call classifies many comments at once (risk / category
// / sentiment), picking the category from the company's configured list.
async function classifyBatch(comments: { id: string; message: string }[], categories: string[]) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || comments.length === 0) return {} as Record<string, { risk_level: string; category: string; sentiment: string }>

  const list = comments.map((c, i) => `${i}. ${JSON.stringify((c.message || '').slice(0, 500))}`).join('\n')
  const prompt = `You classify social-media comments left on a business's Facebook/Instagram posts.

For EACH comment below, decide:
- "risk_level": "critical" if it is angry, abusive, a serious complaint, or reputationally harmful; otherwise "safe".
- "category": pick exactly ONE from this list: ${categories.map(c => `"${c}"`).join(', ')}.
- "sentiment": "positive", "neutral", or "negative".

Comments:
${list}

Reply with ONLY a JSON array, one object per comment in order, like:
[{"i":0,"risk_level":"safe","category":"Positive Feedback","sentiment":"positive"}]
No prose, no code fences.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    if (!res.ok) return {}
    let text = (data.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim()
    text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
    const arr = JSON.parse(text)
    const out: Record<string, { risk_level: string; category: string; sentiment: string }> = {}
    const catSet = new Set(categories)
    for (const r of arr) {
      const c = comments[r.i]
      if (!c) continue
      out[c.id] = {
        risk_level: r.risk_level === 'critical' ? 'critical' : 'safe',
        category: catSet.has(r.category) ? r.category : 'Neutral / Mixed',
        sentiment: ['positive', 'negative', 'neutral'].includes(r.sentiment) ? r.sentiment : 'neutral',
      }
    }
    return out
  } catch { return {} }
}

// Classify a single freshly-ingested comment (used by the real-time webhook,
// where comments arrive one at a time rather than in a sync batch).
export async function classifyOne(db: any, companyId: string, commentDbId: string, message: string) {
  if (!message?.trim()) return
  const { data: catRows } = await db.from('social_comment_categories').select('name').eq('company_id', companyId)
  const categories = (catRows && catRows.length ? catRows.map((c: any) => c.name) : DEFAULT_SOCIAL_CATEGORIES)
  const results = await classifyBatch([{ id: commentDbId, message }], categories)
  const cls = results[commentDbId]
  if (cls) await db.from('social_comments').update(cls).eq('id', commentDbId)
}

// ── Sync ────────────────────────────────────────────────────────────────────
type ToClassify = { id: string; message: string }

// Pull a Facebook Page's recent posts + comments into social_posts /
// social_comments. New comment inserts count toward the returned `comments`.
async function syncFacebookChannel(db: any, companyId: string, channel: any, toClassify: ToClassify[]): Promise<{ posts: number; comments: number }> {
  const token = channel.page_access_token
  if (!token) return { posts: 0, comments: 0 }

  const feedRes = await fetch(`${GRAPH}/${channel.page_id}/feed?fields=id,message,permalink_url,created_time,full_picture,status_type&limit=25&access_token=${encodeURIComponent(token)}`)
  const feed = await feedRes.json()
  if (!feedRes.ok) throw new Error(feed?.error?.message || 'Could not fetch page posts')

  let postCount = 0, commentCount = 0
  for (const p of (feed.data || [])) {
    postCount++
    const postRow = {
      company_id: companyId, meta_channel_id: channel.id, platform: 'facebook',
      external_post_id: p.id, permalink: p.permalink_url || null, message: p.message || null,
      media_url: p.full_picture || null,
      post_type: /video|reel/i.test(p.status_type || '') ? 'reel' : 'post',
      posted_at: p.created_time || null, raw: p,
    }
    const { data: existingPost } = await db.from('social_posts').select('id').eq('company_id', companyId).eq('external_post_id', p.id).maybeSingle()
    let postDbId = existingPost?.id
    if (postDbId) await db.from('social_posts').update(postRow).eq('id', postDbId)
    else { const { data: ins } = await db.from('social_posts').insert(postRow).select('id').maybeSingle(); postDbId = ins?.id }

    const cRes = await fetch(`${GRAPH}/${p.id}/comments?fields=id,from{id,name,picture},message,created_time,attachment&limit=100&access_token=${encodeURIComponent(token)}`)
    const cData = await cRes.json()
    if (!cRes.ok) continue
    for (const c of (cData.data || [])) {
      const { data: existing } = await db.from('social_comments').select('id, category').eq('company_id', companyId).eq('external_comment_id', c.id).maybeSingle()
      const row: any = {
        company_id: companyId, post_id: postDbId, meta_channel_id: channel.id, platform: 'facebook',
        external_comment_id: c.id, external_post_id: p.id,
        author_name: c.from?.name || 'Facebook user', author_id: c.from?.id || null,
        author_photo: c.from?.picture?.data?.url || null,
        message: c.message || null,
        attachment_url: c.attachment?.media?.image?.src || c.attachment?.url || null,
        commented_at: c.created_time || null, raw: c,
      }
      if (existing?.id) {
        await db.from('social_comments').update(row).eq('id', existing.id)
        if (!existing.category && (c.message || '').trim()) toClassify.push({ id: existing.id, message: c.message })
      } else {
        const { data: ins } = await db.from('social_comments').insert(row).select('id').maybeSingle()
        commentCount++
        if (ins?.id && (c.message || '').trim()) toClassify.push({ id: ins.id, message: c.message })
      }
    }
  }
  return { posts: postCount, comments: commentCount }
}

// Pull an Instagram account's recent media + comments. Handles BOTH flavours:
// an Instagram-Login account (its own token on graph.instagram.com) and a
// page-linked Instagram account (the Page token on graph.facebook.com). The
// media/comments edges are the same shape on both graphs; only the base URL,
// the account node, and the token differ. IG comments expose `username` (not a
// `from{name}`), so that is the author name.
async function syncInstagramChannel(db: any, companyId: string, channel: any, toClassify: ToClassify[]): Promise<{ posts: number; comments: number }> {
  const token = channel.page_access_token
  if (!token) return { posts: 0, comments: 0 }
  const igLogin = isIgLoginChannel(channel)
  const base = igLogin ? IG_GRAPH : GRAPH
  // IG-Login tokens are scoped to the account, so `me` is safest; page-linked
  // reads go through the IG business account id with the Page token.
  const accountNode = igLogin ? 'me' : (channel.ig_account_id || '')
  if (!igLogin && !accountNode) return { posts: 0, comments: 0 }

  const mediaRes = await fetch(`${base}/${accountNode}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25&access_token=${encodeURIComponent(token)}`)
  const media = await mediaRes.json()
  if (!mediaRes.ok) throw new Error(media?.error?.message || 'Could not fetch Instagram media')

  // IG-Login comment reads omit `from` (username carries the author); page-linked
  // IG returns from{id,username} via the Graph API.
  const commentFields = igLogin ? 'id,text,username,timestamp' : 'id,text,username,timestamp,from'

  let postCount = 0, commentCount = 0
  for (const m of (media.data || [])) {
    postCount++
    const postRow = {
      company_id: companyId, meta_channel_id: channel.id, platform: 'instagram',
      external_post_id: m.id, permalink: m.permalink || null, message: m.caption || null,
      media_url: m.media_url || m.thumbnail_url || null,
      post_type: /video|reel/i.test(m.media_type || '') ? 'reel' : 'post',
      posted_at: m.timestamp || null, raw: m,
    }
    const { data: existingPost } = await db.from('social_posts').select('id').eq('company_id', companyId).eq('external_post_id', m.id).maybeSingle()
    let postDbId = existingPost?.id
    if (postDbId) await db.from('social_posts').update(postRow).eq('id', postDbId)
    else { const { data: ins } = await db.from('social_posts').insert(postRow).select('id').maybeSingle(); postDbId = ins?.id }

    const cRes = await fetch(`${base}/${m.id}/comments?fields=${commentFields}&limit=100&access_token=${encodeURIComponent(token)}`)
    const cData = await cRes.json()
    if (!cRes.ok) continue
    for (const c of (cData.data || [])) {
      const { data: existing } = await db.from('social_comments').select('id, category').eq('company_id', companyId).eq('external_comment_id', c.id).maybeSingle()
      const row: any = {
        company_id: companyId, post_id: postDbId, meta_channel_id: channel.id, platform: 'instagram',
        external_comment_id: c.id, external_post_id: m.id,
        author_name: c.username || c.from?.username || 'Instagram user',
        author_id: c.from?.id || null, author_photo: null,
        message: c.text || null,
        commented_at: c.timestamp || null, raw: c,
      }
      if (existing?.id) {
        await db.from('social_comments').update(row).eq('id', existing.id)
        if (!existing.category && (c.text || '').trim()) toClassify.push({ id: existing.id, message: c.text })
      } else {
        const { data: ins } = await db.from('social_comments').insert(row).select('id').maybeSingle()
        commentCount++
        if (ins?.id && (c.text || '').trim()) toClassify.push({ id: ins.id, message: c.text })
      }
    }
  }
  return { posts: postCount, comments: commentCount }
}

// Sync every connected social account for a company: the Facebook Page AND each
// connected Instagram account (page-linked or Instagram-Login). Previously only
// Facebook was pulled, so Instagram comments only ever showed if they happened
// to arrive live on the webhook.
export async function syncSocial(companyId: string): Promise<{ posts: number; comments: number; classified: number }> {
  const db = admin()

  const { data: catRows } = await db.from('social_comment_categories').select('name').eq('company_id', companyId)
  const categories = (catRows && catRows.length ? catRows.map((c: any) => c.name) : DEFAULT_SOCIAL_CATEGORIES)

  const toClassify: ToClassify[] = []
  let postCount = 0, commentCount = 0
  const errors: string[] = []

  // Facebook Page.
  const fbChannel = await getFacebookChannel(db, companyId)
  if (fbChannel?.page_access_token) {
    try {
      const r = await syncFacebookChannel(db, companyId, fbChannel, toClassify)
      postCount += r.posts; commentCount += r.comments
    } catch (e: any) { errors.push(`Facebook: ${e?.message || 'sync failed'}`) }
  }

  // Every connected Instagram account (page-linked + Instagram-Login).
  const { data: igChannels } = await db.from('meta_channels').select('*')
    .eq('company_id', companyId).eq('platform', 'instagram').eq('is_active', true)
  for (const ch of (igChannels || [])) {
    if (!ch.page_access_token) continue
    try {
      const r = await syncInstagramChannel(db, companyId, ch, toClassify)
      postCount += r.posts; commentCount += r.comments
    } catch (e: any) { errors.push(`Instagram (${ch.page_name || ch.ig_account_id || ch.id}): ${e?.message || 'sync failed'}`) }
  }

  if (!fbChannel && !(igChannels && igChannels.length)) {
    throw new Error('No Facebook or Instagram account connected. Connect one under Settings → Channels first.')
  }
  // Everything connected failed outright (e.g. every token lapsed): surface it.
  if (errors.length && postCount === 0 && commentCount === 0) {
    throw new Error(errors.join(' · '))
  }

  // Classify the new/unclassified comments in batches of 30.
  let classified = 0
  for (let i = 0; i < toClassify.length; i += 30) {
    const batch = toClassify.slice(i, i + 30)
    const results = await classifyBatch(batch, categories)
    for (const [id, cls] of Object.entries(results)) {
      await db.from('social_comments').update(cls).eq('id', id)
      classified++
    }
  }

  return { posts: postCount, comments: commentCount, classified }
}
