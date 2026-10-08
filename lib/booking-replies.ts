import { internalHeaders } from '@/lib/internal-call'
// Customers answering a booking reminder by text: "C" confirms, "R" gets the
// reschedule link. Only kicks in when that number has a confirmed booking in
// the next 3 days that was reminded — so a stray "C" in a normal chat is left
// alone. ("YES"/"CANCEL" are opt-in/opt-out keywords, so they're not used.)

import { resolveBookingSettings, manageUrl, PUBLIC_COMPANY_COLS } from '@/lib/booking'
import { notifyCompany } from '@/lib/notify'

const CONFIRM = new Set(['C', 'CONFIRM', 'CONFIRMED', 'Y'])
const RESCHEDULE = new Set(['R', 'RESCHEDULE', 'CHANGE', 'MOVE'])
const tail9 = (s: string) => (s || '').replace(/\D/g, '').slice(-9)

export async function handleBookingSmsReply(params: {
  db: any; companyId: string; conversationId: string; from: string; text: string; origin: string
}): Promise<boolean> {
  const { db, companyId, conversationId, from, origin } = params
  const word = String(params.text || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  const isConfirm = CONFIRM.has(word), isMove = RESCHEDULE.has(word)
  if (!isConfirm && !isMove) return false

  try {
    const now = Date.now()
    const { data: rows, error } = await db.from('bookings')
      .select('*').eq('company_id', companyId).eq('status', 'confirmed')
      .gt('starts_at', new Date(now).toISOString()).lt('starts_at', new Date(now + 72 * 3600_000).toISOString())
      .order('starts_at').limit(30)
    if (error || !rows?.length) return false
    const mine = rows.filter((b: any) => (b.reminder_24h_at || b.reminder_2h_at) && (b.conversation_id === conversationId || (b.customer_phone && tail9(b.customer_phone) === tail9(from))))
    const b = mine[0]
    if (!b) return false

    const { data: company } = await db.from('companies').select(PUBLIC_COMPANY_COLS).eq('id', companyId).maybeSingle()
    if (!company) return false
    const settings = resolveBookingSettings(company.booking_settings)
    const tz = b.timezone || settings.timezone
    const when = new Date(b.starts_at).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm')

    let reply: string
    if (isConfirm) {
      if (!b.customer_confirmed_at) {
        await db.from('bookings').update({ customer_confirmed_at: new Date().toISOString() }).eq('id', b.id)
        await notifyCompany({ db, companyId, type: 'booking', conversationId, message: `✅ ${b.customer_name || 'Customer'} confirmed ${b.service_name}, ${when}` })
      }
      reply = `Thanks${b.customer_name ? ` ${String(b.customer_name).split(/\s+/)[0]}` : ''} — you're confirmed for ${b.service_name} on ${when}. See you then!`
    } else {
      const minsToStart = (Date.parse(b.starts_at) - now) / 60000
      reply = settings.allow_reschedule && minsToStart > settings.cancel_hours * 60
        ? `No problem — pick a new time here: ${manageUrl(company, b.manage_token)}`
        : `To change your ${b.service_name} booking on ${when}, please reply here and we'll sort it out with you.`
      await notifyCompany({ db, companyId, type: 'booking', conversationId, message: `🔁 ${b.customer_name || 'Customer'} wants to reschedule ${b.service_name}, ${when}` })
    }
    await fetch(`${origin}/api/telnyx/sms/send`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ companyId, conversationId, to: from, text: reply, senderName: company.name }),
    })
    return true
  } catch (e) {
    console.error('[booking sms reply] failed', e)
    return false
  }
}
