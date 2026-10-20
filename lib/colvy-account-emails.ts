// The words of Colvy's own account emails (to business owners and their staff),
// on the shared layout in lib/colvy-email. Each returns { subject, html, text }.
// Routes keep their own logic (who gets it, links, dedupe, opt-outs) and only
// call these for the content. Pass values raw: the layout escapes everything.

import { colvyEmail, type EmailBlock } from '@/lib/colvy-email'

export type Mail = { subject: string; html: string; text: string }

// ── Sign-up verification code (app/api/auth/otp/send) ───────────────────────

export function signupCodeEmail(code: string, minutes = 10): Mail {
  const { html, text } = colvyEmail({
    preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
    title: 'Verify your email',
    intro: 'Enter this 6-digit code to continue setting up your Colvy account.',
    blocks: [{ type: 'code', code, note: `This code expires in ${minutes} minutes. If you didn’t request it, you can ignore this email.` }],
  })
  return { subject: `${code} is your Colvy verification code`, html, text }
}

// ── Confirm your email (app/api/auth/signup, app/api/auth/send-confirmation) ─

export function confirmEmail(o: {
  /** 'code' is the mobile app: no browser for a link to land in. */
  mode: 'link' | 'code'
  link?: string
  code?: string
  slug?: string | null
  /** A resend asked for later (send-confirmation) rather than the first one. */
  resend?: boolean
}): Mail {
  const address: EmailBlock[] = o.slug ? [{ type: 'facts', rows: [['Your Colvy address', `${o.slug}.colvy.com`]] }] : []
  if (o.mode === 'code') {
    const code = String(o.code || '')
    const { html, text } = colvyEmail({
      preheader: `Your code is ${code}. Enter it in the Colvy app.`,
      title: o.resend ? 'Your Colvy code' : 'Welcome to Colvy',
      intro: 'Enter this code in the Colvy app to confirm your email address.',
      blocks: [{ type: 'code', code, note: 'This code expires in an hour.' }, ...address],
      secondary: o.resend
        ? 'Didn’t ask for this? You can ignore this email.'
        : 'Didn’t sign up for Colvy? You can ignore this email. Nobody can use the code without it.',
    })
    return { subject: `${code} is your Colvy confirmation code`, html, text }
  }
  const link = String(o.link || '')
  const { html, text } = colvyEmail({
    preheader: 'One click to confirm your email and switch on your Colvy account.',
    title: 'Welcome to Colvy',
    intro: 'Thanks for signing up. Confirm your email address to switch on your account.',
    blocks: address,
    cta: { label: 'Confirm my email', url: link },
    more: [
      { type: 'link', url: link },
    ],
    secondary: 'This link expires in 24 hours. Didn’t sign up for Colvy? You can ignore this email.',
  })
  return { subject: 'Confirm your email address — Colvy', html, text }
}

// ── Team invite (app/api/send-team-invite) ──────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer (read-only)',
  editor: 'Agent (can view and edit)',
  admin: 'Admin (full access)',
}

export function teamInviteEmail(o: { companyName: string; inviterName: string; role: string; inviteLink: string; email: string }): Mail {
  const { html, text } = colvyEmail({
    preheader: `${o.inviterName} has invited you to join ${o.companyName} on Colvy.`,
    title: `Join ${o.companyName} on Colvy`,
    intro: [
      'Hi there,',
      `**${o.inviterName}** has invited you to join **${o.companyName}** on Colvy, where the team answers customers’ messages, calls and orders together.`,
    ],
    blocks: [{ type: 'facts', rows: [['Your role', ROLE_LABELS[o.role] || ROLE_LABELS.editor]] }],
    cta: { label: 'Accept invitation', url: o.inviteLink },
    more: [{ type: 'link', url: o.inviteLink }],
    secondary: `This invitation was sent to ${o.email}. If you weren’t expecting it, you can ignore this email.`,
  })
  return { subject: `Join ${o.companyName}'s team on Colvy`, html, text }
}

// ── Trial reminders (app/api/cron/trial-nudges) ─────────────────────────────

export type TrialNudgeKind = 't_minus_3' | 't_zero' | 't_plus_3'

