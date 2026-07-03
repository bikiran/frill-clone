# v91 Customer Segmentation Dashboard

Learn how to segment your customers by value, frequency, and behavior.

## Quick Start

**Access Dashboard:**
```
https://YOUR_BOARD.colvy.com/admin/customers/segments?slug=YOUR_COMPANY
```

**What You'll See:**
1. Six pre-built segment cards (VIP, Active, At-Risk, etc.)
2. RFM analysis matrix
3. Detailed customer table when you select a segment

---

## Understanding Segments

### 1. VIP Customers
**Criteria:** Spend > $1,000 AND 3+ orders

**Best For:** 
- Exclusive early access to new features
- Priority support
- Special pricing/loyalty programs

**Example:** "Let's send VIPs a thank-you email + 10% coupon"

### 2. Active Buyers
**Criteria:** Purchased within last 30 days

**Best For:**
- Cross-sell/upsell campaigns
- Flash sales
- New product announcements

**Example:** "Email active buyers about our new collection"

### 3. At-Risk Customers
**Criteria:** No purchase in 90+ days (but has purchased before)

**Best For:**
- Win-back campaigns
- "We miss you" discounts
- Engagement surveys

**Example:** "Send at-risk customers a personalized re-engagement email"

### 4. Frequent Buyers
**Criteria:** 4+ orders per year

**Best For:**
- Loyalty rewards
- Exclusive member programs
- Early access sales

**Example:** "Frequent buyers get member-only discounts"

### 5. New Customers
**Criteria:** Single purchase in last 30 days

**Best For:**
- Onboarding series
- Product education
- First-purchase follow-up

**Example:** "Send new customers a welcome series + 20% next-purchase coupon"

### 6. High Volume Spenders
**Criteria:** Total spend > $5,000

**Best For:**
- VIP treatment
- Account management
- Custom solutions

**Example:** "High spenders get dedicated support"

---

## RFM Analysis Explained

**RFM** = Recency + Frequency + Monetary (industry standard)

### Recency (R): When Did They Last Buy?
- **3 points:** Last 30 days → Recently active
- **2 points:** 31-90 days → Moderately active
- **1 point:** 91-180 days → Slowing down
- **0 points:** 180+ days → Dormant

### Frequency (F): How Often Do They Buy?
- **3 points:** 12+ orders/year → Very frequent
- **2 points:** 4-11 orders/year → Regular
- **1 point:** 1-3 orders/year → Occasional
- **0 points:** No purchase history

### Monetary (M): How Much Do They Spend?
- **3 points:** $5,000+ → High value
- **2 points:** $1,000-$4,999 → Mid value
- **1 point:** $100-$999 → Low value
- **0 points:** <$100 → Minimal

### Total Score: 0-9

