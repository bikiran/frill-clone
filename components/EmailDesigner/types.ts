// The email designer's data: a list of simple blocks plus a few settings.
// Stored as JSON in email_designs.design; rendered to email-safe HTML by
// ./render.ts (shared by the browser preview and the server send).

/** The business's branding, from the company row and its settings. */
export type EmailBrand = {
  companyId: string
  name: string
  slug?: string | null
  logoUrl?: string | null
  accent?: string | null
  address?: string | null
  website?: string | null
  phone?: string | null
  email?: string | null
}

export type Align = 'left' | 'center'

export type ProductItem = { name: string; price?: string; image?: string; url?: string }
export type SocialLink = { network: 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'website' | 'x' | 'linkedin'; url: string }
/** One side of a two-column block: any of a picture, title, text and button. */
export type ColumnItem = { image?: string; alt?: string; title?: string; text?: string; label?: string; url?: string }
export type MenuLink = { label: string; url: string }

/** The look of the whole email (Design tab). Fonts are email-safe stacks, never web fonts. */
export type FontChoice = 'modern' | 'classic' | 'friendly' | 'clean'
export type Corners = 'sharp' | 'soft' | 'round'
export type ButtonStyle = 'filled' | 'outline'
export type ButtonShape = 'rounded' | 'pill'

export type Block =
  | { id: string; type: 'header'; showLogo?: boolean; showName?: boolean; align?: Align }
  | { id: string; type: 'heading'; text: string; size?: 'lg' | 'md'; align?: Align }
  /** Light markup: **bold**, _italic_, [label](https://…), {{merge_tag}}. Blank line = new paragraph. */
  | { id: string; type: 'text'; text: string; align?: Align }
  | { id: string; type: 'image'; src: string; alt: string; url?: string; width?: number }
  | { id: string; type: 'button'; label: string; url: string; color?: string; align?: Align }
  | { id: string; type: 'products'; items: ProductItem[]; buttonLabel?: string }
  | { id: string; type: 'coupon'; code: string; offer?: string; title?: string; note?: string; label?: string; url?: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height?: number }
  | { id: string; type: 'social'; links: SocialLink[] }
  | { id: string; type: 'columns'; items: ColumnItem[] }
  /** A picture that opens the video (email can't play video): YouTube links get their thumbnail automatically. */
  | { id: string; type: 'video'; url: string; thumbnail?: string; label?: string }
  | { id: string; type: 'menu'; links: MenuLink[] }
  | { id: string; type: 'footer'; address?: string; note?: string }

export type BlockType = Block['type']

export type EmailDesign = {
  version: 1
  /** Background behind the email card. */
  background?: string
  /** Accent override (else the brand's). */
  accent?: string
  font?: FontChoice
  corners?: Corners
  buttonStyle?: ButtonStyle
  buttonShape?: ButtonShape
  blocks: Block[]
}

/** The merge tags offered in the designer (match the SMS personalisation chips). */
export const MERGE_TAGS: { token: string; label: string; sample: string }[] = [
  { token: 'first_name', label: 'First name', sample: 'Sarah' },
  { token: 'store_name', label: 'Store name', sample: 'Roxy Aquarium' },
  { token: 'outlet', label: 'Outlet', sample: 'Somerton' },
  { token: 'coupon_code', label: 'Coupon code', sample: 'FISH15' },
]

/** Special tags the sender fills per recipient. */
export const SYSTEM_TAGS = ['unsubscribe_url', 'preferences_url', 'open_pixel_url'] as const

export const SUBJECT_HINT = { ideal: 45, max: 78 }
export const PREVIEW_HINT = { ideal: 90, max: 140 }
