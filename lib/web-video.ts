// Videos phones play but browsers can't. Picture messages (MMS) usually carry
// 3GP clips (H.263 video, AMR audio): the phone's own player handles them, but
// Chrome shows a dead 0:00 player. Safe to import from client code.

const OLD_PHONE_TYPE = /^video\/(3gpp2?|3gp)\b/i
const OLD_PHONE_EXT = /\.(3gp|3gpp|3g2|3gpp2)(?:[?#]|$)/i

/** A 3GP clip, by content type or file name — browsers can't play these. */
export function isOldPhoneVideo(att: { url?: string | null; type?: string | null; kind?: string | null } | null | undefined): boolean {
  if (!att || (att.kind && att.kind !== 'video')) return false
  return OLD_PHONE_TYPE.test(String(att.type || '')) || OLD_PHONE_EXT.test(String(att.url || ''))
}

/**
 * Should an arriving MMS video be turned into an MP4? 3GP always; QuickTime too
 * (iPhones send HEVC .mov clips that only Safari plays). MP4 and WebM already
 * play everywhere and are kept as they came.
 */
export function needsWebMp4(contentType: string | null | undefined): boolean {
  const ct = String(contentType || '').toLowerCase()
  return OLD_PHONE_TYPE.test(ct) || ct.startsWith('video/quicktime')
}
