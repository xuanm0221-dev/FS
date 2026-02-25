'use client';

import type { MonthlyStockResponse, MonthlyStockRow } from './inventory-monthly-types';
import type { RetailSalesResponse, RetailSalesRow } from './retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';

export interface SnapshotData {
  /** 월별 재고잔액 — 실적월만 (미래월 null) */
  monthly: MonthlyStockResponse;
  /** 리테일 매출 — 계획월 strip 후 실적월만 */
  retailActuals: RetailSalesResponse;
  /** 2026 계획월 계산용 2025 전체 실적 (year=2026일 때만 유효) */
  retail2025: RetailSalesResponse['retail2025'] | null;
  /** 출고매출 — 실적월만 */
  shipment: ShipmentSalesResponse;
  /** 매입상품 — 실적월만 */
  purchase: PurchaseResponse;
  /** 저장 시각 (ISO string) */
  savedAt: string;
  /** 계획 시작 월 (1-based). 2026: 2, 2025: undefined */
  planFromMonth?: number;
}

const snapshotKey = (year: number, brand: string) =>
  `inv_snapshot_${year}_${brand}`;

export function saveSnapshot(year: number, brand: string, data: SnapshotData): void {
  try {
    localStorage.setItem(snapshotKey(year, brand), JSON.stringify(data));
  } catch {
    console.warn('[snapshot] localStorage 저장 실패 (용량 초과 등)');
  }
}

export function loadSnapshot(year: number, brand: string): SnapshotData | null {
  try {
    const raw = localStorage.getItem(snapshotKey(year, brand));
    return raw ? (JSON.parse(raw) as SnapshotData) : null;
  } catch {
    return null;
  }
}

export function deleteSnapshot(year: number, brand: string): void {
  try {
    localStorage.removeItem(snapshotKey(year, brand));
  } catch {
    // ignore
  }
}

/**
 * 당월 재계산 후 최신 실적 컬럼만 스냅샷에 병합.
 * latestMonthIdx: 0-based (January = 0)
 */
export function mergeLatestMonthIntoSnapshot(
  snapshot: SnapshotData,
  fresh: {
    monthly: MonthlyStockResponse;
    shipment: ShipmentSalesResponse;
    purchase: PurchaseResponse;
    retailActuals?: RetailSalesResponse;
  },
  latestMonthIdx: number,
): SnapshotData {
  const mergeRows = <T extends { monthly: (number | null)[] }>(
    snapRows: T[],
    freshRows: T[],
    idx: number,
  ): T[] => {
    const freshByKey = new Map(
      (freshRows as (T & { key: string })[]).map((r) => [r.key, r]),
    );
    return (snapRows as (T & { key: string })[]).map((r) => {
      const f = freshByKey.get(r.key);
      if (!f) return r;
      const monthly = [...r.monthly];
      monthly[idx] = f.monthly[idx];
      return { ...r, monthly };
    }) as T[];
  };

  const mergeMonthlyStockTable = (
    snap: MonthlyStockResponse,
    freshResp: MonthlyStockResponse,
  ): MonthlyStockResponse => ({
    ...snap,
    dealer: { rows: mergeRows(snap.dealer.rows, freshResp.dealer.rows, latestMonthIdx) as MonthlyStockRow[] },
    hq: { rows: mergeRows(snap.hq.rows, freshResp.hq.rows, latestMonthIdx) as MonthlyStockRow[] },
  });

  const mergeRetailTable = (
    snap: RetailSalesResponse,
    freshResp: RetailSalesResponse,
  ): RetailSalesResponse => ({
    ...snap,
    dealer: { rows: mergeRows(snap.dealer.rows, freshResp.dealer.rows, latestMonthIdx) as RetailSalesRow[] },
    hq: { rows: mergeRows(snap.hq.rows, freshResp.hq.rows, latestMonthIdx) as RetailSalesRow[] },
  });

  const mergeDataTable = <R extends ShipmentSalesResponse | PurchaseResponse>(
    snap: R,
    freshResp: R,
  ): R => ({
    ...snap,
    data: { rows: mergeRows(snap.data.rows, freshResp.data.rows, latestMonthIdx) as RetailSalesRow[] },
  });

  return {
    ...snapshot,
    monthly: mergeMonthlyStockTable(snapshot.monthly, fresh.monthly),
    shipment: mergeDataTable(snapshot.shipment, fresh.shipment),
    purchase: mergeDataTable(snapshot.purchase, fresh.purchase),
    retailActuals: fresh.retailActuals
      ? mergeRetailTable(snapshot.retailActuals, fresh.retailActuals)
      : snapshot.retailActuals,
    savedAt: new Date().toISOString(),
  };
}

/**
 * CLOSED_THROUGH를 기준으로, 해당 연도의 최신 실적 월 인덱스(0-based)를 반환.
 * e.g. CLOSED_THROUGH='202601', year=2026 → 0 (January)
 *      CLOSED_THROUGH='202601', year=2025 → 11 (December)
 */
export function getLatestActualMonthIdx(year: number, closedThrough: string): number {
  const ctYear = parseInt(closedThrough.slice(0, 4), 10);
  const ctMonth = parseInt(closedThrough.slice(4, 6), 10);
  if (ctYear > year) return 11; // 해당 연도 전체 마감
  if (ctYear === year) return ctMonth - 1;
  return -1; // 해당 연도 실적 없음
}
