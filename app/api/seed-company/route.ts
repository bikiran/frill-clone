import { NextRequest, NextResponse } from 'next/server'
import { seedCompanyData } from '@/lib/seedCompany'

export async function POST(req: NextRequest) {
  try {
    const { companyId, companyName } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const result = await seedCompanyData(companyId, companyName || 'Your Company')
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
