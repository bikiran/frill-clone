# Marketplace listings: track Facebook Marketplace enquiries and sales in Colvy

## Why it works this way

When someone messages you about a Facebook Marketplace listing, the message
goes to the Messenger of the personal profile that posted it. Meta has no API
for personal profiles or Marketplace, so no app can read those chats, Colvy
included. Reading them some other way breaks Meta's rules and risks the
account.

So Colvy brings the buyer to you instead. Each listing gets:

- **Its own page**, at `<your-workspace>.colvy.com/item/<code>`, with the
  photos, price, condition, pick-up place and description. The page has
  **Chat now**, **Text us** and **Call** buttons, and **Buy online** when the
  listing is linked to a product in your WooCommerce or Shopify store.
- **A short code** buyers can text to your Colvy number, like `TANK4`.

A chat started on the page, or a text with the code, arrives in your inbox
with the listing attached. The conversation shows an "Asking about" card with
the listing, plus a **Sold to them** button.

## Setting it up

1. **Run the database update.** In Supabase, run
   `migrations/COLVY_V441_MARKETPLACE_LISTINGS.sql`. It's safe to run more
   than once.
2. In Colvy, go to **Marketing → Marketplace Listings → New listing**.
   - Add a title, price, photos and details, or copy them from a product in
     your store.
   - The code is suggested from the title, and you can change it.
3. Open the listing. Under **Share it**:
   - **For your listing**: paste this line into the Marketplace description.
   - **Reply when someone messages you on Marketplace**: paste this into
     Messenger when a buyer asks a question there. Links you send in a
     Messenger chat are clickable.
   - **QR**: print it on a sign if you sell in person too.
4. Answer buyers in Colvy as usual. When it sells, choose **Mark as sold** and
   pick who bought it. You can also tap **Sold to them** in their
   conversation.

Facebook sometimes hides or removes links in Marketplace listings. That's why
every listing also has a code people can text, which needs no link. Try it
with one listing first.

## What gets counted

| Number | Counted from |
|---|---|
| **Views** | Visits to the listing's page (link previews and bots aren't counted) |
| **Enquiries** | Conversations about the listing: chats from its page, texts with its code |
| **Sales** | Marked as sold; a payment link paid in the listing's conversation; a WooCommerce or Shopify order from that customer within 7 days |
| **Revenue** | The sale price, or what was paid |

A sale is only counted once. When a buyer has already paid through a Colvy
payment link and is then marked as the buyer, it still counts as one sale.

Each listing's link also appears in **Link Reports**, under "Marketplace
listing".
