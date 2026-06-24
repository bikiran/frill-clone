
# Frill Clone v23

## What's New

This release includes the following enhancements and fixes:

1. **Views/Impressions**: 
   - Fixed the race condition on announcement views with atomic Postgres RPCs
   - Added views/impressions tracking to ideas (impressions on every open, views once per browser via localStorage)
   - Showing views/impressions counts on idea cards

2. **Like + Subscribe**:
   - Added new `idea_likes` and `idea_subscriptions` tables to track user-to-idea relationships
   - Maintaining `ideas.likes` count via a database trigger (mirrors the existing votes trigger)
   - Added Like and Subscribe action buttons to the IdeaCard and IdeaDetail components
   - Added "Liked Ideas" and "Subscribed Ideas" filter toggles to the ideas tab

3. **Top-left Menu (Frill-style)**:
   - Moved the account menu to a left workspace switcher component
   - Added links to Admin Settings, Dashboard, Profile, View as Customer

4. **Emoji → SVG**:
   - Converted emojis to SVG in the main public flow (create idea categories, success screen, home page, idea cards)
   - Remaining emojis (comment reactions, onboarding industry icons) noted for a future pass

## Deployment

1. Unzip the attached `colvy-v23.zip` 
2. Push the updated files to your GitHub repo
3. Run the SQL commands in `v23_schema_updates.sql` in your Supabase SQL Editor to update the database schema
4. Redeploy the app on Vercel

The ZIP archive contains:
- All new and updated components, pages, and DB queries
- A clean removal of unused code and half-implemented features
- This README documenting what's new
- The SQL file to update your database schema

No additional setup steps or environment variable changes are required. After pushing to GitHub and redeploying on Vercel, v23 should be live!

Let me know if you have any other questions or feedback. Enjoy the new features!
