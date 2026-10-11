// Customer-safe facts about the business itself (no customer data).

import { loadBusinessHours, hoursOutlook } from '@/lib/business-hours'
import type { ActionDef, JsonSchema } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

export const getBusinessHours: ActionDef = {
  key: 'get_business_hours',
  description: 'Opening hours for each store: today, tomorrow and the next week in the business’s local time, holiday/special hours, and whether it’s open right now. Live from Google Business Profile when connected. Use this for any question about opening times.',
  input: obj({
    date: { type: 'string', description: 'Only if the customer asks about a specific day more than a week away: YYYY-MM-DD.' },
  }),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx, args) {
    const hours = await loadBusinessHours(ctx.db, ctx.companyId)
    const out = hoursOutlook(hours, { date: typeof args?.date === 'string' ? args.date : null })
    const from = [...new Set(out.places.map(p => p.from))].join(' + ') || 'nowhere'
    return {
      ok: true,
      data: out,
      summary: out.places.length ? `Hours for ${out.places.length} store${out.places.length === 1 ? '' : 's'} from ${from}` : 'No opening hours on file',
    }
  },
}
