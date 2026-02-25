export type SeasonKey = '당년F' | '당년S' | '1년차' | '2년차' | '차기시즌' | '과시즌';
export type AccKey = '신발' | '모자' | '가방' | '기타';
export const ACC_KEYS: AccKey[] = ['신발', '모자', '가방', '기타'];
export const SEASON_KEYS: SeasonKey[] = ['당년F', '당년S', '1년차', '2년차', '차기시즌', '과시즌'];
export type RowKey = SeasonKey | AccKey;
export type Brand = '전체' | 'MLB' | 'MLB KIDS' | 'DISCOVERY';

// 하나의 행(시즌/품종)에 대한 원본 데이터
export interface InventoryRowRaw {
  key: RowKey;
  opening: number;        // 기초재고 (전년기말)
  sellIn: number[];       // 월별 12개 (대리상: 본사→대리상 출고 / 본사: 상품매입)
  sellOut: number[];      // 월별 12개 (대리상: POS / 본사: 대리상출고)
  closing: number;        // 기말재고
  woiSellOut?: number[];  // WOI 전용 판매 시리즈 (본사: 리테일매출본사, 대리상: 미설정 시 sellOut 사용)
  hqSales?: number[];     // 본사 전용: 12개월 본사 리테일 매출(K)
}

// 계산 완료된 행 (합계행 포함)
export interface InventoryRow {
  key: string;           // RowKey 또는 '재고자산합계' | '의류합계' | 'ACC합계'
  label: string;
  isTotal: boolean;      // 재고자산합계
  isSubtotal: boolean;   // 의류합계, ACC합계
  isLeaf: boolean;       // 개별 행
  opening: number;
  sellIn: number[];      // 월별 12개
  sellInTotal: number;   // 연간 합계
  sellOut: number[];     // 월별 12개
  sellOutTotal: number;  // 연간 합계
  closing: number;
  delta: number;         // 증감 = closing - opening
  sellThrough: number;   // 판매율 (%)
  woi: number;           // 재고주수
  woiSellOut: number[];  // WOI 계산 기준 판매 시리즈 (소계 집계용)
  hqSales?: number[];    // 본사 전용: 월별 본사판매(K)
  hqSalesTotal?: number; // 본사 전용: 연간 본사판매 합계(K)
}

// 테이블 전체 데이터 (대리상 or 본사)
export interface InventoryTableData {
  rows: InventoryRow[];
}

// API 응답
export interface InventoryApiResponse {
  year: number;
  brand: Brand;
  dealer: InventoryTableData;
  hq: InventoryTableData;
}

// API 파라미터
export interface InventoryParams {
  year: number;
  growthRate: number;  // 0~30 (%)
  brand: Brand;
}
