import { RetailSalesRow, RetailSalesTableData } from './retail-sales-types';
import { normalizeSeasonKey, BRD_CD_MAP } from './inventory-db';
import { yymmToDateRange } from './retail-sales-db';
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
  '의류합계': '의류합계', 'ACC합계': 'ACC합계', '출고매출합계': '출고매출합계',
};

// ACC prdt_hrrc_cd2 → AccKey
const ACC_CODE_MAP: Record<string, MonthlyAccKey> = {
  A0100A0120: '기타',
  A0100A0130: '가방',
  A0100A0140: '모자',
  A0100A0150: '신발',
};

// ─────────────────────────────────────────────
// 시즌 정규화
// ─────────────────────────────────────────────

/**
 * SUBSTR(prdt_cd,2,3) 형태의 시즌 코드 정규화
 * N = Fall → F로 치환 후 기존 normalizeSeasonKey 재사용
 * 예: "24N" → "24F", "25F" → "25F", "25S" → "25S"
 */
function normalizeShipmentSeason(
  rawSeason: string | null,
  displayYear: number,
): MonthlySeasonKey | null {
  if (!rawSeason) return null;
  const normalized = rawSeason.replace(/N$/, 'F');
  return normalizeSeasonKey(normalized, displayYear);
}

// ─────────────────────────────────────────────
// SQL 빌더
// ─────────────────────────────────────────────

function brdCdFilter(brdCd: string | undefined): string {
  return brdCd ? `AND brd_cd = '${brdCd}'` : '';
}

/**
 * 본사→대리상(chnl_cd=84) 출고매출 쿼리
 * 결과: { YYMM, MAJOR_CLS, SUB_CLS_OR_SEASON, SALE_AMT_SUM }
 */
export function buildShipmentSalesQuery(
  startDate: string,
  endDate: string,
  brdCd: string | undefined,
): string {
  return `
WITH base AS (
  SELECT
    prdt_hrrc_cd1,
    prdt_hrrc_cd2,
    prdt_cd,
    TO_CHAR(CAST(pst_dt AS DATE), 'YYYYMM') AS yymm,
    tag_sale_amt
  FROM sap_fnf.dw_cn_copa_d
  WHERE chnl_cd = '84'
    ${brdCdFilter(brdCd)}
    AND CAST(pst_dt AS DATE) >= DATE '${startDate}'
    AND CAST(pst_dt AS DATE) <  DATE '${endDate}'
    AND prdt_hrrc_cd1 IN ('A0100', 'L0100')
),
labeled AS (
  SELECT
    yymm,
    CASE
      WHEN prdt_hrrc_cd1 = 'A0100' THEN 'ACC'
      WHEN prdt_hrrc_cd1 = 'L0100' THEN '의류'
    END AS major_cls,
    CASE
      WHEN prdt_hrrc_cd1 = 'A0100' THEN
        CASE
          WHEN prdt_hrrc_cd2 = 'A0100A0120' THEN 'A0100A0120'
          WHEN prdt_hrrc_cd2 = 'A0100A0130' THEN 'A0100A0130'
          WHEN prdt_hrrc_cd2 = 'A0100A0140' THEN 'A0100A0140'
          WHEN prdt_hrrc_cd2 = 'A0100A0150' THEN 'A0100A0150'
          ELSE 'ACC_OTHER'
        END
      WHEN prdt_hrrc_cd1 = 'L0100' THEN
        SUBSTR(prdt_cd, 2, 3)
    END AS sub_cls_or_season,
    tag_sale_amt
  FROM base
)
SELECT
  yymm      AS YYMM,
  major_cls AS MAJOR_CLS,
  sub_cls_or_season AS SUB_CLS_OR_SEASON,
  SUM(tag_sale_amt) AS SALE_AMT_SUM
FROM labeled
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
`;
}

// ─────────────────────────────────────────────
// DB raw row 타입
// ─────────────────────────────────────────────

interface DbShipmentRow {
  YYMM: string;
  MAJOR_CLS: string;        // 'ACC' | '의류'
  SUB_CLS_OR_SEASON: string;
  SALE_AMT_SUM: number;
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
function buildShipmentTable(
  rows: DbShipmentRow[],
  yymmList: string[],
  displayYear: number,
): RetailSalesTableData {
  const dataMap = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (row.MAJOR_CLS === '의류') {
      const key = normalizeShipmentSeason(row.SUB_CLS_OR_SEASON, displayYear);
      if (!key) continue;
      addToCell(dataMap, key, row.YYMM, row.SALE_AMT_SUM);
    } else if (row.MAJOR_CLS === 'ACC') {
      const accKey = ACC_CODE_MAP[row.SUB_CLS_OR_SEASON];
      if (!accKey) continue;
      addToCell(dataMap, accKey, row.YYMM, row.SALE_AMT_SUM);
    }
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
      isTotal: key === '출고매출합계',
      isSubtotal: key !== '출고매출합계',
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
  const grandTotal = buildSubtotal('출고매출합계', [clothingSubtotal, accSubtotal]);

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

/**
 * 출고매출 쿼리 실행 후 단일 RetailSalesTableData 반환
 * @param yymmList [1월YYMM, ..., 12월YYMM] — CLOSED_THROUGH 필터 적용 후 queryable 값
 * @param brand    브랜드 (BRD_CD_MAP 키)
 * @param displayYear 연도 탭 (시즌 레이블 계산 기준)
 */
export async function fetchShipmentSales(
  yymmList: string[],
  brand: string,
  displayYear: number,
): Promise<RetailSalesTableData> {
  const brdCd = BRD_CD_MAP[brand];
  const { startDate, endDate } = yymmToDateRange(yymmList);

  const rows = await executeSnowflakeQuery<DbShipmentRow>(
    buildShipmentSalesQuery(startDate, endDate, brdCd),
  );

  return buildShipmentTable(rows, yymmList, displayYear);
}
