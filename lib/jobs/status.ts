// Job statuses and the moves allowed between them (docs/plans/jobs.md). The
// API applies every change as compare-and-set (update … where status = from),
// so two people moving the same job at once can't both win.

export const JOB_STATUSES = ['new', 'quoting', 'awaiting_approval', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const
export type JobStatus = typeof JOB_STATUSES[number]

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  new: 'New', quoting: 'Quoting', awaiting_approval: 'Awaiting approval', scheduled: 'Scheduled',
  in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}

/** ak-tag tone per status (components/ui/AdminKit). */
export const JOB_STATUS_TONE: Record<JobStatus, '' | 'blue' | 'amber' | 'violet' | 'green' | 'red'> = {
  new: 'blue', quoting: 'violet', awaiting_approval: 'amber', scheduled: 'blue', in_progress: 'amber', completed: 'green', cancelled: 'red',
}

const MOVES: Record<JobStatus, JobStatus[]> = {
  new: ['quoting', 'scheduled', 'in_progress', 'cancelled'],
  quoting: ['new', 'awaiting_approval', 'scheduled', 'cancelled'],
  awaiting_approval: ['quoting', 'scheduled', 'cancelled'],
  scheduled: ['quoting', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['scheduled', 'completed', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['new'],
}

export const isJobStatus = (s: any): s is JobStatus => (JOB_STATUSES as readonly string[]).includes(s)

/** Can a job go from `from` to `to`? Staying put is not a move. */
export function canMoveJob(from: string, to: string): boolean {
  if (!isJobStatus(from) || !isJobStatus(to) || from === to) return false
  return MOVES[from].includes(to)
}

export const nextStatuses = (from: string): JobStatus[] => (isJobStatus(from) ? MOVES[from] : [])

export const isOpenJob = (s: string) => s !== 'completed' && s !== 'cancelled'

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'withdrawn'] as const
export type QuoteStatus = typeof QUOTE_STATUSES[number]
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' }
export const QUOTE_STATUS_TONE: Record<QuoteStatus, '' | 'blue' | 'amber' | 'violet' | 'green' | 'red'> = { draft: '', sent: 'amber', accepted: 'green', declined: 'red', withdrawn: '' }

export const fmtJobNumber = (n: number | null | undefined, prefix = 'J') => (n ? `${prefix}-${n}` : '')
export const fmtQuoteNumber = (n: number | null | undefined, rev?: number | null, prefix = 'Q') => (n ? `${prefix}-${n}${rev && rev > 1 ? ` (rev ${rev})` : ''}` : '')

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const
export type InvoiceStatus = typeof INVOICE_STATUSES[number]
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' }
export const INVOICE_STATUS_TONE: Record<InvoiceStatus, '' | 'blue' | 'amber' | 'violet' | 'green' | 'red'> = { draft: '', sent: 'amber', paid: 'green', void: '' }
