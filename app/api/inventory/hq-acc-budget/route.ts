import { NextRequest, NextResponse } from 'next/server';
import { readHqAccBudgetStore, writeHqAccBudgetStore, HqAccBudgetEntry } from '@/lib/inventory-file-store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await readHqAccBudgetStore();
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[HQ-ACC-BUDGET API] GET error:', message);
    return NextResponse.json({ error: `조회 오류: ${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      data?: Record<string, HqAccBudgetEntry>;
    };
    if (!body.data) {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }
    await writeHqAccBudgetStore(body.data);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[HQ-ACC-BUDGET API] POST error:', err);
    return NextResponse.json({ error: 'Failed to save HQ ACC budget data' }, { status: 500 });
  }
}
