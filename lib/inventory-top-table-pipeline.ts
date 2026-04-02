/**
 * 재고자산(sim) 상단표: build → WOI → HQ 플랜 오버레이 → 리테일 연간합 display 정렬.
 * 화면·시나리오 JSON 저장이 동일 파이프라인을 쓰도록 공유.
 */
import type { MonthlyStockResponse } from '@/lib/inventory-monthly-types';
import type { RetailSalesResponse } from '@/lib/retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';
import type { AccKey, InventoryTableData, RowKey } from '@/lib/inventory-types';
import { buildTableDataFromMonthly } from '@/lib/build-inventory-from-monthly';
import { applyAccTargetWoiOverlay, applyHqSellInSellOutPlanOverlay, rebuildTableFromLeafs } from '@/lib/inventory-calc';

export type InventoryTopTablePair = { dealer: InventoryTableData; hq: InventoryTableData };

const ACC_LEAF_KEYS = new Set(['신발', '모자', '가방', '기타']);

function inventoryKeyToRetailKey(key: string): string {
  return key === '재고자산합계' ? '매출합계' : key;
}

function scaleMonthly(monthly: number[], oldTotal: number, newTotal: number): number[] {
  if (oldTotal === 0) return monthly.map(() => Math.round(newTotal / 12));
  return monthly.map((v) => Math.round(v * (newTotal / oldTotal)));
}

/**
 * buildTableDataFromMonthly → applyAccTargetWoiOverlay → applyHqSellInSellOutPlanOverlay (FY26).
 */
export function finalize2026InventoryTopTable(
  mData: MonthlyStockResponse,
  rData: RetailSalesResponse,
  sData: ShipmentSalesResponse,
  pData: PurchaseResponse | undefined,
  accTargetWoiDealer: Record<AccKey, number>,
  accTargetWoiHq: Record<AccKey, number>,
  accHqHoldingWoi: Record<AccKey, number>,
  hqSellInPlan: Partial<Record<RowKey, number>>,
  mergedSellOutPlan: Partial<Record<RowKey, number>>,
): InventoryTopTablePair {
  const year = 2026;
  const built = buildTableDataFromMonthly(mData, rData, sData, pData, year);
  const withWoi = applyAccTargetWoiOverlay(
    built.dealer,
    built.hq,
    rData,
    accTargetWoiDealer,
    accTargetWoiHq,
    accHqHoldingWoi,
    year,
  );
  return applyHqSellInSellOutPlanOverlay(
    withWoi.dealer,
    withWoi.hq,
    hqSellInPlan,
    mergedSellOutPlan,
    year,
  );
}

/** 리테일 응답 행별 연간합(원) — InventoryDashboard perBrandRetail* 와 동일 */
export function retailAnnualTotalsByRowKey(retail: RetailSalesResponse): {
  dealer: Record<string, number | null>;
  hq: Record<string, number | null>;
} {
  const dealer: Record<string, number | null> = {};
  const hq: Record<string, number | null> = {};
  for (const row of retail.dealer?.rows ?? []) {
    dealer[row.key] = row.monthly.reduce<number>((s, v) => s + (v ?? 0), 0);
  }
  for (const row of retail.hq?.rows ?? []) {
    hq[row.key] = row.monthly.reduce<number>((s, v) => s + (v ?? 0), 0);
  }
  return { dealer, hq };
}

/**
 * topTableData에 리테일 연간합을 반영해 Sell-out / hqSales 등을 스케일하고 소계 재계산.
 * InventoryDashboard topTableDisplayData useMemo 와 동일 로직.
 */
