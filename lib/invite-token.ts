// Team invite links carry a random token; the team_members row keeps only its
// SHA-256, so a row that can be read doesn't hand out a working link. The server
// (/api/team/accept-invite) hashes the token from the link and compares.

const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')

export async function newInviteToken(): Promise<{ token: string; hash: string }> {
  const token = hex(crypto.getRandomValues(new Uint8Array(24)))
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return { token, hash }
}
