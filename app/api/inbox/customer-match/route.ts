import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMatches, maskEmail, maskPhone, type Candidate, type MatchSignals, type IdentityKind } from '@/lib/customer-match'
import { phoneKey, emailKey, detectContactInfo } from '@/lib/phone'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const META_CHANNELS = ['instagram', 'facebook', 'whatsapp']
const GENERIC_NAMES = new Set(['instagram user', 'messenger user', 'facebook user', 'whatsapp user', 'visitor', 'dm'])

// POST { action, conversationId, ... }
//   action 'suggest' (default) → { confirmed?, suggestions[] } with masked display
//   action 'confirm'           → link the platform identity to a customer + move the thread
//   action 'unlink'            → reverse the most recent confirm for this identity
//   action 'reject'            → record that a suggested contact is NOT this person
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = body.action || 'suggest'
    const conversationId = body.conversationId
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    const db = admin()
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const companyId = conv.company_id
    const platform = String(conv.channel || '') as MatchSignals['platform']
    const platformUserId = conv.meta_user_id || null

    if (action === 'confirm') return await confirmMatch(db, conv, body)
    if (action === 'unlink') return await unlinkMatch(db, conv, body)
    if (action === 'reject') return await rejectMatch(db, conv, body)
    if (action === 'request-details') return await requestDetails(db, conv, body, req)
    if (action === 'find-duplicates') return await findDuplicates(db, conv, body)
    if (action === 'merge') return await mergeCustomers(db, conv, body)

    // ── suggest ──────────────────────────────────────────────────────────────
    if (!META_CHANNELS.includes(platform || '')) {
      return NextResponse.json({ ok: true, confirmed: null, suggestions: [], notApplicable: true })
    }

    const visitorId = conv.contact_id || null
    const { data: visitor } = visitorId
      ? await db.from('contacts').select('*').eq('id', visitorId).maybeSingle()
      : { data: null as any }

    // ── Gather signals from the contact + this conversation's messages ────────
    const emails = new Set<string>(), phones = new Set<string>(), orderNumbers = new Set<string>()
    if (visitor?.email) { const k = emailKey(visitor.email); if (k) emails.add(k) }
    if (visitor?.phone) { const k = phoneKey(visitor.phone); if (k.length >= 8) phones.add(k) }
    const { data: msgs } = await db.from('messages').select('content')
      .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(200)
    for (const m of (msgs || [])) {
      const info = detectContactInfo(m.content)
      if (info.email) emails.add(info.email.key)
      if (info.phone && info.phone.key.length >= 8) phones.add(info.phone.key)
      for (const mm of String(m.content || '').matchAll(/#(\d{3,})\b/g)) orderNumbers.add(mm[1])
    }

    const name = (visitor?.name && !GENERIC_NAMES.has(String(visitor.name).toLowerCase())) ? visitor.name : undefined
    const signals: MatchSignals = {
      platform, platformUserId: platformUserId || undefined,
      username: visitor?.ig_username || undefined, name,
      emails: [...emails], phones: [...phones],
      suburb: visitor?.suburb || undefined, postcode: visitor?.postcode || undefined,
      orderNumbers: [...orderNumbers],
    }

    // ── Gather candidate customers ────────────────────────────────────────────
    const candMap = new Map<string, any>()   // contactId → contact row
    const add = (rows: any[] | null) => { for (const r of (rows || [])) if (r.id !== visitorId) candMap.set(r.id, r) }

    // Confirmed platform identity (durable key).
    let confirmedIdentityContactId: string | null = null
    if (platform && platformUserId) {
      const { data } = await db.from('customer_identities').select('contact_id')
        .eq('company_id', companyId).eq('kind', platform).eq('value', platformUserId).eq('status', 'confirmed').maybeSingle()
      confirmedIdentityContactId = data?.contact_id || null
      if (confirmedIdentityContactId) {
        const { data: c } = await db.from('contacts').select('*').eq('id', confirmedIdentityContactId).maybeSingle()
        if (c) candMap.set(c.id, c)
      }
    }
    // By phone / email.
    if (phones.size) add((await db.from('contacts').select('*').eq('company_id', companyId).in('phone_norm', [...phones]).limit(10)).data)
    if (emails.size) {
      const orExpr = [...emails].map(e => `email.ilike.${e.replace(/,/g, '')}`).join(',')
      add((await db.from('contacts').select('*').eq('company_id', companyId).or(orExpr).limit(10)).data)
    }
    // Probable: by name.
    if (name) add((await db.from('contacts').select('*').eq('company_id', companyId).ilike('name', name).limit(10)).data)

    // Order number mentioned → which customer owns it.
    const orderOwnerEmails = new Map<string, string>()  // email → order#
    for (const on of orderNumbers) {
      const { data: o } = await db.from('woocommerce_orders').select('customer_email, billing_phone_norm')
        .eq('company_id', companyId).eq('woo_order_id', Number(on)).maybeSingle()
      if (o?.customer_email) {
        orderOwnerEmails.set(emailKey(o.customer_email), on)
        add((await db.from('contacts').select('*').eq('company_id', companyId).or(`email.ilike.${o.customer_email.replace(/,/g, '')}`).limit(3)).data)
      }
      if (o?.billing_phone_norm) add((await db.from('contacts').select('*').eq('company_id', companyId).eq('phone_norm', o.billing_phone_norm).limit(3)).data)
    }

    const candidates = [...candMap.values()]
    // Confirmed platform ids per candidate.
    const idByContact = new Map<string, { kind: IdentityKind; value: string }[]>()
    if (candidates.length) {
      const { data: ids } = await db.from('customer_identities').select('contact_id, kind, value')
        .eq('company_id', companyId).eq('status', 'confirmed').in('contact_id', candidates.map(c => c.id))
      for (const r of (ids || [])) {
        const arr = idByContact.get(r.contact_id) || []; arr.push({ kind: r.kind, value: r.value }); idByContact.set(r.contact_id, arr)
      }
    }

    const candForEngine: Candidate[] = candidates.map(c => ({
      contactId: c.id, name: c.name,
      emails: c.email ? [c.email] : [],
      phones: c.phone ? [c.phone] : [],
      usernames: [c.name, c.ig_username].filter(Boolean),
      suburbs: [c.suburb].filter(Boolean), postcodes: [c.postcode].filter(Boolean),
      orderNumbers: c.email && orderOwnerEmails.has(emailKey(c.email)) ? [orderOwnerEmails.get(emailKey(c.email))!] : [],
      channels: Array.isArray(c.channels_seen) ? c.channels_seen : [],
      confirmedPlatformIds: idByContact.get(c.id) || [],
    }))

    const outcome = computeMatches(signals, candForEngine)

    // Drop candidates a human already marked "not this person" for this identity.
    if (platformUserId) {
      const { data: rej } = await db.from('customer_identity_audit').select('contact_id')
        .eq('company_id', companyId).eq('action', 'match_rejected')
        .contains('evidence', { metaValue: platformUserId })
      const rejected = new Set((rej || []).map((r: any) => r.contact_id).filter(Boolean))
      if (rejected.size) {
        outcome.suggestions = outcome.suggestions.filter(s => !rejected.has(s.contactId))
        if (outcome.confirmed && rejected.has(outcome.confirmed.contactId)) outcome.confirmed = undefined
      }
    }

    // ── Enrich for display (masked until confirmed) ──────────────────────────
    const byId = new Map(candidates.map(c => [c.id, c]))
    const enrich = async (r: any) => {
      const c = byId.get(r.contactId)
      if (!c) return null
      let lifetime: number | null = null, lastOrder: any = null, address: string | null = c.address || null
      try {
        const key = c.email ? emailKey(c.email) : null
        if (key) {
          const { data: cust } = await db.from('woocommerce_customers').select('total_spend, total_orders, last_order_date')
            .eq('company_id', companyId).ilike('email', c.email).maybeSingle()
          if (cust) lifetime = Number(cust.total_spend) || null
          const { data: ord } = await db.from('woocommerce_orders').select('woo_order_id, total, order_date, billing')
            .eq('company_id', companyId).ilike('customer_email', c.email).order('order_date', { ascending: false }).limit(1).maybeSingle()
          if (ord) { lastOrder = { number: ord.woo_order_id, total: Number(ord.total) }; if (!address && ord.billing) { const b = ord.billing; address = [b.address_1, b.city].filter(Boolean).join(', ') || null } }
        }
      } catch {}
      return {
        contactId: r.contactId, name: c.name || 'Customer', confidence: r.confidence, band: r.band,
        ambiguous: !!r.ambiguous, evidence: r.evidence,
        maskedEmail: maskEmail(c.email), maskedPhone: maskPhone(c.phone),
        address, lifetime, lastOrder,
        alreadyLinked: r.contactId === confirmedIdentityContactId,
      }
    }

    const confirmed = outcome.confirmed ? await enrich(outcome.confirmed) : null
    const suggestions = (await Promise.all(outcome.suggestions.map(enrich))).filter(Boolean)

    return NextResponse.json({ ok: true, confirmed, suggestions, currentContactId: visitorId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── confirm: link this platform identity to a customer & move the thread ──────
async function confirmMatch(db: any, conv: any, body: any) {
  const companyId = conv.company_id
  const platform = String(conv.channel || '')
  const platformUserId = conv.meta_user_id || null
  const targetId = body.contactId
  if (!targetId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  const { data: target } = await db.from('contacts').select('*').eq('id', targetId).eq('company_id', companyId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const visitorId = conv.contact_id || null
  const { data: visitor } = visitorId ? await db.from('contacts').select('*').eq('id', visitorId).maybeSingle() : { data: null as any }

  const movedConvIds: string[] = []
  const before: any = { visitorContactId: visitorId }

  if (visitorId && visitorId !== targetId) {
    // Move the platform identity onto the customer so future inbound threads to
    // them; clear it on the visitor (the webhook keys on meta_user_id).
    if (platformUserId) {
      before.movedMetaUserId = platformUserId
      const patch: any = {}
      if (!target.meta_user_id) patch.meta_user_id = platformUserId
      if (!target.avatar_url && visitor?.avatar_url) patch.avatar_url = visitor.avatar_url
      if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', targetId)
      await db.from('contacts').update({ meta_user_id: null }).eq('id', visitorId)
    }
    // Repoint every conversation the visitor holds onto the customer.
    const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', visitorId)
    for (const c of (convs || [])) movedConvIds.push(c.id)
    if (movedConvIds.length) await db.from('conversations').update({ contact_id: targetId }).in('id', movedConvIds)
    before.movedConversationIds = movedConvIds
    // Share an identity group so orders/timeline resolve across both.
    const gid = target.identity_group_id || crypto.randomUUID()
    await db.from('contacts').update({ identity_group_id: gid }).eq('id', targetId)
    await db.from('contacts').update({ identity_group_id: gid }).eq('id', visitorId)
  }

  // Record the confirmed platform identity (one per value — clear any prior).
  if (platform && platformUserId) {
    await db.from('customer_identities').update({ status: 'rejected' })
      .eq('company_id', companyId).eq('kind', platform).eq('value', platformUserId).eq('status', 'confirmed').neq('contact_id', targetId)
    const { data: existing } = await db.from('customer_identities').select('id')
      .eq('company_id', companyId).eq('kind', platform).eq('value', platformUserId).eq('contact_id', targetId).maybeSingle()
    const row = {
      company_id: companyId, contact_id: targetId, kind: platform, value: platformUserId,
      display: body.display || null, status: 'confirmed', confidence: body.confidence || null,
      evidence: body.evidence || [], source: body.source || 'Confirmed in inbox',
      confirmed_by: body.userId || null, confirmed_by_name: body.userName || null, confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (existing) await db.from('customer_identities').update(row).eq('id', existing.id)
    else await db.from('customer_identities').insert(row)
  }

  await db.from('customer_identity_audit').insert({
    company_id: companyId, contact_id: targetId, action: 'match_confirmed',
    actor_id: body.userId || null, actor_name: body.userName || null,
    detail: `Confirmed ${platform} identity → ${target.name || 'customer'}`,
    evidence: { confidence: body.confidence, signals: body.evidence, metaKind: platform, metaValue: platformUserId },
    before, after: { targetContactId: targetId },
  })

  return NextResponse.json({ ok: true, contactId: targetId })
}

// ── unlink: reverse the latest confirm for this platform identity ─────────────
async function unlinkMatch(db: any, conv: any, body: any) {
  const companyId = conv.company_id
  const platform = String(conv.channel || '')
  const platformUserId = conv.meta_user_id || null
  const kind = body.kind || platform
  const value = body.value || platformUserId
  if (!value) return NextResponse.json({ error: 'nothing to unlink' }, { status: 400 })

  // Reject the confirmed identity.
  const { data: ident } = await db.from('customer_identities').select('*')
    .eq('company_id', companyId).eq('kind', kind).eq('value', value).eq('status', 'confirmed').maybeSingle()
  if (ident) await db.from('customer_identities').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', ident.id)

  // Reverse the merge recorded at confirm time, if we can find it.
  const { data: audits } = await db.from('customer_identity_audit').select('*')
    .eq('company_id', companyId).eq('action', 'match_confirmed').order('created_at', { ascending: false }).limit(20)
  const rec = (audits || []).find((a: any) => a?.evidence?.metaValue === value)
  let restored = false
  if (rec?.before?.visitorContactId && rec.before.visitorContactId !== rec.after?.targetContactId) {
    const vId = rec.before.visitorContactId
    const convIds: string[] = rec.before.movedConversationIds || []
    if (convIds.length) await db.from('conversations').update({ contact_id: vId }).in('id', convIds)
    if (rec.before.movedMetaUserId) {
      await db.from('contacts').update({ meta_user_id: rec.before.movedMetaUserId }).eq('id', vId)
      // Clear it off the customer only if it was the moved value.
      await db.from('contacts').update({ meta_user_id: null }).eq('id', rec.after?.targetContactId).eq('meta_user_id', rec.before.movedMetaUserId)
    }
    restored = true
  }

  await db.from('customer_identity_audit').insert({
    company_id: companyId, contact_id: rec?.before?.visitorContactId || conv.contact_id || null, action: 'identity_unlinked',
    actor_id: body.userId || null, actor_name: body.userName || null,
    detail: `Unlinked ${kind} identity`, evidence: { kind, value, restored },
  })
  return NextResponse.json({ ok: true, restored, contactId: rec?.before?.visitorContactId || conv.contact_id || null })
}

// ── request-details: ask the customer for the email/phone used at checkout ─────
// Sends a neutral message on the conversation's own channel. It NEVER includes
// any stored customer information — we only ask them to share an identifier.
const REQUEST_DETAILS_MESSAGE =
  'To help locate your order, please share the email address or mobile number used at checkout.'

async function requestDetails(db: any, conv: any, body: any, req: NextRequest) {
  const companyId = conv.company_id
  const message = (body.message && String(body.message).trim()) || REQUEST_DETAILS_MESSAGE
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const res = await fetch(`${base}/api/meta/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: conv.id, content: message, agentName: body.userName || 'Agent' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: data.error || 'Could not send the request' }, { status: 502 })
  await db.from('customer_identity_audit').insert({
    company_id: companyId, contact_id: conv.contact_id || null, action: 'details_requested',
    actor_id: body.userId || null, actor_name: body.userName || null,
    detail: 'Asked the customer for the email/phone used at checkout',
    evidence: { conversationId: conv.id },
  })
  return NextResponse.json({ ok: true })
}

// ── find-duplicates: other contacts that are very likely the same person ──────
// Only strong, deterministic signals: same identity group, or an exact email /
// phone match. Never name/photo alone.
async function findDuplicates(db: any, conv: any, body: any) {
  const companyId = conv.company_id
  const contactId = body.contactId
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  const { data: primary } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
  if (!primary) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const dupes = new Map<string, any>()
  const add = (rows: any[] | null) => { for (const r of (rows || [])) if (r.id !== contactId) dupes.set(r.id, r) }
  if (primary.identity_group_id) add((await db.from('contacts').select('*').eq('company_id', companyId).eq('identity_group_id', primary.identity_group_id).neq('id', contactId).limit(10)).data)
  if (primary.email) add((await db.from('contacts').select('*').eq('company_id', companyId).or(`email.ilike.${String(primary.email).replace(/,/g, '')}`).neq('id', contactId).limit(10)).data)
  if (primary.phone) { const pk = phoneKey(primary.phone); if (pk.length >= 8) add((await db.from('contacts').select('*').eq('company_id', companyId).eq('phone_norm', pk).neq('id', contactId).limit(10)).data) }

  const duplicates = [...dupes.values()].map(c => ({
    id: c.id, name: c.name || 'Customer', source: c.source || null, createdAt: c.created_at,
    maskedEmail: maskEmail(c.email), maskedPhone: maskPhone(c.phone),
    reason: primary.identity_group_id && c.identity_group_id === primary.identity_group_id ? 'Same linked identity'
      : (primary.email && emailKey(c.email) === emailKey(primary.email)) ? 'Same email'
      : 'Same phone number',
  }))
  return NextResponse.json({ ok: true, primary: { id: primary.id, name: primary.name }, duplicates })
}

// ── merge: fold a duplicate contact into the primary, keep an audit ────────────
async function mergeCustomers(db: any, conv: any, body: any) {
  const companyId = conv.company_id
  const primaryId = body.primaryContactId
  const mergeId = body.mergeContactId
  if (!primaryId || !mergeId || primaryId === mergeId) return NextResponse.json({ error: 'primaryContactId and a different mergeContactId are required' }, { status: 400 })
  const { data: primary } = await db.from('contacts').select('*').eq('id', primaryId).eq('company_id', companyId).maybeSingle()
  const { data: dup } = await db.from('contacts').select('*').eq('id', mergeId).eq('company_id', companyId).maybeSingle()
  if (!primary || !dup) return NextResponse.json({ error: 'One of the customers was not found' }, { status: 404 })

  // Fill only EMPTY primary fields from the duplicate — never overwrite.
  const FILL = ['name', 'email', 'phone', 'address', 'city', 'state', 'postcode', 'suburb', 'country', 'company_name', 'avatar_url', 'meta_user_id', 'woo_customer_id', 'prexty_customer_id', 'stripe_customer_id']
  const patch: any = {}
  for (const f of FILL) if ((primary[f] === null || primary[f] === undefined || primary[f] === '') && dup[f]) patch[f] = dup[f]
  if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', primaryId)

  // Repoint every reference we know about (best-effort; a missing table is fine).
  const repoint = async (table: string) => {
    try { await db.from(table).update({ contact_id: primaryId }).eq('company_id', companyId).eq('contact_id', mergeId) } catch {}
  }
  await repoint('conversations')
  await repoint('customer_identities')
  await repoint('reviews')
  await repoint('orders')
  await repoint('scheduled_messages')

  await db.from('customer_identity_audit').insert({
    company_id: companyId, contact_id: primaryId, action: 'customers_merged',
    actor_id: body.userId || null, actor_name: body.userName || null,
    detail: `Merged “${dup.name || 'customer'}” into “${primary.name || 'customer'}”`,
    before: { mergedContact: { id: dup.id, name: dup.name, email: dup.email, phone: dup.phone, source: dup.source, created_at: dup.created_at } },
    after: { primaryContactId: primaryId, filled: Object.keys(patch) },
  })

  // Remove the now-empty duplicate (references were repointed). Keep the audit.
  try { await db.from('contacts').delete().eq('id', mergeId).eq('company_id', companyId) } catch {}

  return NextResponse.json({ ok: true, contactId: primaryId, filled: Object.keys(patch) })
}

// ── reject: this suggested customer is NOT the person (don't suggest again) ────
async function rejectMatch(db: any, conv: any, body: any) {
  const companyId = conv.company_id
  await db.from('customer_identity_audit').insert({
    company_id: companyId, contact_id: body.contactId || null, action: 'match_rejected',
    actor_id: body.userId || null, actor_name: body.userName || null,
    detail: `Marked not a match`, evidence: { conversationId: conv.id, metaValue: conv.meta_user_id },
  })
  return NextResponse.json({ ok: true })
}
