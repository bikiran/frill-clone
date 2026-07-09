import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Redirects /l/<code> to the stored file URL and counts the click.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await db.from('short_links').select('target_url, clicks').eq('code', code).maybeSingle()
    if (!data?.target_url) {
      return new NextResponse('Link not found', { status: 404 })
    }
    // Best-effort click count
    db.from('short_links').update({ clicks: (data.clicks || 0) + 1 }).eq('code', code).then(() => {})
    return NextResponse.redirect(data.target_url)
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
