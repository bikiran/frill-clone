// Referral program helpers (server-side; pass a service-role Supabase client).

export const REFERRAL_CREDIT_CENTS = 10000   // $100
export const REFERRAL_CURRENCY = 'aud'

// A short, unambiguous code (no 0/O/1/I) for a company's share link.
function randomCode(len = 7): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

// Return the company's referral code, generating + persisting one if missing.
// Retries on the (rare) unique collision.
export async function ensureReferralCode(db: any, company: { id: string; referral_code?: string | null }): Promise<string | null> {
  if (company.referral_code) return company.referral_code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const { data, error } = await db.from('companies')
      .update({ referral_code: code }).eq('id', company.id).is('referral_code', null).select('referral_code').maybeSingle()
    if (!error && data?.referral_code) return data.referral_code
    // Someone set it concurrently, or a collision — re-read and/or retry.
    const { data: fresh } = await db.from('companies').select('referral_code').eq('id', company.id).maybeSingle()
    if (fresh?.referral_code) return fresh.referral_code
    if (error && !/duplicate|unique/i.test(error.message || '')) return null
  }
  return null
}

// Total Colvy account credit for a company, in cents (sum of the ledger).
export async function creditBalanceCents(db: any, companyId: string): Promise<number> {
  try {
    const { data } = await db.from('account_credits').select('amount_cents').eq('company_id', companyId)
    return (data || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0)
  } catch { return 0 }
}
