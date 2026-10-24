// Who is a Colvy platform Super Admin. One list, read from SUPER_ADMIN_EMAILS
// (comma-separated) and defaulting to the founder, so adding someone later is
// a single environment setting. Server-side only: the browser never decides
// who is a Super Admin, the API routes do.

const DEFAULT_SUPER_ADMINS = ['bishalstha76@gmail.com']

export function superAdminEmails(): string[] {
  const env = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return env.length ? env : DEFAULT_SUPER_ADMINS
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase()
  return !!e && superAdminEmails().includes(e)
}
