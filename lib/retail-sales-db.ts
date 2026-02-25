import {
  RetailSalesRow,
  RetailSalesTableData,
  DbRetailClothingRow,
  DbRetailAccRow,
} from './retail-sales-types';
import {
  normalizeSeasonKey,
  accCategoryToKey,
  BRD_CD_MAP,
} from './inventory-db';
import type { MonthlySeasonKey, MonthlyAccKey } from './inventory-monthly-types';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const SEASON_KEYS: MonthlySeasonKey[] = ['당년F', '당년S', '1년차', '2년차', '차기시즌', '과시즌'];
const ACC_KEYS: MonthlyAccKey[] = ['신발', '모자', '가방', '기타'];

const LABELS: Record<string, string> = {
  '당년F': '당년F', '당년S': '당년S',
  '1년차': '1년차', '2년차': '2년차', '차기시즌': '차기시즌', '과시즌': '과시즌',
  '신발': '신발', '모자': '모자', '가방': '가방', '기타': '기타',
  '의류합계': '의류합계', 'ACC합계': 'ACC합계', '매출합계': '매출합계',
};

// ─────────────────────────────────────────────
// YYMM → 날짜 범위 변환
// ─────────────────────────────────────────────

/**
 * YYMM 리스트 → SQL 날짜 범위 { startDate, endDate }
 * e.g. ['202501','202503'] → { startDate:'2025-01-01', endDate:'2025-04-01' }
 */
export function yymmToDateRange(yymmList: string[]): { startDate: string; endDate: string } {
  const sorted = [...yymmList].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const startDate = `${first.slice(0, 4)}-${first.slice(4, 6)}-01`;

  // 마지막 YYMM의 다음 달 1일
  const lastYear = parseInt(last.slice(0, 4), 10);
  const lastMonth = parseInt(last.slice(4, 6), 10);
  const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  return { startDate, endDate };
}

// ─────────────────────────────────────────────
// SQL 빌더 헬퍼
// ─────────────────────────────────────────────

function brdCdFilter(brdCd: string | undefined): string {
  return brdCd ? `AND s.brd_cd = '${brdCd}'` : '';
}

// ─────────────────────────────────────────────
// 4개 쿼리 빌더
// ─────────────────────────────────────────────

