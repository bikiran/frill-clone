// HD audio for Colvy calls in the browser and the app.
//
// Every Twilio Voice Device Colvy creates asks for Opus first. Opus is a
// wideband ("HD") codec, so the leg between the browser or app and Twilio
// carries fuller audio; PCMU (G.711, narrowband) stays as the fallback for a
// browser or network that can't do Opus. A call that ends up on the ordinary
// phone network (a customer's mobile or landline) is narrowband on that side
// whatever we ask for: the phone network carries G.711, so the HD part is the
// Colvy side of the call (and app-to-app / browser-to-browser calls, which stay
// on Twilio end to end).
//
// The microphone keeps the browser's voice processing on, explicitly: echo
// cancellation, noise suppression and automatic gain. Browsers default these
// on for getUserMedia; saying so means a future SDK or browser default can't
// quietly switch them off.
//
// The mobile app reads the same preference from /api/twilio/token
// (`audio.codecPreferences`), so a server change reaches both.

/** Codec order for Twilio Device / ConnectOptions: Opus (wideband) first, PCMU fallback. */
export const HD_CODEC_PREFERENCES = ['opus', 'pcmu'] as const

/** Microphone processing applied to every call's getUserMedia. */
export const HD_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

/** What the token route tells the mobile app to use. */
export const MOBILE_AUDIO_CONFIG = {
  codecPreferences: [...HD_CODEC_PREFERENCES],
  echoCancellation: true,
  noiseSuppression: true,
}

/**
 * Options for `new Device(token, …)`. The SDK types the codecs as its own enum
 * (Call.Codec.Opus === 'opus'), so the plain strings are cast.
 */
export function hdDeviceOptions<T extends Record<string, unknown>>(extra?: T): { codecPreferences: any[] } & T {
  return { codecPreferences: [...HD_CODEC_PREFERENCES] as any[], ...(extra || ({} as T)) }
}

/**
 * Apply the microphone constraints to a Device. Best-effort and never throws:
 * an SDK without setAudioConstraints, or a browser that refuses one of the
 * constraints, still places the call with the browser's defaults.
 */
export function applyHdAudio(device: any): void {
  try {
    const p = device?.audio?.setAudioConstraints?.(HD_AUDIO_CONSTRAINTS)
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch { /* defaults it is */ }
}
