import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // no lookalikes (l, o, 0, 1)

function makeCode(len = 7) {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

// Wrap a long URL behind https://colvy.com/l/<code>. Used for Stripe checkout
// links, media and attachments — keeps SMS short, avoids spam-looking URLs, and
// gives us click tracking. Falls back to the original URL if anything fails, so
// a shortener problem can never block a payment or a message.
export async function shortenUrl(
  targetUrl: string,
  opts: { companyId?: string; kind?: string; conversationId?: string; expiresAt?: string } = {}
): Promise<string> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
  if (!targetUrl) return targetUrl
  try {
    const db = admin()
    // A few attempts in case of a code collision.
    for (let i = 0; i < 5; i++) {
      const code = makeCode()
      const { error } = await db.from('short_links').insert({
        code,
        company_id: opts.companyId || null,
        target_url: targetUrl,
        kind: opts.kind || 'other',
        conversation_id: opts.conversationId || null,
        expires_at: opts.expiresAt || null,
      })
      if (!error) return `${base}/l/${code}`
      // Unique violation → try another code; anything else → give up.
      if (!/duplicate|unique/i.test(error.message || '')) break
    }
  } catch { /* fall through */ }
  return targetUrl
}
