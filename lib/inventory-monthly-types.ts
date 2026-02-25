export type MonthlySeasonKey = '당년F' | '당년S' | '1년차' | '2년차' | '차기시즌' | '과시즌';
export type MonthlyAccKey = '신발' | '모자' | '가방' | '기타';

export interface MonthlyStockRow {
  key: string;
  label: string;
  isTotal: boolean;
  isSubtotal: boolean;
  isLeaf: boolean;
  opening: number | null;       // 기초(전년기말)
  monthly: (number | null)[];   // 12개 [1월~12월], null = 미마감
}

export interface MonthlyStockTableData {
  rows: MonthlyStockRow[];
}

export interface MonthlyStockResponse {
  year: number;
  brand: string;
  closedThrough: string;  // e.g. '202601' — 이 YYMM 이하만 데이터 존재
  dealer: MonthlyStockTableData;
  hq: MonthlyStockTableData;
}

// DB raw row types (Snowflake는 컬럼명 대문자 반환)
export interface DbClothingRow {
  YYMM: string;
  SEASON: string;
  STOCK_AMT_SUM: number;
}

export interface DbAccRow {
  YYMM: string;
  ACC_MID_CATEGORY: string;
  STOCK_AMT_SUM: number;
}
