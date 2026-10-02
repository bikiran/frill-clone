// Best-effort audit of platform super-admin actions. Never throws — an audit
// write must never break the action it records. Requires super_admin_audit
// (migrations/COLVY_V319_SUPER_ADMIN_AUDIT.sql); silently no-ops if absent.

export async function logSuperAdminAudit(db: any, e: {
  adminId?: string | null
  adminEmail?: string | null
  companyId?: string | null
  action: string
  summary?: string | null
  detail?: any
}): Promise<void> {
  try {
    await db.from('super_admin_audit').insert({
      admin_id: e.adminId || null,
      admin_email: e.adminEmail || null,
      company_id: e.companyId || null,
      action: e.action,
      summary: e.summary || null,
      detail: e.detail ?? null,
    })
  } catch { /* table missing or write failed — ignore */ }
}
