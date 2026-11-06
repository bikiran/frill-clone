// Jobs & Services settings (companies.job_settings), with defaults for an
// Australian business registered for GST. Read and written through
// resolveJobSettings so stored values are always tidy.

import { cleanDeposit, type Deposit } from '@/lib/jobs/quote-math'

export type JobSettings = {
  gst_registered: boolean
  tax_rate: number               // percent; 10 for Australian GST
  prices_include_tax: boolean    // default for new quotes
  quote_valid_days: number
  default_terms: string
  default_deposit: Deposit
  job_prefix: string
  quote_prefix: string
  /** Field staff (not owners or admins) see only jobs they're assigned to, and no prices. */
  restrict_to_assigned: boolean
  /** Completing a job asks for the customer's signature first. */
  require_signature: boolean
}

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  gst_registered: true,
  tax_rate: 10,
  prices_include_tax: false,
  quote_valid_days: 30,
  default_terms: 'This quote is valid for 30 days. Prices include GST where shown. Any extra work will be quoted before it starts.',
  default_deposit: { type: 'none', value: 0 },
  job_prefix: 'J',
  quote_prefix: 'Q',
  restrict_to_assigned: false,
  require_signature: false,
}

const prefix = (v: any, d: string) => {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  return s || d
}

export function resolveJobSettings(raw: any): JobSettings {
  const r = raw && typeof raw === 'object' ? raw : {}
  const rate = Number(r.tax_rate)
  const days = Math.round(Number(r.quote_valid_days))
  return {
    gst_registered: r.gst_registered !== false,
    tax_rate: Number.isFinite(rate) ? Math.min(100, Math.max(0, Math.round(rate * 100) / 100)) : DEFAULT_JOB_SETTINGS.tax_rate,
    prices_include_tax: r.prices_include_tax === true,
    quote_valid_days: Number.isFinite(days) ? Math.min(365, Math.max(1, days)) : DEFAULT_JOB_SETTINGS.quote_valid_days,
    default_terms: typeof r.default_terms === 'string' ? r.default_terms.slice(0, 4000) : DEFAULT_JOB_SETTINGS.default_terms,
    default_deposit: cleanDeposit(r.default_deposit),
    job_prefix: prefix(r.job_prefix, 'J'),
    quote_prefix: prefix(r.quote_prefix, 'Q'),
    restrict_to_assigned: r.restrict_to_assigned === true,
    require_signature: r.require_signature === true,
  }
}

/** The GST rate a quote uses: 0 when the business isn't registered. */
export const effectiveTaxRate = (s: JobSettings) => (s.gst_registered ? s.tax_rate : 0)
