# Colvy Powers: team rewards and power-ups

> Serious about work. Playful about teamwork.

An optional layer, off by default, that each business switches on in **Settings → Colvy Powers**. People earn **XP** (never spent, decides the level) and **Colvy Coins** (spent on small, friendly powers) for real work. Off means the app looks and behaves exactly as before: no chip, no requests beyond one "is it on?" check, no pins, nothing in the inbox.

## What people see

- **Top-bar chip** (admin only, when on and you take part): your level ring and coins. Earning makes a coin pop under the chip and the number tick over; a level-up glows once. Click for level, streak, today's coins and shortcuts.
- **/admin/powers**: Overview (level, XP bar, coins, streak, today against the daily limit, *Say thanks*, how you earn, recent activity), Power Shop, Challenges, Leaderboard (podium, week or month, by XP / resolved / tasks / jobs / thanks; tap a person for their profile), Badges.
- **Inbox**: a teammate's Priority Pin floats a conversation to the top of *your* list for 30 minutes, tagged "📌 Jamie ×" (× unpins). Thread menu → *Pin for a teammate* / *Nudge a teammate about this*. VIP Crown and status emoji appear beside a teammate's name on their messages.
- **Small moments** (bottom-right, dismissable, never over work): a nudge, team confetti (2 seconds, no clicks blocked), a spotlight. Quiet while your Focus Shield is up.
- **Reduced motion**: same information, no movement.

## Architecture (fits the existing app; nothing existing is restructured)

| Piece | Where |
|---|---|
| Schema + money functions | `migrations/COLVY_V438_COLVY_POWERS.sql` (new tables only) |
| Rules, powers, levels, settings bounds, anti-abuse helpers | `lib/powers/config.ts` (pure) |
| Access, settings, paying/reversing, work checks, sweeps, job hook | `lib/powers/server.ts` |
| Challenges / achievements / live effects | `lib/powers/challenges.ts`, `achievements.ts`, `live.ts` |
| API | `app/api/powers/{me,check,thanks,use,dismiss,leaderboard,challenges,member,settings,adjust}` |
| Background sweep | `app/api/cron/powers` every 10 min (`vercel.json`) |
| Browser state | `lib/powers/client.ts` (one shared copy for chip, inbox, page) |
| UI | `components/powers/*`, `app/admin/powers`, `app/admin/crm-settings/powers` |

### Data

