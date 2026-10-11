// Business Memory and the context builder.
//
// Three kinds of memory, kept separate:
//   • Business (durable)   — profile, hours, locations, policies, tone, rules.
//                            From the companies row + company_locations +
//                            business_memory (status 'active' only — learned
//                            preferences start as 'proposed' and need the owner).
//   • Customer             — who this is, what's worth remembering about them
//                            (customer_memory). Orders/conversations are read
//                            live through actions, not copied here.
//   • Working (temporary)  — this run's conversation; loaded fresh each run and
//                            recorded in agent_steps, never stored as memory.
//
// Every slice carries a reference, saved on the run (context_refs), so "why did
// Colvy do this?" can point at exactly what the agent knew.

import { colvyWeek, weekText } from '@/lib/business-hours'
import { renderMemory } from './business-memory'

export type ContextRef = { type: string; id: string; label: string }

export type AgentContextPack = {
  companyName: string
  businessText: string
  customerText: string
  verification: 'verified' | 'probable' | 'unknown'
  timezone: string
  /** How the business wants replies to sound (Business Memory → tone). */
  toneText: string
  contactId: string | null
  refs: ContextRef[]
}

function validTz(tz: any): boolean {
  if (!tz || typeof tz !== 'string') return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const digits = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)

export async function buildContext(db: any, companyId: string, opts: { conversationId?: string | null; contactId?: string | null }): Promise<AgentContextPack> {
  const refs: ContextRef[] = []

  const [{ data: co }, { data: locs }, { data: mem }] = await Promise.all([
    db.from('companies').select('id, name, website, business_phone, business_email, business_address, business_city, business_state, business_hours, booking_settings').eq('id', companyId).maybeSingle(),
    db.from('company_locations').select('id, label, street_address, suburb, state, phone, is_primary').eq('company_id', companyId).limit(20),
    db.from('business_memory').select('id, kind, key, content').eq('company_id', companyId).eq('status', 'active').limit(200).then((r: any) => r, () => ({ data: [] })),
  ])

  const biz: string[] = []
  if (co) {
    refs.push({ type: 'company', id: co.id, label: 'Business profile' })
    biz.push(`Business: ${co.name}${co.website ? ` (${co.website})` : ''}`)
    const contact = [co.business_phone && `phone ${co.business_phone}`, co.business_email && `email ${co.business_email}`].filter(Boolean).join(', ')
    if (contact) biz.push(`Contact: ${contact}`)
    const week = colvyWeek(co.business_hours)
    biz.push(week
      ? `Opening hours saved in Colvy: ${weekText(week)}. Use get_business_hours before answering — it has live Google hours, holiday hours and the right dates.`
      : 'Opening hours: use get_business_hours.')
  }
  if (locs?.length) {
    refs.push({ type: 'locations', id: companyId, label: `${locs.length} location${locs.length === 1 ? '' : 's'}` })
    biz.push('Locations:\n' + locs.map((l: any) => `- ${l.label || l.suburb || 'Location'}${l.street_address ? `, ${l.street_address}` : ''}${l.suburb ? `, ${l.suburb}` : ''}${l.phone ? ` (${l.phone})` : ''}${l.is_primary ? ' — main' : ''}`).join('\n'))
  }
  // Business Memory: policies, rules and tone the owner set (active only).
  const memory = renderMemory((mem || []) as any[])
  biz.push(...memory.lines)
  refs.push(...memory.refs)

  // ── Customer ──
  let contactId = opts.contactId || null
  let channel: string | null = null
  let smsNumber: string | null = null
  if (opts.conversationId) {
    const { data: conv } = await db.from('conversations').select('id, contact_id, channel, sms_number').eq('company_id', companyId).eq('id', opts.conversationId).maybeSingle()
    if (conv) {
      refs.push({ type: 'conversation', id: conv.id, label: `Conversation (${conv.channel || 'chat'})` })
      contactId = contactId || conv.contact_id || null
      channel = conv.channel || null
      smsNumber = conv.sms_number || null
    }
  }
  const cust: string[] = []
  let verification: AgentContextPack['verification'] = 'unknown'
  if (contactId) {
    const [{ data: c }, { data: cm }] = await Promise.all([
      db.from('contacts').select('id, name, email, phone').eq('company_id', companyId).eq('id', contactId).maybeSingle(),
      db.from('customer_memory').select('id, kind, content, sensitive').eq('company_id', companyId).eq('contact_id', contactId).eq('sensitive', false).limit(30).then((r: any) => r, () => ({ data: [] })),
    ])
    if (c) {
      refs.push({ type: 'contact', id: c.id, label: c.name || 'Customer' })
      cust.push(`Customer: ${c.name || 'name unknown'}${c.email ? `, ${c.email}` : ''}${c.phone ? `, ${c.phone}` : ''} (contact id ${c.id})`)
      // Texting from the number on file is a strong signal it's them; a linked
      // contact on chat is likely but not proven.
      verification = channel === 'sms' && smsNumber && c.phone && digits(smsNumber) === digits(c.phone) ? 'verified' : 'probable'
    }
    for (const m of (cm || []) as any[]) {
      cust.push(`- ${m.kind}: ${String(m.content).slice(0, 400)}`)
      refs.push({ type: 'customer_memory', id: m.id, label: m.kind })
    }
  }
  if (!cust.length) cust.push('Customer: not identified yet.')
  cust.push(`Identity: ${verification === 'verified' ? 'verified (messaging from the phone number on file)' : verification === 'probable' ? 'probably this customer (linked to the conversation, not proven)' : 'unknown'}`)

  return {
    companyName: co?.name || 'the business',
    businessText: biz.join('\n\n') || 'No business details saved yet.',
    customerText: cust.join('\n'),
    verification, contactId, refs,
    toneText: memory.toneText,
    timezone: validTz(co?.booking_settings?.timezone) ? co.booking_settings.timezone : 'Australia/Melbourne',
  }
}
