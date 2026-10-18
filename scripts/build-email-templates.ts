// Writes the Supabase Auth email templates in supabase/email-templates/ from
// Colvy's shared email layout (lib/colvy-email), so they look the same as the
// emails the app sends itself.
//
//   npx tsx scripts/build-email-templates.ts
//
// Supabase keeps these templates in its dashboard, not in this repo, so after
// changing them paste each file into Supabase → Authentication → Emails →
// Templates (the header comment in each file says which one, and the subject).
//
// The output is plain static HTML with Supabase's Go template variables in it
// ({{ .ConfirmationURL }} and so on). The year is left out of the copyright
// line because a static template can't work it out.

import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { colvyEmail, type ColvyEmailInput } from '../lib/colvy-email'

/** Stand-in URLs the layout accepts; swapped for Go template variables after rendering. */
const URL_VARS: Record<string, string> = {
  'https://colvy.invalid/__CONFIRMATION_URL__': '{{ .ConfirmationURL }}',
}
const CONFIRM = 'https://colvy.invalid/__CONFIRMATION_URL__'

export type SupabaseTemplate = {
  file: string
  /** The template's name in Supabase → Authentication → Emails → Templates. */
  name: string
  subject: string
  /** Variables the body must contain. */
  vars: string[]
  /** When Colvy causes Supabase to send it. */
  when: string
  /** Where it lives in Supabase → Authentication → Emails (default 'Templates'). */
  section?: 'Templates' | 'Security'
  email: Omit<ColvyEmailInput, 'year'>
}

export const SUPABASE_TEMPLATES: SupabaseTemplate[] = [
  {
    file: 'confirm-signup.html',
    name: 'Confirm sign up',
    subject: 'Confirm your email for Colvy',
    vars: ['{{ .ConfirmationURL }}'],
    when: 'Rarely. Colvy\'s sign-up confirms emails with its own codes (app/api/auth/otp/send), so Supabase only sends this if an account is made with supabase.auth.signUp, e.g. super admin → Create user on a server without the service role key.',
    email: {
      preheader: 'Confirm your email to switch on your Colvy account.',
      title: 'Confirm your email',
      intro: 'Thanks for signing up. Tap the button to confirm your email address.',
      cta: { label: 'Confirm my email', url: CONFIRM },
      more: [
        { type: 'link', url: CONFIRM },
      ],
      secondary: 'Didn’t sign up for Colvy? You can ignore this email.',
    },
  },
  {
    file: 'magic-link.html',
    name: 'Magic link or OTP',
    subject: 'Your Colvy sign-in link',
    vars: ['{{ .ConfirmationURL }}', '{{ .Token }}'],
    when: 'Not used today. Colvy has no email sign-in link (no signInWithOtp call). Set it up anyway so it looks right if that changes.',
    email: {
      preheader: 'Your link to sign in to Colvy.',
      title: 'Sign in to Colvy',
      intro: 'Tap the button to sign in. The link works once.',
      cta: { label: 'Sign in to Colvy', url: CONFIRM },
      more: [
        { type: 'link', url: CONFIRM },
        { type: 'text', small: true, text: 'Asked for a code instead? Enter this one:' },
        { type: 'code', code: '{{ .Token }}' },
      ],
      secondary: 'Didn’t try to sign in? You can ignore this email. Your account is safe.',
    },
  },
  {
    file: 'invite-user.html',
    name: 'Invite user',
    subject: 'You’ve been invited to Colvy',
    vars: ['{{ .ConfirmationURL }}', '{{ .Email }}'],
    when: 'Not used today. Colvy\'s team invites are its own emails (app/api/send-team-invite), not Supabase\'s inviteUserByEmail.',
    email: {
      preheader: 'Accept your invitation to join a team on Colvy.',
      title: 'You’re invited to Colvy',
      intro: 'You’ve been invited to join a team on Colvy, the all-in-one customer platform for small businesses. Accept to set up your login.',
      cta: { label: 'Accept invitation', url: CONFIRM },
      more: [{ type: 'link', url: CONFIRM }],
      secondary: 'This invitation was sent to {{ .Email }}. If you weren’t expecting it, you can ignore this email.',
    },
  },
  {
    file: 'change-email.html',
    name: 'Change email address',
    subject: 'Confirm your new email for Colvy',
    vars: ['{{ .ConfirmationURL }}', '{{ .Email }}', '{{ .NewEmail }}'],
    when: 'Yes. Sent when someone changes their email on their profile (web app/profile, and the mobile app\'s profile editor), via supabase.auth.updateUser({ email }). With "Secure email change" on, Supabase sends it to both the old and the new address.',
    email: {
      preheader: 'Confirm the change to the email on your Colvy account.',
      title: 'Confirm your new email',
      intro: 'We got a request to change the email on your Colvy account from **{{ .Email }}** to **{{ .NewEmail }}**. Tap the button to confirm.',
      cta: { label: 'Confirm the change', url: CONFIRM },
      more: [{ type: 'link', url: CONFIRM }],
      secondary: 'Didn’t ask for this? Don’t tap the button, and let us know at support@colvy.com so we can check your account.',
    },
  },
  {
    file: 'reset-password.html',
    name: 'Reset password',
    subject: 'Reset your Colvy password',
    vars: ['{{ .ConfirmationURL }}'],
    when: 'Yes. Sent from "Forgot password?" on the web (app/forgot-password) and in the mobile app, via supabase.auth.resetPasswordForEmail.',
    email: {
      preheader: 'Choose a new password for your Colvy account.',
      title: 'Reset your password',
      intro: 'We got a request to reset the password for your Colvy account. Tap the button to choose a new one.',
      cta: { label: 'Choose a new password', url: CONFIRM },
      more: [
        { type: 'link', url: CONFIRM },
        { type: 'note', text: 'The link works once and expires in an hour. Colvy will never ask for your password by email.' },
      ],
      secondary: 'Didn’t ask to reset it? You can ignore this email. Your password won’t change.',
    },
  },
  {
    file: 'reauthentication.html',
    name: 'Reauthentication',
    subject: 'Your Colvy confirmation code',
    vars: ['{{ .Token }}'],
    when: 'Not used today (no supabase.auth.reauthenticate call). Only sent if "Secure password change" is switched on and the app asks for it.',
    email: {
      preheader: 'Your code to confirm it’s you.',
      title: 'Confirm it’s you',
      intro: 'Enter this code in Colvy to confirm the change you’re making.',
      blocks: [{ type: 'code', code: '{{ .Token }}' }],
      secondary: 'Didn’t ask for a code? Change your password and let us know at support@colvy.com.',
    },
  },
]

