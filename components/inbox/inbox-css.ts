// The inbox's stylesheets, moved out of app/admin/inbox/page.tsx unchanged.

// The inbox layout: columns, mobile panes, tablet drawer, composer and buttons.
export const INBOX_CSS = `
        .sched-btn { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid var(--border); background: #fff; color: var(--ink); font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s ease, border-color .15s ease, color .15s ease; }
        .sched-btn:hover:not(:disabled) { background: var(--canvas, #fafafa); }
        .sched-btn.primary { background: var(--coral); border-color: var(--coral); color: #fff; }
        .sched-btn.primary:hover:not(:disabled) { background: var(--coral); filter: brightness(0.95); }
        .sched-btn.icon { width: 30px; padding: 0; justify-content: center; color: var(--slate); }
        .sched-btn.icon:hover:not(:disabled) { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
        .sched-btn:disabled { cursor: default; }
        /* Composer resize grip: reveal the "drag to resize" pill on hover. */
        .composer-grip:hover .composer-grip-pill { opacity: 1 !important; transform: translateY(0) !important; }
        .composer-grip::before {
          content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
          width: 44px; height: 4px; border-radius: 999px; background: var(--border);
          opacity: 0; transition: opacity .12s ease;
        }
        .composer-grip:hover::before { opacity: 1; }

        /* The collapsed one-line reply bar is a phone thing only. */
        .mcmp-bar { display: none; }

        /* Keyboard keys in the empty thread pane. */
        .inbox-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; background: #fff; border: 1px solid #e5e5ea; box-shadow: 0 1px 0 rgba(0,0,0,0.04); font-size: 11.5px; font-weight: 600; color: #3a3a3c; }
        @media (hover: none), (max-width: 1100px) { .inbox-kbd-hints { display: none !important; } }

        /* Desktop: the list, the thread and the contact panel float as rounded
           cards on a soft grey, like a native app. The thread column keeps its
           menus unclipped, so its header and reply box take the corners. */
        @media (min-width: 1101px) {
          .inbox-root { background: #f1f1f4; padding: 10px; gap: 10px; }
          .inbox-col-list, .inbox-col-contact, .inbox-collapsed-rail { border: none !important; border-radius: 18px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
          .inbox-col-thread { border-radius: 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
          .inbox-col-thread > .inbox-thread-header { border-radius: 18px 18px 0 0; }
          .inbox-col-thread .inbox-composer { border-radius: 0 0 18px 18px; }
          .inbox-empty-thread { border-radius: 18px; }
        }

        /* A message that has just arrived (or just been sent) rises into place
           from its own corner; what was already there when the thread opened
           stays still. */
        .chat-msg-row.msg-in { animation: msgIn .4s cubic-bezier(.2,.9,.3,1.12) both; transform-origin: bottom left; }
        .chat-msg-row.msg-in.mine { transform-origin: bottom right; }
        @keyframes msgIn { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }

        /* ── Inbox mobile responsiveness ─────────────────────────────── */
        @media (max-width: 767px) {
          /* Fit the inbox between the top header AND the fixed bottom nav — the
             old height only subtracted the 56px header, so the composer / Send
             row (and the mobile back button's pane) sat behind the bottom nav.
             dvh tracks the mobile browser chrome so the top isn't pushed off. */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
          }
          /* Keyboard up (components/KeyboardAware): the page has shrunk to the
             space above it and the bottom tabs and banners have stepped aside,
             so the inbox takes everything under the top bar. While writing an
             email the customer strip and the To row (still under Details when
             the keyboard is down) give way, and the editor starts shorter. */
          html.kb-open .inbox-root {
            height: calc(100dvh - 56px - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - var(--admin-banners-h, 0px)) !important;
          }
          html.kb-open .cg-wrap { display: none; }
          html.kb-open .ecmp:has(.email-rte:focus) .ecmp-to { display: none !important; }
          html.kb-open .email-rte { min-height: 72px !important; max-height: 30dvh !important; }
          /* One pane at a time on phones */
          .inbox-root .inbox-col-list,
          .inbox-root .inbox-col-thread,
          .inbox-root .inbox-col-contact { display: none !important; }
          .inbox-root .inbox-col-list { width: 100% !important; flex: 1 1 100% !important; }
          .inbox-root .inbox-col-thread { width: 100% !important; flex: 1 1 100% !important; }
          .inbox-root .inbox-col-contact { width: 100% !important; flex: 1 1 100% !important; border-left: none !important; }

          .inbox-pane-list .inbox-col-list { display: flex !important; }
          .inbox-pane-thread .inbox-col-thread { display: flex !important; }
          .inbox-pane-contact .inbox-col-contact { display: flex !important; }

          /* The collapsed-sidebar rail is desktop-only */
          .inbox-root .inbox-collapsed-rail { display: none !important; }
          /* Back / nav buttons only on mobile */
          .inbox-mobile-only { display: flex !important; }

          /* ── Customer top details: native mobile chat header ──────────
             Row 1 is the identity bar (back · name · call · contact) — the
             pattern every phone messaging app uses. Row 2 is a single
             horizontally-scrollable strip of tools. Previously ~10 controls
             wrapped into three ragged rows and ate a third of the screen. */
          .inbox-thread-header {
            padding: 6px 8px 0 !important;
            gap: 8px !important;
            align-items: center;
            position: sticky; top: 0; z-index: 20;
            /* iOS-style translucent bar */
            background: rgba(255,255,255,0.92) !important;
            backdrop-filter: saturate(180%) blur(12px);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
          }
          .inbox-thread-header .inbox-header-name {
            flex: 1 1 auto !important;
            min-width: 0 !important;
          }
          .inbox-thread-header .inbox-header-name p:first-child { font-size: 16px !important; }

          /* Row 1 is one tidy line: back · avatar · name · call · contact · ⋯.
             The name truncates; nothing is pushed off the right edge. Every
             other control lives in a tray (row 2+) that the ⋯ button opens,
             wrapping onto as many lines as it needs, so nothing is cut off
             and nothing scrolls sideways. The tools container dissolves
             (display: contents) so its buttons wrap alongside Pin, Assign and
             the actions menu; desktop keeps its own layout untouched. */
          .inbox-thread-header { padding-bottom: 6px !important; row-gap: 6px !important; }
          .inbox-thread-header .inbox-back-label { display: none; }
          .inbox-thread-header .inbox-mobile-only:first-child { width: 36px; padding: 0 !important; justify-content: center; }
          .inbox-thread-header .inbox-call-label { display: none; }
          .inbox-thread-header [data-callbar-btn] { width: 36px; height: 36px; padding: 0 !important; justify-content: center; flex-shrink: 0; }
          .inbox-thread-header .inbox-m-more { width: 36px !important; height: 36px !important; }
          .inbox-thread-header .inbox-header-tools,
          .inbox-thread-header .inbox-pin-btn,
          .inbox-thread-header .inbox-status-pill,
          .inbox-thread-header [data-assign-menu],
          .inbox-thread-header [data-actions-menu] { display: none !important; }
          .inbox-thread-header.m-tools-open { padding-bottom: 8px !important; }
          .inbox-thread-header.m-tools-open .inbox-m-break { display: block !important; order: 9; flex: 0 0 100%; height: 0; }
          .inbox-thread-header.m-tools-open .inbox-header-tools { display: contents !important; }
          /* The tray: status and who has it on one line, the tools on the next. */
          .inbox-thread-header.m-tools-open .inbox-status-pill { display: inline-flex !important; order: 10; }
          .inbox-thread-header.m-tools-open [data-assign-menu] { display: block !important; order: 11; }
          .inbox-thread-header.m-tools-open .inbox-header-tools::before { content: ''; order: 12; flex: 0 0 100%; height: 0; }
          .inbox-thread-header.m-tools-open .inbox-header-tools > * { order: 13 !important; flex-shrink: 0; }
          .inbox-thread-header.m-tools-open .inbox-pin-btn { display: flex !important; order: 13; width: 36px !important; height: 36px !important; }
          .inbox-thread-header.m-tools-open [data-actions-menu] { display: block !important; order: 13; }
          /* Assignment tabs scroll horizontally without a visible scrollbar. */
          .inbox-assign-tabs { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .inbox-assign-tabs::-webkit-scrollbar { display: none; }

          /* Overdue badge tooltip — appears INSTANTLY on hover (no browser
             title-delay), larger, with a quick pop animation. */
          .overdue-badge .overdue-tip {
            position: absolute;
            top: 50%;
            right: calc(100% + 8px);
            transform: translateY(-50%) scale(0.92);
            transform-origin: right center;
            width: 230px;
            background: #1f2937;
            color: #fff;
            font-size: 12.5px;
            line-height: 1.4;
            font-weight: 500;
            padding: 9px 12px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.22);
            opacity: 0;
            pointer-events: none;
            z-index: 100;
            transition: opacity 90ms ease, transform 90ms ease;
          }
          .overdue-badge:hover .overdue-tip {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
          .overdue-badge .overdue-tip::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 100%;
            transform: translateY(-50%);
            border: 6px solid transparent;
            border-left-color: #1f2937;
          }
          .inbox-thread-header .inbox-header-tools > * { flex-shrink: 0; }

          /* Bigger, thumb-friendly hit targets (Apple's 44px guidance) */
          .inbox-thread-header .inbox-header-tools button { min-height: 36px; }

          /* Tray dropdowns (Assign, ⋯, outlets) open full-width under the
             header rather than off the edge of a narrow screen. */
          .inbox-thread-header [data-assign-menu],
          .inbox-thread-header [data-actions-menu],
          .inbox-thread-header [data-move-menu] { position: static !important; }
          .inbox-thread-header [data-assign-menu] > button { min-height: 36px; padding: 6px 12px !important; }
          .inbox-thread-header [data-actions-menu] > button { min-width: 36px; min-height: 36px; }
          .inbox-thread-header [data-assign-menu] > div,
          .inbox-thread-header [data-actions-menu] > div,
          .inbox-thread-header [data-move-menu] > div {
            top: calc(100% + 4px) !important; left: 8px !important; right: 8px !important;
            width: auto !important; max-width: none !important; z-index: 200;
          }

          /* ── Native-app feel ───────────────────────────────────────────────
             The pane switching above already gives a phone layout; these make it
             behave like an installed app rather than a website in a browser. */

          /* Fill the real visible viewport. 100vh on iOS Safari includes the
             address bar, so the composer sat below the fold; dvh tracks the
             browser chrome as it hides and shows. */
          /* …minus the app header and the bottom tab bar, which both stay on
             screen; a bare 100dvh ran ~115px under the tab bar, so the reply
             box hid behind it until you scrolled. */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            overflow: hidden;
          }

          /* Respect the notch and the home indicator. */
          .inbox-thread-header { padding-top: max(6px, env(safe-area-inset-top)) !important; }
          .inbox-composer {
            padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
            position: sticky; bottom: 0; z-index: 30;
            background: rgba(255,255,255,0.96);
            backdrop-filter: saturate(180%) blur(12px);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
            border-top: 1px solid var(--border);
          }

          /* iOS zooms the whole page when a focused input is under 16px. */
          .inbox-root input,
          .inbox-root textarea,
          .inbox-root select { font-size: 16px !important; }

          /* Momentum scrolling, and stop the rubber-band effect dragging the
             whole page when a list hits its end. */
          .inbox-root .inbox-col-list,
          .inbox-root .inbox-col-thread,
          .inbox-root .inbox-col-contact,
          .inbox-messages {
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
          }

          /* No grey flash on tap, and no accidental text selection when
             swiping — both are dead giveaways of a web page. */
          .inbox-root button,
          .inbox-root [role="button"] {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            user-select: none;
          }
          /* Message text stays selectable so customers' details can be copied. */
          .inbox-messages, .inbox-messages * { user-select: text; }

          /* Apple's minimum comfortable target is 44px; several controls were
             under 30px and hard to hit accurately. */
          .inbox-root button { min-height: 36px; }
          .inbox-composer button { min-height: 40px; }
          .sched-list .sched-btn { min-height: 34px; }
          /* Attachment tiles keep a round remove button (a bit larger for a thumb). */
          .inbox-composer .staged-strip button { min-height: 0; width: 24px !important; height: 24px !important; }

          /* Slimmer composer on a phone: the reply box was a fixed 3 rows, which
             ate a big chunk of the screen even when empty. Start at ~2 rows and
             let it grow up to 40dvh as they type; tighten the surrounding gaps. */
          .inbox-composer { padding: 8px 12px !important; }
          .inbox-composer textarea {
            min-height: 52px !important;
            height: 52px !important;
            max-height: 40dvh;
            line-height: 1.35;
            margin-bottom: 6px !important;
          }

          /* Conversation rows: full-width tap target with a pressed state. */
          .inbox-col-list button:active { background: var(--peach) !important; }

          /* Contact panel opens as a full sheet rather than a cramped column. */
          .inbox-pane-contact .inbox-col-contact {
            padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
          }

          /* ── Composer on a phone ───────────────────────────────────────────
             The toolbar carried ~8 controls (note, resolve, short link, emoji,
             quick replies, attach, save card, send menu) in a fixed row. On a
             narrow screen they collided with the Send button and several were
             unreachable. Two changes fix it without hiding anything:
             the tools scroll horizontally on their own line, and Send gets a
             full-width line beneath so it's never squeezed. */
          .inbox-composer .composer-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
          }
          .inbox-composer .composer-tools {
            gap: 6px !important;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            padding-bottom: 2px;
          }
          .inbox-composer .composer-tools::-webkit-scrollbar { display: none; }
          /* Controls keep their size instead of being crushed to fit. */
          .inbox-composer .composer-tools > * { flex-shrink: 0; }
          .inbox-composer .composer-tools button {
            min-width: 38px;
            min-height: 38px;
          }

          /* Send row: full width, thumb-sized. */
          .inbox-composer .composer-bar > div:last-child {
            display: flex !important;
            gap: 8px !important;
          }
          .inbox-composer .composer-bar > div:last-child > button,
          .inbox-composer .composer-bar > div:last-child > div {
            flex: 1;
          }
          /* …except the round AI / resolve buttons beside Send. */
          .inbox-composer .composer-bar > .cmp-send > .cmp-tool,
          .inbox-composer .composer-bar > .cmp-send > .ai-orb { flex: 0 0 auto !important; width: 44px !important; }
          .inbox-composer .cmp-tools { flex-wrap: nowrap; }
          .inbox-composer .cmp-hint { display: none; }
          .inbox-composer .cmp-mode button { min-height: 0 !important; }
          .inbox-composer .composer-bar > div:last-child button {
            min-height: 44px;
            font-size: 14px !important;
          }

          /* Dropdowns must escape the scrolling strip, or they'd be clipped. */
          .inbox-composer .composer-tools [style*="position: absolute"],
          .inbox-composer .composer-tools > div > div { z-index: 120; }

          /* The thread header's own tool strip: same treatment, and drop the
             text labels so the icons alone fit across a phone. */
          .inbox-thread-header .inbox-header-tools button span.tool-label { display: none; }

          /* Message bubbles get more of the screen — 70% left too much dead
             space on a 390px phone. Replies sit against the right edge (no
             business avatar beside your own messages, like iMessage). */
          .inbox-messages .chat-msg-col { max-width: 84% !important; min-width: 0; }
          .inbox-messages .chat-agent-av { display: none !important; }
          .inbox-messages .chat-cust-av { width: 24px !important; height: 24px !important; font-size: 10px !important; }
          .inbox-messages { padding: 10px 12px !important; gap: 7px !important; }
          /* Flatter, less bulky bubbles on a phone. */
          .inbox-messages .msg-bubble { box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; }
          .inbox-messages .msg-bubble p { line-height: 1.4 !important; }

          /* ── Thread first ──────────────────────────────────────────────────
             The full email composer (From/To/Subject/Signature/toolbar) used
             to open on every thread and took the whole screen, squashing the
             messages to a sliver. On a phone the composer now starts as a
             one-line bar; tapping it opens the composer, capped at about two
             thirds of the height so the thread stays visible above it. The
             desktop drag-resize grip and its remembered height don't apply. */
          .inbox-messages { min-height: 0; }
          .inbox-composer .composer-grip { display: none !important; }
          .inbox-composer { flex-shrink: 0; }
          .inbox-composer.mcmp-collapsed { padding: 8px 10px !important; }
          .inbox-composer.mcmp-collapsed > :not(.mcmp-bar) { display: none !important; }
          .inbox-composer.mcmp-collapsed .mcmp-bar { display: flex; align-items: center; gap: 8px; }
          .inbox-composer.mcmp-open { max-height: 66%; overflow-y: auto; overscroll-behavior: contain; }
          .inbox-composer.mcmp-open .mcmp-bar { display: none !important; }
          .inbox-composer .cmp-head { gap: 8px; padding: 8px 10px 2px; }
          .inbox-composer .cmp-via { margin-left: auto; min-width: 0; flex: 0 1 auto; }
          .inbox-composer .cmp-via-lbl { display: none; }
          .inbox-composer .cmp-mode button { padding: 0 12px; }
          .mcmp-reply {
            flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px;
            height: 44px; min-height: 44px !important; padding: 0 12px 0 6px; border: 1px solid var(--border); border-radius: 14px;
            background: #f8f9fb; color: var(--slate); font: inherit; font-size: 14px; text-align: left; cursor: text;
          }
          .mcmp-reply.note { background: #fffbeb; border-color: #fcd34d; }
          .mcmp-ch {
            display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; height: 30px; padding: 0 9px;
            border-radius: 10px; background: #fff; border: 1px solid var(--border); color: var(--ink);
            font-size: 12px; font-weight: 700;
          }
          .mcmp-reply.note .mcmp-ch { color: #b45309; border-color: #fcd34d; }
          .mcmp-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .mcmp-text.has-draft { color: var(--ink); }
          .mcmp-text b { color: var(--coral); font-weight: 700; }
          .mcmp-note {
            flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; height: 44px; min-height: 44px !important; padding: 0 12px;
            border-radius: 14px; border: 1px solid var(--border); background: #fff; color: var(--slate);
            font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
          }
          .mcmp-note.on { color: var(--ink); }
          /* The Colvy AI orb never sits on the composer: it steps aside while
             the composer is open, and rests just above the collapsed bar. */
          html body:has(.inbox-pane-thread .inbox-composer.mcmp-open) .colvy-ai-orb-wrap { display: none !important; }
          html body:has(.inbox-pane-thread .inbox-composer.mcmp-collapsed) .colvy-ai-orb-wrap[data-default-pos] { bottom: calc(58px + env(safe-area-inset-bottom, 0px) + 76px) !important; }
        }
        /* The conversation header, like Sellio's: a tinted status pill, who
           it's assigned to, then plain round icons that only show a
           background on hover. Its menus are soft white cards. */
        .th-btn { position: relative; width: 36px; height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #52525b; cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease; }
        .th-btn:hover { background: #f4f4f5; color: #18181b; }
        .th-btn:active { transform: scale(.93); }
        .th-btn.on { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .th-btn:focus-visible, .th-pill:focus-visible, .th-menu-row:focus-visible, .th-mood:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .th-dial { color: #059669; }
        .th-dial:hover { background: #ecfdf3; color: #047857; }
        .th-ai { color: #8b5cf6; }
        .th-ai:hover { background: #f5f3ff; color: #7c3aed; }
        .th-ai.off { color: #a1a1aa; }
        .th-ai-slash { position: absolute; width: 20px; height: 1.8px; border-radius: 1px; background: #ef4444; transform: rotate(-45deg); }
        .th-pill { height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 0 15px; border: none; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 650; white-space: nowrap; cursor: pointer; transition: background .15s ease, transform .1s ease; }
        .th-pill:active { transform: scale(.97); }
        .th-call { background: #ecfdf3; color: #067647; }
        .th-call:hover { background: #d1fadf; }
        .th-assign { background: transparent; color: #18181b; padding: 0 12px 0 4px; font-weight: 600; }
        .th-assign.none { width: 36px; padding: 0; justify-content: center; background: #f4f4f5; color: #3f3f46; }
        .th-assign:hover, .th-assign.on { background: #f4f4f5; }
        .th-assign.none:hover, .th-assign.none.on { background: #ececef; }
        .th-assign-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
        .th-av { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); font-size: 12.5px; font-weight: 700; }
        .th-av.sm { width: 26px; height: 26px; font-size: 12px; }
        .th-status { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; color: var(--st-fg); }
        .th-status select { field-sizing: content; appearance: none; -webkit-appearance: none; height: 36px; margin: 0; padding: 0 32px 0 35px; border: none; border-radius: 999px; background: var(--st-bg); color: var(--st-fg); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; transition: filter .15s ease; }
        /* Hover darkens with an inset shadow, not a filter: a filter lifts the
           select above its own icon and chevron, which then vanish. */
        .th-status select:hover { box-shadow: inset 0 0 0 999px rgba(0,0,0,.035); }
        .th-status select:focus { outline: none; }
        .th-status select:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--st-fg) 22%, transparent); }
        .th-status-ic { position: absolute; left: 13px; z-index: 1; display: flex; pointer-events: none; }
        .th-status-chev { position: absolute; right: 12px; z-index: 1; pointer-events: none; }
        .th-menu { z-index: 50; padding: 6px; border-radius: 16px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); transform-origin: top right; animation: thMenuIn .18s cubic-bezier(.22,1,.36,1); }
        @keyframes thMenuIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
        .th-menu-search { width: 100%; box-sizing: border-box; height: 40px; margin: 0 0 4px; padding: 0 30px 0 12px; border-radius: 12px; border: 1.5px solid #e4e4e7; background: #fff; font: inherit; font-size: 14px; color: #111; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
        .th-menu-search:focus { border-color: var(--coral); box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .th-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; color: #18181b; text-align: left; cursor: pointer; }
        .th-menu-row:hover { background: #f4f4f5; }
        .th-menu-row.cur { font-weight: 650; }
        .th-menu-row.danger { color: #dc2626; }
        .th-menu-row > svg { color: #71717a; flex-shrink: 0; }
        .th-menu-sep { height: 1px; margin: 4px 6px; background: #f0f0f2; }
        .th-menu-label { margin: 6px 10px 4px; font-size: 12.5px; font-weight: 500; color: #8e8e93; }
        .th-mood { flex: 1; min-width: 0; height: 58px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: none; border-radius: 14px; background: #f4f4f5; color: #71717a; cursor: pointer; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
        .th-mood:hover { background: color-mix(in srgb, var(--mood) 9%, #fff); color: var(--mood); }
        .th-mood.on { background: color-mix(in srgb, var(--mood) 14%, #fff); color: var(--mood); box-shadow: inset 0 0 0 1.5px var(--mood); }
        .th-mood-l { font-size: 11.5px; font-weight: 650; line-height: 1; }
        /* The contact panel, in the same style: pill tabs, a tinted Action
           pill, small pill buttons. */
        .cp-tabs { display: flex; gap: 2px; margin: 12px 14px 0; padding: 3px; border-radius: 999px; background: #f4f4f5; flex-shrink: 0; }
        .cp-tab { flex: 1 1 auto; height: 32px; padding: 0 10px; border: none; border-radius: 999px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #71717a; cursor: pointer; white-space: nowrap; transition: background .18s ease, color .15s ease, box-shadow .18s ease; }
        .cp-tab:hover { color: #18181b; }
        .cp-tab:hover { background: transparent; }
        .cp-tab.on, .cp-tab.on:hover { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); }
        .cp-tab:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .cp-action { width: 100%; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1.5px solid #e4e4e7; border-radius: 999px; background: #fff; color: #18181b; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 1px rgba(16,24,40,.03); transition: background .15s ease, border-color .15s ease, transform .1s ease; }
        .cp-action > svg:first-child { color: var(--coral); }
        .cp-action-chev { color: #71717a; transition: transform .2s ease; }
        .cp-action.on .cp-action-chev { transform: rotate(180deg); }
        .cp-action:hover, .cp-action.on { background: #fafafa; border-color: #d4d4d8; }
        .cp-action:active { transform: scale(.98); }
        .cp-action:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .cp-act-row > span:first-child { color: #52525b; display: inline-flex; }
        .cp-mini { height: 28px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px; border: none; border-radius: 999px; background: #f4f4f5; color: #3f3f46; font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease; }
        .cp-mini:hover { background: #ececef; }
        .cp-mini.accent { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .cp-mini.accent:hover { background: color-mix(in srgb, var(--coral) 18%, #fff); }
        .cp-mini.violet { background: #f5f3ff; color: #7c3aed; }
        .cp-mini.violet:hover { background: #ede9fe; }
        .cp-mini:disabled { opacity: .6; cursor: default; }
        .inbox-col-contact button[style*="border-radius: 999px"]:not(:disabled):hover, .inbox-col-contact a[style*="border-radius: 999px"]:hover { filter: brightness(.97); }
        /* The conversation list's controls, like Sellio's: borderless pill
           chips (the chosen one dark), a grey location pill, a status menu
           and a round filter icon. */
        .il-chip { flex-shrink: 0; height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .il-chip:hover { background: #ececef; color: #18181b; }
        .il-chip.on { background: #18181b; color: #fff; }
        .il-chip:focus-visible, .il-status:focus-visible, .il-loc:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .il-chip-n { min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); }
        .il-chip.on .il-chip-n { background: rgba(255,255,255,.18); color: #fff; }
        .il-search { width: 100%; box-sizing: border-box; height: 38px; padding: 0 14px 0 38px; border: 1.5px solid transparent; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .il-search::placeholder { color: #a1a1aa; }
        .il-search:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .il-loc { width: 100%; height: 36px; padding: 0 34px 0 36px; border: none; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 13.5px; font-weight: 600; color: #18181b; cursor: pointer; appearance: none; -webkit-appearance: none; transition: background .15s ease; }
        .il-loc:hover { background: #ececef; }
        .il-loc.on { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .il-status { height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 0 11px 0 10px; border: none; border-radius: 999px; background: transparent; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; transition: background .15s ease; }
        .il-status svg:first-child { color: #52525b; }
        .il-status:hover, .il-status.on { background: #f4f4f5; }
        .il-badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; border: 2px solid #fff; background: var(--coral); color: #fff; font-size: 9.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
        .cp-hint { margin-top: 8px; width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: none; border-radius: 12px; background: #f6f6f7; font: inherit; font-size: 13px; color: #52525b; text-align: left; cursor: pointer; transition: background .15s ease; }
        .cp-hint:hover { background: #efeff1; }
        .cp-hint-ic { display: inline-flex; color: var(--coral); flex-shrink: 0; }
        /* Conversation tags, like Sellio's: a dot and the label in its colour,
           on a soft tint of it. */
        .cv-tag { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 9%, #fff); color: color-mix(in srgb, var(--tag) 88%, #000); font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap; }
        .cv-tag-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tag); flex-shrink: 0; }
        .cv-tag-dot.live { animation: livePulse 1.6s ease-in-out infinite; }
        /* A row's outlet and who has it: quiet grey, under the tags' colour. */
        .il-where { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; min-width: 0; font-size: 12px; font-weight: 500; color: #8e8e93; }
        .il-where svg { flex-shrink: 0; }
        .il-where span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .il-who { display: flex; align-items: center; gap: 6px; margin-top: 6px; min-width: 0; font-size: 12px; font-weight: 500; color: #71717a; }
        .il-who-av { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); font-size: 10px; font-weight: 700; }
        .il-who-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Conversation cards (Sellio-style): avatar with the channel on it, name
           and time, one line of the latest message, then the tags hanging off a
           little connector from the avatar. */
        .il-scroll { padding: 6px 0 10px; }
        .ilc { position: relative; display: grid; grid-template-columns: 42px minmax(0, 1fr); column-gap: 11px; align-items: start; width: calc(100% - 16px); margin: 3px 8px; padding: 11px 12px; border: none; border-radius: 18px; background: #f6f6f7; text-align: left; cursor: pointer; font-family: inherit; color: inherit; transition: background .2s, box-shadow .2s, transform .15s; }
        .ilc::before { display: none !important; }
        .ilc:hover { background: #efeff1; }
        .ilc:active { transform: scale(.985); }
        .ilc.unread { background: color-mix(in srgb, var(--acc) 8%, #fff); }
        .ilc.unread:hover { background: color-mix(in srgb, var(--acc) 12%, #fff); }
        .ilc.sel { background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 8px 22px -12px rgba(16,24,40,.28); }
        .ilc.sel::after { content: ''; position: absolute; left: -8px; top: 16px; bottom: 16px; width: 4px; border-radius: 0 4px 4px 0; background: var(--acc); }
        .ilc:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 30%, transparent); }
        .ilc-avcol { grid-row: 1 / span 2; align-self: stretch; display: flex; flex-direction: column; }
        .ilc-av { position: relative; width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(160deg, hsl(var(--h, 14) 92% 72%), hsl(var(--h, 14) 72% 55%)); color: #fff; font-size: 17px; font-weight: 700; transition: box-shadow .25s, transform .25s cubic-bezier(.34,1.56,.64,1); }
        .ilc-av img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
        .ilc-av.logo { background: #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
        .ilc-av.logo img { inset: 5px; width: calc(100% - 10px); height: calc(100% - 10px); border-radius: 9px; }
        .ilc-ch { position: absolute; right: -4px; bottom: -3px; display: inline-flex; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px #fff; }
        .ilc-new { position: absolute; top: -1px; right: -1px; width: 11px; height: 11px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 0 2px #fff; }
        .ilc-line { flex: 1; min-height: 8px; width: 24px; margin: 5px 0 10px 20px; border-left: 1.5px solid #d4d4d8; border-bottom: 1.5px solid #d4d4d8; border-bottom-left-radius: 10px; transition: opacity .18s, min-height .36s cubic-bezier(.32,.72,0,1), margin .36s cubic-bezier(.32,.72,0,1); }
        .ilc-main { grid-column: 2; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 2px; transition: opacity .18s; }
        .ilc-top { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .ilc-name { min-width: 0; font-size: 14px; font-weight: 650; letter-spacing: -.005em; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ilc.unread .ilc-name { font-weight: 750; }
        .ilc-pin { display: inline-flex; flex-shrink: 0; color: var(--coral); }
        .ilc-time { margin-left: auto; padding-left: 6px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 11.5px; color: #a1a1aa; }
        .ilc.unread .ilc-time { color: var(--acc); font-weight: 600; }
        .ilc-mid { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .ilc-mid > p { font-size: 12.5px !important; }
        .ilc-prev { flex: 1; min-width: 0; font-size: 12.5px; color: #71717a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ilc.unread .ilc-prev { color: var(--ink); font-weight: 600; }
        .ilc-who { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #6a9f3e; color: #fff; font-size: 10.5px; font-weight: 700; }
        .ilc-count { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; flex-shrink: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--acc); color: #fff; font-size: 10.5px; font-weight: 750; }
        .ilc-tags { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; margin-top: 8px; max-height: 60px; overflow: hidden; transition: opacity .18s, max-height .36s cubic-bezier(.32,.72,0,1), margin-top .36s cubic-bezier(.32,.72,0,1); }
        .ilc-where { display: inline-flex; align-items: center; gap: 4px; height: 22px; max-width: 100%; min-width: 0; padding: 0 8px; border-radius: 999px; background: #fff; box-shadow: inset 0 0 0 1px #ececef; font-size: 11.5px; font-weight: 500; color: #71717a; }
        .ilc-where svg { flex-shrink: 0; }
        .ilc-where span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ilc.sel .ilc-where { background: #f6f6f7; box-shadow: none; }

        /* Desktop: the list folds to a strip of avatars and back. The column's
           width is the only thing that moves; inside it everything keeps its
           full-width layout (so nothing re-wraps), the header folds away and
           the words fade. */
        .inbox-col-list.il-desk { overflow: hidden; transition: width .36s cubic-bezier(.32,.72,0,1); }
        .il-inner { position: relative; flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; }
        .il-desk .il-inner { width: 300px; }
        .il-fold { display: grid; grid-template-rows: 1fr; grid-template-columns: minmax(0, 1fr); transition: grid-template-rows .36s cubic-bezier(.32,.72,0,1), opacity .2s; }
        .il-fold > div { min-height: 0; min-width: 0; }
        .il-collapsed .il-fold { grid-template-rows: 0fr; opacity: 0; }
        .il-collapsed .il-fold > div, .il-anim .il-fold > div { overflow: hidden; }
        .il-titlerow { transition: opacity .2s; }
        .il-collapsed .il-titlerow { opacity: 0; pointer-events: none; }
        .il-mini { position: absolute; top: 10px; left: 0; width: 82px; z-index: 6; display: flex; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .18s; }
        .il-collapsed .il-mini { opacity: 1; pointer-events: auto; transition-delay: .14s; }
        .il-mini-btn { position: relative; width: 40px; height: 40px; border-radius: 50%; border: none; background: #f4f4f5; color: #3f3f46; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background .15s, transform .2s cubic-bezier(.34,1.56,.64,1); }
        .il-mini-btn::before { display: none !important; }
        .il-mini-btn:hover { background: #ececef; transform: translateX(2px); }
        .il-mini-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 30%, transparent); }
        .il-mini-count { position: absolute; top: -6px; right: -10px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; background: var(--coral); color: #fff; font-size: 10.5px; font-weight: 750; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px #fff; }
        .il-wide-only { transition: opacity .18s; }
        .il-collapsed .il-wide-only { opacity: 0; pointer-events: none; }
        /* New conversation: a round + in the list's header, with a tooltip. */
        .il-new { position: relative; width: 34px; height: 34px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 50%; background: #f4f4f5; color: var(--ink); cursor: pointer; transition: background .15s ease, transform .1s ease; }
        .il-new::before { display: none !important; }
        .il-new:hover { background: #ececef; }
        .il-new:active { transform: scale(.94); }
        .il-new:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ink); }
        .il-new svg { transition: transform .25s cubic-bezier(.3,1.4,.5,1); }
        .il-new:hover svg { transform: rotate(90deg); }
        .il-tip { position: absolute; top: calc(100% + 10px); left: 50%; z-index: 30; padding: 8px 12px; border-radius: 12px; background: var(--card, #fff); color: var(--ink); font-size: 13px; font-weight: 550; white-space: nowrap; box-shadow: 0 10px 28px -8px rgba(16,24,40,.22), 0 0 0 1px rgba(0,0,0,.06); opacity: 0; transform: translate(-50%, -4px); pointer-events: none; transition: opacity .15s ease, transform .15s ease; }
        .il-tip::before { content: ''; position: absolute; top: -5px; left: 50%; width: 10px; height: 10px; background: inherit; transform: translateX(-50%) rotate(45deg); box-shadow: -1px -1px 0 rgba(0,0,0,.06); border-radius: 2px 0 0 0; }
        .il-new:hover .il-tip, .il-new:focus-visible .il-tip { opacity: 1; transform: translate(-50%, 0); transition-delay: .25s; }
        @media (hover: none) { .il-tip { display: none; } }
        .il-collapsed .ilc { background: transparent; box-shadow: none; }
        .il-collapsed .ilc-main { opacity: 0; }
        .il-collapsed .ilc-line { opacity: 0; min-height: 0; margin-top: 0; margin-bottom: 0; }
        .il-collapsed .ilc-tags { opacity: 0; max-height: 0; margin-top: 0; }
        .il-collapsed .ilc:hover .ilc-av { transform: scale(1.07); }
        .il-collapsed .ilc.sel .ilc-av { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--acc); }
        @media (prefers-reduced-motion: reduce) {
          .inbox-col-list.il-desk, .il-fold, .ilc, .ilc-av, .ilc-main, .ilc-tags, .ilc-line, .il-mini, .il-titlerow { transition: none !important; }
        }
        @media (prefers-reduced-motion: reduce) { .th-menu { animation: none; } }
        /* Desktop / tablet: the tools sit inline on the right as before */
        @media (min-width: 768px) {
          .inbox-header-tools { display: flex; align-items: center; gap: 2px; }
        }
        /* Narrow desktop windows: tighten so nothing falls off */
        @media (min-width: 768px) and (max-width: 1100px) {
          .inbox-thread-header { gap: 7px !important; padding: 10px 12px !important; }
          .inbox-header-tools { gap: 0 !important; }
        }
        @media (min-width: 768px) {
          .inbox-mobile-only { display: none !important; }
        }
        /* Tablets: the conversation gets the room; contact details slide in
           from the right on demand instead of taking a fixed 280px column. */
        .inbox-tablet-scrim { display: none; }
        @media (min-width: 768px) and (max-width: 1100px) {
          .inbox-tablet-only { display: flex !important; }
          .inbox-root .inbox-col-contact {
            position: fixed !important; top: 56px; right: 0; bottom: 0; z-index: 320;
            width: min(360px, 88vw) !important; border-left: 1px solid var(--border);
            box-shadow: -24px 0 48px -24px rgba(16,24,40,.35);
            transform: translate3d(105%,0,0); transition: transform .32s cubic-bezier(.22,1,.36,1);
            visibility: hidden;
          }
          .inbox-root.tablet-contact-open .inbox-col-contact { transform: none; visibility: visible; }
          .inbox-root.tablet-contact-open .inbox-tablet-scrim {
            display: block; position: fixed; inset: 56px 0 0 0; z-index: 310;
            background: rgba(17,24,39,.22); animation: tabletScrimIn .25s ease both;
          }
          .inbox-root .inbox-col-contact > .cp-tabs { margin-right: 48px; }
          @keyframes tabletScrimIn { from { opacity: 0 } to { opacity: 1 } }
        }
        @media (min-width: 768px) and (max-width: 860px) {
          /* the bottom tab bar is still showing at this width — leave room for it */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
          }
          .inbox-root .inbox-col-contact { bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
          .inbox-root.tablet-contact-open .inbox-tablet-scrim { bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .inbox-root .inbox-col-contact { transition: none !important; }
        }
      `