export function trialNudgeEmail(kind: string, business: string, billingUrl: string): Mail {
  const copy = kind === 't_minus_3' ? {
    subject: 'Your Colvy trial ends in 3 days',
    preheader: `Pick a plan to keep ${business} running without a break.`,
    intro: `Keep your inbox, orders, calls and everything you’ve set up for ${business} running without interruption. Pick a plan before your trial ends and nothing skips a beat.`,
    label: 'Choose a plan',
  } : kind === 't_zero' ? {
    subject: 'Your Colvy trial has ended',
    preheader: 'Your data is safe. Upgrade to pick up where you left off.',
    intro: `Your trial for ${business} has finished, but your data is safe. Upgrade now to pick up exactly where you left off: inbox, orders, calls and all.`,
    label: 'Upgrade and keep going',
  } : {
    subject: 'Still time to bring Colvy back',
    preheader: 'Your workspace and data are still here.',
    intro: `${business}’s trial ended a few days ago. Your workspace and data are still here. Upgrade any time to switch everything back on.`,
    label: 'Reactivate Colvy',
  }
  const { html, text } = colvyEmail({
    preheader: copy.preheader,
    title: copy.subject,
    intro: copy.intro,
    cta: { label: copy.label, url: billingUrl },
    secondary: 'Not sure which plan fits? Get in touch and we’ll help you choose.',
    footerNote: `You’re receiving this because ${business} is on a Colvy trial.`,
  })
  return { subject: copy.subject, html, text }
}

// ── @mention (app/api/mentions/notify) ──────────────────────────────────────

export function mentionEmail(o: { name: string; mentionedBy?: string | null; where: string; companyName: string; preview: string; link: string }): Mail {
  const preview = String(o.preview || '').slice(0, 300)
  const by = o.mentionedBy || 'A teammate'
  const { html, text } = colvyEmail({
    preheader: preview ? `${by}: ${preview.slice(0, 90)}` : `${by} mentioned you in ${o.where}.`,
    kicker: o.companyName,
    title: 'You were mentioned',
    intro: [`Hi ${o.name},`, `**${by}** mentioned you in ${o.where} at ${o.companyName}.`],
    blocks: preview ? [{ type: 'quote', text: preview }] : [],
    cta: { label: 'Open in Colvy', url: o.link },
    footerNote: 'You’re receiving this because a teammate @mentioned you in Colvy.',
  })
  return { subject: `${o.mentionedBy || 'Someone'} mentioned you in ${o.where}`, html, text }
}

// ── Assigned / tagged (app/api/notify/members) ──────────────────────────────

export function memberNotifyEmail(o: { title: string; body: string; link: string; companyName?: string | null }): Mail {
  const paras = String(o.body || '').split(/\n+/).map(s => s.trim()).filter(Boolean)
  const { html, text } = colvyEmail({
    preheader: paras[0] ? paras[0].slice(0, 120) : o.title,
    kicker: o.companyName || undefined,
    title: o.title,
    blocks: paras.length ? [{ type: 'quote', text: paras.join('\n') }] : [],
    cta: { label: 'Open in Colvy', url: o.link },
    footerNote: 'You’re receiving this because a teammate assigned or tagged you in Colvy.',
  })
  return { subject: o.title, html, text }
}

// ── New Google review (lib/google-business), to the business ────────────────

export function newReviewEmail(o: { business: string; reviewer?: string | null; rating: number; comment?: string | null; reviewsUrl: string }): Mail {
  const n = Math.max(0, Math.min(5, Math.round(o.rating || 0)))
  const who = o.reviewer || 'A customer'
  const { html, text } = colvyEmail({
    preheader: `${who}${n ? ` gave ${o.business} ${n} out of 5 stars` : ` reviewed ${o.business}`}.`,
    kicker: o.business,
    title: `You got a new ${n ? `${n}-star ` : ''}review${n >= 4 ? '. Nice work!' : ''}`,
    blocks: [
      { type: 'facts', rows: [['From', who], ['Rating', n ? `${n} out of 5 stars` : 'No star rating']] },
      { type: 'quote', text: o.comment || '(no written comment)' },
    ],
    cta: { label: 'Read and reply', url: o.reviewsUrl },
    secondary: 'Replying to reviews builds trust, and Colvy can draft the reply for you.',
    footerNote: `You’re receiving this because ${o.business} has Google reviews connected to Colvy.`,
  })
  return { subject: `${o.reviewer || 'Someone'} left a ${n ? `${n}-star ` : ''}review for ${o.business}`, html, text }
}

