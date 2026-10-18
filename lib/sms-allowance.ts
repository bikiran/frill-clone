// The monthly SMS allowance as the editor and the server both see it. No
// database access, so the campaign editor can import it.

export interface SmsAllowanceSummary {
  /** The plan includes SMS at all. */
  entitled: boolean
  unlimited: boolean
  /** null when unlimited. */
  limit: number | null
  used: number
  /** null when unlimited. */
  remaining: number | null
}

/**
 * Can this many parts go out this month? The words are the ones the editor
 * and the server both show, so the block reads the same wherever it's hit.
 */
export function allowanceProblem(a: SmsAllowanceSummary, partsNeeded: number): string | null {
  if (!a.entitled) return 'SMS isn\u2019t included in this plan. Upgrade to the Inbox or Everything plan to send text messages.'
  if (a.unlimited) return null
  const left = a.remaining ?? 0
  if (partsNeeded > left) {
    return `This campaign needs ${partsNeeded.toLocaleString('en-AU')} texts; you have ${left.toLocaleString('en-AU')} left this month.`
  }
  return null
}
