import { NextRequest, NextResponse } from 'next/server';
import { CLOSED_THROUGH } from '@/lib/inventory-db';
import { fetchPurchaseSales } from '@/lib/purchase-db';
import { RetailSalesTableData, RetailSalesRow } from '@/lib/retail-sales-types';

export interface PurchaseResponse {
  year: number;
  brand: string;
  closedThrough: string;
  data: RetailSalesTableData;
}

/** YYMM 문자열 생성 (예: year=2025, month=1 → '202501') */
function toYYMM(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

/**
 * year 기준 YYMM 리스트 생성 — 기초 없음, 1월~12월만
 * queryable = CLOSED_THROUGH 이하인 월만
 */
function buildYyymmList(year: number) {
  const all: string[] = Array.from({ length: 12 }, (_, i) => toYYMM(year, i + 1));
  const queryable = all.filter((yymm) => yymm <= CLOSED_THROUGH);
  return { all, queryable };
}

function padRows(
  rows: RetailSalesRow[],
  allYymms: string[],
  queryable: string[],
): RetailSalesRow[] {
  return rows.map((row) => ({
    ...row,
    monthly: allYymms.map((yymm) => {
      if (yymm > CLOSED_THROUGH) return null;
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

  const { all: allYymms, queryable: allQueryable } = buildYyymmList(year);
  const queryable = onlyLatest ? allQueryable.slice(-1) : allQueryable;

  if (queryable.length === 0) {
    return NextResponse.json({
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      data: { rows: [] },
    } satisfies PurchaseResponse);
  }

  try {
    const tableData = await fetchPurchaseSales(queryable, brand, year);

    const response: PurchaseResponse = {
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      data: { rows: padRows(tableData.rows, allYymms, queryable) },
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[purchase API] error:', message);
    return NextResponse.json(
      { error: `매입상품 오류: ${message}` },
      { status: 500 },
    );
  }
}
