# Colvy Jobs & Services — technical plan

This plan covers removalists, cleaners, electricians, plumbers and other trades. Jobs and quotes are built on the existing Contacts, Inbox, Bookings, Forms, Calendar, Tasks, Gallery, Payments and audit systems. **Phase 1 (quotes and jobs) is built in this change.** Phases 2–5 come after review.

---

## Reuse map

| Need | Existing piece |
|---|---|
| Tenancy and auth | `requireCompanyAccess` (`lib/company-access.ts`). Service-role routes filter `company_id`. |
| Permissions | `PERMISSION_SUITES` (`lib/permissions.ts`) plus `canUseFeature`. Jobs adds a `jobs` key (`restrictedDefault:false`). **Enforced on the server** in every jobs route (`lib/jobs/access.ts`), not only in the nav. |
| Navigation | `SECTIONS` in `app/admin/layout.tsx` plus `canUseNavItem`. A module predicate (`lib/modules.ts`) shows Jobs only to businesses that use it. |
| Business type | `companies.industry`. Jobs is on by default for *Trades & Home Services* and *Logistics* (removalists), and can be switched on or off by anyone (`companies.modules.jobs`). |
| Customers | `contacts`. Conversions take the contact from the conversation, booking or form. New customers are matched by email, then phone (the same rules as bookings, `ensureContact`). |
| Conversations | Created from a conversation with `conversation_id` kept. Quotes are sent by SMS/email into that thread (`/api/telnyx/sms/send`, `/api/email/reply`). |
| Bookings | Created from a booking (`booking_id`), which copies the time, address, service and customer. |
| Forms | Created from a form response (`form_response_id`); answers become the job description. |
| Payments | Deposits use `chat_payments` + `createChatCheckoutSession(kind:'quote_deposit')`. They're confirmed only by the Stripe webhook, or by the server asking Stripe for the session. Never by the customer landing on the return page. |
| Numbering | Per-company counter function (`colvy_create_ticket` pattern): J-1001, Q-1001. |
| GST | Australian GST at 10% by default, prices including or excluding GST. Configurable rate and "not registered for GST". |
| Audit | `audit()` → `activity_logs` (new types `job_*`, `quote_*`), plus a per-job activity timeline (`job_events`). |
| Outbound events | `emitIntegrationEvent` (`job.created`, `quote.sent`, `quote.accepted`, `quote.declined`, `quote.deposit_paid`) for Slack, Zapier and webhooks. |
| UI kit | `AdminKit` (pages, panels, pills, chips, tags), `SheetKit` (side sheets), `DateTimeField`. |

## Database (migration `COLVY_V427_JOBS.sql`)

- `companies.modules jsonb` — per-business module switches (`{ jobs, restaurant }`).
- `companies.job_settings jsonb` — GST registration, rate, prices incl./excl. GST, quote validity days, default terms, default deposit, job/quote prefixes.
- `job_counters` (`company_id` pk, `last_job`, `last_quote`) and `colvy_next_job_number(company, kind)`, which allocates numbers atomically.
- `jobs`:
  - Identity, status and source: number, title, description, status, source (`manual · conversation · booking · form`).
  - Links: `contact_id`, `conversation_id`, `booking_id`, `form_response_id`.
  - Scheduling and value: address, scheduled start/end, `accepted_quote_id`, `value_cents`.
  - Industry fields: `fields jsonb` (empty until Phase 3).
  - Housekeeping: `sort_order`, `create_key`, cancel reason, created by, timestamps.
  - Guards:
    - unique `(company_id, number)`;
    - unique `(company_id, create_key)`, so a double-click can't create two jobs;
    - unique `(company_id, booking_id)` and `(company_id, form_response_id)`, so one booking or form response becomes one job.
- `job_quotes`:
  - number + revision, status (`draft · sent · accepted · declined · withdrawn`), title, intro, terms, validity date.
  - `items jsonb` (validated) and discount.
  - GST mode and rate, with computed subtotal / discount / GST / total in integer cents.
  - Deposit type, value and amount; `deposit_status` (`none · requested · paid · refunded`); `deposit_payment_id`.
  - Public token, sent / viewed / decided timestamps and the decider's name, note, IP and user agent.