// ── Security notifications (Supabase → Authentication → Emails → Security) ──
// Short heads-ups after a change to the account. Each gives the one action
// that matters if it wasn't them: reset the password.
const RESET = 'https://colvy.com/forgot-password'
const notMe = () => `Wasn’t you? Reset your password now and email support@colvy.com so we can help secure your account.`

const securityTemplate = (o: { file: string; name: string; subject: string; vars: string[]; preheader: string; title: string; intro: string; facts?: [string, string][] }): SupabaseTemplate => ({
  file: o.file, name: o.name, subject: o.subject, vars: o.vars, section: 'Security',
  when: 'Sent by Supabase when this notification is switched on under Authentication → Emails → Security.',
  email: {
    preheader: o.preheader,
    title: o.title,
    intro: o.intro,
    blocks: o.facts?.length ? [{ type: 'facts', rows: o.facts }] : [],
    cta: { label: 'Reset my password', url: RESET },
    secondary: notMe(),
  },
})

export const SECURITY_TEMPLATES: SupabaseTemplate[] = [
  securityTemplate({
    file: 'security-password-changed.html', name: 'Password changed', subject: 'Your Colvy password was changed',
    vars: ['{{ .Email }}'],
    preheader: 'The password for your Colvy account was just changed.',
    title: 'Your password was changed',
    intro: 'The password for your Colvy account was just changed. If you did this, there’s nothing else to do.',
    facts: [['Account', '{{ .Email }}']],
  }),
  securityTemplate({
    file: 'security-email-changed.html', name: 'Email address changed', subject: 'Your Colvy email address was changed',
    vars: ['{{ .OldEmail }}', '{{ .Email }}'],
    preheader: 'The email address on your Colvy account was changed.',
    title: 'Your email address was changed',
    intro: 'The email address you sign in to Colvy with was just changed. If you did this, there’s nothing else to do.',
    facts: [['Old email', '{{ .OldEmail }}'], ['New email', '{{ .Email }}']],
  }),
  securityTemplate({
    file: 'security-phone-changed.html', name: 'Phone number changed', subject: 'Your Colvy phone number was changed',
    vars: ['{{ .OldPhone }}', '{{ .Phone }}'],
    preheader: 'The phone number on your Colvy account was changed.',
    title: 'Your phone number was changed',
    intro: 'The phone number on your Colvy account was just changed. If you did this, there’s nothing else to do.',
    facts: [['Old number', '{{ .OldPhone }}'], ['New number', '{{ .Phone }}']],
  }),
  securityTemplate({
    file: 'security-identity-linked.html', name: 'Sign-in method linked', subject: 'A new way to sign in was added to your Colvy account',
    vars: ['{{ .Provider }}', '{{ .Email }}'],
    preheader: 'A new sign-in method was linked to your Colvy account.',
    title: 'New sign-in method added',
    intro: 'You can now sign in to Colvy with a new method. If you did this, there’s nothing else to do.',
    facts: [['Account', '{{ .Email }}'], ['Sign-in method', '{{ .Provider }}']],
  }),
  securityTemplate({
    file: 'security-identity-unlinked.html', name: 'Sign-in method removed', subject: 'A sign-in method was removed from your Colvy account',
    vars: ['{{ .Provider }}', '{{ .Email }}'],
    preheader: 'A sign-in method was removed from your Colvy account.',
    title: 'Sign-in method removed',
    intro: 'A way of signing in to Colvy was removed from your account. If you did this, there’s nothing else to do.',
    facts: [['Account', '{{ .Email }}'], ['Sign-in method', '{{ .Provider }}']],
  }),
  securityTemplate({
    file: 'security-mfa-added.html', name: 'MFA method added', subject: 'Two-step verification was added to your Colvy account',
    vars: ['{{ .FactorType }}'],
    preheader: 'A two-step verification method was added to your Colvy account.',
    title: 'Two-step verification added',
    intro: 'A new two-step verification method was added to your Colvy account. If you did this, your account is now better protected.',
    facts: [['Method', '{{ .FactorType }}']],
  }),
  securityTemplate({
    file: 'security-mfa-removed.html', name: 'MFA method removed', subject: 'Two-step verification was removed from your Colvy account',
    vars: ['{{ .FactorType }}'],
    preheader: 'A two-step verification method was removed from your Colvy account.',
    title: 'Two-step verification removed',
    intro: 'A two-step verification method was removed from your Colvy account. If you did this, there’s nothing else to do.',
    facts: [['Method', '{{ .FactorType }}']],
  }),
]


