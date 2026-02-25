export interface RetailSalesRow {
  key: string;
  label: string;
  isTotal: boolean;
  isSubtotal: boolean;
  isLeaf: boolean;
  monthly: (number | null)[];  // 12개 [1월~12월], opening 없음
}

export interface RetailSalesTableData {
  rows: RetailSalesRow[];
}

export interface RetailSalesResponse {
  year: number;
  brand: string;
  closedThrough: string;
  dealer: RetailSalesTableData;
  hq: RetailSalesTableData;
  /** 1-based; first month that is plan (e.g. 2 = from Feb). Only for 2026. */
  planFromMonth?: number;
  /** 2026 계획월 클라이언트 계산용 — 2025 전체 실적. year=2026 응답에만 포함. */
  retail2025?: { dealer: RetailSalesTableData; hq: RetailSalesTableData };
}

// DB raw row types (Snowflake 대문자 컬럼명)
export interface DbRetailClothingRow {
  YYMM: string;
  SEASON: string;
  SALES_AMT_SUM: number;
}

export interface DbRetailAccRow {
  YYMM: string;
  ACC_MID_CATEGORY: string;
  SALES_AMT_SUM: number;
}
