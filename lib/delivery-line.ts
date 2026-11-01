// The chat stream line for a scheduled delivery, and how to read it back.
// Same text as colvy-mobile's lib/deliveryLine.ts, so a delivery booked on
// either app reads the same in both: a leading 🚚, the day and window, then
// the address and the order on their own lines. The message's metadata
// (kind: 'delivery_scheduled', date, window, address, order_number) carries
// the same parts for anything that wants them structured.

const MARK = '🚚 Delivery scheduled'

/** "Sun, 1 Nov" for a YYYY-MM-DD date (read as that local day). */
export function deliveryDay(date: string): string {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null
  return t && !isNaN(+t) ? t.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : date
}

export function deliveryLine(d: { date: string; window?: string | null; address?: string | null; orderNumber?: string | null }): string {
  return [
    `${MARK} · ${deliveryDay(d.date)}${d.window ? ` · ${d.window}` : ''}`,
    d.address || '',
    d.orderNumber ? `Order #${d.orderNumber}` : '',
  ].filter(Boolean).join('\n')
}

export const isDeliveryLine = (text?: string | null) => /^\s*🚚\s*delivery scheduled/i.test(String(text || ''))

/** "Sun, 1 Nov · Evening", the address and "Order #126730", from a delivery message. */
export function readDelivery(text: string, meta?: any): { when: string; address: string; order: string } {
  if (meta?.kind === 'delivery_scheduled' && meta.date) {
    return {
      when: `${deliveryDay(String(meta.date))}${meta.window ? ` · ${meta.window}` : ''}`,
      address: String(meta.address || ''),
      order: meta.order_number ? `Order #${meta.order_number}` : '',
    }
  }
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  const when = (lines[0] || '').replace(/^\s*🚚\s*delivery scheduled\s*·?\s*/i, '')
  const order = lines.find(l => /^order #/i.test(l)) || ''
  const address = lines.slice(1).filter(l => l !== order).join(', ')
  return { when, address, order }
}
