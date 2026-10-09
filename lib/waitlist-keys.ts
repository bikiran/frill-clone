// Which catalogue item a waitlist entry is for, as one key — shared by the
// Waitlists page (grouping) and /api/waitlist (the stock map it returns).
// WooCommerce: the product/variation id as it always was. Shopify: s<variant>,
// or sp<product> for "any option". Free-text items have none.
export function waitlistItemKey(e: any): string | null {
  if (e?.woo_product_id) return String(e.woo_product_id)
  if (e?.shopify_variant_id) return `s${e.shopify_variant_id}`
  if (e?.shopify_product_id) return `sp${e.shopify_product_id}`
  return null
}
