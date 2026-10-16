// Server-side access to the forms tables (forms, form_responses, form_versions,
// form_notifications). Server only.
//
// V375 closes these tables to the public key: a stranger can read a published
// form and file a response into one, nothing else. So any server route that
// reads them must use the service role — never the anon key as a fallback,
// which would quietly see nothing once the migration runs — and must make the
// "published?" or "whose workspace?" decision itself, explicitly.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Service-role client for the forms tables. Throws if the key isn't configured. */
export function formsDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Forms need SUPABASE_SERVICE_ROLE_KEY on the server')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/** The columns the server routes read from a form row. */
export type FormRow = {
  id: string
  company_id: string | null
  title?: string
  questions?: unknown
  is_published?: boolean | null
  [col: string]: unknown
}

/** The form, only if it exists and is published (what a stranger may see). */
export async function publishedForm(db: SupabaseClient, formId: unknown, cols = 'id, company_id, title, questions, is_published'): Promise<FormRow | null> {
  if (!isUuid(formId)) return null
  const sel = /\bis_published\b/.test(cols) ? cols : `${cols}, is_published`
  const { data } = await db.from('forms').select(sel).eq('id', formId).maybeSingle()
  const form = data as unknown as FormRow | null
  return form && form.is_published === true ? form : null
}
