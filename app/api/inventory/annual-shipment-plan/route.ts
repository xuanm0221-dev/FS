import { NextRequest, NextResponse } from 'next/server';
import { readAnnualPlanStore, writeAnnualPlanStore } from '@/lib/inventory-file-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') ?? '2026');
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    const store = await readAnnualPlanStore();
    return NextResponse.json({ data: store[String(year)] ?? null });
  } catch (error) {
    console.error('annual shipment plan GET error:', error);
    return NextResponse.json({ data: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      year?: number;
      data?: unknown;
    };
    const year = Number(body.year ?? 2026);
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    const store = await readAnnualPlanStore();
    store[String(year)] = (body.data ?? null) as never;
    await writeAnnualPlanStore(store);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('annual shipment plan POST error:', error);
    return NextResponse.json({ error: 'Failed to save annual shipment plan' }, { status: 500 });
  }
}