**RFM Categories:**
- **8-9:** 🏆 Champions (your best customers)
- **6-7:** ⭐ Loyal Customers (steady performers)
- **4-5:** 👤 Potential Loyalists (room to grow)
- **2-3:** ⚠️ At Risk (losing traction)
- **0-1:** ❌ Lost (haven't engaged)

---

## Dashboard Features

### Segment Cards
Each card shows:
- Segment name & description
- Number of customers in segment
- Click to filter & view customers

### RFM Matrix
Grid showing count of customers in each RFM category:
- Champions: How many best customers?
- Loyal: How many regular buyers?
- At Risk: How many to save?
- Lost: How many need reactivation?

### Customer Table
When you select a segment:
- **Name:** Customer full name
- **Email:** For contacting
- **Spend:** Total lifetime value ($)
- **Orders:** Number of purchases
- **RFM:** Their RFM score (0-9)

Click any customer row to view:
- Full contact details
- Complete order history
- Products purchased
- Days since last order
- Full profile page

---

## Common Use Cases

### Use Case 1: VIP Campaign

**Goal:** Send exclusive offer to top customers

1. Click **"VIP Customers"** card
2. See customers with 3+ orders AND >$1000 spend
3. Click each customer to review purchase history
4. Export customer emails (or copy manually)
5. Send VIP-exclusive email campaign

### Use Case 2: Win-Back Campaign

**Goal:** Re-engage customers who've gone inactive

1. Click **"At-Risk Customers"** card
2. See customers inactive 90+ days
3. Review their last purchase date
4. Send personalized "We miss you" email
5. Track responses

### Use Case 3: New Customer Onboarding

**Goal:** Welcome and educate recent buyers

1. Click **"New Customers"** card
2. See purchases from last 30 days
3. Review what they bought
4. Send onboarding email series
5. Cross-sell related products

### Use Case 4: Loyalty Program Enrollment

**Goal:** Enroll frequent buyers in program

1. Click **"Frequent Buyers"** card
2. See 4+ purchases/year
3. Contact for loyalty program signup
4. Offer exclusive member benefits

### Use Case 5: RFM Targeting

**Goal:** Tailor messaging by RFM category

1. Review RFM Matrix
2. See "Champions" count is high
3. Send thank-you message to all 8-9 score customers
4. Send reactivation offer to all 0-1 score customers

---

## Customer Profile Page

Click any customer row to open full profile:

### Header Section
- Customer name & email
- **RFM Score (0-9)** with category badge
- Key metrics: Total Spend, Order Count, Avg Order Value

### Contact Info
- Phone number (if available)
- Full address
- Customer since date
- Days since last purchase

### Products Purchased
- All product SKUs/names ever purchased
- Shows breadth of customer interests

### Order History
- Complete order list (newest first)
- Each order shows: date, total amount, status
- Status badges: completed, processing, cancelled

**Use Profile To:**
- Make informed customer support decisions
- Understand customer purchase patterns
- Identify opportunities for upsell
- Personalize communication
- Track customer lifecycle

---

## Tips & Tricks

### Tip 1: Export Segment Data
Currently table shows top 50 customers per segment.

To export all:
1. Open browser developer tools (F12)
2. Copy table data manually
3. Or use screenshot tools
4. v92 will add CSV export feature

### Tip 2: Regular Check-Ins
Segments update in real-time based on latest data.

Schedule weekly reviews:
- Monday: Check at-risk segment
- Wednesday: Review new customers
- Friday: Celebrate VIP acquisitions

### Tip 3: Custom Segmentation Ideas
Current segments are flexible. Future versions will allow:
- Custom spend ranges ($2000-$5000)
- Product-based segments (bought skis)
- Location-based segments (California customers)
- Behavior-based (abandoned cart, wishlist)

### Tip 4: Link to Feedback
In v92, you'll be able to:
- See customer's submitted feedback/ideas
- View their in-store reviews
- Check support tickets
- All in one profile

---

## Segment Counts Explained

**Why did my segment count change?**

Segments recalculate automatically based on latest data:
- New order placed → Frequency increases, RFM score changes
- 30 days pass → Active becomes inactive
- New purchase after 90 days → At-risk → Active

**Example Timeline:**
- Day 1: Customer is "Active" (purchased 15 days ago)
- Day 31: Customer moves to "Potential Loyalists" (no recent purchase)
- Day 32: Customer buys again → Back to "Active"

---

## FAQ

**Q: How often update?**  
A: Real-time as orders sync (webhooks) or hourly (scheduled sync)

**Q: Can I change segment criteria?**  
A: Not yet, v92 will add custom segment builder

**Q: How many customers can I segment?**  
A: Works great up to 100,000+ customers

**Q: What if a customer has no purchase history?**  
A: They won't appear (segments require purchase data)

**Q: Can I segment by product?**  
A: v92 feature, but profile shows products purchased now

**Q: Does it integrate with email tools?**  
A: v92 will add Mailchimp, Klaviyo, ConvertKit integrations

---

## Next Steps

1. ✅ View all segments (RFM matrix)
2. ✅ Click a segment to see customers
3. ✅ Click customer to view profile
4. ✅ Use insights for campaigns
5. 📋 Plan targeted engagement by segment

---

**Tips & Feedback?** Email support or check `V91_COMPLETE_GUIDE.md`.