// ── SMS credits: auto top-up switched off (lib/sms-credits) ─────────────────

export function smsAutoTopUpOffEmail(o: { business: string; error: string; balanceCents: number; billingUrl: string }): Mail {
  const balance = `A$${((Number(o.balanceCents) || 0) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const { html, text } = colvyEmail({
    preheader: `We couldn’t charge your card twice, so auto top-up is off. Balance: ${balance}.`,
    kicker: o.business,
    title: 'Auto top-up for SMS credits is off',
    intro: [
      `We tried twice to top up ${o.business}’s SMS credits with the saved card, and both payments failed. So you’re not charged by surprise later, auto top-up is now switched off.`,
      'Texts within your plan’s monthly allowance still go out. Texts beyond it need credit, so top up to keep campaigns and replies going.',
    ],
    blocks: [{ type: 'facts', rows: [['SMS balance', balance], ['What happened', o.error || 'The card was declined.']] }],
    cta: { label: 'Top up SMS credits', url: o.billingUrl },
    secondary: 'You can save a new card and switch auto top-up back on from the same page.',
    footerNote: `You’re receiving this because you own ${o.business} on Colvy.`,
  })
  return { subject: 'Auto top-up for SMS credits is off', html, text }
}

// ── A tax invoice was issued for a payment to Colvy (lib/tax-invoices) ──────

export function taxInvoiceEmail(o: { business: string; title: string; number: string; total: string; gst: string; date: string; items: string[]; url: string }): Mail {
  const isTax = o.title === 'Tax Invoice'
  const word = isTax ? 'tax invoice' : 'receipt'
  const { html, text } = colvyEmail({
    preheader: `${o.title} ${o.number}: ${o.total}${isTax ? `, including GST of ${o.gst}` : ''}. Paid, thank you.`,
    kicker: o.business,
    title: `Your ${word} ${o.number}`,
    intro: `Thanks for your payment. Your ${word} is ready to view, print or save as a PDF.`,
    blocks: [{ type: 'facts', rows: [
      [isTax ? 'Invoice number' : 'Receipt number', o.number],
      ['Date', o.date],
      ['For', o.items.join(', ') || 'Colvy'],
      ['Total paid', o.total],
      ...(isTax ? [['GST included', o.gst] as [string, string]] : []),
    ] }],
    cta: { label: `View ${word}`, url: o.url },
    secondary: isTax
      ? 'Keep it for your records: you can claim the GST as a credit in your BAS. All your invoices are in Billing → Billing history.'
      : 'All your receipts are in Billing → Billing history.',
    footerNote: `You’re receiving this because you’re the billing contact for ${o.business} on Colvy.`,
  })
  return { subject: `${o.title} ${o.number} from Colvy`, html, text }
}

// ── Colvy team alerts (lib/billing-alert) ───────────────────────────────────

export function colvyTeamAlertEmail(subject: string, text: string): Mail {
  const paras = String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  const mail = colvyEmail({
    preheader: paras[0] ? paras[0].slice(0, 140) : subject,
    kicker: 'Colvy team alert',
    title: subject,
    intro: paras,
    cta: { label: 'Open super admin', url: 'https://colvy.com/platform-admin' },
    footerNote: 'Sent to the Colvy team only.',
  })
  return { subject, ...mail }
}

// ── Sales enquiry (app/api/contact-sales), to Colvy's own inbox ─────────────

export function salesEnquiryEmail(o: { name: string; email: string; company?: string; message?: string; plan?: string; source?: string }): Mail {
  const { html, text } = colvyEmail({
    preheader: `${o.name}${o.company ? ` from ${o.company}` : ''} sent a sales enquiry.`,
    kicker: 'Sales enquiry',
    title: `${o.name}${o.company ? ` from ${o.company}` : ''}`,
    intro: 'Reply to this email to answer them directly.',
    blocks: [
      { type: 'facts', rows: [['Name', o.name], ['Email', o.email], ['Company', o.company || '—'], ['Plan / interest', o.plan || '—'], ['From page', o.source || '—']] },
      ...(o.message ? [{ type: 'heading', text: 'Message' } as EmailBlock, { type: 'quote', text: o.message } as EmailBlock] : []),
    ],
    footerNote: 'Sent from the contact form on colvy.com.',
  })
  return { subject: `Sales enquiry — ${o.name}${o.company ? ` (${o.company})` : ''}`, html, text }
}