/** The finished file: header comment plus the email. */
export function renderSupabaseTemplate(t: SupabaseTemplate): string {
  let { html } = colvyEmail({ ...t.email, year: false })
  for (const [stand, v] of Object.entries(URL_VARS)) html = html.split(stand).join(v)
  // Variable names in the comment are written without braces: Supabase's
  // template engine would otherwise try to fill them in there too.
  const header = `<!--
  Colvy: "${t.name}" email for Supabase Auth.

  WHERE TO PASTE IT
    Supabase dashboard → Authentication → Emails → ${t.section || 'Templates'} → "${t.name}"${t.section === 'Security' ? ' (switch it on, then open it)' : ''}.
    Subject:      ${t.subject}
    Message body: replace everything with this whole file.

  DOES COLVY SEND IT?
    ${t.when}

  Uses: ${t.vars.map(v => v.replace(/[{}]/g, '').trim()).join(', ')}.
  Generated by scripts/build-email-templates.ts from lib/colvy-email.ts.
  Edit there and run: npx tsx scripts/build-email-templates.ts
-->
`
  return html.replace(/^<!doctype html>\n/i, `<!doctype html>\n${header}`) + '\n'
}

if (process.argv[1] && /build-email-templates\.ts$/.test(process.argv[1])) {
  const dir = join(__dirname, '..', 'supabase', 'email-templates')
  for (const t of [...SUPABASE_TEMPLATES, ...SECURITY_TEMPLATES]) {
    writeFileSync(join(dir, t.file), renderSupabaseTemplate(t))
    console.log('wrote', t.file)
  }
  // reset-password.html replaces the old recovery.html.
  const old = join(dir, 'recovery.html')
  if (existsSync(old)) { unlinkSync(old); console.log('removed recovery.html (now reset-password.html)') }
}
