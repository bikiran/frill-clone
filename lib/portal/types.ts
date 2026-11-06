// What the customer portal page gets from /api/portal (op=me). Amounts in cents.

export type PortalPublic = {
  name: string; slug: string; logoUrl: string | null; accent: string | null; hidePoweredBy: boolean
  sections: Record<string, boolean>
}

export type PortalComing = {
  id: string; kind: 'booking' | 'reservation' | 'delivery'; title: string; startsAt: string; endsAt: string | null
  allDay?: boolean; where?: string | null; party?: number | null; status: string; statusLabel: string
  /** Change or cancel (the booking's own page). */
  manageUrl?: string | null
}
export type PortalPayment = { id: string; description: string; cents: number; currency: string; url: string | null; createdAt: string }
export type PortalQuote = { id: string; number: string; title: string; cents: number; status: string; statusLabel: string; url: string; sentAt: string | null; waiting: boolean }
export type PortalJob = { id: string; title: string; status: string; statusLabel: string; nextVisit: string | null }
export type PortalOrder = {
  id: string; kind: 'in_store' | 'online' | 'payment'; platform: string | null; number: string; at: string; cents: number; currency: string
  paid: boolean; statusLabel: string; items: string; url: string | null
  /** Opens its receipt (GET /api/portal?op=receipt&key=…). */
  receipt: string | null
}
export type PortalMessage = { id: string; mine: boolean; text: string; at: string; by: string | null }

export type PortalMe = {
  me: { name: string; email: string; phone: string; marketingEmail: boolean; marketingSms: boolean; smsOnFile: boolean; via: 'code' | 'link'; expiresAt: string }
  comingUp?: PortalComing[]
  payments?: PortalPayment[]
  quotes?: PortalQuote[]
  jobs?: PortalJob[]
  orders?: PortalOrder[]
  messages?: { items: PortalMessage[]; canReply: boolean } | null
}
