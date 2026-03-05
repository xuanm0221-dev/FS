import { NextRequest, NextResponse } from 'next/server';
import { CLOSED_THROUGH } from '@/lib/inventory-db';
import { fetchShipmentSales } from '@/lib/shipment-sales-db';
import { RetailSalesTableData, RetailSalesRow } from '@/lib/retail-sales-types';

export interface ShipmentSalesResponse {
  year: number;
  brand: string;
  closedThrough: string;
  data: RetailSalesTableData;
}

function toYYMM(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

function buildYyymmList(year: number) {
  const all: string[] = Array.from({ length: 12 }, (_, i) => toYYMM(year, i + 1));
  const queryable = all.filter((yymm) => yymm <= CLOSED_THROUGH);
  return { all, queryable };
}

function padRows(
  rows: RetailSalesRow[],
  allYymms: string[],
  queryable: string[],
  includeFuture: boolean,
): RetailSalesRow[] {
  return rows.map((row) => ({
    ...row,
    monthly: allYymms.map((yymm) => {
      if (!includeFuture && yymm > CLOSED_THROUGH) return null;
      const idx = queryable.indexOf(yymm);
      return idx >= 0 ? (row.monthly[idx] ?? null) : null;
    }),
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get('year') ?? '2025', 10);
  const brand = searchParams.get('brand') ?? 'MLB';
  const onlyLatest = searchParams.get('onlyLatest') === 'true';
  const includeFuture = searchParams.get('includeFuture') === 'true';

  const { all: allYymms, queryable: allQueryable } = buildYyymmList(year);
  const baseQueryable = includeFuture ? allYymms : allQueryable;
  const queryable = onlyLatest ? baseQueryable.slice(-1) : baseQueryable;

  if (queryable.length === 0) {
    return NextResponse.json({
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      data: { rows: [] },
    } satisfies ShipmentSalesResponse);
  }

  try {
    const tableData = await fetchShipmentSales(queryable, brand, year);

    const response: ShipmentSalesResponse = {
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      data: { rows: padRows(tableData.rows, allYymms, queryable, includeFuture) },
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[shipment-sales API] error:', message);
    return NextResponse.json(
      { error: `출고매출 오류: ${message}` },
      { status: 500 },
    );
  }
}
