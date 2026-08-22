// Sentiment gate for automated review requests: don't ask a customer for a
// public review if their conversation shows they had a bad experience and are
// likely to leave a negative one. Fails OPEN (allows the send) when AI is
// unavailable or errors — a review-request pipeline should never silently stop
// because the classifier is down; the operator can still disable the toggle.

import { AIService } from '@/lib/ai-service'

export async function assessReviewSentiment(conversation: string): Promise<{ block: boolean; sentiment: string; reason: string }> {
  if (!process.env.ANTHROPIC_API_KEY || !conversation.trim()) {
    return { block: false, sentiment: 'unknown', reason: 'ai_unavailable' }
  }
  try {
    // A small/fast model is plenty for this classification.
    const svc = new AIService({ provider: 'claude', model: 'claude-haiku-4-5-20251001' })
    return await svc.reviewSentiment(conversation)
  } catch (e) {
    console.error('[review sentiment] classification failed, allowing send:', (e as any)?.message || e)
    return { block: false, sentiment: 'error', reason: 'error' }
  }
}
