# Colvy for Shopify — app config + theme extension

This folder is the Shopify side of Colvy: the app's configuration
(`shopify.app.toml`) and the theme app extension that puts Colvy on the
storefront. The server side lives in the main app (`app/api/shopify/*`,
`lib/shopify-*`).

| Storefront piece | What it does | Where |
| --- | --- | --- |
| **Colvy chat** (app embed) | The Colvy chat bubble on every page | `extensions/colvy-theme/blocks/chat-widget.liquid` |
| **Back in stock** (app block) | "Notify me" form under a sold-out size/variant → Colvy Waitlists → one SMS/email when it's back | `extensions/colvy-theme/blocks/back-in-stock.liquid` + `assets/colvy-bis.css`, script source `src/colvy-bis.js` |

The block's script is edited in `src/colvy-bis.js` and minified into
`extensions/colvy-theme/assets/colvy-bis.js` by `npm run build` (Shopify's
budget for app block JavaScript is 10 KB); `npm run deploy` builds first.

The "Notify me" form posts to `https://{store}/apps/colvy/waitlist`. Shopify
signs that request and forwards it to `https://colvy.com/api/shopify/proxy/waitlist`
(the `[app_proxy]` section), so no key is ever in the browser. The chat embed
gets the workspace from an app metafield Colvy writes when a store connects,
so merchants don't type anything.

## Deploying

**From GitHub (no terminal):** the "Deploy Shopify app" workflow
(`.github/workflows/shopify-deploy.yml`) deploys on every push to `main` that
changes this folder, or by hand from GitHub → Actions → Deploy Shopify app →
Run workflow. It needs one repository secret, `SHOPIFY_APP_AUTOMATION_TOKEN`:
Dev Dashboard → Colvy → Settings → App automation token → Create, then GitHub
→ Settings → Secrets and variables → Actions → New repository secret. The
token expires (1–6 months); rotate it in the Dev Dashboard and update the
secret.

**From a computer** (Node 20+, Shopify login):

```bash
cd shopify
npm install
npx shopify app config link   # once: log in and pick the Colvy app
npm run deploy                # builds, then pushes config + theme extension
```

`app deploy` makes this file the source of truth for the app's URLs, scopes,
compliance webhooks and app proxy: edit them here, not in the dashboard.
Two things stay in the Dev Dashboard: **protected customer data** access
(name, email, phone, address) and distribution.

`client_id` must match `SHOPIFY_API_KEY` in Vercel (and the app's secret is
`SHOPIFY_API_SECRET`). `shopify.app.private.toml` is the privately shared copy
(see **Private app** below).

## How a store connects

Shopify's App Store rules: installs start in Shopify (never by typing a
myshopify.com address into Colvy), and Shopify's permission screen comes
before any Colvy page. The flow (`lib/shopify-install.ts`):

1. The merchant installs Colvy from the App Store listing (or, for a
   development store, from the Dev Dashboard → Colvy → Install app).
2. Shopify opens the App URL (`/api/shopify/app`), which goes straight to
   Shopify's permission screen unless the store is already connected with
   every permission.
3. The callback saves the store to its workspace: the one that clicked
   **Install from Shopify** in Colvy (a cookie shared across colvy.com), or
   the one it was connected to before. If neither, the store waits for an
   hour while the merchant signs in or signs up to Colvy, and the Shopify page
   asks **Finish connecting {store}**.

`SHOPIFY_APP_LISTING_URL` (Vercel) is where **Install from Shopify** goes;
it defaults to `https://apps.shopify.com/colvy`.

## Private app (connect a store before App Store approval)

While the public Colvy app is in review, its listing
(`apps.shopify.com/colvy`) doesn't exist yet. A second, **privately shared**
copy of the app (Shopify calls it *custom distribution*) can connect a store in
the meantime. Shopify's limits: one private app works for **one store** (or the
stores of one Shopify Plus organisation), and custom apps **can't bill through
Shopify**, so that workspace keeps Colvy's own billing.

Once, in this order:

1. **Shopify Dev Dashboard → Create app** → name it `Colvy (private)`.
   **Distribution → Custom distribution** (this can't be changed later), enter
   the store's `….myshopify.com` address and **Generate link**. Keep the link.
2. **Config + storefront blocks.** Paste the app's **Client ID** into
   `shopify/shopify.app.private.toml` (`client_id`, editable on GitHub), and
   add a repository secret `SHOPIFY_PRIVATE_APP_AUTOMATION_TOKEN` (Dev
   Dashboard → Colvy (private) → Settings → App automation token). The
   "Deploy Shopify app" workflow then deploys the same URLs, permissions,
   webhooks, app proxy and theme extension to it. From a computer instead:
   `npm run build && npx shopify app deploy --config private`.
3. **Protected customer data**: request the same fields as the public app in
   the Dev Dashboard (Colvy (private) → API access).
4. **Vercel → Environment variables**, then redeploy:
   - `SHOPIFY_CUSTOM_API_KEY` — the private app's Client ID
   - `SHOPIFY_CUSTOM_API_SECRET` — its Client secret
   - `SHOPIFY_CUSTOM_INSTALL_URL` — the link from step 1
5. **Supabase → SQL editor**: run `migrations/COLVY_V422_SHOPIFY_PRIVATE_APP.sql`.

Then, signed in to Colvy as the super admin, open that store's workspace →
**Integrations → Shopify → Install with private link**. Shopify installs the
app, asks for permissions, and the store comes back connected to that
workspace (it shows a **Private app** badge). Opening the install link
directly works too: after signing in, the Shopify page asks **Finish connecting
{store}**.

**When the public app is approved:** install Colvy from the App Store on the
same store and open it. Shopify shows the permission screen, and the store moves
over to the public app (and to Shopify billing). Then uninstall Colvy (private)
from the store. Its uninstall notice is ignored for a store that has already
moved.

## Billing (Shopify App Pricing)

A workspace using Colvy through the Shopify app pays for Colvy through
Shopify, not Stripe (App Store requirement 1.2.1; `lib/shopify-billing.ts`).
A workspace on its trial or Free plan with no Stripe subscription becomes
Shopify-billed when it connects a store through the app; its **Billing** page
then sends people to Shopify's plan page, and Stripe checkout is refused.
Workspaces already paying with Stripe keep Stripe.

Set up once in the Partner Dashboard (Apps → Colvy → Distribution → Manage
listing → Pricing content → Manage):

- Pricing method: **Shopify App Pricing**.
- Public plans whose names contain **Free**, **Feedback**, **Inbox** and
  **Everything** (Colvy maps them by name, or by the standard prices).
- Each plan's **Welcome link**: `https://colvy.com/api/shopify/billing/return`.

Vercel env: `SHOPIFY_PARTNER_API_TOKEN` (Partner Dashboard → Settings →
Partner API clients, with **Manage apps**). `SHOPIFY_PARTNER_ORG_ID` and
`SHOPIFY_APP_GID` default to Colvy's (`5242426`, `gid://shopify/App/433393926145`).
Shopify sends no webhooks for plan changes, so Colvy re-reads the
subscription on the welcome link, when the Billing page opens, and every six
hours from the shopify-sync cron.

## Using it on a store

In Colvy → Integrations → Shopify, a connected store shows **On your store**:

- **Chat bubble → Turn on** opens the theme editor with the Colvy chat embed switched on.
- **"Notify me" → Add to product page** opens the product template with the block added.

Press **Save** in the theme editor. The block's text, channels (text/email)
and button colour are block settings in the theme editor; the SMS wording
and auto-send switch are in Colvy → Waitlists → Settings.
