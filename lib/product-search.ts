// Live product lookup for AI replies: which of the store's products the
// customer's message is about, with current price and stock. Read straight from
// the synced catalogue, never from the knowledge library, so it's always current.

const STOP = new Set(['that', 'this', 'with', 'have', 'from', 'your', 'what', 'when', 'where', 'which', 'would', 'could', 'should', 'there', 'their', 'they', 'them', 'then', 'than', 'about', 'just', 'like', 'want', 'need', 'know', 'does', 'will', 'been', 'were', 'also', 'some', 'much', 'many', 'more', 'very', 'please', 'thanks', 'thank', 'hello', 'today', 'still', 'into', 'here', 'okay', 'good', 'great', 'sure', 'yeah', 'order', 'orders', 'price', 'stock', 'available', 'have', 'buy', 'get'])

const keywords = (text: string) => Array.from(new Set(
  (String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter(w => !STOP.has(w))
)).slice(0, 8)

// Plurals and simple endings: "guppies" should find "Guppy", "plants" → "Plant".
const stemWord = (w: string) => w.replace(/ies$/, 'y').replace(/(ches|shes|xes|sses)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1')

export async function findProducts(db: any, companyId: string, text: string) {
  const words = keywords(text).map(stemWord).filter(w => w.length >= 3)
  if (!words.length) return []
  const ors = words.map(w => `name.ilike.%${w.replace(/[%,()]/g, '')}%`).join(',')
  const { data } = await db.from('woocommerce_products')
    .select('woo_product_id, name, price, sale_price, on_sale, stock_status, stock_quantity, permalink')
    .eq('company_id', companyId).or(ors).limit(80)
  const lower = String(text).toLowerCase()
  return (data || [])
    .map((p: any) => {
      const name = String(p.name || '').toLowerCase()
      let score = words.filter(w => name.includes(w)).length
      if (lower.includes(name)) score += 3          // the full product name was mentioned
      return { ...p, score }
    })
    .filter((p: any) => p.score >= (words.length > 1 ? 2 : 1) || lower.includes(String(p.name || '').toLowerCase()))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
}

