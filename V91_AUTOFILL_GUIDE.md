# v91 Form Auto-Fill Integration

Automatically pre-fill customer data when WooCommerce customers submit feedback.

## How It Works

```
Customer submits feedback via widget
        ↓
Email address captured
        ↓
Colvy checks WooCommerce customers table
        ↓
If email match found:
  - Display customer info (name, spend, orders)
  - Pre-fill form fields (phone, address)
  - Show data with visual highlight
        ↓
Customer reviews/edits pre-filled data
        ↓
Submit with complete context
```

---

## Components

### `FormAutoFill.tsx`
Displays auto-filled customer info above the form.

**Props:**
```tsx
<FormAutoFill 
  email={string}           // Customer email to look up
  companyId={string}       // Company UUID
  onFieldsLoad={function}  // Callback when fields loaded
/>
```

**Features:**
- ✅ Async customer lookup (non-blocking)
- ✅ Shows customer summary card
- ✅ Displays pre-filled fields with green highlight
- ✅ Shows purchase metrics (spend, order count)
- ✅ Graceful fallback if customer not found

**What It Displays:**
```
┌─────────────────────────────────────────┐
│ ✓ Customer info pre-filled              │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ John Smith                          │ │
│ │ 💰 Total Spend: $1,250 • 📦 Orders: 5│
│ └─────────────────────────────────────┘ │
│ ┌──────────────┬──────────────┐         │
│ │ First Name:  │ John         │         │
│ │ Phone:       │ 555-1234     │         │
│ │ City:        │ San Francisco│         │
│ └──────────────┴──────────────┘         │
└─────────────────────────────────────────┘
```

---

## Integration Points

### 1. Widget Feedback Form
**File:** `app/widget/page.tsx`

**Add FormAutoFill:**
```tsx
'use client'

import { FormAutoFill } from '@/components/FormAutoFill'
import { IdeaModal } from '@/components/IdeaModal'
import { useState } from 'react'

export default function WidgetPage() {
  const [email, setEmail] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [autoFilledFields, setAutoFilledFields] = useState({})

  return (
    <>
      {/* Email input */}
      <input 
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
      />

      {/* Show auto-filled customer info if found */}
      {email && companyId && (
        <FormAutoFill 
          email={email}
          companyId={companyId}
          onFieldsLoad={(fields) => setAutoFilledFields(fields)}
        />
      )}

      {/* Form continues below... */}
    </>
  )
}
```

### 2. IdeaModal Auto-Fill
**File:** `components/IdeaModal.tsx`

**Use Auto-Filled Data:**
```tsx
import { FormAutoFill } from '@/components/FormAutoFill'

export function IdeaModal() {
  const [autoFilledFields, setAutoFilledFields] = useState([])
  
  return (
    <>
      <FormAutoFill 
        email={submitterEmail}
        companyId={companyId}
        onFieldsLoad={(fields) => {
          // Pre-fill form fields
          fields.forEach(field => {
            if (field.autofilled) {
              document.querySelector(`[name="${field.name}"]`).value = field.value
            }
          })
          setAutoFilledFields(fields)
        }}
      />
    </>
  )
}
```

### 3. Idea Creation with Auto-Fill
**File:** `app/api/widget-data/route.ts`

**Use Auto-Filled Context:**
```typescript
export async function POST(req: NextRequest) {
  const {
    title,
    description,
    submitterEmail,
    submitterName, // Auto-filled
    phone,         // Auto-filled
    address,       // Auto-filled
    companyId
  } = await req.json()

  // Store enriched idea with WooCommerce context
  const { error } = await supabase
    .from('ideas')
    .insert({
      title,
      description,
      user_id: null,
      created_by_name: submitterName || 'Anonymous',
      company_id: companyId,
      
      // Store enriched context
      submitter_email: submitterEmail,
      submitter_phone: phone,
      submitter_address: address,
      
      // ... other fields
    })
}
```

---

## Visual Flow

### Before Auto-Fill (v90)
```
📝 Feedback Form
├─ Email: [empty]
├─ Name: [empty]
├─ Phone: [empty]
├─ Message: [customer types...]
└─ Submit
```

### After Auto-Fill (v91)
```
👤 WooCommerce Customer Found!
├─ John Smith
├─ 💰 $1,250 spent • 5 orders

📝 Feedback Form
├─ Email: john@example.com
├─ Name: John Smith ✅ Pre-filled
├─ Phone: 415-555-1234 ✅ Pre-filled
├─ Message: [customer can edit...]
└─ Submit
```

---

## Behavior Details

