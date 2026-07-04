import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SegmentationService } from '@/lib/segmentation-service'

export async function POST(req: NextRequest) {
  try {
    const { companyId, segmentId } = await req.json()

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: customers } = await sb
      .from('woocommerce_customers')
      .select('*')
      .eq('company_id', companyId)

    if (!customers || customers.length === 0) {
      return NextResponse.json({ error: 'No customers found' }, { status: 404 })
    }

    let filteredCustomers = customers
    if (segmentId) {
      const segments = SegmentationService.getSegments()
      const segment = segments.find(s => s.id === segmentId)
      if (segment) {
        filteredCustomers = SegmentationService.filterBySegment(customers, segment)
      }
    }

    const headers = ['ID', 'Email', 'First Name', 'Last Name', 'Phone', 'Total Spend', 'Total Orders', 'Avg Order Value', 'Last Order Date', 'First Order Date', 'RFM Score', 'RFM Category']

    const rows = filteredCustomers.map(customer => {
      const rfmScore = SegmentationService.getRFMScore(customer)
      const rfmCategory = SegmentationService.getRFMCategory(rfmScore)

      return [
        customer.id,
        customer.email,
        customer.first_name || '',
        customer.last_name || '',
        customer.phone || '',
        customer.total_spend.toFixed(2),
        customer.total_orders,
        customer.average_order_value.toFixed(2),
        customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString() : '',
        customer.first_order_date ? new Date(customer.first_order_date).toLocaleDateString() : '',
        rfmScore,
        rfmCategory
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error: any) {
    console.error('[Customer Export] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to export customers' }, { status: 500 })
  }
}
