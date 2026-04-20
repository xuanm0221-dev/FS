// Tag매출 전처리 — Snowflake에서 1회 조회 후 in-memory 캐시 (연도별 별도)
import { NextResponse } from 'next/server';
import { fetchTagSalesByYear, TagSales2025Result } from '@/lib/pl-tag-sales-2025-preprocess-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var _tagSalesCacheByYear: Record<number, { data: TagSales2025Result; at: number }> | undefined;
  // eslint-disable-next-line no-var
  var _tagSalesInflightByYear: Record<number, Promise<TagSales2025Result> | undefined> | undefined;
}

// 히스토리컬 데이터 → 긴 TTL (12시간)
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year') ?? '2025');
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: '유효한 year 파라미터가 필요합니다.' }, { status: 400 });
    }
    const force = url.searchParams.get('refresh') === '1';
    const now = Date.now();

    if (!global._tagSalesCacheByYear) global._tagSalesCacheByYear = {};
    if (!global._tagSalesInflightByYear) global._tagSalesInflightByYear = {};

    const cached = global._tagSalesCacheByYear[year];
    if (!force && cached && now - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(
        { year, ...cached.data, cachedAt: cached.at },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const existingInflight = global._tagSalesInflightByYear[year];
    if (!force && existingInflight) {
      const data = await existingInflight;
      return NextResponse.json(
        { year, ...data, cachedAt: global._tagSalesCacheByYear[year]?.at ?? now },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const inflight = fetchTagSalesByYear(year)
      .then((data) => {
        global._tagSalesCacheByYear![year] = { data, at: Date.now() };
        global._tagSalesInflightByYear![year] = undefined;
        return data;
      })
      .catch((err) => {
        global._tagSalesInflightByYear![year] = undefined;
        throw err;
      });
    global._tagSalesInflightByYear[year] = inflight;
    const data = await inflight;

    return NextResponse.json(
      { year, ...data, cachedAt: global._tagSalesCacheByYear[year]?.at ?? now },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Tag매출 전처리 오류: ${message}` }, { status: 500 });
  }
}
