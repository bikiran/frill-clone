// A conversation's one-line preview when its newest message is only files:
// "📎 Jeb Order Labels.pdf", "📎 Jeb Order Labels.pdf and 2 more", "🖼️ Photo",
// "🖼️ 3 photos". Whatever stores the message saves this as
// conversations.last_message. The list (web and app) then shows it as a file
// chip with the file type's colour and the name, not as text.

type F = { name?: string | null; mime?: string | null; type?: string | null; inline?: boolean | null } | null | undefined

const isPicture = (f: NonNullable<F>) =>
  /^image\//i.test(String(f.mime || f.type || '')) || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(String(f.name || ''))

/** The preview for a message's files ('' when there are none). */
export function filesPreview(files: F[] | null | undefined): string {
  const all = (Array.isArray(files) ? files : []).filter(Boolean) as NonNullable<F>[]
  // A picture shown inside the email (a signature logo) isn't one of its
  // files, unless pictures are all it has.
  const own = all.filter(f => !f.inline)
  const list = own.length ? own : all
  if (!list.length) return ''
  const docs = list.filter(f => !isPicture(f))
  if (!docs.length) return list.length > 1 ? `🖼️ ${list.length} photos` : '🖼️ Photo'
  const first = String(docs[0].name || '').replace(/\s+/g, ' ').trim() || 'Attachment'
  return (list.length > 1 ? `📎 ${first} and ${list.length - 1} more` : `📎 ${first}`).slice(0, 200)
}

export type FilePreview = { name: string; more: number; photo: boolean }

/**
 * A saved preview that is only files, as the file to show: the one above, the
 * "📎 name: link" lines a file sent by text is saved with, and older wording
 * ("Sent an attachment", "📎 2 attachments"). Anything else is null.
 */
export function parseFilePreview(text: string | null | undefined): FilePreview | null {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null
  if (lines.length === 1) {
    const l = lines[0]
    const pic = l.match(/^🖼️?\s*(?:(Photo|Media)|(\d+) photos)$/u)
    if (pic) return { name: pic[1] || `${pic[2]} photos`, more: 0, photo: true }
    if (/^(Sent an attachment|Attachment)$/i.test(l)) return { name: 'Attachment', more: 0, photo: false }
    const sent = l.match(/^Sent (\d+) attachments$/i)
    if (sent) return { name: `${sent[1]} attachments`, more: 0, photo: false }
  }
  let first: string | null = null
  let more = 0
  for (const l of lines) {
    const m = l.match(/^📎\s*(.+?)(?::\s*https?:\/\/\S+)?$/u)
    if (m) {
      if (first === null) first = m[1].trim()
      else more++
    } else if (/^https?:\/\/\S+$/.test(l)) {
      more++ // a photo sent with it, by its link
    } else {
      return null // the message has words: show them
    }
  }
  if (!first) return null
  const and = first.match(/^(.*\S)\s+and (\d+) more$/)
  if (and) { first = and[1]; more += Number(and[2]) }
  return { name: first, more, photo: false }
}

/** Words with a file sent by text after them: "📎 quote.pdf: https://…" → "📎 quote.pdf". */
export const tidyFileLinks = (text: string | null | undefined) =>
  text ? text.replace(/(📎\s*[^\n]+?):\s*https?:\/\/\S+/gu, '$1') : text
