import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/version
 *
 * Tells the mobile app the latest published version per platform so it can show
 * an in-app "update available" prompt when the installed build is behind.
 *
 * Values come from env so a new release can be announced without a code change:
 *   APP_ANDROID_LATEST / APP_IOS_LATEST — newest version on the store
 *   APP_ANDROID_MIN    / APP_IOS_MIN    — hard minimum (below this = forced update)
 *   APP_ANDROID_URL    / APP_IOS_URL    — store listing to open
 *
 * Defaults deliberately match the currently shipped app version, so nothing
 * prompts until these are bumped after a real store release.
 */
const CURRENT = '1.3.0'

export async function GET() {
  return NextResponse.json({
    android: {
      latest: process.env.APP_ANDROID_LATEST || CURRENT,
      min: process.env.APP_ANDROID_MIN || '0.0.0',
      url: process.env.APP_ANDROID_URL || 'https://play.google.com/store/apps/details?id=com.colvy.app',
    },
    ios: {
      latest: process.env.APP_IOS_LATEST || CURRENT,
      min: process.env.APP_IOS_MIN || '0.0.0',
      url: process.env.APP_IOS_URL || 'https://apps.apple.com/app/colvy/id0000000000',
    },
  })
}
