# Colvy for Restaurants — implementation plan

Status: **plan for review. No restaurant code has been written.**

This plan builds restaurant reservations into Colvy by extending Bookings, Contacts, Inbox, Calls, Payments and Reviews. It doesn't create a new app or a second booking engine.

---

## 1. Existing functionality to reuse

| Need | What exists today | How it's reused |
|---|---|---|
| Reservations | **Bookings** (`lib/booking.ts`, `bookings` + `booking_services`, V323/V324/V388/V400). Statuses `pending · confirmed · cancelled · expired · completed · no_show`. `seats` column; `booking_services.capacity`. Public flow `app/book/[slug]`, manage page `app/booking/[token]`. | A reservation **is a booking row** of a new service kind `reservation`. Party size goes in `seats`; special requests go in `notes`. Manage, cancel and reschedule links already work. |
| Atomic availability | `claim_booking_slot()` RPC: advisory lock per (company, staff), re-check, insert. Pending hold → confirm. | New `claim_reservation()` RPC built the same way: lock per company and service, check covers and tables, insert. A table exclusion constraint is the last line of defence. |
| Slot engine | `computeSlots()` in `lib/booking-time.ts`. Pure, time-zone aware (`zonedToUtc`, `dateInTz`). Opening hours, closed dates, notice, max days ahead. | Reused for the time grid. A reservation-specific capacity check is layered on top: covers per interval, then table fit. |
| Time zone | `booking_settings.timezone` (default Australia/Melbourne). | The same zone drives reservations, reminders and analytics. |
| Deposits | `chat_payments` + `createChatCheckoutSession(kind:'booking_payment')`. The Stripe webhook branch and `settleBookingPayment()` confirm the booking. The return page verifies with Stripe, never on redirect alone. Auto-refund on a lost slot. `policyFor()` sets cancel windows. | Deposit **rules** (party size, days and periods; fixed or per person) decide `amount_due`. Payment, webhook, refund and policy code is reused unchanged. |
| Confirmations, reminders, no-show, review | `customerMessage()` (SMS + email with .ics). `runBookingSweep()` (cron every 10 min): 24 h and 2 h reminders, auto-complete, `review_requests` row, rebook nudge. SMS replies "C"/"R". | Templates gain restaurant wording (party size, table). The sweep handles reservations through the same claims (`update … where col is null`). |
| Contacts / Guest CRM | `contacts` + consent fields. `ensureContact()` (email, then last 9 digits of phone). Merge tool `/api/contacts/duplicates`. Contact timeline already has a `bookings` group and `nextBooking`. | Guests are contacts. Stats are **computed from bookings**, not copied. Guest profile fields are added to contacts. |
| Inbox side panel | `ContactPanelBody.tsx` "Settings for this customer" rows; `+ Action` menu already has `booking`. | New "Reservations" row: upcoming visit, history and no-shows, plus a "Reserve a table" action. |
| Missed calls | `queueMissedCallText` / `sendMissedCallText` (`lib/missed-call-text.ts`). Atomic per-number claim table `missed_call_texts`, opt-out, landline and spam checks, `when: always · after_hours`. | Add a `{booking_link}` placeholder and a restaurant default message. Make the 12 h cooldown configurable. The call sites don't change. |
| SMS / email | `/api/telnyx/sms/send` (opt-out, credits, threading), `deliverAutomatedMessage()` (sending hours, fallback), `sendCustomerEmail()`. | Every restaurant message goes through these, so consent and credits stay consistent. |
| Reviews | `review_requests` queue + `/api/reviews/dispatch`. Settings, suppression and sentiment checks. Bookings already queue one on completion. | Reused unchanged, triggered when a reservation completes. |
| Campaigns | `resolveAudience()` with consent checks; one-off broadcasts; `lapsed` audience (store data only). | Birthday and inactive-guest audiences are added as new audience types based on reservations, sent through the existing campaign sender. |
| Embed | `EmbedDialog.tsx` iframe + `colvy-booking-height` postMessage; widget "Book" tab. | A `reserve.js` script injects the same iframe with auto-height. A hosted page lives at `/reserve/<slug>`. |
| Permissions / nav / settings / audit | `PERMISSION_SUITES`, `canUseNavItem` + `storeAllowsPage` pattern, jsonb settings with `resolveX()`, `audit()` → `activity_logs`. | New `reservations` permission, a module predicate in the nav, `restaurant_settings` jsonb, and new audit types. |

