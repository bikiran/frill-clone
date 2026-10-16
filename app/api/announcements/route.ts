import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { adminDb, cleanInput, loadOwned, schemaReady, writeAnnouncement } from '@/lib/announcements-server'
import { statusOf, toPublicAnnouncement } from '@/lib/announcements'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { createSmsDraft, defaultSmsText } from '@/lib/announcements-sms'
import { htmlToText } from '@/lib/safe-html'

export const dynamic = 'force-dynamic'

// The admin's announcements, read and written with the service role for the
// workspace's staff only (requireCompanyAccess: owner, team members who aren't
// board visitors, the platform admin).
//
// GET  ?companyId=…  → { announcements, outlets, ideas, company, schemaReady }
// POST { companyId, action, id?, data? }
//   save        create (no id) or update; data = the editor's fields
//   publish     go live now          unpublish  back to draft
//   pin         data.pinned          duplicate  copy as a new draft
//   delete      remove it            sms_draft  make a draft SMS campaign from it

async function staff(req: NextRequest, db: any, companyId: string) {
  const r = await requireCompanyAccess(req, db, companyId)
  return r.ok ? r : null
}

async function whoName(db: any, companyId: string, userId?: string) {
  if (!userId) return null
  try {
    const { data } = await db.from('team_members').select('name, email').eq('company_id', companyId).eq('user_id', userId).limit(1)
    return data?.[0]?.name || data?.[0]?.email?.split('@')[0] || null
  } catch { return null }
}

function emitPublished(db: any, a: any) {
  emitIntegrationEvent(a.company_id, 'announcement.published', {
    title: `Announcement: ${String(a.title || '').slice(0, 200)}`,
    summary: htmlToText(a.description || '').slice(0, 600),
    path: '/admin/announcements',
    data: { announcement: { id: a.id, title: a.title } },
    dedupeKey: `announcement:${a.id}`,
  }, { db })
}

export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const access = await staff(req, db, companyId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const [anns, company, outlets, ideas, ready] = await Promise.all([
      db.from('announcements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
      db.from('companies').select('id, name, slug, logo_url, accent_color, industry').eq('id', companyId).maybeSingle(),
      db.from('company_locations').select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false }),
      db.from('ideas').select('id, title, status, votes').eq('company_id', companyId).neq('is_private', true).order('votes', { ascending: false }).limit(200),
      schemaReady(db),
    ])
    if (anns.error) return NextResponse.json({ error: 'Couldn’t load announcements' }, { status: 500 })
    return NextResponse.json({
      announcements: anns.data || [],
      company: company.data || null,
      outlets: outlets.data || [],
      ideas: ideas.data || [],
      schemaReady: ready,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await staff(req, db, companyId)
    if (!access) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const action = String(b.action || '')
    const id = b.id ? String(b.id) : ''
    const prev = id ? await loadOwned(db, companyId, id) : null
    if (id && !prev) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    const now = Date.now()

    if (action === 'save') {
      const { row, error } = cleanInput(b.data || {}, now)
      if (error) return NextResponse.json({ error }, { status: 400 })
      if (!prev && !row.title) return NextResponse.json({ error: 'Give it a title' }, { status: 400 })
      // Going live now: the post's date is the moment it went live.
      const wasLive = prev ? statusOf(prev, now) === 'published' || statusOf(prev, now) === 'expired' : false
      if (row.status === 'published' && !wasLive && !row.publish_at) row.publish_at = new Date(now).toISOString()
      if (row.status === 'draft') row.publish_at = row.publish_at ?? null
      row.updated_by = access.userId || null
      const w = prev
        ? await writeAnnouncement(db, { update: { ...row, updated_at: new Date(now).toISOString() }, id: prev.id, companyId })
        : await writeAnnouncement(db, { insert: { ...row, company_id: companyId, views: 0, impressions: 0, reactions: {} } })
      if (w.error || !w.data) return NextResponse.json({ error: 'Couldn’t save the announcement' }, { status: 500 })
      let saved = w.data
      const warnings: string[] = []
      // Scheduling needs publish_at (V387). Without it a "scheduled" post would
      // have no time, so keep it a draft and say why.
      if (row.status === 'scheduled' && w.dropped.includes('publish_at')) {
        const r = await writeAnnouncement(db, { update: { status: 'draft' }, id: saved.id, companyId })
        saved = r.data || saved
        warnings.push('Scheduling needs a database update (V387), so this was saved as a draft.')
      }
      const notSaved = w.dropped.filter(c => c !== 'updated_by' && c !== 'publish_at')
      if (notSaved.length) warnings.push(`Not saved until the V387 database update runs: ${notSaved.join(', ').replace(/_/g, ' ')}.`)
      if (statusOf(saved, now) === 'published' && !wasLive) emitPublished(db, saved)
      return NextResponse.json({ announcement: saved, dropped: w.dropped, warnings })
    }

    if (!prev) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

    if (action === 'publish') {
      const w = await writeAnnouncement(db, { update: { status: 'published', publish_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }, id: prev.id, companyId })
      if (w.error) return NextResponse.json({ error: 'Couldn’t publish' }, { status: 500 })
      if (statusOf(prev, now) !== 'published') emitPublished(db, w.data)
      return NextResponse.json({ announcement: w.data })
    }
    if (action === 'unpublish') {
      const w = await writeAnnouncement(db, { update: { status: 'draft', updated_at: new Date(now).toISOString() }, id: prev.id, companyId })
      if (w.error) return NextResponse.json({ error: 'Couldn’t unpublish' }, { status: 500 })
      return NextResponse.json({ announcement: w.data })
    }
    if (action === 'pin') {
      const w = await writeAnnouncement(db, { update: { is_pinned: !!b.data?.pinned }, id: prev.id, companyId })
      if (w.error) return NextResponse.json({ error: 'Couldn’t update' }, { status: 500 })
      return NextResponse.json({ announcement: w.data })
    }
    if (action === 'duplicate') {
      const copy: Record<string, any> = {}
      for (const k of ['description', 'tag', 'location_ids', 'segmentation', 'cover_image', 'video_url', 'cta_label', 'cta_url', 'boost_enabled', 'boost_type', 'boost_title', 'boost_blurb', 'boost_button_label', 'boost_image', 'idea_id', 'language']) {
        if (k in prev) copy[k] = prev[k]
      }
      const w = await writeAnnouncement(db, { insert: {
        ...copy, company_id: companyId, title: `Copy of ${prev.title || 'announcement'}`.slice(0, 200),
        status: 'draft', is_pinned: false, views: 0, impressions: 0, reactions: {}, notify_subscribers: false,
      } })
      if (w.error) return NextResponse.json({ error: 'Couldn’t duplicate' }, { status: 500 })
      return NextResponse.json({ announcement: w.data })
    }
    if (action === 'delete') {
      const { error } = await db.from('announcements').delete().eq('id', prev.id).eq('company_id', companyId)
      if (error) return NextResponse.json({ error: 'Couldn’t delete' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (action === 'sms_preview') {
      const { data: company } = await db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle()
      return NextResponse.json({ text: defaultSmsText(company, prev) })
    }
    if (action === 'sms_draft') {
      const r = await createSmsDraft(db, prev, { userId: access.userId || null, userName: await whoName(db, companyId, access.userId), text: b.data?.text || null })
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 500 })
      return NextResponse.json({ campaignId: r.id })
    }
    if (action === 'public_preview') {
      return NextResponse.json({ post: toPublicAnnouncement(prev) })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
