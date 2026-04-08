/**
 * 직영 ACC 예산 JSON 스키마 (클라이언트·서버 공용, Node fs 미사용)
 */
export interface HqAccBudgetEntry {
  arrival: number; // 입고완료 (M)
  order: number; // 발주완료 (M)
  /** 입고 기준월 (1–12), 라벨 예: 입고완료(8월) */
  arrivalThroughMonth: number;
  /** 발주 기준월 (1–12), 라벨 예: 발주완료(8월) */
  orderThroughMonth: number;
}

export const HQ_ACC_BUDGET_BRANDS = ['MLB', 'MLB KIDS', 'DISCOVERY'] as const;

export const DEFAULT_HQ_ACC_BUDGET: Record<string, HqAccBudgetEntry> = {
  MLB: { arrival: 0, order: 0, arrivalThroughMonth: 8, orderThroughMonth: 8 },
  'MLB KIDS': { arrival: 0, order: 0, arrivalThroughMonth: 8, orderThroughMonth: 8 },
  DISCOVERY: { arrival: 0, order: 0, arrivalThroughMonth: 8, orderThroughMonth: 8 },
};

export function normalizeHqAccBudgetEntry(raw: unknown): HqAccBudgetEntry {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const am = o.arrivalThroughMonth != null ? Number(o.arrivalThroughMonth) : 8;
  const om = o.orderThroughMonth != null ? Number(o.orderThroughMonth) : 8;
  return {
    arrival: typeof o.arrival === 'number' && !Number.isNaN(o.arrival) ? o.arrival : 0,
    order: typeof o.order === 'number' && !Number.isNaN(o.order) ? o.order : 0,
    arrivalThroughMonth: Number.isFinite(am) ? Math.min(12, Math.max(1, Math.round(am))) : 8,
    orderThroughMonth: Number.isFinite(om) ? Math.min(12, Math.max(1, Math.round(om))) : 8,
  };
}
