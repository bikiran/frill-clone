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
import { COLVY_FEATURES } from '../lib/colvy-account-emails'

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
      intro: 'Welcome to Colvy. Thanks for signing up. Confirm your email address to switch on your account.',
      cta: { label: 'Confirm my email', url: CONFIRM },
      more: [
        { type: 'link', url: CONFIRM },
        { type: 'heading', text: 'What Colvy does' },
        { type: 'list', items: COLVY_FEATURES },
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

/** The finished file: header comment plus the email. */
export function renderSupabaseTemplate(t: SupabaseTemplate): string {
  let { html } = colvyEmail({ ...t.email, year: false })
  for (const [stand, v] of Object.entries(URL_VARS)) html = html.split(stand).join(v)
  // Variable names in the comment are written without braces: Supabase's
  // template engine would otherwise try to fill them in there too.
  const header = `<!--
  Colvy: "${t.name}" email for Supabase Auth.

  WHERE TO PASTE IT
    Supabase dashboard → Authentication → Emails → Templates → "${t.name}".
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
  for (const t of SUPABASE_TEMPLATES) {
    writeFileSync(join(dir, t.file), renderSupabaseTemplate(t))
    console.log('wrote', t.file)
  }
  // reset-password.html replaces the old recovery.html.
  const old = join(dir, 'recovery.html')
  if (existsSync(old)) { unlinkSync(old); console.log('removed recovery.html (now reset-password.html)') }
}
