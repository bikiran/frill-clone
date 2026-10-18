import type { NextRequest } from 'next/server'
import { preferencesGet, preferencesPost } from '@/lib/email-unsubscribe-routes'

export const dynamic = 'force-dynamic'

// A customer's email (and text) preferences for one business, from the link
// in its marketing email. Handlers: lib/email-unsubscribe-routes.ts.
export async function GET(req: NextRequest) { return preferencesGet(req) }
export async function POST(req: NextRequest) { return preferencesPost(req) }