// Keyframes and small bits used across the inbox.
export const INBOX_KEYFRAMES_CSS = `
        @keyframes doaSlideIn { from { transform: translate(100%, -50%); } to { transform: translate(0, -50%); } }
        @keyframes typingDot { 0%, 60%, 100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes recPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes livePulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.6); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(34,197,94,0); } }
        .ai-spark:hover .ai-tip { opacity: 1 !important; }
        /* Hide the assignment-strip scrollbar on every screen size — the chevron
           buttons drive scrolling now, so the raw grey scrollbar isn't wanted. */
        .inbox-assign-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .inbox-assign-tabs::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `

// Message rows: hover actions, bubbles and reactions.
export const THREAD_MESSAGES_CSS = `
              .chat-msg-row:hover .chat-msg-actions,
              .chat-msg-row .chat-msg-actions.pinned { opacity: 1 !important; pointer-events: auto !important; }
              /* The picker sat 34px above the smiley with a dead gap between them:
                 the cursor left the row on the way up, the row's :hover dropped,
                 and everything vanished before you got there. This invisible
                 bridge keeps the pointer inside the hoverable area the whole way. */
              .chat-react-picker::before {
                content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 22px;
              }
              .chat-att:hover .chat-att-fwd { opacity: 1 !important; }
              /* ── Reply box: one card (Coax-style) ── */
              .cmp-card{border:1px solid var(--border);border-radius:18px;background:#f8f9fb;transition:border-color .2s,box-shadow .2s,background .2s}
              .cmp-card:focus-within{background:#fff;border-color:#d7dae0;box-shadow:0 0 0 4px rgba(255,122,107,.10),0 8px 24px -16px rgba(16,24,40,.25)}
              .cmp-card.note{background:#fffbeb;border-color:#fcd34d}
              .cmp-card.note:focus-within{box-shadow:0 0 0 4px rgba(245,158,11,.14)}
              .cmp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 2px}
              .cmp-mode{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:rgba(17,24,39,.06)}
              .cmp-mode-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08),0 2px 6px -2px rgba(16,24,40,.12);transition:transform .28s cubic-bezier(.22,1,.36,1)}
              .cmp-mode button{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:0!important;height:28px;padding:0 14px;border:none;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--slate);cursor:pointer;transition:color .2s}
              .cmp-mode button[aria-selected="true"]{color:var(--ink)}
              .cmp-card.note .cmp-mode button[aria-selected="true"]{color:#b45309}
              .cmp-via{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
              .cmp-via b{color:var(--ink);font-weight:700}
              .cmp-input::placeholder{color:#9ca3af}
              .cmp-input:focus{outline:none!important;box-shadow:none!important;border:none!important}
              .cmp-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px 10px}
              .cmp-tools{display:flex;align-items:center;gap:5px;min-width:0;flex:1 1 auto;flex-wrap:wrap}
              .cmp-send{display:flex;align-items:center;gap:8px;flex-shrink:0}
              .cmp-tool{transition:filter .15s,transform .15s cubic-bezier(.22,1,.36,1),background .15s,color .15s}
              .cmp-tool:hover{filter:brightness(.95);color:var(--ink)!important}
              .cmp-tool:active{transform:scale(.93)}
              .cmp-tool:focus-visible,.cmp-mode button:focus-visible{outline:2px solid var(--coral);outline-offset:1px}
              .cmp-hint{display:flex;justify-content:flex-end;gap:14px;padding:7px 6px 0;font-size:11.5px;color:#9ca3af}
              .cmp-hint kbd{font:inherit;font-weight:700;color:var(--slate);padding:1px 6px;border-radius:5px;background:#f3f4f6;border:1px solid #e5e7eb}
              /* Responsive: sized by the reply box's own width (it's narrow on
                 tablets with three columns), not just the screen. */
              .inbox-composer{container-type:inline-size}
              .cmp-bar{flex-wrap:wrap;row-gap:8px}
              .cmp-tools{flex:1 1 230px}
              .cmp-send{margin-left:auto}
              @container (max-width: 560px){ .cmp-hint{display:none} }
              /* Narrow box (phones, or the middle column on a tablet): tools on
                 their own line, then a full-width Send row. */
              @container (max-width: 470px){
                .cmp-bar{flex-direction:column;align-items:stretch}
                .cmp-tools{flex:0 0 auto}
                .cmp-send{margin-left:0;width:100%}
                .cmp-send > div:last-child{flex:1 1 auto;display:flex}
                .cmp-send > div:last-child > button:first-child{flex:1 1 auto}
              }
              @container (max-width: 300px){ .cmp-via{display:none} }
              @media (max-width: 380px){
                .inbox-composer .cmp-tools{gap:3px!important}
                .inbox-composer .cmp-tools .cmp-tool{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important}
              }
              @media (prefers-reduced-motion:reduce){.cmp-mode-thumb,.cmp-tool{transition:none}}
            
/* A scheduled delivery in the thread: the same pill as the other lifecycle lines, clickable. */
.tm-dlv{display:inline-flex;align-items:flex-start;gap:8px;max-width:100%;padding:7px 12px 7px 15px;border:0;border-radius:16px;background:color-mix(in srgb,#059669 13%,transparent);color:#059669;font:inherit;line-height:1.45;text-align:left;cursor:pointer;transition:background .15s}
.tm-dlv::before{display:none!important}
.tm-dlv:hover{background:color-mix(in srgb,#059669 19%,transparent)}
.tm-dlv:focus-visible{outline:2px solid color-mix(in srgb,#059669 55%,transparent);outline-offset:2px}
.tm-dlv-i{flex-shrink:0;display:inline-flex;margin-top:2px}
.tm-dlv-t{min-width:0;font-size:12px;overflow-wrap:anywhere}
.tm-dlv-t b{font-weight:700}
.tm-dlv-t span{opacity:.8;font-weight:500}
.tm-dlv-go{flex-shrink:0;margin-top:3px;opacity:.55}
.tm-dlv:hover .tm-dlv-go{opacity:.9}
[data-theme="dark"] .tm-dlv{color:#34d399}
`