export function applyTopTableRetailDisplayOverlay(
  topTableData: InventoryTopTablePair,
  retailDealerAnnualTotalByRowKey: Record<string, number | null> | null | undefined,
  retailHqAnnualTotalByRowKey: Record<string, number | null> | null | undefined,
  yearDays: number = 366,
): InventoryTopTablePair {
  const dealerLeafRows = topTableData.dealer.rows
    .filter((row) => row.isLeaf)
    .map((row) => {
      const retailKey = inventoryKeyToRetailKey(row.key);
      const newTotalWon = retailDealerAnnualTotalByRowKey?.[retailKey] ?? null;

      let updatedRow = row;
      if (newTotalWon != null) {
        const newSellOutK = newTotalWon / 1000;
        updatedRow = {
          ...updatedRow,
          sellOut: scaleMonthly(row.sellOut, row.sellOutTotal, newSellOutK),
          sellOutTotal: newSellOutK,
        };
      }

      if (ACC_LEAF_KEYS.has(row.key)) {
        const newSellInTotal = updatedRow.closing + updatedRow.sellOutTotal - updatedRow.opening;
        updatedRow = {
          ...updatedRow,
          sellIn: scaleMonthly(updatedRow.sellIn, updatedRow.sellInTotal, newSellInTotal),
          sellInTotal: newSellInTotal,
        };
      } else {
        const newClosing = updatedRow.opening + updatedRow.sellInTotal - updatedRow.sellOutTotal;
        updatedRow = {
          ...updatedRow,
          closing: newClosing,
          delta: newClosing - updatedRow.opening,
        };
      }

      return updatedRow;
    });
  const dealerRows = rebuildTableFromLeafs(dealerLeafRows, yearDays);

  const dealerAccSellInMap = new Map(
    dealerLeafRows
      .filter((row) => ACC_LEAF_KEYS.has(row.key))
      .map((row) => [row.key, { sellIn: row.sellIn, sellInTotal: row.sellInTotal }]),
  );

  const hqLeafRows = topTableData.hq.rows
    .filter((row) => row.isLeaf)
    .map((row) => {
      const retailKey = inventoryKeyToRetailKey(row.key);
      const newTotalWon = retailHqAnnualTotalByRowKey?.[retailKey] ?? null;
      const newTotalK = newTotalWon != null ? newTotalWon / 1000 : null;
      const oldHqTotal = row.hqSalesTotal ?? 0;
      const newHqSales =
        newTotalK != null && row.hqSales
          ? scaleMonthly(row.hqSales, oldHqTotal, newTotalK)
          : row.hqSales;

      if (ACC_LEAF_KEYS.has(row.key)) {
        const dealerAcc = dealerAccSellInMap.get(row.key);
        if (dealerAcc) {
          const newSellOutTotal = dealerAcc.sellInTotal;
          const newSellOut = scaleMonthly(row.sellOut, row.sellOutTotal, newSellOutTotal);
          const hqSalesTotal = newTotalK ?? (row.hqSalesTotal ?? 0);
          const newSellInTotal = Math.max(0, row.closing + newSellOutTotal + hqSalesTotal - row.opening);
          const newSellIn = scaleMonthly(row.sellIn, row.sellInTotal, newSellInTotal);
          return {
            ...row,
            sellIn: newSellIn,
            sellInTotal: newSellInTotal,
            sellOut: newSellOut,
            sellOutTotal: newSellOutTotal,
            hqSales: newHqSales,
            hqSalesTotal: newTotalK ?? row.hqSalesTotal,
          };
        }
      }

      return {
        ...row,
        hqSales: newHqSales,
        hqSalesTotal: newTotalK ?? row.hqSalesTotal,
      };
    });
  const hqRows = rebuildTableFromLeafs(hqLeafRows, yearDays);

  return {
    dealer: { rows: dealerRows },
    hq: { rows: hqRows },
  };
}

/** display 오버레이 적용 후 본사 합계 행 기말재고(K) */
export function hqTotalClosingAfterDisplay(
  topTableData: InventoryTopTablePair,
  retailDealerAnnualTotalByRowKey: Record<string, number | null> | null | undefined,
  retailHqAnnualTotalByRowKey: Record<string, number | null> | null | undefined,
  yearDays?: number,
): number | null {
  const displayed = applyTopTableRetailDisplayOverlay(
    topTableData,
    retailDealerAnnualTotalByRowKey,
    retailHqAnnualTotalByRowKey,
    yearDays,
  );
  const totalRow = displayed.hq.rows.find((r) => r.isTotal);
  const c = totalRow?.closing;
  return c != null && Number.isFinite(c) ? c : null;
}
