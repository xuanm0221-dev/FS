import type { MonthlyStockResponse, MonthlyStockRow } from './inventory-monthly-types';
import type { RetailSalesResponse, RetailSalesRow, RetailSalesTableData } from './retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';

const BRANDS_TO_AGGREGATE = ['MLB', 'MLB KIDS', 'DISCOVERY'] as const;

function sumOrNull(a: number | null, b: number | null): number | null {
  const va = a ?? 0;
  const vb = b ?? 0;
  return va + vb;
}

const ROW_ORDER = ['재고자산합계', '의류합계', '당년F', '당년S', '1년차', '2년차', '차기시즌', '과시즌', 'ACC합계', '신발', '모자', '가방', '기타'];

function aggregateMonthlyRows(rowsList: MonthlyStockRow[][]): MonthlyStockRow[] {
  const byKey = new Map<string, MonthlyStockRow>();
  for (const rows of rowsList) {
    for (const row of rows) {
      const existing = byKey.get(row.key);
      if (!existing) {
        byKey.set(row.key, { ...row, opening: row.opening ?? 0, monthly: row.monthly.map((v) => v ?? 0) });
      } else {
        const opening = sumOrNull(existing.opening, row.opening) ?? 0;
        const monthly = existing.monthly.map((v, i) => (sumOrNull(v, row.monthly[i]) ?? 0));
        byKey.set(row.key, { ...existing, opening, monthly });
      }
    }
  }
  const ordered = ROW_ORDER.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const rest = Array.from(byKey.keys()).filter((k) => !ROW_ORDER.includes(k)).map((k) => byKey.get(k)!);
  return [...ordered, ...rest];
}

function aggregateRetailRows(rowsList: RetailSalesRow[][]): RetailSalesRow[] {
  const byKey = new Map<string, RetailSalesRow>();
  for (const rows of rowsList) {
    for (const row of rows) {
      const existing = byKey.get(row.key);
      if (!existing) {
        byKey.set(row.key, { ...row, monthly: row.monthly.map((v) => v ?? 0) });
      } else {
        const monthly = existing.monthly.map((v, i) => (sumOrNull(v, row.monthly[i]) ?? 0));
        byKey.set(row.key, { ...existing, monthly });
      }
    }
  }
  const ordered = ROW_ORDER.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const rest = Array.from(byKey.keys()).filter((k) => !ROW_ORDER.includes(k)).map((k) => byKey.get(k)!);
  return [...ordered, ...rest];
}

export function aggregateMonthlyStock(responses: MonthlyStockResponse[]): MonthlyStockResponse {
  if (responses.length === 0) {
    return {
      year: 2025,
      brand: '전체',
      closedThrough: '',
      dealer: { rows: [] },
      hq: { rows: [] },
    };
  }
  const first = responses[0];
  return {
    ...first,
    brand: '전체',
    dealer: { rows: aggregateMonthlyRows(responses.map((r) => r.dealer.rows)) },
    hq: { rows: aggregateMonthlyRows(responses.map((r) => r.hq.rows)) },
  };
}

export function aggregateRetailSales(responses: RetailSalesResponse[]): RetailSalesResponse {
  if (responses.length === 0) {
    return {
      year: 2025,
      brand: '전체',
      closedThrough: '',
      dealer: { rows: [] },
      hq: { rows: [] },
    };
  }
  const first = responses[0];
  const result: RetailSalesResponse = {
    ...first,
    brand: '전체',
    dealer: { rows: aggregateRetailRows(responses.map((r) => r.dealer.rows)) },
    hq: { rows: aggregateRetailRows(responses.map((r) => r.hq.rows)) },
  };
  const retail2025List = responses.map((r) => r.retail2025).filter(Boolean) as { dealer: RetailSalesTableData; hq: RetailSalesTableData }[];
  if (retail2025List.length > 0) {
    result.retail2025 = {
      dealer: { rows: aggregateRetailRows(retail2025List.map((r) => r.dealer.rows)) },
      hq: { rows: aggregateRetailRows(retail2025List.map((r) => r.hq.rows)) },
    };
  }
  return result;
}

export function aggregateShipmentSales(responses: ShipmentSalesResponse[]): ShipmentSalesResponse {
  if (responses.length === 0) {
    return {
      year: 2025,
      brand: '전체',
      closedThrough: '',
      data: { rows: [] },
    };
  }
  const first = responses[0];
  return {
    ...first,
    brand: '전체',
    data: { rows: aggregateRetailRows(responses.map((r) => r.data.rows)) },
  };
}

export function aggregatePurchase(responses: PurchaseResponse[]): PurchaseResponse {
  if (responses.length === 0) {
    return {
      year: 2025,
      brand: '전체',
      closedThrough: '',
      data: { rows: [] },
    };
  }
  const first = responses[0];
  return {
    ...first,
    brand: '전체',
    data: { rows: aggregateRetailRows(responses.map((r) => r.data.rows)) },
  };
}

export { BRANDS_TO_AGGREGATE };
