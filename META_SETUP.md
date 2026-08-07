# Meta (Instagram + Messenger) setup — Colvy

This connects Instagram DMs and Facebook Messenger to Colvy. **One Meta app, shared across all Roxy outlets** (option A): you pass App Review once, then each outlet connects its own Page/Instagram account and you map it to that outlet in Colvy.

Nothing here works with **real customers** until App Review is approved. Before that, it works only for accounts you add as **testers/roles** in the Meta dev app — which is exactly how you test it end to end first.

---

## 1. Create the Meta app

1. Go to https://developers.facebook.com/apps → **Create App** → type **Business**.
2. Add products: **Messenger**, **Instagram** (Instagram API with Instagram Login / messaging), and **Facebook Login**.
3. In **App Settings → Basic**, note the **App ID** and **App Secret**.

## 2. Set the Colvy env vars (in Vercel)

| Variable | Value |
|---|---|
| `META_APP_ID` | your App ID |
| `META_APP_SECRET` | your App Secret |
| `META_REDIRECT_URI` | `https://colvy.com/api/meta/callback` (ROOT domain — one URL for ALL companies) |
| `META_VERIFY_TOKEN` | any random string (you'll paste the same one into the webhook config) |
| `META_ENABLE_MESSAGING_SCOPES` | *(optional)* `true` to also request the Messenger/Instagram DM scopes. Leave unset for the **Social Engagement / comments** feature, which only needs the four Page scopes. Set to `true` once the app is App-Review-approved for the DM permissions — otherwise Facebook rejects the whole login with "Invalid Scopes". |
| `META_LOGIN_CONFIG_ID` | *(optional)* the **Configuration ID** of a **Facebook Login for Business** configuration. If your app is the *Login for Business* type, set this — the OAuth dialog then takes its permissions from that dashboard configuration (the `scope` string is ignored) and a classic scope-only login otherwise fails with "This content isn't available right now". |

Redeploy after adding them.

## 3. Configure Facebook Login

- **Facebook Login → Settings → Valid OAuth Redirect URIs**: add the ROOT URL only
  `https://colvy.com/api/meta/callback`
  You add this ONCE. It works for every company subdomain — the company identity
  travels in the OAuth `state`, and the user is bounced back to their own
  subdomain after connecting. You never touch Meta's allow-list per signup.

## 4. Configure the webhook

- **Messenger → Settings → Webhooks** (and **Instagram → Webhooks**): 
  - Callback URL: `https://colvy.com/api/meta/webhook` (root domain, shared by all companies)
  - Verify token: the same string you put in `META_VERIFY_TOKEN`
  - Subscribe to fields: **messages**, **messaging_postbacks**, **message_reactions**

## 5. Request these permissions in App Review

**Page / Social-Engagement scopes** — the four the comments feature needs (requested by default):

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`
- `pages_manage_engagement`

**Messenger / Instagram DM scopes** — only when you also want the DM inbox, and only after these are approved (then set `META_ENABLE_MESSAGING_SCOPES=true`):

- `pages_messaging`
- `instagram_basic`
- `instagram_manage_messages`
- `business_management`

> ⚠️ **Do NOT request `pages_read_user_content`.** It is **deprecated** — merged into `pages_read_engagement` — and Facebook now returns **"Invalid Scopes: pages_read_user_content"**. If a **Use case** in the dashboard added it automatically, remove it there (see Troubleshooting). Our code never requests it.

Requesting a scope the app isn't approved for makes Facebook reject the **entire** login with "Invalid Scopes", so we request only the four Page scopes by default and gate the DM scopes behind `META_ENABLE_MESSAGING_SCOPES`.

App Review needs a screencast of the connect flow and a short description of how each permission is used. Expect **days to weeks**, and possible rejections — this is Meta's process, entirely on their side.

## 6. Business Verification

Meta will require **Business Verification** (business documents) before some permissions go live. Do this early — it's often the slowest step.

## 7. Requirements for each connected account

- Each Instagram account must be a **Business or Creator** account **linked to a Facebook Page**.
- The person connecting must have an admin role on the Page.

---

## Connecting outlets (after approval)

1. In Colvy: **CRM Settings → Channels → Instagram/Messenger**.
2. Click **Connect Facebook & Instagram**, log in, choose the outlet's Page (its linked IG account comes along automatically).
3. Back in Colvy, set the **Outlet** dropdown next to each connected account.
4. Repeat per outlet. Each outlet's DMs now land in that outlet's inbox.

## Notes / limits

- **24-hour window:** Meta only allows a free-form reply within 24 hours of the customer's last message. Colvy blocks a later reply with a clear message rather than a raw API error. Replying outside 24h needs an approved message tag (not yet built).
- **Token refresh:** Page tokens are long-lived (~60 days). Reconnecting an outlet refreshes them. A scheduled refresh can be added later if needed.

---

## Troubleshooting the connect flow

Two temporary/diagnostic endpoints help here (both hide the token value):

- `GET /api/meta/connect?companyId=<id>&debug=1` — returns the **exact** dialog URL and `scope` string we send to Facebook, **without** redirecting. Use it to prove our request is clean.
- `GET /api/meta/diagnostics?companyId=<id>` — after a Page is connected, reports `tokenType` (PAGE/USER), `grantedScopes`, `selectedPageId`, whether a Page token exists, and a live **feed-read probe** so a `#10` shows up with its real Graph message.

### "Invalid Scopes: pages_read_user_content"

This is a **developer-only warning from the Meta app's own configuration — not from our request.** Confirm with `?debug=1`: the `scope` will only ever contain the four Page scopes. The deprecated permission is coming from a **Use case** attached to the app.

**Fix (Meta App Dashboard):** App → **Use cases** → open the one granting Page access → **Customize → Permissions** → remove `pages_read_user_content`. Ensure the four Page scopes are present. (`pages_read_engagement` fully replaces it.)

### "This content isn't available right now"

This is the actual **blocker** on the Facebook login screen. With a clean request (verify via `?debug=1`), it's almost always one of:

1. **App in Development mode + the connecting Facebook account has no role on the app.** In Dev mode only app roles can complete login. Fix: App → **App roles → Roles** → add that account as Admin/Developer/Tester, or take the app **Live**. Quick test: connect with the **app owner's** own Facebook account first — if that works, it's a roles/mode issue.
2. **The app is *Facebook Login for Business* type** and rejects a classic `scope=` login. Fix: create a **Login for Business configuration** with the four Page permissions (no `pages_read_user_content`), copy its **Configuration ID**, and set `META_LOGIN_CONFIG_ID` in Vercel. Our dialog then uses `config_id` instead of `scope`.
3. **Redirect URI mismatch.** `Facebook Login → Settings → Valid OAuth Redirect URIs` must contain `https://colvy.com/api/meta/callback` exactly (matching `META_REDIRECT_URI`).

### Sync fails with error `#10`

`(#10)` means the read was made without the right permission or token. Colvy already reads the Page feed/comments with the stored **Page token**, so the usual cause is a token minted **before** `pages_read_engagement` was granted. **Reconnect the Page** to get a fresh token (the callback overwrites the old one — it's never reused), then re-run the sync. Confirm with `/api/meta/diagnostics` that `tokenType` is `PAGE`, `grantedScopes` includes `pages_read_engagement`, and `probes.readFeed.ok` is `true`.