/** FR(대리상) 의류 리테일 매출 — 날짜 범위, GROUP BY yymm+sesn */
export function buildFrClothingRetailQuery(
  startDate: string,
  endDate: string,
  brdCd: string | undefined,
): string {
  return `
WITH sale_base AS (
  SELECT
    TO_CHAR(s.sale_dt, 'YYYYMM') AS yymm,
    s.sesn,
    SUBSTR(s.prdt_scs_cd, 7, 2) AS item,
    COALESCE(s.tag_amt, 0) AS sale_amt
  FROM CHN.dw_sale s
  JOIN CHN.dw_shop_wh_detail w
    ON s.shop_id = w.shop_id
  WHERE s.sale_dt >= '${startDate}'
    AND s.sale_dt < '${endDate}'
    ${brdCdFilter(brdCd)}
    AND w.fr_or_cls = 'FR'
),
prdt_dim AS (
  SELECT item, parent_prdt_kind_nm
  FROM (
    SELECT
      ITEM AS item,
      parent_prdt_kind_nm,
      ROW_NUMBER() OVER (PARTITION BY ITEM ORDER BY ITEM) AS rn
    FROM FNF.PRCS.DB_PRDT
    WHERE ITEM IS NOT NULL
  )
  WHERE rn = 1
),
joined AS (
  SELECT
    b.yymm,
    b.sesn,
    b.sale_amt,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm
  FROM sale_base b
  LEFT JOIN prdt_dim d ON b.item = d.item
)
SELECT
  yymm AS YYMM,
  sesn AS SEASON,
  SUM(sale_amt) AS SALES_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('의류', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

/** FR(대리상) ACC 리테일 매출 — 날짜 범위, GROUP BY yymm+중분류 */
export function buildFrAccRetailQuery(
  startDate: string,
  endDate: string,
  brdCd: string | undefined,
): string {
  return `
WITH sale_base AS (
  SELECT
    TO_CHAR(s.sale_dt, 'YYYYMM') AS yymm,
    s.sesn,
    SUBSTR(s.prdt_scs_cd, 7, 2) AS item,
    COALESCE(s.tag_amt, 0) AS sale_amt
  FROM CHN.dw_sale s
  JOIN CHN.dw_shop_wh_detail w
    ON s.shop_id = w.shop_id
  WHERE s.sale_dt >= '${startDate}'
    AND s.sale_dt < '${endDate}'
    ${brdCdFilter(brdCd)}
    AND w.fr_or_cls = 'FR'
),
prdt_dim AS (
  SELECT item, parent_prdt_kind_nm, prdt_kind_nm
  FROM (
    SELECT
      ITEM AS item,
      parent_prdt_kind_nm,
      prdt_kind_nm,
      ROW_NUMBER() OVER (PARTITION BY ITEM ORDER BY ITEM) AS rn
    FROM FNF.PRCS.DB_PRDT
    WHERE ITEM IS NOT NULL
  )
  WHERE rn = 1
),
joined AS (
  SELECT
    b.yymm,
    b.sesn,
    b.sale_amt,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm,
    d.prdt_kind_nm
  FROM sale_base b
  LEFT JOIN prdt_dim d ON b.item = d.item
)
SELECT
  yymm AS YYMM,
  CASE
    WHEN parent_prdt_kind_nm = 'ACC'      THEN prdt_kind_nm
    WHEN parent_prdt_kind_nm = 'UNMAPPED' THEN sesn
    ELSE 'OTHER'
  END AS ACC_MID_CATEGORY,
  SUM(sale_amt) AS SALES_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('ACC', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

/** OR(직영) 의류 리테일 매출 — shop_map CTE 방식, 맵핑 없는 매장도 OR로 포함 */
export function buildOrClothingRetailQuery(
  startDate: string,
  endDate: string,
  brdCd: string | undefined,
): string {
  return `
WITH shop_map AS (
  SELECT shop_id, MAX(fr_or_cls) AS fr_or_cls
  FROM CHN.dw_shop_wh_detail
  GROUP BY shop_id
),
sale_base AS (
  SELECT
    TO_CHAR(s.sale_dt, 'YYYYMM') AS yymm,
    s.sesn,
    SUBSTR(s.prdt_scs_cd, 7, 2) AS item,
    COALESCE(s.tag_amt, 0) AS sale_amt
  FROM CHN.dw_sale s
  LEFT JOIN shop_map w ON s.shop_id = w.shop_id
  WHERE s.sale_dt >= '${startDate}'
    AND s.sale_dt < '${endDate}'
    ${brdCdFilter(brdCd)}
    AND (w.fr_or_cls = 'OR' OR w.fr_or_cls IS NULL)
),
prdt_dim AS (
  SELECT item, parent_prdt_kind_nm
  FROM (
    SELECT
      ITEM AS item,
      parent_prdt_kind_nm,
      ROW_NUMBER() OVER (PARTITION BY ITEM ORDER BY ITEM) AS rn
    FROM FNF.PRCS.DB_PRDT
    WHERE ITEM IS NOT NULL
  )
  WHERE rn = 1
),
joined AS (
  SELECT
    b.yymm,
    b.sesn,
    b.sale_amt,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm
  FROM sale_base b
  LEFT JOIN prdt_dim d ON b.item = d.item
)
SELECT
  yymm AS YYMM,
  sesn AS SEASON,
  SUM(sale_amt) AS SALES_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('의류', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

/** OR(직영) ACC 리테일 매출 — shop_map CTE 방식, 맵핑 없는 매장도 OR로 포함 */
export function buildOrAccRetailQuery(
  startDate: string,
  endDate: string,
  brdCd: string | undefined,
): string {
  return `
WITH shop_map AS (
  SELECT shop_id, MAX(fr_or_cls) AS fr_or_cls
  FROM CHN.dw_shop_wh_detail
  GROUP BY shop_id
),
sale_base AS (
  SELECT
    TO_CHAR(s.sale_dt, 'YYYYMM') AS yymm,
    s.sesn,
    SUBSTR(s.prdt_scs_cd, 7, 2) AS item,
    COALESCE(s.tag_amt, 0) AS sale_amt
  FROM CHN.dw_sale s
  LEFT JOIN shop_map w ON s.shop_id = w.shop_id
  WHERE s.sale_dt >= '${startDate}'
    AND s.sale_dt < '${endDate}'
    ${brdCdFilter(brdCd)}
    AND (w.fr_or_cls = 'OR' OR w.fr_or_cls IS NULL)
),
prdt_dim AS (
  SELECT item, parent_prdt_kind_nm, prdt_kind_nm
  FROM (
    SELECT
      ITEM AS item,
      parent_prdt_kind_nm,
      prdt_kind_nm,
      ROW_NUMBER() OVER (PARTITION BY ITEM ORDER BY ITEM) AS rn
    FROM FNF.PRCS.DB_PRDT
    WHERE ITEM IS NOT NULL
  )
  WHERE rn = 1
),
joined AS (
  SELECT
    b.yymm,
    b.sesn,
    b.sale_amt,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm,
    d.prdt_kind_nm
  FROM sale_base b
  LEFT JOIN prdt_dim d ON b.item = d.item
)
SELECT
  yymm AS YYMM,
  CASE
    WHEN parent_prdt_kind_nm = 'ACC'      THEN prdt_kind_nm
    WHEN parent_prdt_kind_nm = 'UNMAPPED' THEN sesn
    ELSE 'OTHER'
  END AS ACC_MID_CATEGORY,
  SUM(sale_amt) AS SALES_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('ACC', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

// ─────────────────────────────────────────────
// Snowflake 실행 레이어
// ─────────────────────────────────────────────

async function executeSnowflakeQuery<T>(sql: string): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const snowflake = require('snowflake-sdk');

  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USER!,
    password: process.env.SNOWFLAKE_PASSWORD!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    role: process.env.SNOWFLAKE_ROLE,
  });

  return new Promise<T[]>((resolve, reject) => {
    conn.connect((connErr: Error | undefined) => {
      if (connErr) { reject(connErr); return; }
      conn.execute({
        sqlText: sql,
        complete: (execErr: Error | undefined, _stmt: unknown, rows: T[] | undefined) => {
          conn.destroy(() => {});
          if (execErr) { reject(execErr); return; }
          resolve(rows ?? []);
        },
      });
    });
  });
}

// ─────────────────────────────────────────────
// 데이터 변환
// ─────────────────────────────────────────────

function addToCell(
  map: Map<string, Map<string, number>>,
  key: string,
  yymm: string,
  value: number,
) {
  if (!map.has(key)) map.set(key, new Map());
  const byYymm = map.get(key)!;
  byYymm.set(yymm, (byYymm.get(yymm) ?? 0) + value);
}

/**
 * DB 조회 결과 + YYMM 리스트(1월~12월) → RetailSalesTableData
 * yymmList = [1월YYMM, ..., 12월YYMM] — opening 없음
 */
function buildRetailSalesTable(
  clothingRows: DbRetailClothingRow[],
  accRows: DbRetailAccRow[],
  yymmList: string[],       // 1월~12월 (12개)
  displayYear: number,
): RetailSalesTableData {
  const dataMap = new Map<string, Map<string, number>>();

  for (const row of clothingRows) {
    const key = normalizeSeasonKey(row.SEASON, displayYear);
    if (!key) continue;
    addToCell(dataMap, key, row.YYMM, row.SALES_AMT_SUM);
  }
  for (const row of accRows) {
    const key = accCategoryToKey(row.ACC_MID_CATEGORY);
    if (!key) continue;
    addToCell(dataMap, key, row.YYMM, row.SALES_AMT_SUM);
  }

  function getValue(key: string, yymm: string): number | null {
    return dataMap.get(key)?.get(yymm) ?? null;
  }

  function buildLeaf(key: MonthlySeasonKey | MonthlyAccKey): RetailSalesRow {
    return {
      key,
      label: LABELS[key] ?? key,
      isTotal: false,
      isSubtotal: false,
      isLeaf: true,
      monthly: yymmList.map((yymm) => getValue(key, yymm)),
    };
  }

  function buildSubtotal(key: string, children: RetailSalesRow[]): RetailSalesRow {
    function sumCol(col: (number | null)[]): number | null {
      const valid = col.filter((v): v is number => v !== null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) : null;
    }
    return {
      key,
      label: LABELS[key] ?? key,
      isTotal: key === '매출합계',
      isSubtotal: key !== '매출합계',
      isLeaf: false,
      monthly: Array.from({ length: 12 }, (_, i) =>
        sumCol(children.map((r) => r.monthly[i]))
      ),
    };
  }

  const clothingLeafs = SEASON_KEYS.map(buildLeaf);
  const accLeafs = ACC_KEYS.map(buildLeaf);
  const clothingSubtotal = buildSubtotal('의류합계', clothingLeafs);
  const accSubtotal = buildSubtotal('ACC합계', accLeafs);
  const grandTotal = buildSubtotal('매출합계', [clothingSubtotal, accSubtotal]);

  return {
    rows: [
      grandTotal,
      clothingSubtotal,
      ...clothingLeafs,
      accSubtotal,
      ...accLeafs,
    ],
  };
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────

export interface RetailSalesResult {
  dealer: RetailSalesTableData;
  hq: RetailSalesTableData;
}

/**
 * 4개 쿼리 실행 후 대리상(FR) / 직영(OR) 월별 리테일 매출 반환
 * @param yymmList [1월YYMM, ..., 12월YYMM] — CLOSED_THROUGH 필터 적용 후 queryable 값
 * @param brand    브랜드 (BRD_CD_MAP 키)
 * @param displayYear 연도 탭 (시즌 레이블 계산 기준)
 */
export async function fetchRetailSales(
  yymmList: string[],
  brand: string,
  displayYear: number,
): Promise<RetailSalesResult> {
  const brdCd = BRD_CD_MAP[brand];
  const { startDate, endDate } = yymmToDateRange(yymmList);

  const [frClothing, frAcc, orClothing, orAcc] = await Promise.all([
    executeSnowflakeQuery<DbRetailClothingRow>(buildFrClothingRetailQuery(startDate, endDate, brdCd)),
    executeSnowflakeQuery<DbRetailAccRow>(buildFrAccRetailQuery(startDate, endDate, brdCd)),
    executeSnowflakeQuery<DbRetailClothingRow>(buildOrClothingRetailQuery(startDate, endDate, brdCd)),
    executeSnowflakeQuery<DbRetailAccRow>(buildOrAccRetailQuery(startDate, endDate, brdCd)),
  ]);

  return {
    dealer: buildRetailSalesTable(frClothing, frAcc, yymmList, displayYear),
    hq: buildRetailSalesTable(orClothing, orAcc, yymmList, displayYear),
  };
}
