// The pending chat_payments row for a form payment, linked to its form and
// question (V380). Kept beside the route so it can be tested with a fake db.

// A missing column (V380 not run yet): Postgres 42703, or PostgREST's schema-cache PGRST204.
export const missingColumn = (e: any) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(String(e.message || '')))

/** Inserts the pending payment with its form link, or without it before V380. */
export async function insertFormPayment(db: any, row: Record<string, unknown>, link: { form_id: string; question_id: string }) {
  const first = await db.from('chat_payments').insert({ ...row, ...link }).select('id').maybeSingle()
  if (!first.error || !missingColumn(first.error)) return first
  return db.from('chat_payments').insert(row).select('id').maybeSingle()
}

