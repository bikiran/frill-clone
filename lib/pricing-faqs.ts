// Shared so the pricing page UI and the FAQPage JSON-LD (app/pricing/page.tsx)
// stay in sync — mismatched structured data can get a page's rich results
// suppressed by Google.
export const PRICING_FAQS: { q: string; a: string }[] = [
  { q: 'How does the pricing work?', a: 'Pick the product you actually use. The Feedback plan covers ideas, roadmaps, announcements, polls, surveys and your help center. Inbox covers live chat, CRM, SMS and voice calls. Everything bundles both. For white-label, SSO/SAML, SLAs and custom contracts, talk to sales. Start on Free and upgrade whenever you need more.' },
  { q: 'Is there a free plan?', a: 'Yes — the Free plan is free forever with no credit card required. It includes an ideas board, a public roadmap, announcements, a help center and the feedback widget.' },
  { q: 'How is SMS and calling billed?', a: 'The Inbox and Everything plans include 3,000 SMS per month. Beyond that, usage is metered and varies by volume — most Australian SMBs can expect roughly 5c per standard SMS. SMS marketing campaigns and international messaging are billed separately. See the note below the plans for details.' },
  { q: 'Can I change plans later?', a: 'Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the end of your billing cycle.' },
  { q: 'What is the 14-day trial?', a: 'Every paid plan comes with a 14-day free trial. No credit card required. Cancel anytime before the trial ends and you won’t be charged.' },
  { q: 'Is my data safe?', a: 'Yes. All data is encrypted in transit and at rest. We’re hosted on Supabase (PostgreSQL) with daily backups and SOC 2 Type II certified infrastructure.' },
  { q: 'Do you offer discounts for nonprofits or startups?', a: 'Yes — email us at support@colvy.com with your details and we’ll set you up with a special rate.' },
]
