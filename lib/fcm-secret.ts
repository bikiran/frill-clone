import crypto from 'crypto'

// Inspect the Firebase credential Twilio pushes mobile call invites with
// (TWILIO_FCM_SECRET). Used to (a) stamp a stable fingerprint into the Twilio
// Push Credential's FriendlyName, so a changed or corrected secret is detected
// and the credential rebuilt, and (b) surface the credential's Firebase project
// and kind in the voice diagnostic. Never returns the secret itself — only a
// short, one-way hash.
export function inspectFcmSecret(raw: string | null | undefined): {
  present: boolean
  fingerprint: string | null
  projectId: string | null
  kind: 'v1' | 'legacy' | 'unknown'
} {
  const secret = (raw || '').trim()
  if (!secret) return { present: false, fingerprint: null, projectId: null, kind: 'unknown' }

  // A base64-wrapped JSON survives env vars byte-for-byte — decode before
  // inspecting so the same credential fingerprints identically either way.
  let json = secret
  if (!json.startsWith('{')) {
    try { const d = Buffer.from(secret, 'base64').toString('utf8').trim(); if (d.startsWith('{')) json = d } catch {}
  }
  const canonical = json.startsWith('{') ? json : secret
  const fingerprint = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 10)

  if (json.startsWith('{')) {
    try {
      const parsed = JSON.parse(json)
      if (parsed.type === 'service_account' || parsed.project_id) {
        return { present: true, fingerprint, projectId: parsed.project_id || null, kind: 'v1' }
      }
    } catch {}
    return { present: true, fingerprint, projectId: null, kind: 'unknown' }
  }
  // A bare non-JSON string is a legacy FCM server key — Google shut these down.
  return { present: true, fingerprint, projectId: null, kind: 'legacy' }
}
