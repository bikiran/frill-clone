#!/bin/bash
# deploy.sh — Run this ONCE to fix the middleware.ts conflict in git, then deploy
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e

echo "🔧 Removing middleware.ts from git tracking..."
git rm --cached middleware.ts 2>/dev/null || echo "  (already untracked)"
echo "middleware.ts" >> .gitignore

echo "📦 Committing the fix..."
git add -A
git commit -m "v107: remove middleware.ts from git (renamed to proxy.ts for Next.js 16), fix Google OAuth company context, add resend email button"

echo "🚀 Pushing to Vercel..."
git push

echo "✅ Done! Vercel deployment started."
