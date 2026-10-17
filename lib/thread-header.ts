// The line at the top of an inbox thread ("Email received from …", "New SMS
// Enquiry from …"). It has to be true: a thread opened from a contact's
// "Email" button (the inbox's ?contact= link makes an empty conversation to
// write in) has received nothing, so it must not say "Email received".

const INBOUND = new Set(['visitor', 'customer', 'contact'])

/** Did the customer send anything in these messages? */
export const hasInbound = (messages: any[] | null | undefined) =>
  (Array.isArray(messages) ? messages : []).some(m => INBOUND.has(String(m?.sender_type || '')))

/**
 * The header for a thread. `kind` is what it's about ('Email Enquiry',
 * 'SMS Enquiry', 'Abandoned Cart', …), `name` who it's with.
 *   - no messages yet: "Email conversation with Kalpana · no messages yet"
 *   - email: "Email received from …" only when the first real message is theirs
 *   - anything else as before: "New SMS Enquiry from …"
 */
export function threadHeaderLine(kind: string, messages: any[] | null | undefined, name: string): string {
  const list = (Array.isArray(messages) ? messages : []).filter(m => String(m?.sender_type || '') !== 'system')
  const first = list[0]
  if (kind === 'Email Enquiry') {
    if (!first) return `Email conversation with ${name} · no messages yet`
    return INBOUND.has(String(first.sender_type || '')) ? `Email received from ${name}` : `Email conversation with ${name}`
  }
  if (!first) return `Conversation with ${name} · no messages yet`
  return `New ${kind} from ${name}`
}
