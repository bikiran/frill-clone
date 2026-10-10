// The $5/mo "Remove Colvy branding" add-on. It's a separate Stripe
// subscription that never touches the workspace's plan: buying it switches on
// the removeBranding entitlement as a per-company override (company_entitlements),
// and cancelling it removes that override again. `brandingAddon` marks the
// override as ours, so cancelling never undoes a super-admin's own grant.

export const BRANDING_ADDON = 'branding_removal'

export async function setBrandingAddon(db: any, companyId: string, on: boolean): Promise<void> {
  if (!companyId) return
  const { data: row } = await db.from('company_entitlements').select('features, reason').eq('company_id', companyId).maybeSingle()
  const features: Record<string, any> = { ...(row?.features || {}) }
  if (on) {
    if (features.removeBranding === true && !features.brandingAddon) return  // already granted by an admin
    features.removeBranding = true
    features.brandingAddon = true
  } else {
    if (!features.brandingAddon) return  // not ours to remove
    delete features.removeBranding
    delete features.brandingAddon
  }
  const { error } = await db.from('company_entitlements').upsert({
    company_id: companyId,
    features,
    reason: row?.reason || (on ? 'Branding removal add-on' : null),
    updated_by: 'stripe',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' })
  if (error) throw new Error(error.message)
}
