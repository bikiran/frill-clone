'use client'

import { confirmDialog } from '@/components/ConfirmDialog'
import { billingUnavailableCopy } from '@/lib/billing-config'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

/**
 * The in-app message when an upgrade or add-on can't reach Stripe because
 * Colvy's billing isn't set up yet (the checkout route answered `setup: true`
 * and has already alerted the Colvy team). Offers an email to Colvy with the
 * request filled in. Never shows env var names.
 */
export async function showBillingUnavailable(opts: { what: string; workspace?: string | null; title?: string; message?: string }): Promise<void> {
  const copy = billingUnavailableCopy()
  const go = await confirmDialog({
    title: opts.title || copy.title,
    message: opts.message || copy.message,
    confirmLabel: 'Email us',
    cancelLabel: 'Close',
    tone: 'primary',
    icon: 'info',
  })
  if (!go) return
  const subject = `Please set up ${opts.what}${opts.workspace ? ` for ${opts.workspace}` : ''}`
  const body = `Hi Colvy team,\n\nI tried to ${opts.what.startsWith('the ') ? `buy ${opts.what}` : opts.what} online but upgrades aren't available yet. Please set it up for me.\n\n${opts.workspace ? `Workspace: ${opts.workspace}\n` : ''}`
  window.location.href = `${COLVY_CONTACT.mailHref}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
