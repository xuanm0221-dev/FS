import { Brand, InventoryRowRaw } from './inventory-types';

// 월별 배열 헬퍼
function months(values: number[]): number[] {
  return values;
}

// ────────────────────────────────────────────────
// 대리상 Raw 데이터 (Sell-in: 본사→대리상 출고, Sell-out: POS 소비자 판매)
// 단위: 천 개 (K pcs)
// ────────────────────────────────────────────────
const dealerRaw2025: InventoryRowRaw[] = [
  // ── 의류 ──
  {
    key: '당년F',
    opening: 180,
    sellIn:  months([  0,  0,  0, 20, 45, 60, 80, 90, 70, 30, 10,  5]),
    sellOut: months([  5,  8, 10, 15, 20, 25, 50, 70, 65, 55, 40, 25]),
    closing: 220,
  },
  {
    key: '당년S',
    opening: 210,
    sellIn:  months([ 40, 50, 70, 80, 60, 20,  5,  0,  0,  0,  5, 10]),
    sellOut: months([ 30, 45, 60, 75, 80, 65, 40, 20, 15, 10,  8,  5]),
    closing: 175,
  },
  {
    key: '1년차',
    opening: 320,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([ 20, 25, 30, 28, 22, 18, 15, 12, 10,  8,  5,  5]),
    closing: 122,
  },
  {
    key: '2년차',
    opening: 150,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([  8, 10, 12, 10,  8,  6,  5,  4,  3,  2,  2,  2]),
    closing:  78,
  },
  {
    key: '차기시즌',
    opening:  20,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0, 15, 30, 40, 35]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    closing: 120,
  },
  {
    key: '과시즌',
    opening: 0,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    closing: 0,
  },
  // ── ACC ──
  {
    key: '신발',
    opening: 240,
    sellIn:  months([ 20, 25, 30, 35, 40, 35, 30, 25, 20, 15, 10,  5]),
    sellOut: months([ 25, 28, 35, 40, 45, 42, 38, 32, 28, 22, 18, 15]),
    closing: 230,
  },
  {
    key: '모자',
    opening:  80,
    sellIn:  months([  8, 10, 12, 15, 18, 15, 12, 10,  8,  5,  3,  2]),
    sellOut: months([  6,  8, 10, 12, 15, 14, 12,  9,  7,  5,  4,  3]),
    closing:  95,
  },
  {
    key: '가방',
    opening:  60,
    sellIn:  months([  5,  6,  8, 10, 12, 10,  8,  6,  5,  4,  3,  2]),
    sellOut: months([  4,  5,  7,  9, 11,  9,  7,  5,  4,  3,  3,  2]),
    closing:  65,
  },
  {
    key: '기타',
    opening:  30,
    sellIn:  months([  2,  3,  4,  5,  6,  5,  4,  3,  3,  2,  2,  1]),
    sellOut: months([  2,  3,  4,  5,  5,  4,  3,  3,  2,  2,  2,  1]),
    closing:  29,
  },
];

// ────────────────────────────────────────────────
// 본사 Raw 데이터 (Sell-in: 상품매입, Sell-out: 대리상출고)
// ────────────────────────────────────────────────
const hqRaw2025: InventoryRowRaw[] = [
  {
    key: '당년F',
    opening: 350,
    sellIn:  months([  0,  0, 30, 80,120,150,100, 50, 20,  5,  0,  0]),
    sellOut: months([  0,  0,  0, 20, 45, 60, 80, 90, 70, 30, 10,  5]),
    closing: 575,
  },
  {
    key: '당년S',
    opening: 280,
    sellIn:  months([100,120,150, 80, 40, 10,  0,  0,  0,  0,  0,  5]),
    sellOut: months([ 40, 50, 70, 80, 60, 20,  5,  0,  0,  0,  5, 10]),
    closing: 475,
  },
  {
    key: '1년차',
    opening: 500,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    closing: 500,
  },
  {
    key: '2년차',
    opening: 200,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    closing: 200,
  },
  {
    key: '차기시즌',
    opening:  50,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0, 20, 60,100, 80, 60]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0, 15, 30, 40, 35]),
    closing: 270,
  },
  {
    key: '과시즌',
    opening: 0,
    sellIn:  months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    sellOut: months([  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]),
    closing: 0,
  },
  {
    key: '신발',
    opening: 400,
    sellIn:  months([ 30, 35, 40, 45, 50, 40, 35, 30, 25, 20, 15, 10]),
    sellOut: months([ 20, 25, 30, 35, 40, 35, 30, 25, 20, 15, 10,  5]),
    closing: 430,
  },
  {
    key: '모자',
    opening: 120,
    sellIn:  months([ 12, 14, 16, 18, 20, 16, 14, 12, 10,  7,  4,  2]),
    sellOut: months([  8, 10, 12, 15, 18, 15, 12, 10,  8,  5,  3,  2]),
    closing: 136,
  },
  {
    key: '가방',
    opening:  90,
    sellIn:  months([  7,  8, 10, 12, 14, 12, 10,  8,  6,  5,  4,  3]),
    sellOut: months([  5,  6,  8, 10, 12, 10,  8,  6,  5,  4,  3,  2]),
    closing:  96,
  },
  {
    key: '기타',
    opening:  40,
    sellIn:  months([  3,  4,  5,  6,  7,  5,  4,  3,  3,  2,  2,  1]),
    sellOut: months([  2,  3,  4,  5,  6,  5,  4,  3,  3,  2,  2,  1]),
    closing:  44,
  },
];

