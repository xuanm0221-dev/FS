import { NextRequest, NextResponse } from 'next/server';
import { readSnapshotsStore, snapshotStoreKey, writeSnapshotsStore } from '@/lib/inventory-file-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year'));
    const brand = (searchParams.get('brand') ?? '').trim();
    if (!Number.isFinite(year) || !brand) {
      return NextResponse.json({ error: 'Invalid year/brand' }, { status: 400 });
    }
    const store = await readSnapshotsStore();
    const data = store[snapshotStoreKey(year, brand)] ?? null;
    return NextResponse.json({ data: data ?? null });
  } catch (error) {
    console.error('inventory snapshot GET error:', error);
    return NextResponse.json({ data: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      year?: number;
      brand?: string;
      data?: unknown;
    };
    const year = Number(body.year);
    const brand = (body.brand ?? '').trim();
    if (!Number.isFinite(year) || !brand) {
      return NextResponse.json({ error: 'Invalid year/brand' }, { status: 400 });
    }
    const store = await readSnapshotsStore();
    store[snapshotStoreKey(year, brand)] = (body.data ?? null) as never;
    await writeSnapshotsStore(store);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('inventory snapshot POST error:', error);
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
  }
}
