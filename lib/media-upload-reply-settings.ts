// The upload-link auto-reply's setting (companies.inbox_settings.media_upload_reply).
// Kept apart from lib/media-upload-reply so the settings page can use it in the
// browser.

export const MEDIA_UPLOAD_REPLY_DEFAULT =
  'Thanks for sending that! Text messages shrink videos a lot, so it may look blurry on our end. For the clearest look, you can upload the original here.'

export const MEDIA_UPLOAD_REPLY_HOURS = 6

export type MediaUploadReplySettings = { enabled: boolean; photos: boolean; message: string }

/** The saved setting (companies.inbox_settings), with defaults filled in. */
export function mediaUploadReplySettings(inboxSettings: any): MediaUploadReplySettings {
  const s = inboxSettings?.media_upload_reply || {}
  const message = typeof s.message === 'string' && s.message.trim() ? s.message.trim().slice(0, 300) : MEDIA_UPLOAD_REPLY_DEFAULT
  return { enabled: s.enabled === true, photos: s.photos === true, message }
}

/** Does this text's media call for the reply? Videos always; photos only if asked. */
export function wantsUploadReply(media: { kind?: string }[] | null | undefined, s: MediaUploadReplySettings): boolean {
  if (!s.enabled || !Array.isArray(media) || !media.length) return false
  return media.some(m => m?.kind === 'video' || (s.photos && m?.kind === 'image'))
}
