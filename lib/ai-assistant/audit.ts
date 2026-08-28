import type { SupabaseClient } from '@supabase/supabase-js'

// Record an action the Colvy AI assistant performed, for the audit trail. Only
// actions (create/modify/send) are logged — never reads. Best-effort: a failed
// audit write must never break the action it describes.
export async function logAiEvent(
  db: SupabaseClient,
  e: {
    companyId: string
    userId: string | null
    action: string
    tool: string
    entityType: string
    entityId?: string | null
    input?: any
    result?: any
  },
): Promise<void> {
  try {
    await (db as any).from('ai_assistant_events').insert({
      company_id: e.companyId,
      user_id: e.userId || null,
      action: e.action,
      tool: e.tool,
      entity_type: e.entityType,
      entity_id: e.entityId ? String(e.entityId) : null,
      input: e.input ?? {},
      result: e.result ?? {},
      performed_via: 'colvy_ai',
    })
  } catch { /* audit is best-effort */ }
}
