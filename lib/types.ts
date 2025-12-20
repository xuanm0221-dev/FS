// 원본 CSV 데이터 (롱 포맷)
export interface FinancialData {
  year: number;
  month: number; // 1~12
  account: string;
  value: number;
}

// 테이블 행 데이터
export interface TableRow {
  account: string;
  level: number; // 인덴트 레벨 (0=최상위)
  isGroup: boolean; // 그룹(접기/펼치기 가능)인지
  isCalculated: boolean; // 계산된 값인지
  isHighlight?: 'sky' | 'yellow' | 'gray' | 'none'; // 배경색 강조
  isBold?: boolean; // 볼드 처리
  values: (number | null)[]; // 12개월 또는 13개(합계 포함)
  children?: TableRow[];
  format?: 'number' | 'percent'; // 표시 형식
  comparisons?: ComparisonData; // 비교 데이터 (PL 2025년 전용)
}

// 비교 데이터 (PL 2025년 전용)
export interface ComparisonData {
  prevYearMonth: number | null; // 전년(기준월)
  currYearMonth: number | null; // 당년(기준월)
  monthYoY: number | null; // 월 YoY
  prevYearYTD: number | null; // 전년 YTD
  currYearYTD: number | null; // 당년 YTD
  ytdYoY: number | null; // YTD YoY
  prevYearAnnual: number | null; // 24년 연간
  currYearAnnual: number | null; // 25년 연간
  annualYoY: number | null; // 연간 YoY
}

// 재무제표 타입
export type StatementType = 'PL' | 'BS' | 'CF';

// 월 데이터 맵
export type MonthDataMap = Map<string, number[]>; // account -> [month1, month2, ..., month12]

