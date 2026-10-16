// Always on the privacy policy, server-rendered so Google's reviewers (and
// crawlers) see it without JavaScript: how Colvy uses Gmail data. Google's
// OAuth verification for the Gmail scopes requires the policy to say what is
// accessed, how it's used, stored and shared, and to state Limited Use
// compliance. Keep it in step with lib/gmail-oauth.ts GMAIL_SCOPES.

import { COLVY_CONTACT } from '@/lib/colvy-contact'

const P = { fontSize: 15.5, lineHeight: 1.7, color: '#374151', margin: '0 0 12px' } as const

export default function GoogleUserData() {
  return (
    <section id="google-user-data" style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>Google user data (Gmail)</h2>
      <p style={P}>
        When a business connects a Gmail account to Colvy (Settings, Channels, Email), Colvy asks Google for two permissions:
        to view email messages and settings (the gmail.readonly scope) and to send email on the account holder’s behalf (the gmail.send scope).
        Colvy can’t delete or change messages in Gmail.
      </p>
      <p style={P}>
        <strong>How we use it.</strong> Colvy reads messages in the connected inbox so customer emails appear as conversations in the business’s Colvy inbox,
        applies the business’s own email rules (for example ignoring newsletters), saves attachments so the team can open them, and sends the replies that
        the business’s team writes or approves in Colvy from the connected Gmail address. We use Gmail data only to provide and improve these user-facing
        features for that business.
      </p>
      <p style={P}>
        <strong>What we don’t do.</strong> We don’t sell Gmail data, use it for advertising, or use it to build user profiles. We don’t use Gmail data to
        develop, improve or train generalised artificial intelligence or machine learning models. People at Colvy don’t read Gmail data unless the business
        asks us to (for example in a support request), it’s needed for security (such as investigating abuse), it’s required by law, or it has been
        aggregated and anonymised for internal operations.
      </p>
      <p style={P}>
        <strong>Sharing.</strong> We share Gmail data only with the service providers that host and run Colvy for us (for example our database, file storage
        and, if the business uses Colvy’s AI writing features on a conversation, our AI provider to produce that draft), under contracts that limit their use
        to providing the service; or where the law requires it.
      </p>
      <p style={P}>
        <strong>Storage and removal.</strong> Access tokens and the emails brought into Colvy are stored in Colvy’s database and are only available to the
        business’s own team. A business can disconnect a Gmail account at any time (Settings, Channels, Email, Remove), and anyone can revoke Colvy’s access
        at <a href="https://myaccount.google.com/permissions" style={{ color: '#111' }}>myaccount.google.com/permissions</a>. To have data deleted, email
        {' '}<a href={COLVY_CONTACT.mailHref} style={{ color: '#111' }}>{COLVY_CONTACT.email}</a>.
      </p>
      <p style={P}>
        Colvy’s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: '#111' }}>Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>
    </section>
  )
}
