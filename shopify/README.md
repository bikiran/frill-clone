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

## Deploying (once, then after changing anything here)

You need Node 20+ and a Shopify Partner / Dev Dashboard login.

```bash
cd shopify
npm install                               # the Shopify CLI + esbuild, once
npx shopify app config link               # once: log in and pick the Colvy app (client_id is already set)
npm run deploy                            # builds, then pushes config + theme extension as a new version
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
