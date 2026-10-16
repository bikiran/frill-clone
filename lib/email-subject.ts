// The subject the inbox's email composer starts with.
//
// It used to be "Re: " + the conversation's subject, and an order thread that
// began as an abandoned cart has the subject "Abandoned cart…" — so a reply to
// the customer's latest order email went out as "Re: Abandoned cart". Now: the
// latest email actually in the thread, else the thread's email subject, else
// something sensible from what the thread is about. Never a label like
// "Abandoned cart" or the customer's own name.

const re = (s: string) => (/^\s*re\s*:/i.test(s) ? s.trim() : `Re: ${s.trim()}`)

const LABEL = /^(abandoned cart|order\s*#|new conversation|visitor|website visitor|live chat|sms|phone call|missed call)/i

export function composerSubject(
  messages: any[] | null | undefined,
  conv: { subject?: string | null; email_subject?: string | null } | null | undefined,
  o: { businessName?: string | null; contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null } = {},
): string {
  const list = Array.isArray(messages) ? messages : []
  // 1. The newest email in the thread (either direction).
  for (let i = list.length - 1; i >= 0; i--) {
    const s = String(list[i]?.email_subject || '').trim()
    if (s && !/^\(no subject\)$/i.test(s)) return re(s)
  }
  // 2. The thread's own email subject.
  const es = String(conv?.email_subject || '').trim()
  if (es && !LABEL.test(es)) return re(es)
  // 3. An automated order message: an older one sent by email went out as
  //    "Update on your order #N", so reply in that thread; otherwise name the order.
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (m?.sender_type !== 'agent' || !m?.metadata?.order_automation) continue
    const n = /#\s?(\d{3,})/.exec(String(m.content || ''))?.[1]
    if (!n) continue
    return String(m.delivery_channel || '').toLowerCase() === 'email' ? `Re: Update on your order #${n}` : `Your order #${n}`
  }
  // 4. A real conversation subject (not a label, not just who they are).
  const subj = String(conv?.subject || '').trim()
  const who = [o.contactName, o.contactPhone, o.contactEmail].map(v => String(v || '').trim().toLowerCase()).filter(Boolean)
  if (subj && !LABEL.test(subj) && !who.includes(subj.toLowerCase()) && !/^[+\d\s()-]{6,}$/.test(subj)) return re(subj)
  // 5. Fallback.
  return o.businessName ? `Message from ${o.businessName}` : 'Re: your message'
}
