'use client'

import Link from 'next/link'

const features = [
  {
    icon: '💡',
    title: 'Idea Board',
    subtitle: 'Capture what customers actually want',
    description: 'A beautiful public board where anyone can submit, vote, and comment on feature requests. The best ideas surface naturally — no spreadsheets, no survey fatigue.',
    bullets: [
      'Anonymous or authenticated submissions',
      'Upvote system — best ideas rise to the top',
      'Rich descriptions with images and links',
      'Sort by votes, recency, or status',
    ],
  },
  {
    icon: '🗺️',
    title: 'Public Roadmap',
    subtitle: 'Show customers what\'s coming',
    description: 'Turn your top ideas into a living roadmap. Customers can see what\'s planned, what\'s in progress, and what just shipped — building trust with every update.',
    bullets: [
      'Planned / In Progress / Shipped columns',
      'Drag ideas between stages',
      'Link ideas directly to roadmap items',
      'Embeddable anywhere',
    ],
  },
  {
    icon: '📢',
    title: 'Announcements',
    subtitle: 'Close the loop, every time',
    description: 'Your own changelog. Post updates about new features, improvements, and fixes — and automatically notify everyone who voted for that idea.',
    bullets: [
      'Tag posts as New Feature, Improvement, or Bug Fix',
      'Auto-notify voters when their idea ships',
      'Beautiful announcement cards',
      'RSS feed included',
    ],
  },
  {
    icon: '🔌',
    title: 'Embeddable Widget',
    subtitle: 'Meet users where they are',
    description: 'Drop a single script tag into your app and the full feedback experience appears as a lightweight widget. No redirects, no context switching.',
    bullets: [
      'One-line install — copy, paste, done',
      'Matches your brand colors',
      'SSO passthrough — users stay logged in',
      'Works on web, React, Vue, plain HTML',
    ],
  },
  {
    icon: '🔒',
    title: 'SSO & Authentication',
    subtitle: 'Seamless for your users',
    description: 'Users who are already logged into your product don\'t need to create yet another account. Single sign-on passes their identity straight through.',
    bullets: [
      'JWT-based SSO integration',
      'Magic link sign-in',
      'Email + password',
      'Control who can post and who can only vote',
    ],
  },
  {
    icon: '⚡',
    title: 'Integrations',
    subtitle: 'Plugs into your existing workflow',
    description: 'Connect your feedback loop to the tools your team already uses. New idea in? Slack pings your channel. Status changes? Jira ticket updates automatically.',
    bullets: [
      'Slack — instant notifications',
      'Jira — sync ideas as issues',
      'Zapier — connect anything',
      'REST API for custom workflows',
    ],
  },
]

export default function Features() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>

      {/* Hero */}
      <div className="text-center py-24 px-4" style={{ background: 'var(--peach)' }}>
        <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--coral)' }}>
          Everything you need
        </p>
        <h1 className="text-5xl font-bold mb-6" style={{ color: 'var(--ink)', lineHeight: 1.15 }}>
          Turn customer feedback<br />into shipped features
        </h1>
        <p className="text-xl max-w-xl mx-auto mb-10" style={{ color: 'var(--slate)' }}>
          One platform. Collect ideas, plan your roadmap, and announce what you ship — all in a single, beautiful tool your customers will love using.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 rounded-xl font-semibold text-white shadow-sm hover:opacity-90 transition"
            style={{ background: 'var(--coral)' }}
          >
            Start for free
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-3 rounded-xl font-semibold border border-gray-200 bg-white hover:shadow-sm transition"
            style={{ color: 'var(--ink)' }}
          >
            See pricing
          </Link>
        </div>
        <p className="text-sm mt-4" style={{ color: 'var(--slate)' }}>14-day free trial · No credit card required</p>
      </div>

      {/* Feature grid */}
      <div className="max-w-6xl mx-auto px-4 py-24">
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-md transition-shadow"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--coral)' }}>
                {f.subtitle}
              </p>
              <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{f.title}</h2>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>{f.description}</p>
              <ul className="space-y-2">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                    <span className="mt-0.5" style={{ color: 'var(--coral)' }}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center py-20 px-4" style={{ background: 'var(--peach)' }}>
        <h2 className="text-3xl font-bold mb-4" style={{ color: 'var(--ink)' }}>
          Ready to close the feedback loop?
        </h2>
        <p className="mb-8" style={{ color: 'var(--slate)' }}>Join thousands of teams who ship better products with their customers, not just for them.</p>
        <Link
          href="/signup"
          className="px-8 py-3 rounded-xl font-semibold text-white hover:opacity-90 transition"
          style={{ background: 'var(--coral)' }}
        >
          Get started free
        </Link>
      </div>
    </div>
  )
}
