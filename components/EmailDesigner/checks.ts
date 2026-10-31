// The designer's Checks tab: what to fix (or think about) before sending.
// Pure, so it runs on every edit. Each check says what's wrong in plain words
// and, where it can, which block to open.

import { safeImage, safeUrl, videoThumb } from './render'
import { PREVIEW_HINT, SUBJECT_HINT, type Block } from './types'

export type CheckLevel = 'error' | 'warn' | 'tip'
export type Check = { id: string; ok: boolean; level: CheckLevel; title: string; detail: string; blockId?: string }

// Phrases spam filters (and readers) treat as a red flag.
const SPAMMY = ['act now', '100% free', 'risk-free', 'risk free', 'winner', 'you have been selected', 'cash bonus', 'click here', 'guaranteed', 'no obligation', 'urgent', 'once in a lifetime', 'double your', 'earn money', 'free money', 'limited time only!!!']

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g
const words = (s: string) => (String(s || '').match(/[A-Za-z0-9'’]+/g) || []).length

function blockText(b: Block): string {
  switch (b.type) {
    case 'heading': case 'text': return b.text || ''
    case 'columns': return (b.items || []).map(c => `${c?.title || ''}\n${c?.text || ''}`).join('\n')
    case 'coupon': return `${b.offer || ''} ${b.title || ''} ${b.note || ''}`
    default: return ''
  }
}

export function runChecks(d: { subject: string; previewText: string; design: { blocks: Block[] } }): Check[] {
  const blocks = d.design.blocks || []
  const subject = String(d.subject || '').trim()
  const pre = String(d.previewText || '').trim()
  const allText = [subject, pre, ...blocks.map(blockText)].join('\n')
  const out: Check[] = []

  out.push({ id: 'subject', ok: !!subject, level: 'error', title: 'Subject line', detail: subject ? 'Added.' : 'Add a subject line. Nothing can be sent without one.' })
  if (subject) {
    out.push({
      id: 'subject-length', ok: subject.length <= SUBJECT_HINT.ideal, level: subject.length <= SUBJECT_HINT.max ? 'tip' : 'warn', title: 'Subject length',
      detail: subject.length <= SUBJECT_HINT.ideal ? `${subject.length} characters: a good length.` : subject.length <= SUBJECT_HINT.max ? `${subject.length} characters: may be cut off on phones.` : `${subject.length} characters: most inboxes cut it off. Aim for under ${SUBJECT_HINT.ideal}.`,
    })
    const letters = subject.replace(/\{\{[^}]*\}\}/g, '').replace(/[^A-Za-z]/g, '')
    const shouting = letters.length >= 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6
    const bangs = (subject.match(/!/g) || []).length
    out.push({ id: 'subject-tone', ok: !shouting && bangs <= 1, level: 'warn', title: 'Calm subject line', detail: shouting ? 'Mostly capitals reads as shouting and trips spam filters.' : bangs > 1 ? 'More than one exclamation mark looks like spam.' : 'No shouting or piles of exclamation marks.' })
  }
  out.push({ id: 'preview', ok: !!pre, level: 'warn', title: 'Preview text', detail: pre ? (pre.length > PREVIEW_HINT.max ? 'Long: inboxes show about the first 90 characters.' : 'Added: it shows after the subject in the inbox.') : 'Add preview text, the line inboxes show after the subject. Without it they show the first words of the email.' })

  const spam = SPAMMY.filter(w => allText.toLowerCase().includes(w))
  out.push({ id: 'spam', ok: !spam.length, level: 'warn', title: 'No spammy wording', detail: spam.length ? `Spam filters look out for: ${spam.map(w => `“${w}”`).join(', ')}.` : 'Nothing that looks like spam.' })

  // Pictures need alt text (people with images off, screen readers).
  const noAlt = blocks.find(b => (b.type === 'image' && safeImage(b.src) && !String(b.alt || '').trim()) || (b.type === 'columns' && (b.items || []).some(c => safeImage(c?.image) && !String(c?.alt || c?.title || '').trim())))
  out.push({ id: 'alt', ok: !noAlt, level: 'warn', title: 'Pictures are described', detail: noAlt ? 'A picture has no description (alt text). Some inboxes hide pictures until asked, and screen readers read it out.' : 'Every picture has a description.', blockId: noAlt?.id })

  // Links that won't work.
  const badButton = blocks.find(b => (b.type === 'button' && String(b.label || '').trim() && !safeUrl(b.url)) || (b.type === 'columns' && (b.items || []).some(c => String(c?.label || '').trim() && String(c?.url || '').trim() && !safeUrl(c?.url, false))) || (b.type === 'video' && String(b.url || '').trim() && !safeUrl(b.url, false)) || (b.type === 'menu' && (b.links || []).some(l => String(l?.label || '').trim() && !safeUrl(l?.url, false))))
  out.push({ id: 'links', ok: !badButton, level: 'error', title: 'Buttons and links go somewhere', detail: badButton ? 'A button or link has no web address yet (it must start with https://), so it won’t show.' : 'Every button and link has an address.', blockId: badButton?.id })
  const badInline = blocks.find(b => (b.type === 'text' || b.type === 'heading') && [...String(b.text || '').matchAll(LINK)].some(m => !safeUrl(m[2])))
  if (badInline) out.push({ id: 'inline-links', ok: false, level: 'error', title: 'Text links work', detail: 'A link in your text doesn’t start with https://, so it shows as plain words.', blockId: badInline.id })

  const cta = blocks.some(b => (b.type === 'button' && safeUrl(b.url) && String(b.label || '').trim()) || (b.type === 'products' && (b.items || []).some(p => safeUrl(p?.url, false))) || (b.type === 'video' && safeUrl(b.url, false)) || (b.type === 'columns' && (b.items || []).some(c => safeUrl(c?.url, false))))
  out.push({ id: 'cta', ok: cta, level: 'warn', title: 'A clear next step', detail: cta ? 'There’s something to tap (a button, product or video).' : 'Add a button, products or a video so people know what to do next.' })

  const emptyCoupon = blocks.find(b => b.type === 'coupon' && !String(b.code || '').trim())
  if (emptyCoupon) out.push({ id: 'coupon', ok: false, level: 'error', title: 'Coupon has a code', detail: 'The coupon block has no code yet, so it won’t show.', blockId: emptyCoupon.id })
  const emptyImage = blocks.find(b => b.type === 'image' && !safeImage(b.src))
  if (emptyImage) out.push({ id: 'image-empty', ok: false, level: 'warn', title: 'Pictures are added', detail: 'A picture block is still empty, so it won’t show.', blockId: emptyImage.id })
  const emptyVideo = blocks.find(b => b.type === 'video' && safeUrl(b.url, false) && !safeImage(b.thumbnail) && !videoThumb(b.url))
  if (emptyVideo) out.push({ id: 'video-thumb', ok: false, level: 'tip', title: 'Video has a picture', detail: 'Only YouTube links get a thumbnail automatically. Add a picture so people see what they’ll watch.', blockId: emptyVideo.id })

  const pictures = blocks.reduce((n, b) => n + (b.type === 'image' && safeImage(b.src) ? 1 : 0) + (b.type === 'columns' ? (b.items || []).filter(c => safeImage(c?.image)).length : 0) + (b.type === 'products' ? (b.items || []).filter(p => safeImage(p?.image)).length : 0), 0)
  const textWords = words(blocks.map(blockText).join(' '))
  out.push({ id: 'balance', ok: !(pictures >= 3 && textWords < 40), level: 'tip', title: 'Words as well as pictures', detail: pictures >= 3 && textWords < 40 ? 'Mostly pictures with few words can land in spam, and says little when pictures are hidden.' : 'A good mix of words and pictures.' })

  const personal = /\{\{\s*first_name/i.test(allText)
  out.push({ id: 'personal', ok: personal, level: 'tip', title: 'Personal touch', detail: personal ? 'Uses the customer’s first name.' : 'Add the First name tag (with a fallback, e.g. {{first_name|there}}) to the subject or greeting.' })

  return out
}

/** Problems that still need doing (not tips). */
export const openIssues = (cs: Check[]) => cs.filter(c => !c.ok && c.level !== 'tip').length
