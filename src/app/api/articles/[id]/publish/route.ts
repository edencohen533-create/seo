import { NextRequest, NextResponse } from 'next/server'
import { publishArticleToDraft } from '@/modules/publisher'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = await publishArticleToDraft(params.id)
  return NextResponse.json({ success: true, url })
}
