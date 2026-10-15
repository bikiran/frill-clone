// The seven setup steps as people see them: wording, icon, roughly how long
// each takes, and the settings page that connects it. Shared by the dashboard
// checklist (components/SetupChecklist) and the /onboarding launcher. Whether a
// step is done comes from the server (lib/setup-status).

import type { ReactNode } from 'react'
import type { SetupStatus, SetupStepKey } from '@/lib/setup-status'

const Svg = ({ size = 20, color = 'currentColor', children }: { size?: number; color?: string; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
type IconProps = { size?: number; color?: string }

export const MailIcon = (p: IconProps) => <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></Svg>
export const SocialIcon = (p: IconProps) => <Svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.35-.3a2.42 2.42 0 1 0-3.2 3.6l3.6 3.5 3.6-3.5c1.2-1.2 1.1-2.7.2-3.7" /></Svg>
export const StoreIcon = (p: IconProps) => <Svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></Svg>
export const PhoneIcon = (p: IconProps) => <Svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></Svg>
export const PeopleIcon = (p: IconProps) => <Svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
export const InviteIcon = (p: IconProps) => <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></Svg>
export const BoltIcon = (p: IconProps) => <Svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></Svg>
export const CheckMark = (p: IconProps) => <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
export const HourglassIcon = (p: IconProps) => <Svg {...p}><path d="M5 22h14" /><path d="M5 2h14" /><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22" /><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" /></Svg>
export const ArrowRight = (p: IconProps) => <Svg {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Svg>

export type StepMeta = {
  key: SetupStepKey
  title: string
  doneTitle: string
  desc: string
  cta: string
  /** The settings page that connects it (before `returnTo` is added). */
  href: string
  alt?: { label: string; href: string }
  minutes: number
  Icon: (p: IconProps) => ReactNode
}

/** Step wording and links. A few depend on what's already connected. */
export function setupSteps(status?: Pick<SetupStatus, 'store'> | null): StepMeta[] {
  const store = status?.store || null
  const storeName = store === 'woocommerce' ? 'WooCommerce' : 'Shopify'
  return [
    { key: 'email', title: 'Connect your email', doneTitle: 'Email connected',
      desc: 'Sign in with Google or forward your work address. Customer emails land in your inbox and replies thread back.',
      cta: 'Connect email', href: '/admin/crm-settings/channels/email', minutes: 2, Icon: MailIcon },
    { key: 'meta', title: 'Connect Facebook & Instagram', doneTitle: 'Facebook & Instagram connected',
      desc: 'Messages from your Facebook Page and Instagram show up next to everything else.',
      cta: 'Connect Facebook', href: '/admin/crm-settings/channels/meta', minutes: 2, Icon: SocialIcon },
    { key: 'store', title: 'Connect your online store', doneTitle: 'Online store connected',
      desc: 'Orders, products and customers from your store, right beside each chat.',
      cta: 'Connect Shopify', href: '/admin/integrations/shopify',
      alt: { label: 'Use WooCommerce', href: '/admin/integrations/woocommerce' }, minutes: 3, Icon: StoreIcon },
    { key: 'phone', title: 'Get a business number', doneTitle: 'Business number live',
      desc: 'An Australian number for calls and texts. The ID check for a new number can take a day or two.',
      cta: 'Get a number', href: '/admin/crm-settings/channels/calls', minutes: 4, Icon: PhoneIcon },
    { key: 'customers', title: 'Bring in your customers', doneTitle: 'Customers in Colvy',
      desc: store
        ? `Import your customers from ${storeName} so every chat shows who you’re talking to.`
        : 'Add your customers so every chat shows who you’re talking to. Connecting a store brings them in for you.',
      cta: store ? 'Import customers' : 'Add customers',
      href: store === 'woocommerce' ? '/admin/integrations/woocommerce' : store === 'shopify' ? '/admin/integrations/shopify' : '/admin/contacts',
      minutes: 2, Icon: PeopleIcon },
    { key: 'team', title: 'Invite your team', doneTitle: 'Team invited',
      desc: 'Share the inbox and orders with the people who help run the business.',
      cta: 'Invite a teammate', href: '/admin/team?invite=1', minutes: 1, Icon: InviteIcon },
    { key: 'automation', title: 'Turn on your first automation', doneTitle: 'First automation on',
      desc: 'Answer common questions for you, like opening hours or delivery times, any time of day.',
      cta: 'Set up an auto-reply', href: '/admin/crm-settings/auto-replies', minutes: 2, Icon: BoltIcon },
  ]
}
