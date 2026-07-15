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

- `pages_show_list`
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_manage_messages`
- `business_management`

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
