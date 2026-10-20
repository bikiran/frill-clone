// Shared by the SMS sender (lib/campaign-sender) and the email sender
// (lib/email-campaign-sender), which is kept free of the SMS sender's imports.

/**
 * The campaign changed under a start (unscheduled, stopped or deleted while
 * its recipients were being written): nothing was sent and the start was
 * undone. The worker skips it; the send route answers 409.
 */
export class CampaignStateChangedError extends Error {
  constructor(message: string) { super(message); this.name = 'CampaignStateChangedError' }
}
