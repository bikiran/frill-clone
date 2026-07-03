import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SegmentationService } from '@/lib/segmentation-service'

/**
 * POST /api/customers/segment
 * Get customers matching a specific segment
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, segmentId } = await req.json()

    if (!companyId || !segmentId) {
      return NextResponse.json(
        { error: 'Missing companyId or segmentId' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get all customers
    const { data: customers } = await supabase
      .from('woocommerce_customers')
      .select('*')
      .eq('company_id', companyId)

    if (!customers) {
      return NextResponse.json({ customers: [] })
    }

    // Find segment
    const segments = SegmentationService.getSegments()
    const segment = segments.find(s => s.id === segmentId)

    if (!segment) {
      return NextResponse.json(
        { error: 'Segment not found' },
        { status: 404 }
      )
    }

    // Filter customers
    const filtered = SegmentationService.filterBySegment(customers, segment)

    return NextResponse.json({
      segment,
      customers: filtered,
      count: filtered.length
    })
  } catch (error: any) {
    console.error('[Segmentation] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Segmentation failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/customers/segment
 * Get all available segments with counts
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get all customers
    const { data: customers } = await supabase
      .from('woocommerce_customers')
      .select('*')
      .eq('company_id', companyId)

    if (!customers) {
      return NextResponse.json({ segments: [] })
    }

    // Get all segments with counts
    const segments = SegmentationService.getSegments().map(segment => ({
      ...segment,
      customerCount: SegmentationService.filterBySegment(customers, segment).length
    }))

    return NextResponse.json({ segments })
  } catch (error: any) {
    console.error('[Segmentation] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch segments' },
      { status: 500 }
    )
  }
}
