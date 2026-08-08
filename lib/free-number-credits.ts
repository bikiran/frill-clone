// Helpers for the "free number credits" a platform admin can grant a company.
// A credit is consumed when a free number is provisioned and refunded if the
// provisioning subsequently fails, so a failed attempt never costs the grant.

// Atomically consume one credit. Uses an optimistic guard (update only if the
// balance is still what we read) so two concurrent provisions can't both spend
// the same credit. Returns true if a credit was consumed, false if none were
// available (or a race lost — caller should treat as "no credit").
export async function consumeFreeCredit(db: any, companyId: string): Promise<boolean> {
  const { data: co } = await db.from('companies').select('free_number_credits').eq('id', companyId).maybeSingle()
  const balance = Number(co?.free_number_credits || 0)
  if (balance <= 0) return false
  const { data: updated } = await db.from('companies')
    .update({ free_number_credits: balance - 1 })
    .eq('id', companyId)
    .eq('free_number_credits', balance) // guard: no-op if someone else already spent it
    .select('id')
    .maybeSingle()
  return !!updated
}

// Give a consumed credit back (best effort) — used when provisioning fails after
// the credit was already spent.
export async function refundFreeCredit(db: any, companyId: string): Promise<void> {
  try {
    const { data: co } = await db.from('companies').select('free_number_credits').eq('id', companyId).maybeSingle()
    const balance = Number(co?.free_number_credits || 0)
    await db.from('companies').update({ free_number_credits: balance + 1 }).eq('id', companyId)
  } catch {}
}
