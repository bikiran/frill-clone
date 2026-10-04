import { NextRequest, NextResponse } from 'next/server'
import { cors, originOf } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// OAuth 2.0 Authorization Server Metadata (RFC 8414), served at
// /.well-known/oauth-authorization-server (and openid-configuration) via a
// rewrite in next.config.js. The issuer is the host the client used, so a
// business's own subdomain works end to end.
export async function GET(req: NextRequest) {
  const o = originOf(req)
  return NextResponse.json({
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/api/mcp/oauth/token`,
    registration_endpoint: `${o}/api/mcp/oauth/register`,
    revocation_endpoint: `${o}/api/mcp/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read', 'write'],
    service_documentation: `${o}/admin/integrations/mcp`,
  }, { headers: { ...cors, 'Cache-Control': 'public, max-age=300' } })
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }
