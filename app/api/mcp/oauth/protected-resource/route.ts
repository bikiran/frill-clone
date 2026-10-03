import { NextRequest, NextResponse } from 'next/server'
import { cors, mcpUrl, originOf } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// OAuth 2.0 Protected Resource Metadata (RFC 9728) for /api/mcp, served at
// /.well-known/oauth-protected-resource[/api/mcp] via next.config.js.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    resource: mcpUrl(req),
    authorization_servers: [originOf(req)],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header'],
    resource_name: 'Colvy',
    resource_documentation: `${originOf(req)}/admin/integrations/mcp`,
  }, { headers: { ...cors, 'Cache-Control': 'public, max-age=300' } })
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }
