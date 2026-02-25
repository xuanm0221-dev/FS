import { NextRequest, NextResponse } from 'next/server';
import { Brand, InventoryApiResponse, InventoryParams } from '@/lib/inventory-types';
import { MOCK_DATA } from '@/lib/inventory-mock';
import { buildTableData, applyTargetWOI, applyTargetWOIForHq } from '@/lib/inventory-calc';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get('year') ?? '2025', 10);
  const growthRate = parseFloat(searchParams.get('growthRate') ?? '5');
  const brand = (searchParams.get('brand') ?? '전체') as Brand;
  const targetDealerWOI = parseFloat(searchParams.get('targetDealerWOI') ?? '30');
  const targetHqWOI = parseFloat(searchParams.get('targetHqWOI') ?? '10');

  const params: InventoryParams = { year, growthRate, brand };

  try {
    // ──────────────────────────────────────────────────────────────
    // TODO: Snowflake SQL 연동 시 아래 Mock 블록을 교체하세요.
    //
    // import { createConnection } from 'snowflake-sdk';
    //
    // SELECT season_key, brand, month,
    //        SUM(sell_in_qty)  AS sell_in,
    //        SUM(sell_out_qty) AS sell_out,
    //        MAX(closing_qty)  AS closing
    // FROM FNF.SAP_FNF.DEALER_INVENTORY
    // WHERE fiscal_year = :year AND brand_group = :brand
    // GROUP BY season_key, brand, month
    // ORDER BY season_key, month;
    //
    // SELECT season_key, brand, month,
    //        SUM(purchase_qty)   AS sell_in,   -- 상품매입
    //        SUM(shipment_qty)   AS sell_out,  -- 대리상출고
    //        MAX(closing_qty)    AS closing
    // FROM FNF.SAP_FNF.HQ_INVENTORY
    // WHERE fiscal_year = :year AND brand_group = :brand
    // GROUP BY season_key, brand, month
    // ORDER BY season_key, month;
    // ──────────────────────────────────────────────────────────────

    const baseYearData = MOCK_DATA[2025];
    const brandData = baseYearData[brand] ?? baseYearData['전체'];

    let dealerRaw: typeof brandData.dealer;
    let hqRaw: typeof brandData.hq;

    if (year === 2026) {
      // 2026년: 목표 재고주수 기반 역산
      // 대리상: 목표기말 = 주당판매×목표WOI, 필요 Sell-in = 목표기말 + 판매계획 - 기초
      dealerRaw = applyTargetWOI(brandData.dealer, targetDealerWOI, growthRate);
      // 본사: sellOut = 대리상 sellIn (출고), 동일 역산
      hqRaw = applyTargetWOIForHq(brandData.hq, dealerRaw, targetHqWOI);
    } else {
      // 2025년: 실적 그대로
      dealerRaw = brandData.dealer;
      hqRaw = brandData.hq;
    }

    const response: InventoryApiResponse = {
      year: params.year,
      brand: params.brand,
      dealer: buildTableData(dealerRaw),
      hq: buildTableData(hqRaw),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[inventory API] error:', err);
    return NextResponse.json({ error: '데이터를 불러오는데 실패했습니다.' }, { status: 500 });
  }
}
