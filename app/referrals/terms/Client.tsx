'use client'

import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

const INK = '#0f1119', SLATE = '#5b6472', BLUE = '#2b59ff'
const REWARD = '$100'
const EFFECTIVE = '23 September 2026'

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
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 72px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: BLUE, margin: '0 0 12px' }}>Colvy Referrals</p>
        <h1 style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Referral Program Terms</h1>
        <p style={{ fontSize: 14, color: SLATE, margin: '0 0 6px' }}>Effective {EFFECTIVE}</p>
        <p style={{ fontSize: 16, color: SLATE, lineHeight: 1.65, margin: '18px 0 8px' }}>
          These terms govern the Colvy referral program. In short: refer a business, and when they subscribe and pay their first month, you earn {REWARD} in account credit. The details are below.
        </p>

        {SECTIONS.map(sec => (
          <section key={sec.h} style={{ marginTop: 34 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 12px' }}>{sec.h}</h2>
            {sec.body.map((b, i) => Array.isArray(b) ? (
              <ul key={i} style={{ margin: '0 0 12px', paddingLeft: 22, color: SLATE }}>
                {b.map((li, j) => <li key={j} style={{ fontSize: 15.5, lineHeight: 1.7, marginBottom: 4 }}>{li}</li>)}
              </ul>
            ) : (
              <p key={i} style={{ fontSize: 15.5, color: SLATE, lineHeight: 1.7, margin: '0 0 12px' }}>{b}</p>
            ))}
          </section>
        ))}

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #eceef2', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/referrals" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>← Back to Referrals</Link>
          <Link href="/terms" style={{ color: SLATE, fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/privacy" style={{ color: SLATE, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
      </div>
      <MarketingFooter />
    </div>
  )
}
