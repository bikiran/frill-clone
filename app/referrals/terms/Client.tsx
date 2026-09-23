'use client'

import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

const INK = '#0f1119', SLATE = '#5b6472', BLUE = '#2b59ff'
const REWARD = '$100'
const EFFECTIVE = '23 September 2026'

// Turn a heading like "3. When a referral qualifies" into an anchor id.
const slug = (h: string) => h.toLowerCase().replace(/^[\d.]+\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Referral program terms. Plain-language rules that match the landing page's
// promise exactly: $100 account credit per successful referral, earned once the
// referred business subscribes and pays their first month.
const SECTIONS: { h: string; body: (string | string[])[] }[] = [
  {
    h: '1. The reward',
    body: [
      `You earn ${REWARD} in Colvy account credit for each new business you refer that becomes a paying Colvy customer, as defined below. There is no limit on the number of referrals you can make or rewards you can earn.`,
      'The reward is issued as account credit applied to your future Colvy invoices. It has no cash value, is not redeemable for cash, and is not transferable.',
    ],
  },
  {
    h: '2. Who can take part',
    body: [
      'You must have an active Colvy account to generate a referral link and receive rewards.',
      'The business you refer must be a new business that is not, and has not recently been, a Colvy customer, and must sign up using your referral link.',
      'You may not refer yourself, your own businesses or workspaces, or accounts you control. Self-referrals and duplicate accounts do not qualify.',
    ],
  },
  {
    h: '3. When a referral qualifies',
    body: [
      'A referral becomes “successful” — and the reward is earned — only when ALL of the following are true:',
      [
        'The referred business signed up using your referral link;',
        'They subscribed to a paid Colvy plan; and',
        'They paid their first month (their first invoice) in full.',
      ],
      'Free trials, unpaid signups, downgrades to a free plan, and accounts that cancel or fail payment before completing their first paid month do not qualify.',
    ],
  },
  {
    h: '4. How and when the credit is applied',
    body: [
      'Once a referral qualifies, the reward is added to your account as credit and applied to your next invoice (or a following invoice if your next one has already been issued).',
      'Credit may take a few days to appear after the referred business’s first payment clears.',
    ],
  },
  {
    h: '5. Fair use',
    body: [
      'The program is intended for genuine recommendations. Spam, misleading claims about Colvy, paid search bidding on Colvy’s brand, incentivising sign-ups in ways that breach these terms, or any attempt to game the program may result in withheld rewards and removal from the program.',
      'If a referred business requests a refund, charges back, or their first payment is reversed, the associated reward may be reversed or deducted from your balance.',
    ],
  },
  {
    h: '6. Changes and ending the program',
    body: [
      'Colvy may change the reward amount, qualification rules, or these terms, and may pause or end the program, at any time. Material changes take effect from the date they are posted; rewards already earned under prior terms are honoured.',
      'Colvy’s determination of whether a referral qualifies is final. These terms sit alongside the Colvy Terms of Service and Privacy Policy.',
    ],
  },
]

export default function Client() {
  return (
    <div style={{ background: '#fff', color: INK }}>
      <MarketingNav />

      {/* Full-bleed banner so the header uses the whole width instead of a
          skinny centred column. */}
      <div style={{ background: 'linear-gradient(180deg,#f7f9ff 0%,#fff 100%)', borderBottom: '1px solid #eef1f6' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '52px 24px 40px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: BLUE, margin: '0 0 12px' }}>Colvy Referrals</p>
          <h1 style={{ fontSize: 'clamp(32px,5vw,52px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Referral Program Terms</h1>
          <p style={{ fontSize: 14, color: SLATE, margin: '0 0 14px' }}>Effective {EFFECTIVE}</p>
          <p style={{ fontSize: 17, color: SLATE, lineHeight: 1.65, margin: 0, maxWidth: 760 }}>
            These terms govern the Colvy referral program. In short: refer a business, and when they subscribe and pay their first month, you earn {REWARD} in account credit. The details are below.
          </p>
        </div>
      </div>

      {/* Two columns: a sticky rail (summary + jump links) on the left, the full
          terms on the right — so the wide desktop space is actually used. */}
      <div className="ref-terms-grid" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 72px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 56, alignItems: 'start' }}>
        <aside className="ref-terms-rail" style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'linear-gradient(135deg,#eff3ff 0%,#f6f0ff 100%)', border: '1px solid #e6ebfb', borderRadius: 16, padding: '20px 20px 22px' }}>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: BLUE, margin: '0 0 10px' }}>Quick summary</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '0 0 6px' }}>
              <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.02em' }}>{REWARD}</span>
              <span style={{ fontSize: 14, color: SLATE, fontWeight: 600 }}>account credit</span>
            </div>
            <p style={{ fontSize: 13.5, color: SLATE, lineHeight: 1.6, margin: 0 }}>Per business that signs up on your link and pays their first month. No cap.</p>
          </div>
          <nav style={{ border: '1px solid #eceef2', borderRadius: 16, padding: '10px 8px' }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', margin: '6px 12px 8px' }}>On this page</p>
            {SECTIONS.map(sec => (
              <a key={sec.h} href={`#${slug(sec.h)}`}
                style={{ display: 'block', padding: '7px 12px', borderRadius: 9, fontSize: 13.5, color: SLATE, textDecoration: 'none', fontWeight: 600 }}>
                {sec.h}
              </a>
            ))}
          </nav>
        </aside>

        <div>
          {SECTIONS.map(sec => (
            <section key={sec.h} id={slug(sec.h)} style={{ marginBottom: 34, scrollMarginTop: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 12px' }}>{sec.h}</h2>
              {sec.body.map((b, i) => Array.isArray(b) ? (
                <ul key={i} style={{ margin: '0 0 12px', paddingLeft: 22, color: SLATE }}>
                  {b.map((li, j) => <li key={j} style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 4 }}>{li}</li>)}
                </ul>
              ) : (
                <p key={i} style={{ fontSize: 16, color: SLATE, lineHeight: 1.75, margin: '0 0 12px', maxWidth: 760 }}>{b}</p>
              ))}
            </section>
          ))}

          <div style={{ marginTop: 12, paddingTop: 24, borderTop: '1px solid #eceef2', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Link href="/referrals" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>← Back to Referrals</Link>
            <Link href="/terms" style={{ color: SLATE, fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link>
            <Link href="/privacy" style={{ color: SLATE, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>
          </div>
        </div>
      </div>

      <style>{`
        .ref-terms-rail nav a:hover { background: #f4f6fb; color: ${INK}; }
        @media (max-width: 860px){
          .ref-terms-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
          .ref-terms-rail { position: static !important; }
        }
      `}</style>
      <MarketingFooter />
    </div>
  )
}