- `powers_settings`: on/off, `enabled_at` (work before it never pays), `config` JSON (rules, caps, per-power price/cooldown/daily limit, leaderboard mode, who takes part). The catalogue of powers, levels and badges lives in code; the business overrides prices and limits. (The spec's suggested `powers` and `levels` tables became code plus overrides: fewer moving parts, same control.)
- `powers_wallets`: coins (≥ 0), XP (≥ 0), streak, savers, per person per business.
- `powers_ledger`: every coin and XP movement (reward, grant, revoke, purchase, gift in/out, reversal). This is the spec's `transactions` and `xp_events` in one append-only table: a reward moves both at once, so one row keeps them consistent. A partial unique index on `(company_id, idem_key)` for live rows is the duplicate guard.
- `powers_activations`: purchases and activations in one row (powers start when bought; Streak Savers are held in the wallet).
- `powers_challenges`, `powers_challenge_progress`, `powers_user_achievements`.

### Money is done in the database, atomically

`powers_award`, `powers_buy`, `powers_gift`, `powers_reverse`, `powers_bump_progress`, `powers_leaderboard` (SECURITY DEFINER, service role only). Each locks the wallet row (`FOR UPDATE`; gifts lock both wallets in id order so they can't deadlock), checks idempotency, caps, cooldowns, daily and per-target limits and the balance, then writes the ledger and wallet together. A reversal takes back only what's there (never below zero) and frees the key so redone work can pay again. Leaderboards are summed in SQL from an index on `(company_id, day, user_id)`.

### Rewards come only from checked work

The browser never says "pay me". It says "check my recent work" (`/api/powers/check`, optionally hinting which conversation or task), and the server reads the work itself:

| Rule | Paid when (server-checked) | Key |
|---|---|---|
| Resolve +10 | Conversation closed, not spam or merged, a customer wrote, and **you** sent a real reply (≥ 3 words, not "ok/thanks") since it last paid | `resolve:<conv>:<latest customer message>`: reopen/close pays nothing; a new customer message plus a new real reply can pay again |
| Task +15 | Done, **assigned** to you; not a task you made yourself and ticked within 10 minutes | `task:<id>`; unticked or deleted → reversed |
| Job +25 | Moved to Completed (jobs routes call the hook directly), each assignee | `job:<id>:<user>`; reopened → reversed |
| Feedback +30 | A 4–5★ Google review whose text names exactly one teammate by first name | `review:<id>` |
| Thanks +10 | A teammate thanks you (max 3 a day per giver, once per pair per day) | `thanks:<from>:<to>:<day>` |
| Challenge | Its own reward, once per period | `challenge:<id>:<period>:<user>` |

Daily caps (default 150 coins / 300 XP per person, in the business's time zone) apply to rewards. The cron sweep covers work done anywhere (the phone app included) and reviews; the same keys mean the in-app check and the sweep never pay twice.

## Safety

- No real money: coins can't be bought, cashed out or moved between workspaces. Mystery Box holds looks only (ring or name colour).
- Nothing grants access: a Priority Pin is refused unless the teammate can already open the inbox; levels and badges unlock looks only.
- Essential work never needs coins.
- Focus Shield silences only Powers' own pings (nudges, confetti, spotlights). Customer messages, assignments, mentions and every other alert still arrive.
- Anything aimed at someone can be dismissed by them; targeted powers are rate-limited per person per hour; a double click uses a power once.
- Owners and admins only: settings, challenges, giving or taking back coins (a reason is required; you can't give yourself coins). Changes go to the Activity log, and coin changes appear in a log on the settings page.
- Leaderboards show names, levels and counts only; a business can show team totals only, or switch them off.

## Compatibility risks (and what was done)

1. **New tables only.** No existing table, column, trigger or RLS policy changes. Until V438 runs, the API answers "off" (admins see a setup hint) and the jobs hook is a no-op.
2. **No database triggers on core tables.** Closing conversations and ticking tasks are browser-side writes today; triggers there would have added risk to every write. Rewards come from server checks (the in-app check plus the 10-minute sweep) instead.
3. **Inbox list.** Priority Pins join the existing per-user pins in the sort (teammate pins first, then mine). With Powers off the set is empty and the order is unchanged.
4. **Task timestamps are written by the browser,** so the 10-minute "trivial task" rule is a deterrent. The daily caps are the hard limit.
5. **Caching.** Settings are cached for 15 s per server instance, so turning it off takes up to 15 s everywhere. Saving always reads fresh, so the "counts from" time can't be skipped by a stale cache.
6. **Realtime.** A content-free broadcast ping on the existing Supabase connection tells teammates' screens to re-read. If it's unavailable, the chip still refreshes on focus and every minute.
7. **The phone app** shows nothing new yet. Its work still earns through the sweep, and its Powers screens are a follow-up.

## Tests

- `scripts/powers-sql.test.mjs` (real Postgres, 52 checks): balances, idempotency, caps, cooldowns, limits, gifts, reversals, streaks and Streak Savers, tenant isolation, who may call the functions, concurrency (20 parallel claims pay once; 20 parallel buys on 90 coins buy exactly 3; 30 parallel two-way gifts with no deadlocks and no coin lost), challenge counting, leaderboard totals.
- `scripts/powers.test.mjs` (73 checks): levels, settings bounds, who takes part, real-reply and trivial-task rules, review name matching, boosts, periods, task credit.
- End to end through the real app against the real SQL (77 checks), plus screens on desktop, phone, dark mode and reduced motion.

## Rollout

1. Run `migrations/COLVY_V438_COLVY_POWERS.sql` in the Supabase SQL editor.
2. Settings → Colvy Powers → switch on. Adjust prices, limits, challenges and visibility to taste.
