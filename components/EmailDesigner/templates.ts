// Starter designs for small retail. Plain words, the business's own branding
// (logo, name, accent colour and address come from its settings), and gaps
// for the owner's own pictures and products.

import type { Block, EmailDesign } from './types'

let n = 0
export const newId = () => `b${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

type NoId<T> = T extends any ? Omit<T, 'id'> : never
const B = (b: NoId<Block>): Block => ({ id: newId(), ...(b as any) })

export type StarterTemplate = { id: string; name: string; description: string; subject: string; previewText: string; design: () => EmailDesign }

const footer = () => B({ type: 'footer' })
const header = () => B({ type: 'header', showLogo: true, showName: true, align: 'center' })

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'new-arrivals', name: 'New arrivals', description: 'Show off what just came in, with product cards.',
    subject: 'Just in at {{store_name}}', previewText: 'Fresh stock has landed. Have a look before it goes.',
    design: () => ({ version: 1, blocks: [
      header(),
      B({ type: 'image', src: '', alt: 'Our newest arrivals' }),
      B({ type: 'heading', text: 'Fresh stock has landed', align: 'left' }),
      B({ type: 'text', text: 'Hi {{first_name|there}},\n\nA new delivery has just arrived at **{{store_name}}** and we wanted you to see it first. Here are a few of our favourites.' }),
      B({ type: 'products', items: [{ name: '' }, { name: '' }], buttonLabel: 'Shop now' }),
      B({ type: 'button', label: 'See everything new', url: '', align: 'center' }),
      B({ type: 'social', links: [] }),
      footer(),
    ] }),
  },
  {
    id: 'sale', name: 'Sale', description: 'A big headline, a coupon code and one clear button.',
    subject: 'Our sale starts now, {{first_name|friend}}', previewText: 'Save on our most popular lines this week only.',
    design: () => ({ version: 1, blocks: [
      header(),
      B({ type: 'heading', text: 'This week only: 20% off', align: 'center' }),
      B({ type: 'text', text: 'Hi {{first_name|there}}, our biggest sale of the season is on now, in store and online. Use the code below at checkout.', align: 'center' }),
      B({ type: 'coupon', code: 'SAVE20', offer: '20% off', title: 'This week only', note: 'Ends Sunday at midnight.' }),
      B({ type: 'button', label: 'Shop the sale', url: '', align: 'center' }),
      B({ type: 'image', src: '', alt: 'Sale items' }),
      footer(),
    ] }),
  },
  {
    id: 'newsletter', name: 'Newsletter', description: 'A monthly round-up with a few short stories.',
    subject: 'What’s new at {{store_name}} this month', previewText: 'News, tips and what’s coming up.',
    design: () => ({ version: 1, blocks: [
      header(),
      B({ type: 'heading', text: 'This month at {{store_name}}' }),
      B({ type: 'text', text: 'Hi {{first_name|there}},\n\nHere’s a quick round-up of what’s been happening and what’s coming up.' }),
      B({ type: 'image', src: '', alt: '' }),
      B({ type: 'heading', text: 'Tip of the month', size: 'md' }),
      B({ type: 'text', text: 'Share something useful your customers would want to know. Keep it short: two or three sentences is plenty.' }),
      B({ type: 'divider' }),
      B({ type: 'heading', text: 'Coming up', size: 'md' }),
      B({ type: 'text', text: 'Let people know about new stock, events or changes to your opening hours.' }),
      B({ type: 'button', label: 'Visit our website', url: '' }),
      B({ type: 'social', links: [] }),
      footer(),
    ] }),
  },
  {
    id: 'event', name: 'Event', description: 'Invite customers to a workshop, launch or open day.',
    subject: 'You’re invited, {{first_name|friend}}', previewText: 'Join us in store. Spots are limited.',
    design: () => ({ version: 1, blocks: [
      header(),
      B({ type: 'image', src: '', alt: 'Our event' }),
      B({ type: 'heading', text: 'You’re invited', align: 'center' }),
      B({ type: 'text', text: 'Join us at **{{outlet|our store}}** for an afternoon of tips, demonstrations and refreshments.\n\n**When:** Saturday, 10am to 12pm\n**Where:** {{outlet|our store}}', align: 'center' }),
      B({ type: 'button', label: 'Save my spot', url: '', align: 'center' }),
      B({ type: 'text', text: 'Spots are limited, so book early.', align: 'center' }),
      footer(),
    ] }),
  },
  {
    id: 'win-back', name: 'Win-back', description: 'Bring back customers who haven’t shopped in a while.',
    subject: 'We miss you, {{first_name|friend}}', previewText: 'Here’s a little something to welcome you back.',
    design: () => ({ version: 1, blocks: [
      header(),
      B({ type: 'heading', text: 'It’s been a while', align: 'center' }),
      B({ type: 'text', text: 'Hi {{first_name|there}}, we haven’t seen you at {{store_name}} for a little while, and we’d love to welcome you back. Here’s 15% off your next visit.', align: 'center' }),
      B({ type: 'coupon', code: '{{coupon_code|WELCOME15}}', offer: '15% off', title: 'Welcome back', note: 'Valid for 30 days, in store and online.' }),
      B({ type: 'button', label: 'Come back and shop', url: '', align: 'center' }),
      B({ type: 'products', items: [{ name: '' }, { name: '' }], buttonLabel: 'Have a look' }),
      footer(),
    ] }),
  },
  {
    id: 'plain-letter', name: 'Plain letter', description: 'A personal note that reads like an email from you.',
    subject: 'A note from {{store_name}}', previewText: 'A quick message from the team.',
    design: () => ({ version: 1, blocks: [
      B({ type: 'spacer', height: 16 }),
      B({ type: 'text', text: 'Hi {{first_name|there}},\n\nI wanted to write to you personally to say thank you for shopping with us. Small businesses like ours only keep going because of customers like you.\n\nIf there’s ever anything we can do better, just reply to this email. It comes straight to me.\n\nThanks again,\nThe team at {{store_name}}' }),
      footer(),
    ] }),
  },
]

export function starterById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.id === id)
}

/** A fresh block of a type, with sensible starting content. */
export function blankBlock(type: Block['type']): Block {
  switch (type) {
    case 'header': return header()
    case 'heading': return B({ type: 'heading', text: 'Your heading' })
    case 'text': return B({ type: 'text', text: 'Write your message here. Use **bold**, _italic_ or [a link](https://example.com).' })
    case 'image': return B({ type: 'image', src: '', alt: '' })
    case 'button': return B({ type: 'button', label: 'Shop now', url: '', align: 'left' })
    case 'products': return B({ type: 'products', items: [], buttonLabel: 'Shop now' })
    case 'coupon': return B({ type: 'coupon', code: '', offer: '10% off', title: 'Coupon' })
    case 'divider': return B({ type: 'divider' })
    case 'spacer': return B({ type: 'spacer', height: 24 })
    case 'social': return B({ type: 'social', links: [] })
    case 'columns': return B({ type: 'columns', items: [{ title: 'Left column', text: 'A short line about this.' }, { title: 'Right column', text: 'A short line about this.' }] })
    case 'video': return B({ type: 'video', url: '', label: 'Watch the video' })
    case 'menu': return B({ type: 'menu', links: [{ label: 'Shop', url: '' }, { label: 'New in', url: '' }, { label: 'Sale', url: '' }] })
    case 'footer': return footer()
  }
}
