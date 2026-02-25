import { NextRequest, NextResponse } from 'next/server';
import { CLOSED_THROUGH, fetchMonthlyStock } from '@/lib/inventory-db';
import { MonthlyStockResponse, MonthlyStockRow } from '@/lib/inventory-monthly-types';

/** YYMM 문자열 생성 (예: year=2025, month=1 → '202501') */
function toYYMM(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`;
}

/**
 * year 기준 YYMM 리스트 생성
 * all[0]        = 기초 (전년 12월)
 * all[1..12]    = 해당 연도 1월~12월
 * queryable     = all 중 CLOSED_THROUGH 이하인 것만
 */
function buildYyymmList(year: number) {
  const all: string[] = [
    toYYMM(year - 1, 12),
    ...Array.from({ length: 12 }, (_, i) => toYYMM(year, i + 1)),
  ];
  const queryable = all.filter((yymm) => yymm <= CLOSED_THROUGH);
  return { all, queryable };
}

/**
 * DB 조회 결과의 monthly 배열(queryable 기준 인덱스)을
 * 연도 전체 12개월 기준으로 재정렬.
 * 미마감 월 → null, 마감 월 → DB 값 (없으면 null)
 */
function padRows(
  rows: MonthlyStockRow[],
  allYymms: string[],   // [기초, 1월..12월] 13개
  queryable: string[],  // [기초, ...마감월] ≤13개
): MonthlyStockRow[] {
  const allMonths = allYymms.slice(1);          // 1월~12월 12개
  const queryableMonths = queryable.slice(1);   // queryable 중 월별만

  return rows.map((row) => ({
    ...row,
    monthly: allMonths.map((yymm) => {
      if (yymm > CLOSED_THROUGH) return null;
      const idx = queryableMonths.indexOf(yymm);
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
  // 당월 재계산: 최신 1개 YYMM만 DB 조회
  const queryable = onlyLatest ? allQueryable.slice(-1) : allQueryable;

  if (queryable.length === 0) {
    return NextResponse.json({
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      dealer: { rows: [] },
      hq: { rows: [] },
    } satisfies MonthlyStockResponse);
  }

  try {
    const { dealer, hq } = await fetchMonthlyStock(queryable, brand, year);

    const response: MonthlyStockResponse = {
      year,
      brand,
      closedThrough: CLOSED_THROUGH,
      dealer: { rows: padRows(dealer.rows, allYymms, queryable) },
      hq:     { rows: padRows(hq.rows,     allYymms, queryable) },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[monthly-stock API] error:', err);
    return NextResponse.json(
      { error: '재고자산 데이터를 불러오는데 실패했습니다.' },
      { status: 500 },
    );
  }
}