**Gaps found in the existing code:**
- Party size is hard-coded to `seats: 1` (`lib/booking.ts:566`, `:1119`).
- There are no table resources. The claim function checks only `bookings` and locks per staff member.
- Public booking has no Turnstile, only an in-memory rate limit.
- `ensureContact` / `ensureConversation` aren't exported.
- Contact merge doesn't move `bookings`.
- `PATCH /api/bookings {cancel, refund:true}` refunds without `guardRefund` (no role check or refund PIN).
- `/pay/<id>` re-mints a Stripe session without `kind`/metadata.
- The admin calendar uses browser time, not business time.

These are fixed as part of the phases below; the first four are needed for reservations.

---

## 2. Database changes (migrations V4xx, idempotent, safe to re-run)

**Phase 1**
- `booking_services.kind` gains `'reservation'`. One reservation "service" per restaurant (or per outlet) holds duration, interval and party limits.
- `bookings`:
  - add `seating_pref text` (`any · indoor · outdoor · bar`), `internal_notes text`, `area_id uuid null`;
  - `source` gains `phone · sms · manual · integration`;
  - status gains `'seated'`, so the list becomes `pending · confirmed · seated · completed · cancelled · no_show` (`expired` stays for lapsed holds);
  - `seats` becomes the party size;
  - index `(company_id, service_id, starts_at) where status in ('pending','confirmed','seated')`.
- `companies.restaurant_settings jsonb`:
  - operating hours (or "use booking hours") and holiday hours;
  - interval, default dining duration, durations by party size;
  - party min and max, max covers per interval, advance window, min notice;
  - cancellation rules, deposit rules, notifications, widget branding, marketing defaults.
- `companies.modules jsonb` (`{ restaurant: bool, jobs: bool }`), shared with Jobs.
- `INDUSTRIES` gains `'Restaurant & Hospitality'`. Google `restaurant/cafe/bar/*_restaurant` maps to it for new sign-ups.
- `contacts` add `birthday date null`, `guest_profile jsonb` (`{ vip, seating_pref, notes, allergies }`).
- RPC `claim_reservation(p_company, p_service, p_starts, p_ends, p_party, p_max_covers, p_row jsonb, p_exclude)`, `SECURITY DEFINER`, service role only:
  - takes an advisory lock on (company, service);
  - sums `seats` overlapping the window;
  - checks max covers;
  - inserts or moves the booking.

**Phase 2**
- `restaurant_areas` (`id, company_id, location_id, name, sort, active`).
- `restaurant_tables` (`id, company_id, area_id, label, min_party, max_party, x, y, w, h, shape, rotation, combinable, active, out_of_service_until`).
- `restaurant_table_combos` (`id, company_id, name, table_ids uuid[], min_party, max_party`).
- `reservation_tables` (`booking_id, table_id, company_id, busy tstzrange, active`), protected by:
  `EXCLUDE USING gist (table_id WITH =, busy WITH &&) WHERE (active)`.
  This needs the `btree_gist` extension, which Supabase supports at no cost. A table, or any table inside a combo, can never be double-assigned, so combined tables aren't counted twice.
- `table_status_events` (`table_id, status: seated · cleared · unavailable, at, by`) for live floor state.
- `claim_reservation` gains table selection: it tries the smallest single table that fits, then combos, all inside the same transaction.

**Phase 3**
- `guest_message_log` (`company_id, contact_id, kind: birthday · inactive · noshow_followup, sent_at`, unique per kind per period) to enforce frequency limits.
- POS link: `reservation_sales` (`booking_id, source, external_id, amount_cents`, unique on `(source, external_id)`) for attributed revenue from Prexty / Woo / recorded sales.

All new tables follow the V412 conventions: server-only writes, and staff read only where the browser needs it. Every row is keyed by `company_id`.

---

## 3. Navigation and UI

These show only when `modules.restaurant` is on. They default to on for "Restaurant & Hospitality", and are offered by a banner to "Food & Drink". Existing navigation stays as it is.

