import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ShopifyAuthError, verifyWebhookHmac } from '@/lib/shopify-auth'
import { saveShopifyCustomers } from '@/lib/shopify-customers'
import { saveShopifyProducts } from '@/lib/shopify-products'
import { upsertShopifyOrder } from '@/lib/shopify-orders'
import { serviceFor } from '@/lib/shopify-sync'
import { runShopifyOrderAutomations } from '@/lib/shopify-automation'
import { stageCheckout, stageFromWebhook } from '@/lib/shopify-checkouts'
import { notifyCompany } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/webhooks/shopify — every Shopify webhook for every store.
 *
 * Signed with the app secret over the RAW body (X-Shopify-Hmac-Sha256); an
 * unsigned or mis-signed request gets 401 and does nothing. The store comes from
 * X-Shopify-Shop-Domain, the event from X-Shopify-Topic.
 *
 * Store topics (subscribed per store at install): customers/create|update|delete,
 * orders/create|updated, checkouts/create|update, products/create|update|delete,
 * inventory_levels/update,
 * app/uninstalled. Compliance topics (declared in the app config, required by
 * Shopify): customers/data_request, customers/redact, shop/redact.
 *
 * Answer 200 once handled; a 5xx makes Shopify retry, so only real failures
 * (database errors) return one.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyWebhookHmac(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  const topic = (req.headers.get('x-shopify-topic') || '').toLowerCase()
  const shop = (req.headers.get('x-shopify-shop-domain') || '').toLowerCase()
  let payload: any = {}
  try { payload = JSON.parse(raw || '{}') } catch {}
  const shopDomain = shop || String(payload?.shop_domain || '').toLowerCase()
  if (!shopDomain) return NextResponse.json({ ok: true, ignored: 'no shop' })

  const db = admin()
  // An install nobody claimed in Colvy yet (lib/shopify-install) holds tokens
  // for an hour; a store redaction removes it too.
  if (topic === 'shop/redact') await db.from('shopify_pending_installs').delete().eq('shop', shopDomain)
  // Normally one workspace per store; legacy pasted-token connections could
  // have the same store in more than one, so act for each.
  const { data: integs } = await db.from('shopify_integrations').select('*').eq('store_domain', shopDomain)
  if (!integs?.length) return NextResponse.json({ ok: true, ignored: 'unknown shop' })

  try {
    for (const integ of integs) {
      const companyId = integ.company_id
      switch (topic) {
        case 'customers/create':
        case 'customers/update': {
          if (!integ.is_active) break
          await saveShopifyCustomers(db, companyId, integ.id, [payload])
          break
        }
        // Orders and products: re-read the current record rather than trusting
        // the payload, so out-of-order deliveries can't leave stale data and
        // line items carry images (webhook payloads don't).
        case 'orders/create':
        case 'orders/updated': {
          if (!integ.is_active || !payload?.id) break
          const svc = await serviceFor(db, integ)
          const order = await svc.getOrder(payload.id)
          if (order) {
            await upsertShopifyOrder(db, companyId, order, { svc })
            // Cart recovery, the order thread + customer message, attribution,
            // review request — the same automations a WooCommerce order gets.
            try { await runShopifyOrderAutomations(db, companyId, order) } catch (e: any) { console.error('[shopify webhook] order automation failed', e?.message || e) }
          }
          break
        }
        // A checkout started or changed: held, and promoted to an abandoned
        // cart only if it's still unpaid after a while (lib/shopify-checkouts).
        case 'checkouts/create':
        case 'checkouts/update': {
          if (!integ.is_active || !payload?.token) break
          await stageCheckout(db, stageFromWebhook(payload, companyId, integ.id))
          break
        }
        case 'products/create':
        case 'products/update': {
          if (!integ.is_active || !payload?.id) break
          const svc = await serviceFor(db, integ)
          const product = await svc.getProduct(payload.id)
          if (product) await saveShopifyProducts(db, svc, companyId, integ.id, [product], { restock: true })
          break
        }
        case 'products/delete': {
          if (payload?.id) await db.from('shopify_products').delete().eq('company_id', companyId).eq('shopify_product_id', Number(payload.id))
          break
        }
        case 'inventory_levels/update': {
          // Names an inventory item + location, not a product: find the product
          // (catalogue first, Shopify if it's new to us) and refresh its stock.
          if (!integ.is_active || !payload?.inventory_item_id) break
          const svc = await serviceFor(db, integ)
          const { data: known } = await db.from('shopify_products').select('shopify_product_id')
            .eq('company_id', companyId).contains('inventory_item_ids', [Number(payload.inventory_item_id)]).limit(1)
          const pid = known?.[0]?.shopify_product_id || await svc.productIdForInventoryItem(payload.inventory_item_id)
          if (!pid) break
          const product = await svc.getProduct(pid)
          if (product) await saveShopifyProducts(db, svc, companyId, integ.id, [product], { restock: true })
          break
        }
        case 'customers/delete': {
          if (payload?.id) await db.from('shopify_customers').delete().eq('company_id', companyId).eq('shopify_customer_id', Number(payload.id))
          // The Colvy contact stays — it holds the conversation history the
          // business keeps on its own account.
          break
        }
        case 'app/uninstalled': {
          await db.from('shopify_integrations').update({
            is_active: false, uninstalled_at: new Date().toISOString(),
            access_token: null, refresh_token: null, token_expires_at: null, refresh_expires_at: null,
            needs_reauth: true, last_error: 'The Colvy app was uninstalled from this Shopify store.',
            updated_at: new Date().toISOString(),
          }).eq('id', integ.id)
          try { await notifyCompany({ db, companyId, type: 'integration', message: `Colvy was uninstalled from the Shopify store ${integ.store_name || shopDomain}. Reinstall it under Integrations → Shopify to keep syncing.` }) } catch {}
          break
        }
        case 'customers/data_request': {
          // The store owner must hand the customer their data. Tell the
          // workspace what Colvy holds and where to export it.
          const who = payload?.customer?.email || payload?.customer?.phone || `Shopify customer ${payload?.customer?.id || ''}`.trim()
          try { await notifyCompany({ db, companyId, type: 'integration', message: `Shopify data request for ${who}. Colvy may hold their contact record and conversations: open Contacts, find them and export their data within 30 days.` }) } catch {}
          break
        }
        case 'customers/redact': {
          const cid = payload?.customer?.id
          if (cid) await db.from('shopify_customers').delete().eq('company_id', companyId).eq('shopify_customer_id', Number(cid))
          const who = payload?.customer?.email || payload?.customer?.phone || `Shopify customer ${cid || ''}`.trim()
          // Contacts and conversations are the business's own records and may
          // have to be kept (tax, disputes) — the business decides; we delete
          // the synced Shopify copy and ask them to review.
          try { await notifyCompany({ db, companyId, type: 'integration', message: `Shopify asked to erase ${who}. Their synced Shopify record was deleted from Colvy. Review their contact and conversations and delete them unless you must keep them.` }) } catch {}
          break
        }
        case 'shop/redact': {
          // Sent 48h after uninstall. If the store was reinstalled since, keep it.
          if (integ.is_active) break
          await db.from('shopify_customers').delete().eq('integration_id', integ.id)
          await db.from('shopify_sync_jobs').delete().eq('integration_id', integ.id)
          await db.from('shopify_integrations').delete().eq('id', integ.id)
          break
        }
        default:
          break
      }
    }
  } catch (e: any) {
    console.error('[shopify webhook]', topic, shopDomain, e?.message || e)
    // Lost access isn't fixed by retrying — and Shopify deletes a subscription
    // that keeps failing. The store is already flagged for reconnecting.
    if (e instanceof ShopifyAuthError) return NextResponse.json({ ok: false, reauth: true })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
