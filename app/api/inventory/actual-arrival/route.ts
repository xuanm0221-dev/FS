// ACC 실제 입고 (Snowflake 실시간) — Python 전처리 스크립트 전용 엔드포인트
// 사용자 UI는 이 API를 직접 호출하지 않고, 전처리된 JSON 파일을 읽음
// (scripts/refresh_2026_actual_arrival.py 가 이 API를 호출하여 public/data/.../*.json 으로 dump)
import { NextRequest, NextResponse } from 'next/server';
import { fetchActualArrival } from '@/lib/actual-arrival-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_BRANDS = ['MLB', 'MLB KIDS', 'DISCOVERY'] as const;
type ValidBrand = (typeof VALID_BRANDS)[number];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year') ?? '2026');
    const brandParam = url.searchParams.get('brand') ?? '';
    const debug = url.searchParams.get('debug') === '1';

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: '유효한 year 파라미터가 필요합니다.' }, { status: 400 });
    }
    if (!(VALID_BRANDS as readonly string[]).includes(brandParam)) {
      return NextResponse.json(
        { error: `brand는 ${VALID_BRANDS.join(' / ')} 중 하나여야 합니다.` },
        { status: 400 },
      );
    }
    const brand = brandParam as ValidBrand;

    const result = await fetchActualArrival(brand, year);

    const payload: Record<string, unknown> = {
      brand: result.brand,
      year: result.year,
      throughMonth: result.throughMonth,
      cumulativeAmtM: result.cumulativeAmtM,
      monthly: result.monthly,
    };
    if (debug) payload.sqlUsed = result.sqlUsed;

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[actual-arrival API] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
