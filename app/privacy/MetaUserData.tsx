// Always on the privacy policy, server-rendered so Meta's reviewers (and
// crawlers) see it without JavaScript: what Colvy receives from Facebook and
// Instagram, how it's used, and how to have it deleted. The "Data deletion
// instructions URL" in the Meta app settings points here:
// https://colvy.com/privacy#facebook-instagram-data
// Keep it in step with lib/meta.ts and lib/instagram-login.ts.

import { COLVY_CONTACT } from '@/lib/colvy-contact'

const P = { fontSize: 15.5, lineHeight: 1.7, color: '#374151', margin: '0 0 12px' } as const

export default function MetaUserData() {
  return (
    <section id="facebook-instagram-data" style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>Facebook and Instagram data</h2>
      <p style={P}>
        When a business connects a Facebook Page or an Instagram professional account to Colvy (Settings, Channels, Facebook &amp; Instagram), Colvy receives
        through Meta’s APIs: the Page’s and the Instagram account’s name, ID and profile picture; the messages people send to the Page on Messenger or to the
        Instagram account by direct message, with the sender’s name and profile picture where Meta provides them; and comments on the business’s Facebook
        and Instagram posts.
      </p>
      <p style={P}>
        <strong>How we use it.</strong> Colvy shows those messages and comments in the business’s inbox, sends the replies the business’s team writes or
        approves in Colvy, and replies to or hides comments when the team asks it to. We use this data only to provide these features to that business.
      </p>
      <p style={P}>
        <strong>What we don’t do.</strong> We don’t sell Facebook or Instagram data, use it for advertising, or use it to build profiles of people. We share it
        only with the service providers that host and run Colvy for us (for example our database, file storage and, if the business uses Colvy’s AI features
        on a conversation, our AI provider), under contracts that limit their use to providing the service; or where the law requires it.
      </p>
      <p style={P}>
        <strong>Storage.</strong> Access tokens, messages and comments are stored in Colvy’s database and are only available to the business’s own team.
      </p>
      <p style={P}>
        <strong>Deleting your data.</strong> A business can disconnect at any time (Settings, Channels, Facebook &amp; Instagram, Disconnect) and can remove
        Colvy from Facebook (Settings &amp; privacy, Settings, Business integrations) or Instagram (Settings and activity, Website permissions, Apps and websites). To have Colvy delete the
        data it received from Facebook or Instagram, whether you’re a business using Colvy or someone who messaged one, email{' '}
        <a href={COLVY_CONTACT.mailHref} style={{ color: '#111' }}>{COLVY_CONTACT.email}</a> from the email address on your Colvy account, or with the name
        of the Page or Instagram account you messaged. We’ll delete it and confirm by email when it’s done.
      </p>
    </section>
  )
}
