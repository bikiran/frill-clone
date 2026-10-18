// Styles for rendered article bodies (lib/markdown → .blog-prose): the public
// article page and the super-admin editor's preview share them. Colours come
// from the --blog-* variables BlogChrome sets for light and dark, with
// fallbacks for the editor, which sits outside BlogChrome.

const CORAL = '#ff6a4d'

export const BLOG_PROSE_CSS = `
  .blog-prose { font-size: 18px; line-height: 1.78; color: var(--blog-text, #0f1119); }
  .blog-prose > p:first-of-type::first-letter { float: left; font-size: 3.4em; line-height: 0.78; font-weight: 900; padding: 6px 10px 0 0; color: ${CORAL}; }
  .blog-prose h2 { font-size: 27px; font-weight: 800; letter-spacing: -0.02em; margin: 40px 0 12px; line-height: 1.22; }
  .blog-prose h3 { font-size: 20px; font-weight: 800; margin: 28px 0 10px; }
  .blog-prose p { margin: 0 0 18px; }
  .blog-prose ul, .blog-prose ol { margin: 0 0 18px; padding-left: 24px; }
  .blog-prose ul { list-style: disc outside; }
  .blog-prose ol { list-style: decimal outside; }
  .blog-prose li { margin: 0 0 8px; padding-left: 4px; }
  .blog-prose li::marker { color: ${CORAL}; font-weight: 800; }
  .blog-prose a { color: ${CORAL}; text-decoration: underline; text-underline-offset: 2px; }
  .blog-prose strong { font-weight: 800; }
  .blog-prose blockquote { margin: 30px 0; padding: 6px 0 6px 22px; border-left: 4px solid ${CORAL}; font-size: 22px; font-weight: 700; font-style: italic; line-height: 1.4; }
  .blog-prose code { background: var(--blog-surface, #fff); border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
  .blog-prose pre { background: var(--blog-surface, #fff); border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); border-radius: 12px; padding: 16px 18px; overflow-x: auto; margin: 0 0 18px; }
  .blog-prose pre code { border: none; background: none; padding: 0; }
  .blog-prose figure { margin: 8px 0 26px; }
  .blog-prose figure img { display: block; width: 100%; border-radius: 14px; border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); }
  .blog-prose figcaption { margin-top: 9px; font-size: 13.5px; line-height: 1.5; color: var(--blog-muted, rgba(15,17,25,0.6)); text-align: center; }
  .blog-prose hr { border: none; border-top: 1px solid var(--blog-border, rgba(15,17,25,0.1)); margin: 34px 0; }

  /* Callouts: > [!TIP] … */
  .blog-prose .callout { --c: ${CORAL}; margin: 26px 0; padding: 18px 20px 4px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); background: color-mix(in srgb, var(--c) 7%, transparent); font-size: 16.5px; line-height: 1.65; }
  .blog-prose .callout-title { margin: 0 0 8px !important; font-size: 12.5px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--c); }
  .blog-prose .callout p { margin: 0 0 14px; }
  .blog-prose .callout ul { margin: 0 0 14px; }
  .blog-prose .callout-tip { --c: #0d9488; }
  .blog-prose .callout-note { --c: #2b59ff; }
  .blog-prose .callout-example { --c: #7c5cff; }
  .blog-prose .callout-try { --c: ${CORAL}; }
  .blog-prose .callout-warning { --c: #d97706; }

  /* Tables */
  .blog-prose .table-wrap { margin: 8px 0 24px; overflow-x: auto; border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); border-radius: 14px; }
  .blog-prose table { width: 100%; border-collapse: collapse; font-size: 15.5px; line-height: 1.5; }
  .blog-prose th { text-align: left; font-size: 12.5px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--blog-muted, rgba(15,17,25,0.6)); background: color-mix(in srgb, var(--blog-text, #0f1119) 4%, transparent); }
  .blog-prose th, .blog-prose td { padding: 12px 16px; vertical-align: top; border-bottom: 1px solid var(--blog-border, rgba(15,17,25,0.1)); }
  .blog-prose tr:last-child td { border-bottom: none; }

  /* Conversation mock-ups: \`\`\`chat */
  .blog-prose .chat { max-width: 440px; margin: 10px auto 28px; border-radius: 22px; border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); background: color-mix(in srgb, var(--blog-text, #0f1119) 3%, transparent); overflow: hidden; box-shadow: 0 18px 40px -24px rgba(15,17,25,0.35); font-size: 15px; line-height: 1.45; }
  .blog-prose .chat-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--blog-border, rgba(15,17,25,0.1)); background: var(--blog-bg, #fff); }
  .blog-prose .chat-head strong { display: block; font-size: 14.5px; }
  .blog-prose .chat-head small { display: block; font-size: 12px; color: var(--blog-muted, rgba(15,17,25,0.6)); }
  .blog-prose .chat-avatar { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: ${CORAL}; color: #fff; font-weight: 800; font-size: 14px; }
  .blog-prose .chat-body { display: flex; flex-direction: column; gap: 8px; padding: 16px 14px 18px; }
  .blog-prose .chat-row { display: flex; }
  .blog-prose .chat-row.out { justify-content: flex-end; }
  .blog-prose .chat-bubble { max-width: 82%; padding: 9px 13px; border-radius: 18px; }
  .blog-prose .chat-row.in .chat-bubble { background: var(--blog-bg, #fff); border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); border-bottom-left-radius: 6px; }
  .blog-prose .chat-row.out .chat-bubble { background: ${CORAL}; color: #fff; border-bottom-right-radius: 6px; }
  .blog-prose .chat-row.out .chat-bubble.ai { background: #7c5cff; }
  .blog-prose .chat-row.out .chat-bubble.draft { background: transparent; color: var(--blog-text, #0f1119); border: 1.5px dashed #7c5cff; }
  .blog-prose .chat-bubble a { color: inherit; }
  .blog-prose .chat-tag { display: block; margin-bottom: 3px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85; }
  .blog-prose .chat-bubble.draft .chat-tag { color: #7c5cff; opacity: 1; }
  .blog-prose .chat-event { align-self: center; margin: 4px 0; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--blog-muted, rgba(15,17,25,0.6)); background: var(--blog-bg, #fff); border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); }
  .blog-prose .chat-card { width: 76%; padding: 12px 14px; border-radius: 16px; border-bottom-right-radius: 6px; background: var(--blog-bg, #fff); border: 1px solid var(--blog-border, rgba(15,17,25,0.1)); display: flex; flex-direction: column; gap: 3px; }
  .blog-prose .chat-card strong { font-size: 14.5px; }
  .blog-prose .chat-card span { font-size: 13px; color: var(--blog-muted, rgba(15,17,25,0.6)); }
  .blog-prose .chat-card em { margin-top: 8px; align-self: flex-start; padding: 7px 14px; border-radius: 999px; background: ${CORAL}; color: #fff; font-style: normal; font-weight: 800; font-size: 13px; }

  @media (max-width: 560px) {
    .blog-prose { font-size: 17px; }
    .blog-prose blockquote { font-size: 19px; }
    .blog-prose .chat-bubble { max-width: 88%; }
    .blog-prose .chat-card { width: 88%; }
  }
`
