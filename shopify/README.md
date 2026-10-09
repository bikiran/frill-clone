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
`SHOPIFY_API_SECRET`).

## Using it on a store

In Colvy → Integrations → Shopify, a connected store shows **On your store**:

- **Chat bubble → Turn on** opens the theme editor with the Colvy chat embed switched on.
- **"Notify me" → Add to product page** opens the product template with the block added.

Press **Save** in the theme editor. The block's text, channels (text/email)
and button colour are block settings in the theme editor; the SMS wording
and auto-send switch are in Colvy → Waitlists → Settings.
