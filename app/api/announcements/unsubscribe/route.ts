import { NextRequest, NextResponse } from 'next/server'
import { readValue } from '@/lib/oauth-state'
import { adminDb } from '@/lib/announcements-server'
import { escapeHtml } from '@/lib/safe-html'
import { unsubscribeContact } from '@/lib/announcement-notify'

export const dynamic = 'force-dynamic'

// The unsubscribe link in announcement emails (lib/announcement-notify.ts).
// GET shows a page with a button, so a mail scanner opening the link doesn't
// unsubscribe anyone; POST (the button, or a mail app's one-click
// List-Unsubscribe-Post) records it. The token is signed and names one
// contact of one company, so it can't be pointed at anyone else.

function page(title: string, body: string, form = '') {
  return new NextResponse(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111}main{max-width:440px;margin:12vh auto;padding:32px 28px;background:#fff;border:1px solid #eee;border-radius:18px}h1{font-size:21px;margin:0 0 10px}p{font-size:15px;line-height:1.55;color:#4b5563;margin:0 0 18px}button{height:44px;padding:0 22px;border:none;border-radius:12px;background:#111;color:#fff;font-size:15px;font-weight:600;cursor:pointer}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${body}</p>${form}</main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function load(t: string | null) {
  const v = readValue(t, 'ann-unsub')
  if (!v?.co || !v?.c) return null
  const db = adminDb()
  const [{ data: contact }, { data: company }] = await Promise.all([
    db.from('contacts').select('id, company_id, email, unsubscribed_at').eq('id', v.c).eq('company_id', v.co).maybeSingle(),
    db.from('companies').select('id, name').eq('id', v.co).maybeSingle(),
  ])
  return contact && company ? { db, contact, company } : null
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  const r = await load(t).catch(() => null)
  if (!r) return page('This link has expired', 'Reply to any email from the business and ask them to stop sending you updates.')
  const name = escapeHtml(r.company.name || 'this business')
  if (r.contact.unsubscribed_at) return page('You’re unsubscribed', `You won’t get updates or offers from ${name}.`)
  return page(`Unsubscribe from ${r.company.name || 'these updates'}?`, `You’ll stop getting updates and offers from ${name} by email and text.`,
    `<form method="post"><input type="hidden" name="t" value="${escapeHtml(t || '')}"><button type="submit">Unsubscribe</button></form>`)
}

export async function POST(req: NextRequest) {
  let t = req.nextUrl.searchParams.get('t')
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('form')) { const fd = await req.formData(); t = String(fd.get('t') || t || '') }
  } catch {}
  const r = await load(t).catch(() => null)
  if (!r) return page('This link has expired', 'Reply to any email from the business and ask them to stop sending you updates.')
  await unsubscribeContact(r.db, r.company.id, r.contact)
  return page('You’re unsubscribed', `You won’t get updates or offers from ${escapeHtml(r.company.name || 'this business')} any more.`)
}
