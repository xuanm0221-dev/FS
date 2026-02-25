import { RetailSalesRow, RetailSalesTableData } from './retail-sales-types';
import { normalizeSeasonKey, accCategoryToKey, BRD_CD_MAP } from './inventory-db';
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
  '의류합계': '의류합계', 'ACC합계': 'ACC합계', '매입합계': '매입합계',
};

// ─────────────────────────────────────────────
// 시즌 정규화
// ─────────────────────────────────────────────

/**
 * SAP_FNF.DW_CN_IVTR_PRDT_M 의 SESN 컬럼 정규화
 * SAP 테이블은 N=Fall 형식 사용 → F로 치환 후 normalizeSeasonKey 재사용
 */
function normalizePurchaseSeason(
  sesn: string | null,
  displayYear: number,
): MonthlySeasonKey | null {
  if (!sesn) return null;
  const normalized = sesn.replace(/N$/, 'F');
  return normalizeSeasonKey(normalized, displayYear);
}

// ─────────────────────────────────────────────
// SQL 빌더
// ─────────────────────────────────────────────

function yymmInClause(yymmList: string[]): string {
  return yymmList.map((y) => `'${y}'`).join(', ');
}

function brdCdFilter(brdCd: string | undefined): string {
  return brdCd ? `AND A.BRD_CD = '${brdCd}'` : '';
}

/** 본사 매입상품 의류 쿼리 — YYYYMM IN, GROUP BY YYYYMM + SESN */
export function buildPurchaseClothingQuery(
  yymmList: string[],
  brdCd: string | undefined,
): string {
  return `
WITH in_base AS (
  SELECT
    A.YYYYMM,
    A.SESN,
    SUBSTR(A.PRDT_CD, 7, 2) AS ITEM,
    COALESCE(A.STOR_AMT, 0) AS STOR_AMT
  FROM SAP_FNF.DW_CN_IVTR_PRDT_M A
  WHERE A.YYYYMM IN (${yymmInClause(yymmList)})
    ${brdCdFilter(brdCd)}
),
prdt_dim AS (
  SELECT ITEM, parent_prdt_kind_nm
  FROM (
    SELECT
      ITEM,
      parent_prdt_kind_nm,
      ROW_NUMBER() OVER (PARTITION BY ITEM ORDER BY ITEM) AS rn
    FROM FNF.PRCS.DB_PRDT
    WHERE ITEM IS NOT NULL
  )
  WHERE rn = 1
),
joined AS (
  SELECT
    b.YYYYMM,
    b.SESN,
    b.STOR_AMT,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm
  FROM in_base b
  LEFT JOIN prdt_dim d ON b.ITEM = d.ITEM
)
SELECT
  YYYYMM,
  SESN AS SEASON,
  SUM(STOR_AMT) AS STOR_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('의류', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

/** 본사 매입상품 ACC 쿼리 — YYYYMM IN, GROUP BY YYYYMM + prdt_kind_nm(중분류) */
export function buildPurchaseAccQuery(
  yymmList: string[],
  brdCd: string | undefined,
): string {
  return `
WITH in_base AS (
  SELECT
    A.YYYYMM,
    A.SESN,
    SUBSTR(A.PRDT_CD, 7, 2) AS ITEM,
    COALESCE(A.STOR_AMT, 0) AS STOR_AMT
  FROM SAP_FNF.DW_CN_IVTR_PRDT_M A
  WHERE A.YYYYMM IN (${yymmInClause(yymmList)})
    ${brdCdFilter(brdCd)}
),
prdt_dim AS (
  SELECT ITEM, parent_prdt_kind_nm, prdt_kind_nm
  FROM (
    SELECT
      ITEM,
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
    b.YYYYMM,
    b.SESN,
    b.STOR_AMT,
    COALESCE(d.parent_prdt_kind_nm, 'UNMAPPED') AS parent_prdt_kind_nm,
    d.prdt_kind_nm
  FROM in_base b
  LEFT JOIN prdt_dim d ON b.ITEM = d.ITEM
)
SELECT
  YYYYMM,
  CASE
    WHEN parent_prdt_kind_nm = 'ACC'      THEN prdt_kind_nm
    WHEN parent_prdt_kind_nm = 'UNMAPPED' THEN SESN
    ELSE 'OTHER'
  END AS ACC_MID_CATEGORY,
  SUM(STOR_AMT) AS STOR_AMT_SUM
FROM joined
WHERE parent_prdt_kind_nm IN ('ACC', 'UNMAPPED')
GROUP BY 1, 2
ORDER BY 1, 2
`;
}

// ─────────────────────────────────────────────
// DB raw row 타입
// ─────────────────────────────────────────────

interface DbPurchaseClothingRow {
  YYYYMM: string;
  SEASON: string;
  STOR_AMT_SUM: number;
}

interface DbPurchaseAccRow {
  YYYYMM: string;
  ACC_MID_CATEGORY: string;
  STOR_AMT_SUM: number;
}

// ─────────────────────────────────────────────
// Snowflake 실행
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
 * DB 조회 결과 → RetailSalesTableData
 * yymmList = [1월YYMM, ..., 12월YYMM] (기초 없음)
 */
function buildPurchaseTable(
  clothingRows: DbPurchaseClothingRow[],
  accRows: DbPurchaseAccRow[],
  yymmList: string[],
  displayYear: number,
): RetailSalesTableData {
  const dataMap = new Map<string, Map<string, number>>();

  for (const row of clothingRows) {
    const key = normalizePurchaseSeason(row.SEASON, displayYear);
    if (!key) continue;
    addToCell(dataMap, key, row.YYYYMM, row.STOR_AMT_SUM);
  }
  for (const row of accRows) {
    const key = accCategoryToKey(row.ACC_MID_CATEGORY);
    if (!key) continue;
    addToCell(dataMap, key, row.YYYYMM, row.STOR_AMT_SUM);
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
      isTotal: key === '매입합계',
      isSubtotal: key !== '매입합계',
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
  const grandTotal = buildSubtotal('매입합계', [clothingSubtotal, accSubtotal]);

  return {
    rows: [grandTotal, clothingSubtotal, ...clothingLeafs, accSubtotal, ...accLeafs],
  };
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────

/**
 * 본사 매입상품 쿼리 실행 후 RetailSalesTableData 반환
 * @param yymmList [1월YYMM, ..., 12월YYMM] — CLOSED_THROUGH 필터 적용 후 queryable 값
 * @param brand    브랜드 (BRD_CD_MAP 키)
 * @param displayYear 연도 탭 (시즌 레이블 계산 기준)
 */
export async function fetchPurchaseSales(
  yymmList: string[],
  brand: string,
  displayYear: number,
): Promise<RetailSalesTableData> {
  const brdCd = BRD_CD_MAP[brand];

  const [clothingRows, accRows] = await Promise.all([
    executeSnowflakeQuery<DbPurchaseClothingRow>(buildPurchaseClothingQuery(yymmList, brdCd)),
    executeSnowflakeQuery<DbPurchaseAccRow>(buildPurchaseAccQuery(yymmList, brdCd)),
  ]);

  return buildPurchaseTable(clothingRows, accRows, yymmList, displayYear);
}