### Email Recognition
- Lookup is **exact match** on email
- Case-insensitive
- Requires prior WooCommerce sync
- Respects company isolation (one company's customers only)

### Pre-Filled Fields
Only pre-filled if available in WooCommerce:
- ✅ First Name → auto-filled
- ✅ Last Name → auto-filled
- ✅ Phone → auto-filled
- ✅ Address → auto-filled
- ✅ City → auto-filled
- ✅ State → auto-filled
- ✅ Zip Code → auto-filled

### Customer Not Found
If email doesn't match WooCommerce:
- Component returns `null` (invisible)
- Form displays normally (empty fields)
- No error or loading state shown

### Loading Behavior
- Async lookup (non-blocking)
- Form remains usable while loading
- Max wait: 2 seconds before showing as not found

---

## Data Flow Diagram

```
┌─────────────────────┐
│   Widget Form       │
│  (user submits)     │
└──────────┬──────────┘
           │
           ├─ Email: john@example.com
           │
    ┌──────▼──────────┐
    │ FormAutoFill    │
    │  Component      │
    └──────┬──────────┘
           │
    ┌──────▼──────────────────┐
    │ GET /api/             │
    │ woocommerce/customer?  │
    │ email=...&companyId=..│
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │ Supabase Query          │
    │ woocommerce_customers   │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │ Return Customer Data:   │
    │ - name                  │
    │ - phone                 │
    │ - address               │
    │ - total_spend           │
    │ - total_orders          │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │ Display Auto-Fill Card  │
    │ + Pre-populate Form     │
    └─────────────────────────┘
```

---

## API Endpoint Used

### GET /api/woocommerce/customer
**Query Params:**
- `email` (required) — Customer email
- `companyId` (required) — Company UUID

**Response (if found):**
```json
{
  "found": true,
  "customer": {
    "id": "uuid...",
    "wooId": 12345,
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "415-555-1234",
    "address": {
      "address_1": "123 Main St",
      "address_2": "Suite 100",
      "city": "San Francisco",
      "state": "CA",
      "postcode": "94105"
    },
    "totalSpend": 1250.00,
    "totalOrders": 5,
    "averageOrderValue": 250.00,
    "lastOrderDate": "2026-07-01T...",
    "firstOrderDate": "2025-06-01T..."
  },
  "orders": [ /* order history */ ]
}
```

**Response (if not found):**
```json
{
  "data": null,
  "message": "Customer not found",
  "found": false
}
```

---

## Best Practices

### Best Practice 1: Show Summary
Always display customer value metrics:
```tsx
<p>💰 Total Spend: $${customer.totalSpend.toFixed(2)}</p>
<p>📦 Orders: {customer.totalOrders}</p>
```
This reminds team of customer importance.

### Best Practice 2: Allow Edits
Pre-filled fields should be editable:
```tsx
<input 
  defaultValue={autoFilledValue}  // Not disabled!
  onChange={handleChange}
/>
```
Customer might have moved or changed phone.

### Best Practice 3: Graceful Fallback
Non-WooCommerce customers should get normal form:
```tsx
{customer ? (
  <FormAutoFill {...props} />
) : (
  <p>No customer data found (not in WooCommerce)</p>
)}
```

### Best Practice 4: Show Visual Cues
Highlight pre-filled fields so customer notices:
```css
.autofilled {
  background: #dcfce7; /* Light green */
  border: 1px solid #86efac;
}
```

---

## Customization

### Change Visual Style
Edit `components/FormAutoFill.tsx`:
```tsx
// Change background color
background: '#dcfce7' → '#fef3c7' (yellow)

// Change highlight text
'✓ Customer info pre-filled' → 'Pre-filled from WooCommerce'
```

### Add More Fields
Extend auto-fill to include:
```tsx
// Add company field
{
  name: 'company',
  label: 'Company',
  value: customer.address?.company || '',
  placeholder: 'Your Company'
}
```

### Custom Segments
Only auto-fill for VIP customers:
```tsx
const rfmScore = SegmentationService.getRFMScore(customer)
if (rfmScore < 6) return null // Hide auto-fill for low-value
```

---

## Limitations

1. **Email Match Only**
   - Currently looks up by email exact match
   - v92 will add phone/name matching

2. **WooCommerce Only**
   - Only recognizes WooCommerce customers
   - v92 will support Shopify, BigCommerce

3. **Sync Timing**
   - Depends on webhook/scheduled sync
   - Real-time webhooks solve this

4. **No Manual Override**
   - Can't force auto-fill for non-WooCommerce
   - v92 will add admin manual entry

---

## FAQ

**Q: What if customer email isn't in WooCommerce?**  
A: FormAutoFill returns null, form shows normally.

**Q: Can I pre-fill for non-customers?**  
A: Not automatically, but you can manually fill form fields.

**Q: Does this work with webhook real-time sync?**  
A: Yes! Webhooks mean auto-fill is instant.

**Q: Can I auto-fill company/account info?**  
A: v92 feature, coming soon.

**Q: Does auto-fill track who viewed?**  
A: Currently no, but v92 will add analytics.

**Q: Can I customize which fields auto-fill?**  
A: Edit FormAutoFill component or request feature.

---

## Next Steps

1. ✅ Enable webhooks for real-time sync
2. ✅ Add FormAutoFill to widget
3. ✅ Test with WooCommerce customer email
4. ✅ Review auto-filled feedback for context
5. 🎯 Use customer data to personalize responses

---

**Questions?** Check `V91_COMPLETE_GUIDE.md` for full documentation.
