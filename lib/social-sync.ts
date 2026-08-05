// Server-only helpers for the Social Engagement Manager: pull Facebook posts +
// comments via the Graph API, AI-classify each comment (risk / category /
// sentiment), and act on them (reply / hide / private-reply DM).
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SOCIAL_CATEGORIES } from '@/lib/social'

const GRAPH = 'https://graph.facebook.com/v21.0'

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

// ── Sync ────────────────────────────────────────────────────────────────────
export async function syncSocial(companyId: string): Promise<{ posts: number; comments: number; classified: number }> {
  const db = admin()
  const channel = await getFacebookChannel(db, companyId)
  if (!channel) throw new Error('No Facebook page connected. Connect one under Integrations first.')
  const token = channel.page_access_token
  if (!token) throw new Error('The Facebook connection is missing its page token — reconnect the page.')

  // The company's category names (fall back to the defaults) drive classification.
  const { data: catRows } = await db.from('social_comment_categories').select('name').eq('company_id', companyId)
  const categories = (catRows && catRows.length ? catRows.map((c: any) => c.name) : DEFAULT_SOCIAL_CATEGORIES)

  // 1) Recent page posts.
  const feedRes = await fetch(`${GRAPH}/${channel.page_id}/feed?fields=id,message,permalink_url,created_time,full_picture,status_type&limit=25&access_token=${encodeURIComponent(token)}`)
  const feed = await feedRes.json()
  if (!feedRes.ok) throw new Error(feed?.error?.message || 'Could not fetch page posts')

  let postCount = 0, commentCount = 0
  const toClassify: { id: string; message: string }[] = []

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

    // 2) Comments on the post.
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

  // 3) Classify the new/unclassified comments in batches of 30.
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
