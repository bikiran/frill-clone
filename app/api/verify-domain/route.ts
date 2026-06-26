import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')

  if (!domain) return NextResponse.json({ error: 'No domain' }, { status: 400 })

  try {
    // Try to fetch the domain to see if it resolves
    // In production this would do a DNS lookup or check Vercel
    // For now we check if the domain has a CNAME to cns.vercel-dns.com
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const res = await fetch(`https://${domain}`, {
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)
      // If we get any response, domain resolves
      return NextResponse.json({ verified: true, status: res.status })
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ verified: false, error: 'Domain timed out' })
      }
      // DNS doesn't resolve
      return NextResponse.json({ verified: false, error: 'Domain does not resolve' })
    }
  } catch (err: any) {
    return NextResponse.json({ verified: false, error: err.message })
  }
}