- **Reservations** (new rail section, glyph "plate"):
  - Today (timeline by service period, with covers and seated / due / late counts);
  - Upcoming;
  - Calendar (day and week grid in business time);
  - List.
  - "New reservation" opens a side sheet: name and phone lookup, party, time picker from the live slot API, seating, table, notes.
  - Compact cards with a status pill. Actions: Confirm · Seat · Complete · No-show · Move · Cancel.
- **Tables & Floor Plan:**
  - area tabs, a canvas with draggable tables (pointer events, so it works with mouse and touch), and a snap grid;
  - table colours show available, reserved, occupied (seated) and unavailable;
  - tap a table to seat, clear, mark unavailable, or assign the selected reservation;
  - an edit mode adds, renames or resizes tables and sets combos.
- **Guests:** the Contacts list filtered to guests (anyone with a reservation), with columns for visits, no-shows, last visit, VIP. A guest opens the existing customer profile with a Reservations tab.
- **Restaurant Settings** (in the Settings menu): hours and holidays · reservations (interval, duration, party limits, advance window, max covers) · cancellation and deposits · notifications and automations · booking widget (logo, colours, rules, message, embed code) · guest marketing.
- **Inbox side panel:** "Reservations" row (next visit, history) and "Reserve a table" action.
- **Mobile app:** a Reservations screen (Today list + actions) behind the same permission, in Phase 1b.

Everything uses AdminKit, SheetKit and the existing pill and status components. There's no new visual identity.

---

## 4. API changes

- `GET /api/reservations?op=today|range|slots`, `POST` (manual create), `PATCH {action: confirm|seat|complete|no_show|cancel|move|assign_table|update}`. They reuse `lib/booking.ts` internals: `confirmBooking`, `cancelBooking`, `rescheduleBooking`, `refundBooking` behind `guardRefund`.
- `GET/PATCH /api/restaurant/settings` (`resolveRestaurantSettings`).
- `GET/POST/PATCH/DELETE /api/restaurant/floor` (areas, tables, combos, positions), Phase 2.
- `POST /api/restaurant/tables/status` (seat, clear, unavailable), Phase 2.
- Public: `GET /api/reserve?op=page|slots&slug&date&party`, `POST /api/reserve` (Turnstile, honeypot, rate limit, consent text) → `claim_reservation` → deposit checkout or confirm.
- Stripe webhook: reuse `booking_payment`. Fix `/pay/[id]` re-mint to carry `kind` and metadata.
- `lib/missed-call-text.ts`: `{booking_link}` placeholder plus configurable cooldown.
- Integration events: `reservation.created · confirmed · seated · completed · cancelled · no_show`.
- Server-side permission checks (`reservations`), not only the client nav.

---

## 5. Migration and compatibility risks

1. **New `seated` status on a shared table.** Code that whitelists statuses (sweep, lists, calendar mirror, waitlist freed-slot logic, `loadBusy`) must treat `seated` as live. Mitigation: grep and update every `status in (...)` / `.in('status', …)` in the same PR, with tests.
2. **Party size > 1 in `seats`.** Group services already sum seats. Reservations use their own claim function, so existing appointments are unaffected.
3. **Two claim paths.** Existing appointment bookings keep `claim_booking_slot`; reservations use `claim_reservation`. They never share a service, so they can't interfere.
4. **Exclusion constraint** needs `btree_gist`. The migration checks for it and stops with a clear message if it's missing.
5. **Time zone.** The admin calendar uses browser time. Reservation views compute in business time from day one; the calendar fix is listed for the same phase.
6. **Contact merge.** Add `bookings` and `reservation_tables` to the merge table list, which also fixes the existing gap for bookings.
7. **Refund permission.** Putting booking refunds behind `guardRefund` changes behaviour for staff who could refund before. This is intentional and listed in the release notes.
8. **Rollout.** Off by default except for the new industry. Migrations are additive, so rollback is turning the module off.

---

## 6. Implementation sequence

- **Phase 1 — MVP**
  1. Migration (kind, columns, modules, restaurant_settings, `claim_reservation`).
  2. `lib/restaurant/` (settings resolver, availability with covers, party durations).
  3. Reservations API and dashboard (Today / Upcoming / Calendar / List, manual create, statuses).
  4. Public reservation page, `reserve.js` embed and Turnstile.
  5. Guest stats on the contact profile and Inbox panel.
  6. Confirmation and reminder templates through the existing sweep.
  7. Tests: availability, overlapping holds, concurrent claims, cancellation, permissions, tenancy.
- **Phase 2 — Operations**
  1. Areas, tables and combos tables plus the exclusion constraint.
  2. Floor plan editor and live view.
  3. Table-aware availability and assignment.
  4. Deposit rules.
  5. No-show tools.
  6. Missed-call recovery.
- **Phase 3 — Retention and analytics**
  1. Analytics dashboard and CSV export. Actual revenue comes only from payments and POS; estimates are labelled.
  2. Review automation tuning.
  3. Birthday and inactive-guest campaigns with frequency limits.
  4. POS attribution architecture.

Each phase ships behind the module flag and is tested before the next one starts.

## 7. Estimated complexity

| Phase | Scope | Size |
|---|---|---|
| 1 | Reservations on Bookings, dashboard, public widget, guest stats, confirmations and reminders | **Large**: about 2,500–3,500 lines, 1 migration, the riskiest part being concurrency |
| 2 | Floor plan editor, table-aware availability, combos, deposits rules, missed-call recovery | **Extra large**: the floor plan UI plus constraint-based allocation |
| 3 | Analytics, review/birthday/inactive automations, POS attribution | **Medium** |

**Recommendation:** approve Phase 1 first. Most of its risk is in `claim_reservation` and the `seated` status change, so those get the most tests.

## 8. Phase 1 — as built

Shipped behind the `restaurant` module (on by default for **Restaurant & Hospitality**, switchable in Business → Features and in Reservation Settings). Migration: `migrations/COLVY_V429_RESTAURANT_RESERVATIONS.sql`.

- **Where reservations live.** One `booking_services` row per restaurant with `kind = 'reservation'` ("Table reservation"), made on first use and kept in step with the settings. Each reservation is a `bookings` row on it: party size in `seats`, "Table for N" as `service_name`, plus `seating_pref`, `occasion`, `internal_notes` and `seated_at`.
- **Seated is not a new status.** The plan suggested a `seated` status; instead a seated table stays `confirmed` with `seated_at` set. Every existing query that reads `confirmed` (reminders, auto-complete, Calendar, reports) keeps working unchanged, and there is no status migration to get wrong. The day sheet shows Booked / Arriving soon / Late / Seated from the times.
- **Capacity by covers** (tables are Phase 2): most guests seated at once (`max_covers`) and, optionally, most guests arriving per interval (`pace_covers`). `claim_reservation()` takes a per-restaurant advisory lock and checks both before inserting or moving, so two guests can't take the last seats. `lib/restaurant/availability.ts` mirrors the same rules for the times shown. The team can book over the limit after a warning; the public page can't.
- **Kept apart from appointments.** Appointment pages, Services, the Bookings list, the waitlist, the AI tools and `claim_booking_slot` all skip the table service.
- **Messages.** Confirmations, reminders and the guest's change/cancel link reuse the booking pipeline with restaurant wording. The change window and "allow changes" come from the restaurant settings.
- **Screens.** Reservations (Day sheet with covers strips, Upcoming, Guests), a reservation sheet (seat, finish, no-show, undo, move, cancel, guest profile: VIP, allergies, birthday, notes), New reservation and Walk-in dialogs, Reservation Settings, the public page at `/reserve/<slug>` (and `<slug>.colvy.com/reserve`), an iframe embed snippet (instead of a separate `reserve.js`), and a guest row in the Inbox contact panel.
- **Spam.** Hidden field, minimum time on the page, per-visitor and per-restaurant burst limits, then Turnstile once its keys are set.
- **Tests.** `scripts/restaurant.test.mjs` (settings, durations, covers, pacing, time zones, module switch) and an end-to-end run against a mock database (concurrent claims, full times, moves, states, guest profiles, public page and spam checks, tenancy, appointments unaffected, desktop and phone screens).

Not in Phase 1: tables and floor plan, deposits, missed-call recovery and analytics (Phases 2 and 3).
