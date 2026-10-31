// The SMS composer's checks: what to fix (or think about) before sending a
// campaign text. Pure, so it runs on every keystroke. Same shape as the email
// designer's checks (components/EmailDesigner/checks.ts).

import { analyseSms, type SegmentInfo } from '@/lib/sms-segments'

export type SmsCheck = { id: string; ok: boolean; level: 'error' | 'warn' | 'tip'; title: string; detail: string }

const SPAMMY = ['act now', '100% free', 'risk-free', 'risk free', 'winner', 'you have been selected', 'cash bonus', 'guaranteed', 'no obligation', 'urgent', 'once in a lifetime', 'double your', 'earn money', 'free money', 'click here']
const LINKISH = /(https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*)/i
// Characters people type that quietly switch a text to Unicode (shorter parts).
const SMART: Record<string, string> = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...' }

export function runSmsChecks(o: { message: string; rendered: SegmentInfo; hasOptOut: boolean; hasSender: boolean }): SmsCheck[] {
  const msg = String(o.message || '')
  const out: SmsCheck[] = []
  if (!msg.trim()) return [{ id: 'empty', ok: false, level: 'error', title: 'Write the message', detail: 'There’s nothing to send yet.' }]

  out.push({ id: 'stop', ok: o.hasOptOut, level: 'error', title: 'How to opt out', detail: o.hasOptOut ? 'Says how to stop (“Reply STOP”).' : 'Add “Reply STOP to opt out”. Marketing texts must say how to unsubscribe (Spam Act).' })
  out.push({ id: 'sender', ok: o.hasSender, level: 'error', title: 'Says who it’s from', detail: o.hasSender ? 'Names the business.' : 'Name the business, or add the Store name tag, so people know who’s texting.' })

  const r = o.rendered
  const one = r.encoding === 'GSM-7' ? 160 : 70
  out.push({
    id: 'parts', ok: r.segments <= 1, level: r.segments > 2 ? 'warn' : 'tip', title: 'Fits in one text',
    detail: r.segments <= 1 ? `${r.length} of ${one} characters: one text per person.` : `${r.segments} parts, and each part is charged as a text. Cut about ${r.length - one} characters to fit in one.`,
  })
  if (r.encoding === 'UCS-2') {
    const smart = r.nonGsmChars.filter(c => SMART[c])
    const fixed = msg.replace(/[’‘“”–—…]/g, c => SMART[c] || c)
    const plainFits = smart.length > 0 && analyseSms(fixed).encoding === 'GSM-7'
    out.push({
      id: 'unicode', ok: false, level: r.segments > 1 ? 'warn' : 'tip', title: 'Plain characters',
      detail: plainFits
        ? `Curly quotes or dashes (${smart.join(' ')}) cut each part from 160 to 70 characters. Swap them for straight ones to fit more in.`
        : `Emoji or special characters (${r.nonGsmChars.slice(0, 5).join(' ')}) cut each part from 160 to 70 characters.`,
    })
  }

  const hasLink = /\{\{\s*short_link\s*\}\}/.test(msg) || LINKISH.test(msg)
  out.push({ id: 'link', ok: hasLink, level: 'tip', title: 'A link to tap', detail: hasLink ? 'Has a link, tracked per person, so you’ll see who clicks.' : 'Add a tracked link (Insert tracked link) to see who clicks and what they order.' })

  const letters = msg.replace(/\{\{[^}]*\}\}/g, '').replace(/[^A-Za-z]/g, '')
  const shouting = letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6
  const bangs = (msg.match(/!/g) || []).length
  out.push({ id: 'tone', ok: !shouting && bangs <= 2, level: 'warn', title: 'Calm tone', detail: shouting ? 'Mostly capitals reads as shouting.' : bangs > 2 ? 'Lots of exclamation marks can read as spam.' : 'No shouting or piles of exclamation marks.' })

  const spam = SPAMMY.filter(w => msg.toLowerCase().includes(w))
  out.push({ id: 'spam', ok: !spam.length, level: 'warn', title: 'No spammy wording', detail: spam.length ? `Carriers filter texts with words like ${spam.map(w => `“${w}”`).join(', ')}.` : 'Nothing that looks like spam.' })

  const personal = /\{\{\s*first_name\s*\}\}/.test(msg)
  out.push({ id: 'personal', ok: personal, level: 'tip', title: 'Personal touch', detail: personal ? 'Uses the customer’s first name.' : 'Starting with their first name (the First name tag) gets more replies.' })
  return out
}

/** Problems that still need doing (not tips). */
export const smsOpenIssues = (cs: SmsCheck[]) => cs.filter(c => !c.ok && c.level !== 'tip').length