// 스케일 적용
function scaleRaw(raw: InventoryRowRaw[], factor: number): InventoryRowRaw[] {
  return raw.map((r) => ({
    ...r,
    opening: Math.round(r.opening * factor),
    sellIn: r.sellIn.map((v) => Math.round(v * factor)),
    sellOut: r.sellOut.map((v) => Math.round(v * factor)),
    closing: Math.round(r.closing * factor),
  }));
}

// 브랜드별 Raw 배열들을 key 기준으로 합산 (전체 = MLB + MLB KIDS + DISCOVERY)
function sumRawArrays(arrs: InventoryRowRaw[][]): InventoryRowRaw[] {
  if (arrs.length === 0) return [];
  const keys = arrs[0].map((r) => r.key);
  return keys.map((key) => {
    const rows = arrs.map((arr) => arr.find((r) => r.key === key)).filter(Boolean) as InventoryRowRaw[];
    return {
      key,
      opening: rows.reduce((s, r) => s + r.opening, 0),
      sellIn: rows[0].sellIn.map((_, i) => rows.reduce((s, r) => s + (r.sellIn[i] ?? 0), 0)),
      sellOut: rows[0].sellOut.map((_, i) => rows.reduce((s, r) => s + (r.sellOut[i] ?? 0), 0)),
      closing: rows.reduce((s, r) => s + r.closing, 0),
    };
  });
}

// 2025년 브랜드별 Raw (나중에 Snowflake에서 불러올 데이터)
const MLB_2025 = {
  dealer: scaleRaw(dealerRaw2025, 0.55),
  hq: scaleRaw(hqRaw2025, 0.55),
};
const MLB_KIDS_2025 = {
  dealer: scaleRaw(dealerRaw2025, 0.25),
  hq: scaleRaw(hqRaw2025, 0.25),
};
const DISCOVERY_2025 = {
  dealer: scaleRaw(dealerRaw2025, 0.2),
  hq: scaleRaw(hqRaw2025, 0.2),
};

// 2026년 브랜드별 Raw (성장률 반영)
const MLB_2026 = {
  dealer: scaleRaw(dealerRaw2025, 0.58),
  hq: scaleRaw(hqRaw2025, 0.58),
};
const MLB_KIDS_2026 = {
  dealer: scaleRaw(dealerRaw2025, 0.26),
  hq: scaleRaw(hqRaw2025, 0.26),
};
const DISCOVERY_2026 = {
  dealer: scaleRaw(dealerRaw2025, 0.21),
  hq: scaleRaw(hqRaw2025, 0.21),
};

export const MOCK_DATA: Record<
  number,
  Record<Brand, { dealer: InventoryRowRaw[]; hq: InventoryRowRaw[] }>
> = {
  2025: {
    전체: {
      dealer: sumRawArrays([MLB_2025.dealer, MLB_KIDS_2025.dealer, DISCOVERY_2025.dealer]),
      hq: sumRawArrays([MLB_2025.hq, MLB_KIDS_2025.hq, DISCOVERY_2025.hq]),
    },
    MLB: MLB_2025,
    'MLB KIDS': MLB_KIDS_2025,
    DISCOVERY: DISCOVERY_2025,
  },
  2026: {
    전체: {
      dealer: sumRawArrays([MLB_2026.dealer, MLB_KIDS_2026.dealer, DISCOVERY_2026.dealer]),
      hq: sumRawArrays([MLB_2026.hq, MLB_KIDS_2026.hq, DISCOVERY_2026.hq]),
    },
    MLB: MLB_2026,
    'MLB KIDS': MLB_KIDS_2026,
    DISCOVERY: DISCOVERY_2026,
  },
};
