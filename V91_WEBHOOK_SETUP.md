# v91 WooCommerce Webhooks Setup

This guide walks you through registering real-time webhooks with WooCommerce for instant customer sync.

## What Are Webhooks?

Webhooks are automated notifications. When a customer is created or an order is placed in WooCommerce, it instantly notifies Colvy. No need to wait for manual syncs.

**Without webhooks:** Colvy checks every 1 hour → 1-hour lag  
**With webhooks:** WooCommerce notifies instantly → Real-time sync

---

## Prerequisites

- ✅ WooCommerce store running (v6.0+)
- ✅ Colvy v91 deployed to your domain
- ✅ WooCommerce REST API credentials (from v90 setup)

---

## Step-by-Step Setup

### 1. Go to WooCommerce REST API Settings

In WooCommerce Admin:
```
Settings → Advanced → REST API
```

If you already created credentials in v90, skip to Step 3.

### 2. Create API Credentials (if needed)

Click **"Create an API key"**

Fill in:
- **Description:** "Colvy Webhooks"
- **User:** Select your admin account
- **Permissions:** ✅ Read (minimal, webhooks are read-only)

Copy the generated:
- **Consumer Key:** `ck_...`
- **Consumer Secret:** `cs_...`

Save these! (You'll need them in Colvy)

### 3. Add Webhooks in WooCommerce

In the same REST API screen, click **"Add webhook"**

**Create 4 webhooks** (one for each event):

#### Webhook #1: Customer Created
- **Name:** `Colvy - Customer Created`
- **Event:** `Customer created`
- **Delivery URL:** `https://YOUR_BOARD.colvy.com/api/webhooks/woocommerce`
- **Status:** ✅ Active

#### Webhook #2: Customer Updated
- **Name:** `Colvy - Customer Updated`
- **Event:** `Customer updated`
- **Delivery URL:** `https://YOUR_BOARD.colvy.com/api/webhooks/woocommerce`
- **Status:** ✅ Active

#### Webhook #3: Order Created
- **Name:** `Colvy - Order Created`
- **Event:** `Order created`
- **Delivery URL:** `https://YOUR_BOARD.colvy.com/api/webhooks/woocommerce`
- **Status:** ✅ Active

#### Webhook #4: Order Updated
- **Name:** `Colvy - Order Updated`
- **Event:** `Order updated`
- **Delivery URL:** `https://YOUR_BOARD.colvy.com/api/webhooks/woocommerce`
- **Status:** ✅ Active

Replace `YOUR_BOARD` with your actual Colvy domain (e.g., `feedback.mystore.com`).

### 4. Test Webhooks in WooCommerce

For each webhook:
1. Click the webhook name
2. Scroll to **"Webhook deliveries"**
3. Click **"Test delivery"**
4. You should see:
   - Status: `✅ Success` (green)
   - Response code: `200`

If you see red errors:
- Check your Colvy domain is correct
- Verify Colvy is deployed and running
- Check firewall/DNS settings

### 5. Verify in Colvy

**Option A: Check Sync Log**
```bash
# In Colvy admin
POST /api/woocommerce/sync?companyId=YOUR_COMPANY_ID
# Should return 200 with synced customers
```

**Option B: Create a Test Order**
1. In WooCommerce, create a fake order
2. Check Colvy's activity logs within 30 seconds
3. New order should appear in woocommerce_orders table

---

## Webhook Event Flow

```
WooCommerce Event (customer.created)
        ↓
    (HTTPS POST)
        ↓
Colvy Webhook Endpoint (/api/webhooks/woocommerce)
        ↓
WebhookService.processWebhook()
        ↓
Fetch full customer data from WooCommerce API
        ↓
Upsert into Supabase (woocommerce_customers table)
        ↓
✅ Sync complete (near real-time)
```

---

## Troubleshooting

### "Webhook Test Failed" (Red X)

**Cause 1: Wrong Domain**
- Check that `YOUR_BOARD.colvy.com` is correct
- Must be publicly accessible (not localhost)

**Cause 2: Colvy Not Running**
- Verify deployment: Visit https://YOUR_BOARD.colvy.com/
- Should see login page

**Cause 3: Firewall Blocking**
- Check if WooCommerce server can reach Colvy
- Verify no VPN/proxy issues

**Cause 4: SSL/TLS Error**
- Colvy must use HTTPS (not HTTP)
- Check SSL certificate is valid

**Fix:** After fixing issue, click "Test delivery" again.

### Webhooks Registered but Not Firing

**Check 1: Event Happened?**
- Create a NEW order/customer in WooCommerce
- Webhooks only trigger for NEW events, not past ones

**Check 2: Webhook Still Active?**
- In WooCommerce REST API, verify webhook shows **Active** ✅
- Sometimes webhooks auto-disable after repeated failures

**Check 3: Logs**
- Check Colvy activity logs: `/admin/activity`
- Should see webhook events logged

### "Company ID Header Missing" Error

This error means Colvy couldn't identify which company the webhook belongs to.

**Current Workaround:**
- The webhook handler requires an `x-company-id` header
- Contact support to add your company ID to webhook registrations

**v92 Fix:**
- Will implement automatic company ID detection

---

## Advanced: Webhook Signature Verification

**Optional Security:** Verify webhooks come from WooCommerce.

In `lib/webhook-service.ts`, uncomment signature validation:

```typescript
const signature = req.headers.get('x-wc-webhook-signature')
const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET
const isValid = webhookService.verifySignature(payload, signature, secret)
if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, 401)
```

Then add to `.env`:
```env
WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_key
```

(Find this in WooCommerce webhook details)

---

## Webhook Delivery Limits

WooCommerce enforces:
- **Timeout:** 5 seconds per delivery
- **Retry:** 5 attempts over 24 hours
- **Dead letter:** After 5 failures, marked as failed

Colvy processes webhooks instantly, so timeouts shouldn't occur.

---

## Disable Webhooks

To stop real-time sync and go back to manual syncs:

1. In WooCommerce REST API settings
2. For each Colvy webhook, click **Deactivate** or Delete
3. Colvy will stop receiving events
4. Manual **"Sync Now"** button still works

---

## FAQ

**Q: Will webhooks sync old customers?**  
A: No, webhooks only sync NEW events. Use manual "Sync Now" for historical data.

**Q: How often do webhooks fire?**  
A: Instantly when events happen (real-time). No artificial delays.

**Q: Do webhooks count against API rate limits?**  
A: No, webhooks are separate from REST API calls.

**Q: Can I register from multiple Colvy environments?**  
A: Yes, you can create multiple webhooks pointing to different Colvy URLs (dev, staging, prod).

**Q: What if WooCommerce can't reach Colvy?**  
A: WooCommerce will retry 5 times over 24 hours, then mark as failed.

---

## Next Steps

1. ✅ Register webhooks (this guide)
2. ✅ Test each webhook (Step 4)
3. ✅ Verify sync in Colvy (Step 5)
4. Visit `/admin/customers/segments` to see synced customers
5. Enable form auto-fill in widget (v91 feature)

---

**Questions?** Check `V91_COMPLETE_GUIDE.md` for full v91 documentation.
