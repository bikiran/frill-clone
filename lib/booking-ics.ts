// Calendar invites for bookings: an .ics file (Apple / Outlook / email
// attachment) and a Google Calendar "add event" link. Pure, shared by the
// server (confirmation email) and the browser (manage page buttons).

export type InviteEvent = {
  uid: string
  title: string
  startMs: number
  endMs: number
  location?: string | null
  description?: string | null
  url?: string | null
  cancelled?: boolean
  sequence?: number
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

// RFC 5545 lines must be folded at 75 octets.
function fold(line: string) {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74) }
  out.push(rest)
  return out.join('\r\n')
}

export function buildIcs(e: InviteEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colvy//Bookings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}@colvy.com`,
    `SEQUENCE:${e.sequence || 0}`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(e.startMs)}`,
    `DTEND:${stamp(e.endMs)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    e.url ? `URL:${e.url}` : '',
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    e.cancelled ? '' : 'BEGIN:VALARM\r\nTRIGGER:-PT1H\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nEND:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.map(l => l.includes('\r\n') ? l : fold(l)).join('\r\n') + '\r\n'
}

export function googleCalendarUrl(e: InviteEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.startMs)}/${stamp(e.endMs)}`,
    details: [e.description, e.url].filter(Boolean).join('\n\n'),
    location: e.location || '',
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