- `job_price_items` — the service price list (labour, material, travel, fee, other; unit; price; GST applies).
- `job_quote_templates` — reusable quotes (title, intro, terms, items, deposit).
- `job_events` — the activity timeline: actor type (staff / customer / system), actor, summary, data.
- RPC `colvy_quote_decide(token, decision, name, note, ip, ua, actor)`:
  - locks the quote row and only accepts while it's `sent` and not expired;
  - updates the job (accepted quote, value, status → Scheduled);
  - withdraws sibling quotes;
  - logs the event.
  - All in one transaction, so a double accept can't happen.

All tables are server-only (RLS on, no anon/authenticated grants), so every read and write goes through API routes that check the `jobs` permission.

## Status rules (`lib/jobs/status.ts`)

`New → Quoting → Awaiting approval → Scheduled → In progress → Completed`, plus `Cancelled` from any open state. Allowed moves:

| From | To |
|---|---|
| New | Quoting, Scheduled, In progress, Cancelled |
| Quoting | New, Awaiting approval, Scheduled, Cancelled |
| Awaiting approval | Quoting, Scheduled, Cancelled |
| Scheduled | Quoting, In progress, Completed, Cancelled |
| In progress | Scheduled, Completed, Cancelled |
| Completed | In progress (reopen) |
| Cancelled | New (reopen) |

Some changes happen automatically:
- sending a quote → Awaiting approval;
- accepting → Scheduled;
- withdrawing the last sent quote → Quoting.

Every change is compare-and-set (`update … where status = <expected>`), so two people dragging the same card can't both win.

## Quote maths (`lib/jobs/quote-math.ts`, pure, tested)

1. Line total = round(qty × unit price), in integer cents.
2. The quote discount (fixed, or % of the gross) is shared between GST and GST-free lines in proportion to their value.
3. GST:
   - prices excl. GST: GST = round(taxable × rate);
   - prices incl. GST: GST = round(taxable × rate ÷ (100 + rate)), so $110 incl. contains $10 GST;
   - not GST registered: GST is 0.
4. Deposit is a fixed amount (capped at the total) or a % of the total.

## UI

- **Jobs** (rail section, briefcase glyph):
  - List, Board (Kanban, drag between columns with mouse or touch, plus a status menu for keyboard users) and Calendar (month view in business time).
  - Search, status chips and "New job".
- **Job page:**
  - status control, details (description, address, schedule);
  - links to customer, conversation, booking and form;
  - quotes list, activity timeline and notes.
- **Quote editor:**
  - line items (labour, material, travel, fee, other), add from the price list, apply a template, discount;
  - GST incl./excl., deposit, validity and terms, with a live totals card;
  - Send by SMS, email or link. Also: revise, withdraw, mark accepted/declined (phone acceptance), request deposit, save as template.
- **Jobs settings:** module switch, GST and numbering, default terms and validity, price list, templates.
- **Public quote page `/q/<token>`:**
  - business branding, items, GST breakdown, terms;
  - accept (typed name + agreement) or decline (optional reason);
  - deposit payment;
  - printable.
- **Create job** from: the Inbox "More actions" menu, a booking's ⋯ menu and the form response drawer.

## Later phases (not built yet)

- **Phase 2:**
  - assignees and staff conflicts, using `calendar_events` mirror rows (they already block booking slots);
  - checklists, before/after photos (`attachments` + Gallery), signatures;
  - start/pause/complete with time tracking, staff-only views, change notifications.
- **Phase 3:** industry templates (removalist, cleaning, trades), validated by per-template schemas stored in `jobs.fields`.
- **Phase 4:** invoices (from a job or accepted quote) with deposits, partials and balances; customer portal; PDFs; payment reminders; no double-counting (payments are the source of truth).
- **Phase 5:** automation templates (quote reminder, on-the-way, completed, invoice reminder, review, repeat service) and reports (conversion, completed jobs, outstanding payments, utilisation, recorded revenue).

## Risks

- **Stripe webhook:** the new `quote_deposit` branch sits **before** the connected-account early exit; `reconcilePayments` gets the same branch.
- **Migrations not yet run:** routes detect the missing tables and return `setupNeeded`, with a hint to run V427.
- **Navigation:** the Jobs section is hidden unless the module is on, so other businesses see no change.
- **Mobile app:** the Jobs screens come later. The `jobs` permission key is mirrored when they do.
