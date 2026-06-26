import { NextResponse } from 'next/server'

// Returns the current deployment build ID
// Clients poll this to detect when a new version is deployed
export async function GET() {
  return NextResponse.json({
    buildId: process.env.NEXT_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(),
    deployedAt: new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  })
}
