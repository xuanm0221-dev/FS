// ─────────────────────────────────────────────
// 직영 ACC 입고 누적 금액 (원가 기준) Snowflake 쿼리
// 소스: sap_fnf.dw_cn_ivtr_prdt_m
// 금액 컬럼: stor_amt
// 월 컬럼: yyyymm (INT, e.g. 202601)
// ACC 매핑: FNF.PRCS.DB_PRDT (PARENT_PRDT_KIND_NM_ENG='ACC',
//          PRDT_KIND_NM_ENG IN 'Shoes','Headwear','Bag','Acc_etc')
// 조인: SUBSTR(a.prdt_cd, 7, 2) = db.ITEM
// 브랜드: BRD_CD_MAP (M=MLB, I=MLB KIDS, X=DISCOVERY)
// ─────────────────────────────────────────────
import { executeSnowflakeQuery } from './snowflake-client';
import { BRD_CD_MAP } from './inventory-db';

export interface ActualArrivalMonthly {
  yyyymm: number;         // e.g. 202604
  arrivalAmtCny: number;  // 원본 합계 (1위안 단위)
}

export interface ActualArrivalResult {
  brand: string;
  year: number;
  monthly: ActualArrivalMonthly[];
  throughMonth: number;      // 데이터가 존재하는 최신 월 (1~12)
  cumulativeAmtM: number;    // 1월~throughMonth 누적 (M = 백만위안, 소수점 2자리)
  sqlUsed: string;           // 디버깅용
}

function buildSql(brdCd: string, year: number): string {
  const startYyyymm = year * 100 + 1;   // 202601
  const endYyyymm = year * 100 + 12;    // 202612
  return `
WITH acc_item_map AS (
  SELECT DISTINCT ITEM, PRDT_KIND_NM_ENG
  FROM FNF.PRCS.DB_PRDT
  WHERE PARENT_PRDT_KIND_NM_ENG = 'ACC'
    AND PRDT_KIND_NM_ENG IN ('Shoes','Headwear','Bag','Acc_etc')
),
base AS (
  SELECT
    a.yyyymm                            AS YYYYMM,
    a.stor_amt                          AS in_stock_amt
  FROM sap_fnf.dw_cn_ivtr_prdt_m a
  JOIN acc_item_map db
    ON SUBSTR(a.prdt_cd, 7, 2) = db.ITEM
  WHERE a.brd_cd = '${brdCd}'
    AND a.yyyymm BETWEEN ${startYyyymm} AND ${endYyyymm}
)
SELECT
  YYYYMM,
  SUM(in_stock_amt) AS ARRIVAL_AMT
FROM base
GROUP BY YYYYMM
ORDER BY YYYYMM
`.trim();
}

interface QueryRow {
  YYYYMM: number | string | null;
  ARRIVAL_AMT: number | string | null;
}

export async function fetchActualArrival(
  brand: 'MLB' | 'MLB KIDS' | 'DISCOVERY',
  year: number,
): Promise<ActualArrivalResult> {
  const brdCd = BRD_CD_MAP[brand];
  if (!brdCd) {
    throw new Error(`알 수 없는 brand: ${brand}`);
  }
  const sql = buildSql(brdCd, year);
  const rows = await executeSnowflakeQuery<QueryRow>(sql);

  const monthly: ActualArrivalMonthly[] = rows
    .map((r) => ({
      yyyymm: r.YYYYMM == null ? 0 : Number(r.YYYYMM),
      arrivalAmtCny: r.ARRIVAL_AMT == null ? 0 : Number(r.ARRIVAL_AMT),
    }))
    .filter((r) => Number.isInteger(r.yyyymm) && r.yyyymm > 0 && Number.isFinite(r.arrivalAmtCny));

  let throughMonth = 0;
  for (const m of monthly) {
    const mm = m.yyyymm % 100;
    if (mm > throughMonth) throughMonth = mm;
  }

  const totalCny = monthly.reduce((sum, m) => sum + m.arrivalAmtCny, 0);
  const cumulativeAmtM = Math.round((totalCny / 1_000_000) * 100) / 100;

  return {
    brand,
    year,
    monthly,
    throughMonth,
    cumulativeAmtM,
    sqlUsed: sql,
  };
}
