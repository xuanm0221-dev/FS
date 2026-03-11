'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand, InventoryApiResponse, InventoryTableData, InventoryRowRaw, AccKey, ACC_KEYS, SEASON_KEYS, RowKey } from '@/lib/inventory-types';
import { MonthlyStockResponse } from '@/lib/inventory-monthly-types';
import { RetailSalesResponse, RetailSalesRow } from '@/lib/retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';
import { buildTableDataFromMonthly } from '@/lib/build-inventory-from-monthly';
import { buildTableData, applyAccTargetWoiOverlay, applyHqSellInSellOutPlanOverlay, rebuildTableFromLeafs } from '@/lib/inventory-calc';
import {
  saveSnapshot,
  loadSnapshot,
  type SnapshotData,
} from '@/lib/inventory-snapshot';
import { stripPlanMonths, applyPlanToSnapshot, mergePlanMonths, PLAN_FROM_MONTH } from '@/lib/retail-plan';
import {
  BRANDS_TO_AGGREGATE,
  aggregateMonthlyStock,
  aggregateRetailSales,
  aggregateShipmentSales,
  aggregatePurchase,
} from '@/lib/aggregate-inventory-by-brand';
import InventoryFilterBar from './InventoryFilterBar';
import InventoryTable from './InventoryTable';
import InventoryMonthlyTable, { TableData } from './InventoryMonthlyTable';

type LeafBrand = Exclude<Brand, '전체'>;
type TopTablePair = { dealer: InventoryTableData; hq: InventoryTableData };
const ANNUAL_SHIPMENT_PLAN_KEY = 'inv_annual_shipment_plan_2026_v1';
const INVENTORY_HQ_CLOSING_KEY = 'inventory_hq_closing_totals';
const INVENTORY_MONTHLY_TOTAL_KEY = 'inventory_monthly_total_closing';
const INVENTORY_PURCHASE_MONTHLY_KEY = 'inventory_purchase_monthly_by_brand';
const INVENTORY_SHIPMENT_MONTHLY_KEY = 'inventory_shipment_monthly_by_brand';
const ANNUAL_PLAN_BRANDS = ['MLB', 'MLB KIDS', 'DISCOVERY'] as const;
const ANNUAL_PLAN_SEASONS = ['currF', 'currS', 'year1', 'year2', 'next', 'past'] as const;
type AnnualPlanBrand = typeof ANNUAL_PLAN_BRANDS[number];
type AnnualPlanSeason = typeof ANNUAL_PLAN_SEASONS[number];
type AnnualShipmentPlan = Record<AnnualPlanBrand, Record<AnnualPlanSeason, number>>;
type HqClosingByBrand = Record<AnnualPlanBrand, number>;
type MonthlyInventoryTotalByBrand = Record<AnnualPlanBrand, (number | null)[]>;
type ShipmentProgressBrand = AnnualPlanBrand;

interface ShipmentProgressRow {
  brand: ShipmentProgressBrand;
  season: '당년S' | '당년F';
  prevYearProgress: number | null;
  monthly: (number | null)[];
}

interface AccShipmentRatioRow {
  brand: ShipmentProgressBrand;
  monthly: (number | null)[];
}

const ANNUAL_PLAN_SEASON_LABELS: Record<AnnualPlanSeason, string> = {
  currF: '당년F',
  currS: '당년S',
  year1: '1년차',
  year2: '2년차',
  next: '차기시즌',
  past: '과시즌',
};
const OTB_SEASONS_LIST = ['27F', '27S', '26F', '26S', '25F'] as const;
type OtbSeason = typeof OTB_SEASONS_LIST[number];
type OtbBrand = AnnualPlanBrand;
type OtbData = Record<OtbSeason, Record<OtbBrand, number>>;

const TXT_HQ_PURCHASE_HEADER = '본사 매입';
const TXT_ANNUAL_PLAN_TITLE = '26년 시즌별 연간 출고계획표';
const TXT_BRAND = '브랜드';
const TXT_PLAN_SECTION = '본사 의류매입';
const TXT_PLAN_UNIT = '(단위: CNY K)';
const TXT_OTB_SECTION = '대리상 OTB';
const TXT_OTB_UNIT = '(단위: CNY K)';
const TXT_SEASON = '시즌';
const TXT_EDIT = '수정';
const TXT_SAVE = '저장';
const TXT_PLAN_ICON = '📋';
const TXT_COLLAPSE = '▲ 접기';
const TXT_EXPAND = '▼ 펼치기';

/** MLB 브랜드 대리상 1년차 연간합계 별도 목표 (CNY K) */
const MLB_1YEAR_OVERRIDE_K = 1_479_053;

/** 본사 의류매입 표(annualPlan) → hqSellInPlan 시즌 행 매핑 */
const DRIVER_COLUMN_HEADERS = ['전년', '계획금액', '계획YOY', 'Rolling금액', 'RollingYOY', '계획대비 증감', '계획대비 증감(%)'] as const;
const INDEPENDENT_DRIVER_COLUMN_HEADERS = ['Rolling'] as const;
const INDEPENDENT_DRIVER_ROWS = ['대리상 리테일 성장율', '본사 리테일 성장율'] as const;
const DEPENDENT_DRIVER_ROWS = ['대리상출고', '본사상품매입', '본사기말재고'] as const;

function formatDriverPercent(value: number): string {
  return `${100 + value}%`;
}

type DependentPlanRowLabel = (typeof DEPENDENT_DRIVER_ROWS)[number];
type DependentPlanValueMap = Partial<Record<DependentPlanRowLabel, Record<AnnualPlanBrand, number | null>>>;

function formatDriverNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString();
}

function getDependentDriverCellValue(
  column: (typeof DRIVER_COLUMN_HEADERS)[number],
  columnIndex: number,
  rowIndex: number,
  currentTotalRow: InventoryTableData['rows'][number] | null,
  prevTotalRow: InventoryTableData['rows'][number] | null,
): string {
  const pickValue = (row: InventoryTableData['rows'][number] | null): number | null | undefined => {
    if (rowIndex === 0) return row?.sellOutTotal;
    if (rowIndex === 1) return row?.sellInTotal;
    return row?.closing;
  };
  if (column === '전년') return formatDriverNumber(pickValue(prevTotalRow));
  if (column === 'Rolling금액') return formatDriverNumber(pickValue(currentTotalRow));
  if (column === 'RollingYOY') {
    const currentValue = pickValue(currentTotalRow);
    const prevValue = pickValue(prevTotalRow);
    if (currentValue == null || prevValue == null || !Number.isFinite(currentValue) || !Number.isFinite(prevValue) || prevValue === 0) {
      return '-';
    }
    return `${Math.round((currentValue / prevValue) * 100).toLocaleString()}%`;
  }
  return '-';
}

function buildShipmentProgressRates(row: ShipmentProgressRow | null | undefined): number[] {
  let prevCumulative = row?.prevYearProgress ?? 0;
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const currentCumulative = row?.monthly[monthIndex] ?? prevCumulative;
    const monthlyRate = Math.max(currentCumulative - prevCumulative, 0);
    prevCumulative = currentCumulative;
    return monthlyRate;
  });
}

function annualPlanToHqSellInPlan(plan: AnnualShipmentPlan, planBrand: AnnualPlanBrand): Partial<Record<RowKey, number>> {
  const row = plan[planBrand];
  if (!row) return {};
  const SEASON_MAP: { plan: AnnualPlanSeason; key: RowKey }[] = [
    { plan: 'currF', key: '당년F' }, { plan: 'currS', key: '당년S' },
    { plan: 'year1', key: '1년차' }, { plan: 'year2', key: '2년차' },
    { plan: 'next', key: '차기시즌' }, { plan: 'past', key: '과시즌' },
  ];
  const out: Partial<Record<RowKey, number>> = {};
  for (const { plan: p, key } of SEASON_MAP) {
    const v = row[p];
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** OTB(CNY) → 대리상 의류 Sell-in(CNY K) 매핑. 당년F=26F, 당년S=26S, 차기시즌=27F+27S. 1년차/2년차/과시즌=0 */
function otbToDealerSellInPlan(otbData: OtbData | null, planBrand: OtbBrand): Partial<Record<RowKey, number>> {
  if (!otbData) return {};
  const out: Partial<Record<RowKey, number>> = {};
  out['당년F'] = Math.round((otbData['26F']?.[planBrand] ?? 0) / 1000);
  out['당년S'] = Math.round((otbData['26S']?.[planBrand] ?? 0) / 1000);
  out['1년차'] = Math.round((otbData['25F']?.[planBrand] ?? 0) / 1000);
  out['2년차'] = 0;
  out['차기시즌'] = Math.round(((otbData['27F']?.[planBrand] ?? 0) + (otbData['27S']?.[planBrand] ?? 0)) / 1000);
  out['과시즌'] = 0;
  return out;
}

function createEmptyAnnualShipmentPlan(): AnnualShipmentPlan {
  const emptyRow: Record<AnnualPlanSeason, number> = {
    currF: 0,
    currS: 0,
    year1: 0,
    year2: 0,
    next: 0,
    past: 0,
  };
  return {
    MLB: { ...emptyRow },
    'MLB KIDS': { ...emptyRow },
    DISCOVERY: { ...emptyRow },
  };
}

function calcYearDays(year: number): number {
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

function sum12(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

function aggregateLeafTables(tables: InventoryTableData[], year: number): InventoryTableData {
  if (tables.length === 0) return { rows: [] };
  const yearDays = calcYearDays(year);
  const byKey = new Map<string, InventoryRowRaw>();
  for (const table of tables) {
    for (const row of table.rows) {
      if (!row.isLeaf) continue;
      const existing = byKey.get(row.key);
      if (!existing) {
        byKey.set(row.key, {
          key: row.key as RowKey,
          opening: row.opening,
          sellIn: [...row.sellIn],
          sellOut: [...row.sellOut],
          closing: row.closing,
          woiSellOut: [...row.woiSellOut],
          ...(row.hqSales ? { hqSales: [...row.hqSales] } : {}),
        });
      } else {
        existing.opening += row.opening;
        existing.closing += row.closing;
        existing.sellIn = sum12(existing.sellIn, row.sellIn);
        existing.sellOut = sum12(existing.sellOut, row.sellOut);
        existing.woiSellOut = sum12(existing.woiSellOut ?? new Array(12).fill(0), row.woiSellOut);
        if (row.hqSales) {
          existing.hqSales = sum12(existing.hqSales ?? new Array(12).fill(0), row.hqSales);
        }
      }
    }
  }
  return buildTableData(Array.from(byKey.values()), yearDays);
}

function aggregateTopTables(tables: TopTablePair[], year: number): TopTablePair {
  return {
    dealer: aggregateLeafTables(tables.map((t) => t.dealer), year),
    hq: aggregateLeafTables(tables.map((t) => t.hq), year),
  };
}

type AdjustedDealerRetailRow = RetailSalesRow & { opening?: number | null };

function buildAdjustedDealerRetailRows(
  sourceRows: RetailSalesRow[],
  monthlyRows: MonthlyStockResponse['dealer']['rows'],
  shipmentRows: ShipmentSalesResponse['data']['rows'],
): AdjustedDealerRetailRow[] {
  const monthlyByKey = new Map(monthlyRows.map((row) => [row.key, row]));
  const shipmentByKey = new Map(shipmentRows.map((row) => [row.key, row]));
  const leafRows: AdjustedDealerRetailRow[] = sourceRows
    .filter((row) => row.isLeaf)
    .map((row) => ({
      ...row,
      opening: monthlyByKey.get(row.key)?.opening ?? null,
      monthly: row.monthly.map((_, monthIndex) => {
        const monthlyRow = monthlyByKey.get(row.key);
        const shipmentRow = shipmentByKey.get(row.key);
        if (!monthlyRow || !shipmentRow) return null;
        const opening = monthIndex === 0 ? (monthlyRow.opening ?? null) : (monthlyRow.monthly[monthIndex - 1] ?? null);
        const sellIn = shipmentRow.monthly[monthIndex] ?? null;
        const closing = monthlyRow.monthly[monthIndex] ?? null;
        if (opening === null && sellIn === null && closing === null) return null;
        return (opening ?? 0) + (sellIn ?? 0) - (closing ?? 0);
      }),
    }));

  const sumOpening = (rows: AdjustedDealerRetailRow[]): number | null => {
    const values = rows
      .map((row) => row.opening)
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0);
  };
  const sumMonthly = (rows: AdjustedDealerRetailRow[], monthIndex: number): number | null => {
    const values = rows
      .map((row) => row.monthly[monthIndex] ?? null)
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0);
  };

  const clothingLeafRows = leafRows.slice(0, 6);
  const accLeafRows = leafRows.slice(6);
  const totalTemplate = sourceRows.find((row) => row.isTotal);
  const subtotalTemplates = sourceRows.filter((row) => row.isSubtotal);
  const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
  const accSubtotalTemplate = subtotalTemplates[1] ?? null;
  const clothingSubtotal =
    clothingSubtotalTemplate == null
      ? null
      : {
          ...clothingSubtotalTemplate,
          opening: sumOpening(clothingLeafRows),
          monthly: clothingSubtotalTemplate.monthly.map((_, monthIndex) => sumMonthly(clothingLeafRows, monthIndex)),
        };
  const accSubtotal =
    accSubtotalTemplate == null
      ? null
      : {
          ...accSubtotalTemplate,
          opening: sumOpening(accLeafRows),
          monthly: accSubtotalTemplate.monthly.map((_, monthIndex) => sumMonthly(accLeafRows, monthIndex)),
        };
  const grandTotal =
    totalTemplate == null
      ? null
      : {
          ...totalTemplate,
          opening: sumOpening(leafRows),
          monthly: totalTemplate.monthly.map((_, monthIndex) => sumMonthly(leafRows, monthIndex)),
        };

  return [
    ...(grandTotal ? [grandTotal] : []),
    ...(clothingSubtotal ? [clothingSubtotal] : []),
    ...clothingLeafRows,
    ...(accSubtotal ? [accSubtotal] : []),
    ...accLeafRows,
  ];
}

function applyAdjustedDealerRetailPlanBase(
  currentRetail: RetailSalesResponse,
  prevYearMonthly: MonthlyStockResponse,
  prevYearRetail: RetailSalesResponse,
  prevYearShipment: ShipmentSalesResponse,
  growthRateDealer: number,
): RetailSalesResponse {
  if (currentRetail.planFromMonth == null) return currentRetail;
  const adjustedPrevDealerRows = buildAdjustedDealerRetailRows(
    prevYearRetail.dealer.rows,
    prevYearMonthly.dealer.rows,
    prevYearShipment.data.rows,
  );
  return {
    ...currentRetail,
    dealer: {
      rows: mergePlanMonths(
        currentRetail.dealer.rows,
        adjustedPrevDealerRows,
        currentRetail.planFromMonth,
        1 + growthRateDealer / 100,
      ),
    },
  };
}

function buildSeasonShipmentDerivedSellOutPlan(
  planBrand: AnnualPlanBrand,
  annualPlan: AnnualShipmentPlan,
  hqTable: InventoryTableData,
): Partial<Record<RowKey, number>> {
  const byKey = new Map(hqTable.rows.filter((r) => r.isLeaf).map((r) => [r.key, r]));
  const out: Partial<Record<RowKey, number>> = {};
  for (let i = 0; i < SEASON_KEYS.length && i < ANNUAL_PLAN_SEASONS.length; i += 1) {
    const seasonKey = SEASON_KEYS[i] as RowKey;
    const planSeason = ANNUAL_PLAN_SEASONS[i];
    const plannedShipment = annualPlan[planBrand][planSeason] ?? 0;
    const hqSalesTotal = byKey.get(seasonKey)?.hqSalesTotal ?? 0;
    out[seasonKey] = Math.max(0, Math.round(plannedShipment - hqSalesTotal));
  }
  return out;
}

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
      {children}
    </div>
  );
}

const ACC_KEYS_ORDER: AccKey[] = ['신발', '모자', '가방', '기타'];
const TH_SMALL = 'px-3 py-2 text-center text-xs font-semibold bg-[#1a2e5a] text-white border border-[#2e4070] whitespace-nowrap';

function HqHoldingWoiTable({
  values,
  onChange,
  horizontal = false,
}: {
  values: Record<AccKey, number>;
  onChange: (key: AccKey, value: number) => void;
  horizontal?: boolean;
}) {
  const [editingKey, setEditingKey] = useState<AccKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (key: AccKey) => {
    setEditingKey(key);
    setEditValue(String(values[key]));
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = (key: AccKey) => {
    const v = parseFloat(editValue);
    if (!isNaN(v) && v > 0) onChange(key, v);
    setEditingKey(null);
    setEditValue('');
  };

  if (horizontal) {
    return (
      <div className="flex items-center gap-3 px-1 py-1.5 rounded border border-gray-200 bg-gray-50 text-xs">
        <span className="font-semibold text-slate-600 whitespace-nowrap">본사판매용</span>
        {ACC_KEYS_ORDER.map((key) => (
          <span key={key} className="flex items-center gap-0.5">
            <span className="text-gray-500">{key}:</span>
            <span
              className="text-blue-700 font-medium cursor-text px-1 py-0.5 rounded hover:bg-blue-50"
              onClick={() => editingKey !== key && startEdit(key)}
            >
              {editingKey === key ? (
                <input
                  ref={inputRef}
                  type="number"
                  min={1}
                  step={1}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(key)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                  className="w-10 text-right text-xs border-0 bg-transparent outline-none tabular-nums text-blue-700 font-medium"
                />
              ) : (
                `${values[key]}주`
              )}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-shrink-0">
      <div className="rounded border border-gray-200 shadow-sm">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH_SMALL} style={{ minWidth: 70 }}>
                본사판매용
              </th>
            </tr>
          </thead>
          <tbody>
            {ACC_KEYS_ORDER.map((key) => (
              <tr key={key} className="bg-white hover:bg-gray-50">
                <td
                  className="px-3 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums align-middle cursor-text"
                  onClick={() => editingKey !== key && startEdit(key)}
                >
                  {editingKey === key ? (
                    <input
                      ref={inputRef}
                      type="number"
                      min={1}
                      step={1}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(key)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                      className="w-12 text-right text-xs border-0 bg-transparent outline-none tabular-nums"
                    />
                  ) : (
                    <span className="text-blue-700 font-medium">{values[key]}주</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeAnnualShipmentPlan(source: unknown): AnnualShipmentPlan {
  const base = createEmptyAnnualShipmentPlan();
  const parsed = (source ?? {}) as Partial<AnnualShipmentPlan>;
  for (const b of ANNUAL_PLAN_BRANDS) {
    for (const season of ANNUAL_PLAN_SEASONS) {
      const v = parsed?.[b]?.[season];
      base[b][season] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
  }
  return base;
}

async function fetchSnapshotFromServer(year: number, brand: string): Promise<SnapshotData | null> {
  try {
    const params = new URLSearchParams({ year: String(year), brand });
    const res = await fetch(`/api/inventory/snapshot?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SnapshotData | null };
    return (json.data ?? null) as SnapshotData | null;
  } catch {
    return null;
  }
}

async function saveSnapshotToServer(year: number, brand: string, data: SnapshotData): Promise<void> {
  try {
    await fetch('/api/inventory/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, brand, data }),
    });
  } catch {
    // ignore server sync errors; local snapshot remains available
  }
}

async function fetchAnnualPlanFromServer(year: number): Promise<AnnualShipmentPlan | null> {
  try {
    const params = new URLSearchParams({ year: String(year) });
    const res = await fetch(`/api/inventory/annual-shipment-plan?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    if (!json.data) return null;
    return normalizeAnnualShipmentPlan(json.data);
  } catch {
    return null;
  }
}

async function saveAnnualPlanToServer(year: number, data: AnnualShipmentPlan): Promise<void> {
  try {
    await fetch('/api/inventory/annual-shipment-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, data }),
    });
  } catch {
    // ignore server sync errors; local copy remains available
  }
}

export default function InventoryDashboard() {
  const [year, setYear] = useState<number>(2026);
  const brand = '전체' as Brand;
  const [growthRateByBrand, setGrowthRateByBrand] = useState<Record<AnnualPlanBrand, number>>({
    MLB: 5, 'MLB KIDS': -1, DISCOVERY: 200,
  });
  const [growthRateHqByBrand, setGrowthRateHqByBrand] = useState<Record<AnnualPlanBrand, number>>({
    MLB: 17, 'MLB KIDS': 0, DISCOVERY: 200,
  });
  const growthRate = growthRateByBrand['MLB'] ?? 5;
  const growthRateHq = growthRateHqByBrand['MLB'] ?? 17;

  const publishDealerAccSellIn = useCallback((nextMap: Record<'MLB' | 'MLB KIDS' | 'DISCOVERY', number>) => {
    if (typeof window === 'undefined') return;
    const payload = {
      values: nextMap,
      updatedAt: Date.now(),
    };
    localStorage.setItem('inventory_dealer_acc_sellin', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-dealer-acc-sellin-updated', { detail: payload }));
  }, []);

  const publishHqClosingByBrand = useCallback((partialMap: Partial<HqClosingByBrand>) => {
    if (typeof window === 'undefined') return;
    const currentRaw = localStorage.getItem(INVENTORY_HQ_CLOSING_KEY);
    let currentValues: HqClosingByBrand = {
      MLB: 0,
      'MLB KIDS': 0,
      DISCOVERY: 0,
    };
    try {
      const parsed = currentRaw ? JSON.parse(currentRaw) : null;
      if (parsed?.values) {
        currentValues = {
          MLB: Number(parsed.values.MLB) || 0,
          'MLB KIDS': Number(parsed.values['MLB KIDS']) || 0,
          DISCOVERY: Number(parsed.values.DISCOVERY) || 0,
        };
      }
    } catch {
      // ignore parse errors and overwrite with fresh values below
    }
    const nextValues = { ...currentValues, ...partialMap };
    const payload = {
      values: nextValues,
      updatedAt: Date.now(),
    };
    localStorage.setItem(INVENTORY_HQ_CLOSING_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-hq-closing-updated', { detail: payload }));
  }, []);
  const publishMonthlyInventoryTotalByBrand = useCallback((partialMap: Partial<MonthlyInventoryTotalByBrand>) => {
    if (typeof window === 'undefined') return;
    const currentRaw = localStorage.getItem(INVENTORY_MONTHLY_TOTAL_KEY);
    let currentValues: MonthlyInventoryTotalByBrand = {
      MLB: new Array(12).fill(null),
      'MLB KIDS': new Array(12).fill(null),
      DISCOVERY: new Array(12).fill(null),
    };
    try {
      const parsed = currentRaw ? JSON.parse(currentRaw) : null;
      if (parsed?.values) {
        currentValues = {
          MLB: Array.isArray(parsed.values.MLB) ? parsed.values.MLB : new Array(12).fill(null),
          'MLB KIDS': Array.isArray(parsed.values['MLB KIDS']) ? parsed.values['MLB KIDS'] : new Array(12).fill(null),
          DISCOVERY: Array.isArray(parsed.values.DISCOVERY) ? parsed.values.DISCOVERY : new Array(12).fill(null),
        };
      }
    } catch {
      // ignore parse errors and overwrite with fresh values below
    }
    const nextValues = { ...currentValues, ...partialMap };
    const payload = {
      values: nextValues,
      updatedAt: Date.now(),
    };
    localStorage.setItem(INVENTORY_MONTHLY_TOTAL_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-monthly-total-updated', { detail: payload }));
  }, []);

  const publishPurchaseMonthlyByBrand = useCallback((partialMap: Partial<MonthlyInventoryTotalByBrand>) => {
    if (typeof window === 'undefined') return;
    const currentRaw = localStorage.getItem(INVENTORY_PURCHASE_MONTHLY_KEY);
    let currentValues: MonthlyInventoryTotalByBrand = {
      MLB: new Array(12).fill(null),
      'MLB KIDS': new Array(12).fill(null),
      DISCOVERY: new Array(12).fill(null),
    };
    try {
      const parsed = currentRaw ? JSON.parse(currentRaw) : null;
      if (parsed?.values) {
        currentValues = {
          MLB: Array.isArray(parsed.values.MLB) ? parsed.values.MLB : new Array(12).fill(null),
          'MLB KIDS': Array.isArray(parsed.values['MLB KIDS']) ? parsed.values['MLB KIDS'] : new Array(12).fill(null),
          DISCOVERY: Array.isArray(parsed.values.DISCOVERY) ? parsed.values.DISCOVERY : new Array(12).fill(null),
        };
      }
    } catch {
      // ignore parse errors
    }
    const nextValues = { ...currentValues, ...partialMap };
    const payload = {
      values: nextValues,
      updatedAt: Date.now(),
    };
    localStorage.setItem(INVENTORY_PURCHASE_MONTHLY_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-purchase-monthly-updated', { detail: payload }));
  }, []);

  const publishShipmentMonthlyByBrand = useCallback((partialMap: Partial<MonthlyInventoryTotalByBrand>) => {
    if (typeof window === 'undefined') return;
    const currentRaw = localStorage.getItem(INVENTORY_SHIPMENT_MONTHLY_KEY);
    let currentValues: MonthlyInventoryTotalByBrand = {
      MLB: new Array(12).fill(null),
      'MLB KIDS': new Array(12).fill(null),
      DISCOVERY: new Array(12).fill(null),
    };
    try {
      const parsed = currentRaw ? JSON.parse(currentRaw) : null;
      if (parsed?.values) {
        currentValues = {
          MLB: Array.isArray(parsed.values.MLB) ? parsed.values.MLB : new Array(12).fill(null),
          'MLB KIDS': Array.isArray(parsed.values['MLB KIDS']) ? parsed.values['MLB KIDS'] : new Array(12).fill(null),
          DISCOVERY: Array.isArray(parsed.values.DISCOVERY) ? parsed.values.DISCOVERY : new Array(12).fill(null),
        };
      }
    } catch {
      // ignore parse errors
    }
    const nextValues = { ...currentValues, ...partialMap };
    const payload = {
      values: nextValues,
      updatedAt: Date.now(),
    };
    localStorage.setItem(INVENTORY_SHIPMENT_MONTHLY_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-shipment-monthly-updated', { detail: payload }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      growthRate,
      growthRateHq,
      growthRateByBrand,
      growthRateHqByBrand,
      updatedAt: Date.now(),
    };
    localStorage.setItem('inventory_growth_params', JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('inventory-growth-updated', { detail: payload }));
  }, [growthRate, growthRateHq, growthRateByBrand, growthRateHqByBrand]);

  // 3개 브랜드 백그라운드 로딩 완료 여부 (필터바 뱃지용)
  const [allBrandsBgLoaded, setAllBrandsBgLoaded] = useState(false);

  // 2026년 재고자산탭 최초 로드 시 3개 브랜드 데이터를 백그라운드에서 병렬 fetch
  // → *DataByBrand에 저장되면 publishHqClosingByBrand 및 하위 publish 효과들이 자동으로 트리거됨
  useEffect(() => {
    if (year !== 2026) return;
    setAllBrandsBgLoaded(false);
    let cancelled = false;

    const run = async () => {
      await Promise.all(
        ANNUAL_PLAN_BRANDS.map(async (b) => {
          // 이미 데이터가 있으면 건너뜀
          if (monthlyByBrandRef.current[b]) return;
          try {
            const [monthlyRes, retailRes, shipmentRes, purchaseRes] = await Promise.all([
              fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand: b })}`),
              fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand: b, growthRate: String(growthRateByBrand[b]), growthRateHq: String(growthRateHqByBrand[b]) })}`),
              fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand: b })}`),
              fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand: b })}`),
            ]);
            if (cancelled) return;
            const [monthly, retail, shipment, purchase] = await Promise.all([
              monthlyRes.json(),
              retailRes.json(),
              shipmentRes.json(),
              purchaseRes.json(),
            ]);
            if (cancelled) return;
            monthlyByBrandRef.current[b] = monthly as MonthlyStockResponse;
            retailByBrandRef.current[b] = retail as RetailSalesResponse;
            shipmentByBrandRef.current[b] = shipment as ShipmentSalesResponse;
            purchaseByBrandRef.current[b] = purchase as PurchaseResponse;
            setMonthlyDataByBrand((prev) => ({ ...prev, [b]: monthly as MonthlyStockResponse }));
            setRetailDataByBrand((prev) => ({ ...prev, [b]: retail as RetailSalesResponse }));
            setShipmentDataByBrand((prev) => ({ ...prev, [b]: shipment as ShipmentSalesResponse }));
            setPurchaseDataByBrand((prev) => ({ ...prev, [b]: purchase as PurchaseResponse }));
          } catch {
            // 백그라운드 fetch 실패는 무시 (현재 브랜드 탭의 메인 fetch가 우선)
          }
        }),
      );
      if (!cancelled) {
        const allLoaded = ANNUAL_PLAN_BRANDS.every((b) => !!monthlyByBrandRef.current[b]);
        if (allLoaded) setAllBrandsBgLoaded(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, growthRateByBrand, growthRateHqByBrand]);

  // 湲곗〈 Sell-in/Sell-out ???곗씠??
  const [data, setData] = useState<InventoryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ?붾퀎 ?ш퀬?붿븸 ???곗씠??
  const [monthlyData, setMonthlyData] = useState<MonthlyStockResponse | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  // 2026 YOY 계산용 전년(year-1) 데이터
  const [prevYearMonthlyData, setPrevYearMonthlyData] = useState<MonthlyStockResponse | null>(null);
  const [prevYearRetailData, setPrevYearRetailData] = useState<RetailSalesResponse | null>(null);
  const [prevYearShipmentData, setPrevYearShipmentData] = useState<ShipmentSalesResponse | null>(null);
  const [prevYearPurchaseData, setPrevYearPurchaseData] = useState<PurchaseResponse | null>(null);
  const [prevYearMonthlyDataByBrand, setPrevYearMonthlyDataByBrand] = useState<Partial<Record<LeafBrand, MonthlyStockResponse>>>({});
  const [prevYearRetailDataByBrand, setPrevYearRetailDataByBrand] = useState<Partial<Record<LeafBrand, RetailSalesResponse>>>({});
  const [prevYearShipmentDataByBrand, setPrevYearShipmentDataByBrand] = useState<Partial<Record<LeafBrand, ShipmentSalesResponse>>>({});
  const [prevYearLoading, setPrevYearLoading] = useState<boolean>(false);
  const [prevYearError, setPrevYearError] = useState<boolean>(false);

  // 由ы뀒??留ㅼ텧 ???곗씠??
  const [retailData, setRetailData] = useState<RetailSalesResponse | null>(null);
  const [retailLoading, setRetailLoading] = useState<boolean>(false);
  const [retailError, setRetailError] = useState<string | null>(null);

  // 蹂몄궗?믩?由ъ긽 異쒓퀬留ㅼ텧 ???곗씠??
  const [shipmentData, setShipmentData] = useState<ShipmentSalesResponse | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState<boolean>(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

  // 蹂몄궗 留ㅼ엯?곹뭹 ???곗씠??
  const [purchaseData, setPurchaseData] = useState<PurchaseResponse | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState<boolean>(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [plActualAvailableMonths, setPlActualAvailableMonths] = useState<number[]>([]);
  const [shipmentProgressRows, setShipmentProgressRows] = useState<ShipmentProgressRow[]>([]);
  const [accShipmentRatioRows, setAccShipmentRatioRows] = useState<AccShipmentRatioRow[]>([]);

  // ?붾퀎 ?뱀뀡 ?좉? (湲곕낯 ?묓옒)
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [retailOpen, setRetailOpen] = useState(false);
  const [adjustedRetailOpen, setAdjustedRetailOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [annualPlanOpen, setAnnualPlanOpen] = useState(false);
  const [dependentPlanOpen, setDependentPlanOpen] = useState(false);
  const [dependentPlanValues, setDependentPlanValues] = useState<DependentPlanValueMap>({});
  const [dependentDriverBrandOpen, setDependentDriverBrandOpen] = useState<Partial<Record<DependentPlanRowLabel, boolean>>>({});
  const [inventoryBrandOpen, setInventoryBrandOpen] = useState<Record<AnnualPlanBrand, boolean>>({
    MLB: true,
    'MLB KIDS': true,
    DISCOVERY: true,
  });
  const [dependentPlanInitialLoading, setDependentPlanInitialLoading] = useState(false);
  const [otbData, setOtbData] = useState<OtbData | null>(null);
  const [otbLoading, setOtbLoading] = useState(false);
  const [otbError, setOtbError] = useState<string | null>(null);
  const [otbEditMode, setOtbEditMode] = useState(false);
  const [otbDraft, setOtbDraft] = useState<OtbData | null>(null);
  const [annualShipmentPlan2026, setAnnualShipmentPlan2026] = useState<AnnualShipmentPlan>(createEmptyAnnualShipmentPlan);
  const [annualShipmentPlanDraft2026, setAnnualShipmentPlanDraft2026] = useState<AnnualShipmentPlan>(createEmptyAnnualShipmentPlan);
  const [annualPlanEditMode, setAnnualPlanEditMode] = useState(false);

  // ?ㅻ깄???곹깭
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  // 2026 ACC 湲곕쭚 紐⑺몴 ?ш퀬二쇱닔 (?由ъ긽/蹂몄궗蹂??좊컻쨌紐⑥옄쨌媛諛㈑룰린?)
  const [accTargetWoiDealer, setAccTargetWoiDealer] = useState<Record<AccKey, number>>({
    '신발': 29,
    '모자': 20,
    '가방': 25.5,
    '기타': 39,
  } as Record<AccKey, number>);
  const [accTargetWoiHq, setAccTargetWoiHq] = useState<Record<AccKey, number>>({
    '신발': 10,
    '모자': 8,
    '가방': 10,
    '기타': 10,
  } as Record<AccKey, number>);
  const [accHqHoldingWoi, setAccHqHoldingWoi] = useState<Record<AccKey, number>>({
    '신발': 30,
    '모자': 20,
    '가방': 30,
    '기타': 30,
  } as Record<AccKey, number>);
  const accTargetWoiDealerRef = useRef(accTargetWoiDealer);
  const accTargetWoiHqRef = useRef(accTargetWoiHq);
  const accHqHoldingWoiRef = useRef(accHqHoldingWoi);
  useEffect(() => {
    accTargetWoiDealerRef.current = accTargetWoiDealer;
  }, [accTargetWoiDealer]);
  useEffect(() => {
    accTargetWoiHqRef.current = accTargetWoiHq;
  }, [accTargetWoiHq]);
  useEffect(() => {
    accHqHoldingWoiRef.current = accHqHoldingWoi;
  }, [accHqHoldingWoi]);
  useEffect(() => {
    const firstAccKey = ACC_KEYS[0];
    if (!firstAccKey) return;
    setAccTargetWoiDealer((prev) => {
      if (prev[firstAccKey as AccKey] === 30) return prev;
      return { ...prev, [firstAccKey]: 30 };
    });
  }, []);
  const [hqSellOutPlan, setHqSellOutPlan] = useState<Partial<Record<RowKey, number>>>({});
  const retail2025Ref = useRef<RetailSalesResponse['retail2025'] | null>(null);
  const monthlyByBrandRef = useRef<Partial<Record<LeafBrand, MonthlyStockResponse>>>({});
  const retailByBrandRef = useRef<Partial<Record<LeafBrand, RetailSalesResponse>>>({});
  const shipmentByBrandRef = useRef<Partial<Record<LeafBrand, ShipmentSalesResponse>>>({});
  const purchaseByBrandRef = useRef<Partial<Record<LeafBrand, PurchaseResponse>>>({});
  const [savedSnapshotByBrand, setSavedSnapshotByBrand] = useState<Partial<Record<LeafBrand, SnapshotData>>>({});
  const [monthlyDataByBrand, setMonthlyDataByBrand] = useState<Partial<Record<LeafBrand, MonthlyStockResponse>>>({});
  const [retailDataByBrand, setRetailDataByBrand] = useState<Partial<Record<LeafBrand, RetailSalesResponse>>>({});
  const [shipmentDataByBrand, setShipmentDataByBrand] = useState<Partial<Record<LeafBrand, ShipmentSalesResponse>>>({});
  const [purchaseDataByBrand, setPurchaseDataByBrand] = useState<Partial<Record<LeafBrand, PurchaseResponse>>>({});

  const DEFAULT_ACC_WOI_DEALER: Record<AccKey, number> = {
    '신발': 29,
    '모자': 20,
    '가방': 25.5,
    '기타': 39,
  } as Record<AccKey, number>;
  const DEFAULT_ACC_WOI_HQ: Record<AccKey, number> = {
    '신발': 10,
    '모자': 8,
    '가방': 10,
    '기타': 10,
  } as Record<AccKey, number>;
  const DEFAULT_ACC_HQ_HOLDING_WOI: Record<AccKey, number> = {
    '신발': 30,
    '모자': 20,
    '가방': 30,
    '기타': 30,
  } as Record<AccKey, number>;

  // ?? 湲곗〈 ??fetch ??
  const fetchData = useCallback(async () => {
    // 2025/2026 ?ш퀬?먯궛 ???곷떒 ?붿빟?쒕뒗 ?붾퀎/由ы뀒??異쒓퀬/留ㅼ엯 議고빀?쇰줈留??뚮뜑?쒕떎.
    // (湲곗〈 /api/inventory fallback???곕㈃ 珥덇린 ?섎뱶肄붾뵫 ?レ옄 源쒕묀?꾩씠 諛쒖깮)
    if (year === 2025 || year === 2026) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        growthRate: String(growthRateByBrand[(brand === '전체' ? 'MLB' : brand) as AnnualPlanBrand] ?? growthRate),
        brand,
      });
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error('?곗씠??濡쒕뱶 ?ㅽ뙣');
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [year, brand, growthRate]);

  // ?? ?붾퀎 ?ш퀬?붿븸 fetch ??
  const fetchMonthlyData = useCallback(async () => {
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: MonthlyStockResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error);
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          monthlyByBrandRef.current[b] = jsons[i];
        });
        setMonthlyDataByBrand(Object.fromEntries(BRANDS_TO_AGGREGATE.map((b, i) => [b, jsons[i]])) as Record<LeafBrand, MonthlyStockResponse>);
        setMonthlyData(aggregateMonthlyStock(jsons));
      } else {
        const res = await fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand })}`);
        if (!res.ok) throw new Error('?붾퀎 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        const json: MonthlyStockResponse = await res.json();
        if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
        monthlyByBrandRef.current[brand as LeafBrand] = json;
        setMonthlyData(json);
      }
    } catch (e) {
      setMonthlyError(String(e));
    } finally {
      setMonthlyLoading(false);
    }
  }, [year, brand]);

  // ?? 由ы뀒??留ㅼ텧 fetch ??
  const fetchRetailData = useCallback(async () => {
    setRetailLoading(true);
    setRetailError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand: b, growthRate: String(growthRateByBrand[b]), growthRateHq: String(growthRateHqByBrand[b]) })}`),
          ),
        );
        const jsons: RetailSalesResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error);
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          retailByBrandRef.current[b] = jsons[i];
        });
        setRetailDataByBrand(Object.fromEntries(BRANDS_TO_AGGREGATE.map((b, i) => [b, jsons[i]])) as Record<LeafBrand, RetailSalesResponse>);
        const aggregated = aggregateRetailSales(jsons);
        if (aggregated.retail2025) retail2025Ref.current = aggregated.retail2025;
        setRetailData(aggregated);
      } else {
        const brandKey = brand as AnnualPlanBrand;
        const res = await fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand, growthRate: String(growthRateByBrand[brandKey] ?? growthRate), growthRateHq: String(growthRateHqByBrand[brandKey] ?? growthRateHq) })}`);
        if (!res.ok) throw new Error('由ы뀒??留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        const json: RetailSalesResponse = await res.json();
        if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
        if (json.retail2025) retail2025Ref.current = json.retail2025;
        retailByBrandRef.current[brand as LeafBrand] = json;
        setRetailData(json);
      }
    } catch (e) {
      setRetailError(String(e));
    } finally {
      setRetailLoading(false);
    }
  }, [year, brand, growthRate, growthRateHq, growthRateByBrand, growthRateHqByBrand]);

  // ?? 異쒓퀬留ㅼ텧 fetch ??
  const fetchShipmentData = useCallback(async () => {
    setShipmentLoading(true);
    setShipmentError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: ShipmentSalesResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? '異쒓퀬留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          shipmentByBrandRef.current[b] = jsons[i];
        });
        setShipmentDataByBrand(Object.fromEntries(BRANDS_TO_AGGREGATE.map((b, i) => [b, jsons[i]])) as Record<LeafBrand, ShipmentSalesResponse>);
        setShipmentData(aggregateShipmentSales(jsons));
      } else {
        const res = await fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand })}`);
        const json: ShipmentSalesResponse = await res.json();
        if (!res.ok || (json as { error?: string }).error) throw new Error((json as { error?: string }).error ?? '異쒓퀬留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        shipmentByBrandRef.current[brand as LeafBrand] = json;
        setShipmentData(json);
      }
    } catch (e) {
      setShipmentError(String(e));
    } finally {
      setShipmentLoading(false);
    }
  }, [year, brand]);

  // ?? 蹂몄궗 留ㅼ엯?곹뭹 fetch ??
  const fetchPurchaseData = useCallback(async () => {
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: PurchaseResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? '留ㅼ엯?곹뭹 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          purchaseByBrandRef.current[b] = jsons[i];
        });
        setPurchaseDataByBrand(Object.fromEntries(BRANDS_TO_AGGREGATE.map((b, i) => [b, jsons[i]])) as Record<LeafBrand, PurchaseResponse>);
        setPurchaseData(aggregatePurchase(jsons));
      } else {
        const res = await fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand })}`);
        const json: PurchaseResponse = await res.json();
        if (!res.ok || (json as { error?: string }).error) throw new Error((json as { error?: string }).error ?? '留ㅼ엯?곹뭹 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        purchaseByBrandRef.current[brand as LeafBrand] = json;
        setPurchaseData(json);
      }
    } catch (e) {
      setPurchaseError(String(e));
    } finally {
      setPurchaseLoading(false);
    }
  }, [year, brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ?ㅻ깄?룹씠 ?덉쑝硫?API ?앸왂, ?놁쑝硫?4媛?API ?몄텧 (전체 ??? ?ㅻ깄??誘몄궗?? ??긽 API 吏묎퀎)
  useEffect(() => {
    let cancelled = false;

    const applySnapshotToState = (snap: SnapshotData) => {
      setMonthlyData(snap.monthly);
      setShipmentData(snap.shipment);
      setPurchaseData(snap.purchase);
      // 4개 항목만 저장하므로 hqSellOutPlan·accTargetWoi·accHqHoldingWoi는 적용하지 않음
      if (year === 2026 && snap.planFromMonth != null && snap.retail2025) {
        setRetailData(
          applyPlanToSnapshot(
            snap.retailActuals,
            snap.retail2025 as RetailSalesResponse,
            snap.planFromMonth,
            growthRate,
            growthRateHq,
          ),
        );
      } else {
        setRetailData(snap.retailActuals);
      }
      setSnapshotSaved(true);
      setSnapshotSavedAt(snap.savedAt);
    };

    const run = async () => {
      if (brand === '전체') {
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        return;
      }

      if (year === 2026) {
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        return;
      }

      const serverSnap = await fetchSnapshotFromServer(year, brand);
      if (cancelled) return;
      if (serverSnap) {
        saveSnapshot(year, brand, serverSnap);
        applySnapshotToState(serverSnap);
        return;
      }

      setSnapshotSaved(false);
      setSnapshotSavedAt(null);
      await Promise.all([
        fetchMonthlyData(),
        fetchRetailData(),
        fetchShipmentData(),
        fetchPurchaseData(),
      ]);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, brand]); // growthRate 관계없이 조회

  useEffect(() => {
    if (year !== 2026) return;
    let cancelled = false;

    const run = async () => {
      const serverPlan = await fetchAnnualPlanFromServer(year);
      if (cancelled) return;
      if (serverPlan) {
        setAnnualShipmentPlan2026(serverPlan);
        setAnnualShipmentPlanDraft2026(serverPlan);
        setAnnualPlanEditMode(false);
        return;
      }

      const empty = createEmptyAnnualShipmentPlan();
      setAnnualShipmentPlan2026(empty);
      setAnnualShipmentPlanDraft2026(empty);
      setAnnualPlanEditMode(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // 2026 대리상 OTB 데이터 fetch
  useEffect(() => {
    if (year !== 2026) {
      setOtbData(null);
      return;
    }
    let cancelled = false;
    setOtbLoading(true);
    setOtbError(null);

    const run = async () => {
      try {
        const res = await fetch('/api/inventory/otb?year=2026', { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: OtbData | null; error?: string };
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setOtbData(json.data ?? null);
      } catch (e) {
        if (!cancelled) setOtbError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setOtbLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // 2026은 snapshot을 우회하므로 성장률 변경 시 리테일 API를 다시 조회한다.
  useEffect(() => {
    if (year !== 2026) return;
    void fetchRetailData();
    setSnapshotSaved(false);
    setSnapshotSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, growthRate, growthRateHq, growthRateByBrand, growthRateHqByBrand]);

  useEffect(() => {
    if (year !== 2026 || brand !== '전체') return;
    let cancelled = false;

    const warmServerSnapshotsToLocal = async () => {
      if (!cancelled) {
        setSavedSnapshotByBrand({});
      }
    };

    void warmServerSnapshotsToLocal();
    return () => {
      cancelled = true;
    };
  }, [year, brand]);

  // 2026 YOY 계산용: 전년(year-1) monthly/retail/shipment/purchase fetch
  useEffect(() => {
    if (year !== 2026) {
      setPrevYearMonthlyData(null);
      setPrevYearRetailData(null);
      setPrevYearShipmentData(null);
      setPrevYearPurchaseData(null);
      setPrevYearMonthlyDataByBrand({});
      setPrevYearRetailDataByBrand({});
      setPrevYearShipmentDataByBrand({});
      setPrevYearLoading(false);
      setPrevYearError(false);
      return;
    }
    // 탭 전환 시 즉시 전년 데이터 초기화 → YOY가 '- → 정상'으로 표시 (잘못된 숫자 방지)
    setPrevYearMonthlyData(null);
    setPrevYearRetailData(null);
    setPrevYearShipmentData(null);
    setPrevYearPurchaseData(null);
    setPrevYearMonthlyDataByBrand({});
    setPrevYearRetailDataByBrand({});
    setPrevYearShipmentDataByBrand({});
    setPrevYearLoading(true);
    setPrevYearError(false);
    let cancelled = false;

    const run = async () => {
      try {
        const prevYear = year - 1;
        if (brand !== '전체') {
          const localPrevSnap = loadSnapshot(prevYear, brand);
          const prevSnap = localPrevSnap ?? await fetchSnapshotFromServer(prevYear, brand);
          if (cancelled) return;
          if (prevSnap) {
            if (!localPrevSnap) {
              saveSnapshot(prevYear, brand, prevSnap);
            }
            setPrevYearMonthlyData(prevSnap.monthly);
            setPrevYearRetailData(prevSnap.retailActuals);
            setPrevYearShipmentData(prevSnap.shipment);
            setPrevYearPurchaseData(prevSnap.purchase);
            setPrevYearMonthlyDataByBrand({});
            setPrevYearRetailDataByBrand({});
            setPrevYearShipmentDataByBrand({});
            return;
          }
        }

        if (brand === '전체') {
          const [monthlyRess, retailRess, shipmentRess, purchaseRess] = await Promise.all([
            Promise.all(BRANDS_TO_AGGREGATE.map((b) =>
              fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(prevYear), brand: b })}`),
            )),
            Promise.all(BRANDS_TO_AGGREGATE.map((b) =>
              fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(prevYear), brand: b, growthRate: '0' })}`),
            )),
            Promise.all(BRANDS_TO_AGGREGATE.map((b) =>
              fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(prevYear), brand: b })}`),
            )),
            Promise.all(BRANDS_TO_AGGREGATE.map((b) =>
              fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(prevYear), brand: b })}`),
            )),
          ]);
          if (cancelled) return;
          const [monthlyJsons, retailJsons, shipmentJsons, purchaseJsons] = await Promise.all([
            Promise.all(monthlyRess.map((r) => r.json() as Promise<MonthlyStockResponse>)),
            Promise.all(retailRess.map((r) => r.json() as Promise<RetailSalesResponse>)),
            Promise.all(shipmentRess.map((r) => r.json() as Promise<ShipmentSalesResponse>)),
            Promise.all(purchaseRess.map((r) => r.json() as Promise<PurchaseResponse>)),
          ]);
          if (cancelled) return;
          setPrevYearMonthlyDataByBrand({
            MLB: monthlyJsons[0],
            'MLB KIDS': monthlyJsons[1],
            DISCOVERY: monthlyJsons[2],
          });
          setPrevYearRetailDataByBrand({
            MLB: retailJsons[0],
            'MLB KIDS': retailJsons[1],
            DISCOVERY: retailJsons[2],
          });
          setPrevYearShipmentDataByBrand({
            MLB: shipmentJsons[0],
            'MLB KIDS': shipmentJsons[1],
            DISCOVERY: shipmentJsons[2],
          });
          setPrevYearMonthlyData(aggregateMonthlyStock(monthlyJsons));
          setPrevYearRetailData(aggregateRetailSales(retailJsons));
          setPrevYearShipmentData(aggregateShipmentSales(shipmentJsons));
          setPrevYearPurchaseData(aggregatePurchase(purchaseJsons));
        } else {
          const [mRes, rRes, sRes, pRes] = await Promise.all([
            fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(prevYear), brand })}`),
            fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(prevYear), brand, growthRate: '0' })}`),
            fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(prevYear), brand })}`),
            fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(prevYear), brand })}`),
          ]);
          if (cancelled) return;
          const [mJson, rJson, sJson, pJson] = await Promise.all([
            mRes.json() as Promise<MonthlyStockResponse>,
            rRes.json() as Promise<RetailSalesResponse>,
            sRes.json() as Promise<ShipmentSalesResponse>,
            pRes.json() as Promise<PurchaseResponse>,
          ]);
          if (cancelled) return;
          if (!mRes.ok || !rRes.ok || !sRes.ok || !pRes.ok) {
            setPrevYearError(true);
            return;
          }
          if (
            (mJson as { error?: string }).error ||
            (rJson as { error?: string }).error ||
            (sJson as { error?: string }).error ||
            (pJson as { error?: string }).error
          ) {
            setPrevYearError(true);
            return;
          }
          setPrevYearMonthlyData(mJson);
          setPrevYearRetailData(rJson);
          setPrevYearShipmentData(sJson);
          setPrevYearPurchaseData(pJson);
          setPrevYearMonthlyDataByBrand({});
          setPrevYearRetailDataByBrand({});
          setPrevYearShipmentDataByBrand({});
        }
      } catch {
        if (!cancelled) {
          setPrevYearMonthlyData(null);
          setPrevYearRetailData(null);
          setPrevYearShipmentData(null);
          setPrevYearPurchaseData(null);
          setPrevYearMonthlyDataByBrand({});
          setPrevYearRetailDataByBrand({});
          setPrevYearShipmentDataByBrand({});
          setPrevYearError(true);
        }
      } finally {
        if (!cancelled) {
          setPrevYearLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [year, brand]);

  useEffect(() => {
    if (year !== 2026) {
      setPlActualAvailableMonths([]);
      setShipmentProgressRows([]);
      setAccShipmentRatioRows([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const [actualRes, progressRes, accRes] = await Promise.all([
          fetch(`/api/pl-forecast/brand-actual?${new URLSearchParams({ year: String(year) })}`, { cache: 'no-store' }),
          fetch('/api/inventory/shipment-progress', { cache: 'no-store' }),
          fetch('/api/inventory/acc-shipment-ratio', { cache: 'no-store' }),
        ]);
        const [actualJson, progressJson, accJson] = await Promise.all([
          actualRes.json() as Promise<{ availableMonths?: number[] }>,
          progressRes.json() as Promise<{ rows?: ShipmentProgressRow[] }>,
          accRes.json() as Promise<{ rows?: AccShipmentRatioRow[] }>,
        ]);
        if (cancelled) return;
        setPlActualAvailableMonths(actualRes.ok ? (actualJson.availableMonths ?? []) : []);
        setShipmentProgressRows(progressRes.ok ? (progressJson.rows ?? []) : []);
        setAccShipmentRatioRows(accRes.ok ? (accJson.rows ?? []) : []);
      } catch {
        if (cancelled) return;
        setPlActualAvailableMonths([]);
        setShipmentProgressRows([]);
        setAccShipmentRatioRows([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // 2025쨌2026?????곷떒 ?쒕뒗 ?붾퀎 ?ш퀬?붿븸 + 由ы뀒??留ㅼ텧 + 異쒓퀬留ㅼ텧 + 留ㅼ엯?곹뭹?쇰줈 援ъ꽦
  // 2026???뚮쭔 ACC 紐⑺몴 ?ш퀬二쇱닔 ?ㅻ쾭?덉씠 ?곸슜

  useEffect(() => {
    if (year !== 2026) {
      setDependentPlanValues({});
      setDependentPlanInitialLoading(false);
      return;
    }
    let mounted = true;
    setDependentPlanInitialLoading(true);

    const loadDependentPlanValues = async (silent = false) => {
      try {
        const res = await fetch('/api/inventory/dependent-plan', { cache: 'no-store' });
        const json = await res.json();
        if (!mounted || !res.ok || !Array.isArray(json?.rows)) return;

        const next: DependentPlanValueMap = {};
        for (const row of json.rows as { label?: string; values?: Record<string, number | null> }[]) {
          const label = (row.label ?? '') as DependentPlanRowLabel;
          if (!DEPENDENT_DRIVER_ROWS.includes(label)) continue;
          next[label] = {
            MLB: row.values?.MLB ?? null,
            'MLB KIDS': row.values?.['MLB KIDS'] ?? null,
            DISCOVERY: row.values?.DISCOVERY ?? null,
          };
        }
        setDependentPlanValues(next);
      } catch {
        // ignore
      } finally {
        if (!silent && mounted) setDependentPlanInitialLoading(false);
      }
    };

    loadDependentPlanValues(false);
    const intervalId = window.setInterval(() => loadDependentPlanValues(true), 15000);
    const handleFocus = () => {
      loadDependentPlanValues(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [year]);

  const effectiveRetailData = useMemo<RetailSalesResponse | null>(() => {
    if (!retailData) return null;
    // 2025년은 연간 확정 실적이므로 closedThrough 관계없이 원본 데이터 그대로 사용
    if (year === 2026 && prevYearMonthlyData && prevYearRetailData && prevYearShipmentData) {
      return applyAdjustedDealerRetailPlanBase(
        retailData,
        prevYearMonthlyData,
        prevYearRetailData,
        prevYearShipmentData,
        growthRate,
      );
    }
    return retailData;
  }, [year, retailData, prevYearMonthlyData, prevYearRetailData, prevYearShipmentData, growthRate]);

  // 브랜드별 effectiveRetailData — applyAdjustedDealerRetailPlanBase 적용 (현재 브랜드 외 2개 포함)
  const perBrandEffectiveRetailData = useMemo<Partial<Record<AnnualPlanBrand, RetailSalesResponse>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, RetailSalesResponse>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const src = retailDataByBrand[b];
      const prevMData = prevYearMonthlyDataByBrand[b];
      const prevRData = prevYearRetailDataByBrand[b];
      const prevSData = prevYearShipmentDataByBrand[b];
      if (!src) continue;
      if (prevMData && prevRData && prevSData) {
        result[b] = applyAdjustedDealerRetailPlanBase(src, prevMData, prevRData, prevSData, growthRateByBrand[b] ?? 5);
      } else {
        result[b] = src;
      }
    }
    return result;
  }, [year, retailDataByBrand, prevYearMonthlyDataByBrand, prevYearRetailDataByBrand, prevYearShipmentDataByBrand, growthRateByBrand]);

  const topTableData = useMemo(() => {
    if (
      (year !== 2025 && year !== 2026) ||
      !monthlyData ||
      !effectiveRetailData ||
      !shipmentData ||
      !purchaseData ||
      monthlyData.dealer.rows.length === 0 ||
      effectiveRetailData.dealer.rows.length === 0 ||
      shipmentData.data.rows.length === 0 ||
      purchaseData.data.rows.length === 0
    ) {
      return null;
    }
    if (year === 2026 && brand === '전체') {
      if (BRANDS_TO_AGGREGATE.some((b) => !monthlyDataByBrand[b] || !retailDataByBrand[b] || !shipmentDataByBrand[b] || !purchaseDataByBrand[b])) {
        return null;
      }
      const perBrandTables: TopTablePair[] = BRANDS_TO_AGGREGATE.map((b) => {
        const mData = monthlyDataByBrand[b]!;
        const baseRetailData = retailDataByBrand[b]!;
        const sData = shipmentDataByBrand[b]!;
        const pData = purchaseDataByBrand[b];
        const prevMData = prevYearMonthlyDataByBrand[b];
        const prevRData = prevYearRetailDataByBrand[b];
        const prevSData = prevYearShipmentDataByBrand[b];
        const rData =
          prevMData && prevRData && prevSData
            ? applyAdjustedDealerRetailPlanBase(baseRetailData, prevMData, prevRData, prevSData, growthRate)
            : baseRetailData;
        const built = buildTableDataFromMonthly(mData, rData, sData, pData ?? undefined, year);
        const withWoi = applyAccTargetWoiOverlay(
          built.dealer,
          built.hq,
          rData,
          accTargetWoiDealer,
          accTargetWoiHq,
          accHqHoldingWoi,
          year,
        );
        const otbDealerSellIn = otbToDealerSellInPlan(otbData, b);
        const mergedSellOutPlan = { ...hqSellOutPlan, ...otbDealerSellIn };
        return applyHqSellInSellOutPlanOverlay(
          withWoi.dealer,
          withWoi.hq,
          annualPlanToHqSellInPlan(annualShipmentPlan2026, b),
          mergedSellOutPlan,
          year,
        );
      });
      return aggregateTopTables(perBrandTables, year);
    }

    const built = buildTableDataFromMonthly(
      monthlyData,
      effectiveRetailData,
      shipmentData,
      purchaseData ?? undefined,
      year,
    );
    if (year === 2026 && brand !== '전체') {
      const withWoi = applyAccTargetWoiOverlay(
        built.dealer,
        built.hq,
        effectiveRetailData,
        accTargetWoiDealer,
        accTargetWoiHq,
        accHqHoldingWoi,
        year,
      );
      const otbDealerSellIn = otbToDealerSellInPlan(otbData, brand as AnnualPlanBrand);
      const mergedSellOutPlan = {
        ...hqSellOutPlan,
        ...otbDealerSellIn,
      };
      return applyHqSellInSellOutPlanOverlay(
        withWoi.dealer,
        withWoi.hq,
        annualPlanToHqSellInPlan(annualShipmentPlan2026, brand as AnnualPlanBrand),
        mergedSellOutPlan,
        year,
      );
    }
    return built;
  }, [year, brand, monthlyData, effectiveRetailData, shipmentData, purchaseData, monthlyDataByBrand, retailDataByBrand, shipmentDataByBrand, purchaseDataByBrand, prevYearMonthlyDataByBrand, prevYearRetailDataByBrand, prevYearShipmentDataByBrand, annualShipmentPlan2026, accTargetWoiDealer, accTargetWoiHq, accHqHoldingWoi, hqSellOutPlan, growthRate, otbData]);

  // 대리상 리테일매출(보정) 연간 합계 = 대리상 재고자산표 Sell-out (K→원 변환)
  // 재고자산표 key('재고자산합계') → 리테일표 key('매출합계') 매핑
  // 대리상 리테일매출(보정) 연간 합계 = 대리상 재고자산표 Sell-out (K→원 변환)
  const adjustedRetailAnnualTotalByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2025 || !topTableData) return null;
    const result: Record<string, number | null> = {};
    for (const row of topTableData.dealer.rows) {
      const retailKey = row.key === '재고자산합계' ? '매출합계' : row.key;
      result[retailKey] = row.sellOutTotal * 1000;
    }
    return result;
  }, [year, topTableData]);

  // 대리상 리테일매출(보정): 연간합계를 실제 리테일 월별 비중으로 배분
  const adjustedDealerRetailTable = useMemo<TableData | null>(() => {
    if (year !== 2025 || !effectiveRetailData || !adjustedRetailAnnualTotalByRowKey) return null;
    const rows = effectiveRetailData.dealer.rows.map((row) => {
      const annualTotal = adjustedRetailAnnualTotalByRowKey[row.key] ?? null;
      const actual = row.monthly;
      const actualSum = actual.reduce<number>((s, v) => s + (v ?? 0), 0);
      const monthly = actual.map((v) =>
        v != null && annualTotal != null && actualSum > 0
          ? Math.round(annualTotal * (v / actualSum))
          : null
      );
      return { ...row, opening: null, monthly } as TableData['rows'][number];
    });
    return { rows };
  }, [year, effectiveRetailData, adjustedRetailAnnualTotalByRowKey]);

  // 검증: 1~12월 합계 - 연간합계 (0이면 정상)
  const adjustedRetailValidationByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (!adjustedDealerRetailTable || !adjustedRetailAnnualTotalByRowKey) return null;
    const result: Record<string, number | null> = {};
    for (const row of adjustedDealerRetailTable.rows) {
      const monthlySum = row.monthly.reduce<number | null>(
        (s, v) => (v == null ? s : (s ?? 0) + v),
        null,
      );
      const annualTotal = adjustedRetailAnnualTotalByRowKey[row.key] ?? null;
      result[row.key] =
        monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
    }
    return result;
  }, [adjustedDealerRetailTable, adjustedRetailAnnualTotalByRowKey]);

  // 2025년 브랜드별 대리상 리테일매출(보정) — 브랜드별 top table로 연간합계 계산 후 비중 배분
  const perBrand2025AdjustedRetailAnnualByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2025) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const mData = monthlyDataByBrand[b];
      const rData = retailDataByBrand[b];
      const sData = shipmentDataByBrand[b];
      if (!mData || !rData || !sData) continue;
      const topTable = buildTableDataFromMonthly(mData, rData, sData, purchaseDataByBrand[b] ?? undefined, 2025);
      const annualByKey: Record<string, number | null> = {};
      for (const row of topTable.dealer.rows) {
        const retailKey = row.key === '재고자산합계' ? '매출합계' : row.key;
        annualByKey[retailKey] = row.sellOutTotal * 1000;
      }
      result[b] = annualByKey;
    }
    return result;
  }, [year, monthlyDataByBrand, retailDataByBrand, shipmentDataByBrand, purchaseDataByBrand]);

  const perBrand2025AdjustedDealerRetailTable = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2025) return {};
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const rData = retailDataByBrand[b];
      const mData = monthlyDataByBrand[b];
      const sData = shipmentDataByBrand[b];
      if (!rData || !mData || !sData) continue;
      const rows = buildAdjustedDealerRetailRows(
        rData.dealer.rows,
        mData.dealer.rows,
        sData.data.rows,
      );
      result[b] = { rows };
    }
    return result;
  }, [year, retailDataByBrand, monthlyDataByBrand, shipmentDataByBrand]);

  const perBrand2025RetailDealerValidationByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2025) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const tableData = perBrand2025AdjustedDealerRetailTable[b];
      const annualByKey = perBrand2025AdjustedRetailAnnualByKey[b];
      if (!tableData || !annualByKey) continue;
      const validation: Record<string, number | null> = {};
      for (const row of tableData.rows) {
        const monthlySum = row.monthly.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
        const annualTotal = annualByKey[row.key] ?? null;
        validation[row.key] = monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
      }
      result[b] = validation;
    }
    return result;
  }, [year, perBrand2025AdjustedDealerRetailTable, perBrand2025AdjustedRetailAnnualByKey]);

  // 2026년: 2025 재고자산표 Sell-out 계산용 (단일/전체 브랜드 모두 지원)
  const prevYearTopTableData = useMemo(() => {
    if (year !== 2026) return null;
    if (brand === '전체') {
      if (BRANDS_TO_AGGREGATE.some((b) => !prevYearMonthlyDataByBrand[b] || !prevYearRetailDataByBrand[b] || !prevYearShipmentDataByBrand[b])) return null;
      const perBrand = BRANDS_TO_AGGREGATE.map((b) =>
        buildTableDataFromMonthly(
          prevYearMonthlyDataByBrand[b]!,
          prevYearRetailDataByBrand[b]!,
          prevYearShipmentDataByBrand[b]!,
          undefined,
          2025,
        )
      );
      return aggregateTopTables(perBrand, 2025);
    }
    if (!prevYearMonthlyData || !prevYearRetailData || !prevYearShipmentData) return null;
    return buildTableDataFromMonthly(
      prevYearMonthlyData,
      prevYearRetailData,
      prevYearShipmentData,
      prevYearPurchaseData ?? undefined,
      2025,
    );
  }, [year, brand, prevYearMonthlyData, prevYearRetailData, prevYearShipmentData, prevYearPurchaseData, prevYearMonthlyDataByBrand, prevYearRetailDataByBrand, prevYearShipmentDataByBrand]);

  // 브랜드별 전년(2025) top table — YOY 비교용
  const perBrandPrevYearTableData = useMemo<Partial<Record<AnnualPlanBrand, TopTablePair>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, TopTablePair>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const mData = prevYearMonthlyDataByBrand[b];
      const rData = prevYearRetailDataByBrand[b];
      const sData = prevYearShipmentDataByBrand[b];
      if (mData && rData && sData) {
        result[b] = buildTableDataFromMonthly(mData, rData, sData, undefined, 2025);
      }
    }
    return result;
  }, [year, prevYearMonthlyDataByBrand, prevYearRetailDataByBrand, prevYearShipmentDataByBrand]);

  // 2026 대리상 리테일 연간합계 = 2025 Sell-out × 성장률 (소계=leaf 합산)
  const retailDealerAnnualTotalByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !prevYearTopTableData) return null;
    const factor = 1 + growthRate / 100;
    const result: Record<string, number | null> = {};
    for (const row of prevYearTopTableData.dealer.rows) {
      if (!row.isLeaf) continue;
      result[row.key] = Math.round(row.sellOutTotal * factor * 1000);
    }
    const sumKeys = (keys: readonly string[]) => keys.reduce((s, k) => s + (result[k] ?? 0), 0);
    result['의류합계'] = sumKeys(SEASON_KEYS);
    result['ACC합계'] = sumKeys(ACC_KEYS);
    result['매출합계'] = result['의류합계'] + result['ACC합계'];
    return result;
  }, [year, prevYearTopTableData, growthRate]);

  // 검증: 1~12월 합계 - 연간합계 (2026 대리상 리테일)
  // 대리상: 실적월 고정, 계획월만 비중 배분하여 목표 연간합계에 맞춤
  // planSum=0(계획월 전부 0)이면 remaining을 계획월 수로 균등 배분
  const adjustedDealerRetailData = useMemo<TableData | null>(() => {
    if (year !== 2026 || !effectiveRetailData || !retailDealerAnnualTotalByRowKey) return null;
    const planFrom = effectiveRetailData.planFromMonth ?? 13;
    const planMonthCount = 12 - (planFrom - 1);
    const rows = effectiveRetailData.dealer.rows.map((row) => {
      const annualTarget = retailDealerAnnualTotalByRowKey[row.key] ?? null;
      if (annualTarget == null) return { ...row };
      const monthly = [...row.monthly];
      const actualSum = monthly.slice(0, planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
      const remaining = annualTarget - actualSum;
      const planSum = monthly.slice(planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
      for (let m = planFrom - 1; m < 12; m++) {
        if (planSum > 0) {
          const v = monthly[m] ?? 0;
          monthly[m] = Math.round(remaining * (v / planSum));
        } else {
          // 계획월 데이터 없으면 균등 배분
          monthly[m] = planMonthCount > 0 ? Math.round(remaining / planMonthCount) : 0;
        }
      }
      return { ...row, monthly };
    });
    return { rows: rows as TableData['rows'] };
  }, [year, effectiveRetailData, retailDealerAnnualTotalByRowKey]);

  const retailDealerValidationByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !adjustedDealerRetailData || !retailDealerAnnualTotalByRowKey) return null;
    const result: Record<string, number | null> = {};
    for (const row of adjustedDealerRetailData.rows) {
      const monthlySum = row.monthly.reduce<number | null>(
        (s, v) => (v == null ? s : (s ?? 0) + v),
        null,
      );
      const annualTotal = retailDealerAnnualTotalByRowKey[row.key] ?? null;
      result[row.key] =
        monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
    }
    return result;
  }, [year, adjustedDealerRetailData, retailDealerAnnualTotalByRowKey]);

  // 2026 본사 리테일 연간합계 = 2025 본사 Sell-out × 본사 성장률 (소계=leaf 합산)
  const retailHqAnnualTotalByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !prevYearTopTableData) return null;
    const factor = 1 + growthRateHq / 100;
    const result: Record<string, number | null> = {};
    for (const row of prevYearTopTableData.hq.rows) {
      if (!row.isLeaf) continue;
      result[row.key] = Math.round((row.hqSalesTotal ?? 0) * factor * 1000);
    }
    const sumKeys = (keys: readonly string[]) => keys.reduce((s, k) => s + (result[k] ?? 0), 0);
    result['의류합계'] = sumKeys(SEASON_KEYS);
    result['ACC합계'] = sumKeys(ACC_KEYS);
    result['매출합계'] = result['의류합계'] + result['ACC합계'];
    return result;
  }, [year, prevYearTopTableData, growthRateHq]);

  // 검증: 1~12월 합계 - 연간합계 (2026 본사 리테일)
  // 본사: 실적월 고정, 계획월만 비중 배분하여 목표 연간합계에 맞춤
  // planSum=0(계획월 전부 0)이면 remaining을 계획월 수로 균등 배분
  const adjustedHqRetailData = useMemo<TableData | null>(() => {
    if (year !== 2026 || !effectiveRetailData || !retailHqAnnualTotalByRowKey) return null;
    const planFrom = effectiveRetailData.planFromMonth ?? 13;
    const planMonthCount = 12 - (planFrom - 1);
    const rows = effectiveRetailData.hq.rows.map((row) => {
      const annualTarget = retailHqAnnualTotalByRowKey[row.key] ?? null;
      if (annualTarget == null) return { ...row };
      const monthly = [...row.monthly];
      const actualSum = monthly.slice(0, planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
      const remaining = annualTarget - actualSum;
      const planSum = monthly.slice(planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
      for (let m = planFrom - 1; m < 12; m++) {
        if (planSum > 0) {
          const v = monthly[m] ?? 0;
          monthly[m] = Math.round(remaining * (v / planSum));
        } else {
          monthly[m] = planMonthCount > 0 ? Math.round(remaining / planMonthCount) : 0;
        }
      }
      return { ...row, monthly };
    });
    return { rows: rows as TableData['rows'] };
  }, [year, effectiveRetailData, retailHqAnnualTotalByRowKey]);

  const retailHqValidationByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !adjustedHqRetailData || !retailHqAnnualTotalByRowKey) return null;
    const result: Record<string, number | null> = {};
    for (const row of adjustedHqRetailData.rows) {
      const monthlySum = row.monthly.reduce<number | null>(
        (s, v) => (v == null ? s : (s ?? 0) + v),
        null,
      );
      const annualTotal = retailHqAnnualTotalByRowKey[row.key] ?? null;
      result[row.key] =
        monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
    }
    return result;
  }, [year, adjustedHqRetailData, retailHqAnnualTotalByRowKey]);

  // 브랜드별 대리상 리테일 조정 데이터 (perBrandEffectiveRetailData 기반 월별 재배분)
  const perBrandAdjustedDealerRetailData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026) return {};
    const sumKeys = (rec: Record<string, number | null>, keys: readonly string[]) =>
      keys.reduce((s, k) => s + (rec[k] ?? 0), 0);
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const effData = perBrandEffectiveRetailData[b];  // applyAdjustedDealerRetailPlanBase 적용된 데이터
      const prevTable = perBrandPrevYearTableData[b];
      if (!effData || !prevTable) continue;
      const factor = 1 + (growthRateByBrand[b] ?? 5) / 100;
      const annualByKey: Record<string, number | null> = {};
      for (const row of prevTable.dealer.rows) {
        if (!row.isLeaf) continue;
        annualByKey[row.key] = Math.round(row.sellOutTotal * factor * 1000);
      }
      if (b === 'MLB') annualByKey['1년차'] = MLB_1YEAR_OVERRIDE_K * 1000;
      annualByKey['의류합계'] = sumKeys(annualByKey, SEASON_KEYS);
      annualByKey['ACC합계']  = sumKeys(annualByKey, ACC_KEYS);
      annualByKey['매출합계'] = (annualByKey['의류합계'] ?? 0) + (annualByKey['ACC합계'] ?? 0);
      const planFrom = effData.planFromMonth ?? 13;
      const planMonthCount = 12 - (planFrom - 1);
      const rows = effData.dealer.rows.map((row) => {
        const annualTarget = annualByKey[row.key] ?? null;
        if (annualTarget == null) return { ...row };
        const monthly = [...row.monthly];
        const actualSum = monthly.slice(0, planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const planSum = monthly.slice(planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
        for (let m = planFrom - 1; m < 12; m++) {
          monthly[m] = planSum > 0
            ? Math.round(remaining * ((monthly[m] ?? 0) / planSum))
            : (planMonthCount > 0 ? Math.round(remaining / planMonthCount) : 0);
        }
        return { ...row, monthly };
      });
      result[b] = { rows: rows as TableData['rows'] };
    }
    return result;
  }, [year, perBrandEffectiveRetailData, perBrandPrevYearTableData, growthRateByBrand]);

  // 브랜드별 본사 리테일 조정 데이터 (perBrandEffectiveRetailData 기반 월별 재배분)
  const perBrandAdjustedHqRetailData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026) return {};
    const sumKeys = (rec: Record<string, number | null>, keys: readonly string[]) =>
      keys.reduce((s, k) => s + (rec[k] ?? 0), 0);
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const effData = perBrandEffectiveRetailData[b];  // applyAdjustedDealerRetailPlanBase 적용된 데이터
      const prevTable = perBrandPrevYearTableData[b];
      if (!effData || !prevTable) continue;
      const factor = 1 + (growthRateHqByBrand[b] ?? 17) / 100;
      const annualByKey: Record<string, number | null> = {};
      for (const row of prevTable.hq.rows) {
        if (!row.isLeaf) continue;
        annualByKey[row.key] = Math.round((row.hqSalesTotal ?? 0) * factor * 1000);
      }
      annualByKey['의류합계'] = sumKeys(annualByKey, SEASON_KEYS);
      annualByKey['ACC합계']  = sumKeys(annualByKey, ACC_KEYS);
      annualByKey['매출합계'] = (annualByKey['의류합계'] ?? 0) + (annualByKey['ACC합계'] ?? 0);
      const planFrom = effData.planFromMonth ?? 13;
      const planMonthCount = 12 - (planFrom - 1);
      const rows = effData.hq.rows.map((row) => {
        const annualTarget = annualByKey[row.key] ?? null;
        if (annualTarget == null) return { ...row };
        const monthly = [...row.monthly];
        const actualSum = monthly.slice(0, planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const planSum = monthly.slice(planFrom - 1).reduce<number>((s, v) => s + (v ?? 0), 0);
        for (let m = planFrom - 1; m < 12; m++) {
          monthly[m] = planSum > 0
            ? Math.round(remaining * ((monthly[m] ?? 0) / planSum))
            : (planMonthCount > 0 ? Math.round(remaining / planMonthCount) : 0);
        }
        return { ...row, monthly };
      });
      result[b] = { rows: rows as TableData['rows'] };
    }
    return result;
  }, [year, perBrandEffectiveRetailData, perBrandPrevYearTableData, growthRateHqByBrand]);

  // 브랜드별 대리상 리테일 연간합계 및 검증 (월합 - 연간합계)
  const perBrandRetailDealerAnnualByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const sumKeys = (rec: Record<string, number | null>, keys: readonly string[]) => keys.reduce((s, k) => s + (rec[k] ?? 0), 0);
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const prevTable = perBrandPrevYearTableData[b];
      if (!prevTable) continue;
      const factor = 1 + (growthRateByBrand[b] ?? 5) / 100;
      const annualByKey: Record<string, number | null> = {};
      for (const row of prevTable.dealer.rows) {
        if (!row.isLeaf) continue;
        annualByKey[row.key] = Math.round(row.sellOutTotal * factor * 1000);
      }
      if (b === 'MLB') annualByKey['1년차'] = MLB_1YEAR_OVERRIDE_K * 1000;
      annualByKey['의류합계'] = sumKeys(annualByKey, SEASON_KEYS);
      annualByKey['ACC합계']  = sumKeys(annualByKey, ACC_KEYS);
      annualByKey['매출합계'] = (annualByKey['의류합계'] ?? 0) + (annualByKey['ACC합계'] ?? 0);
      result[b] = annualByKey;
    }
    return result;
  }, [year, perBrandPrevYearTableData, growthRateByBrand]);

  const perBrandRetailDealerValidationByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const adjData = perBrandAdjustedDealerRetailData[b];
      const annualByKey = perBrandRetailDealerAnnualByKey[b];
      if (!adjData || !annualByKey) continue;
      const validation: Record<string, number | null> = {};
      for (const row of adjData.rows) {
        const monthlySum = row.monthly.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
        const annualTotal = annualByKey[row.key] ?? null;
        validation[row.key] = monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
      }
      result[b] = validation;
    }
    return result;
  }, [year, perBrandAdjustedDealerRetailData, perBrandRetailDealerAnnualByKey]);

  // 브랜드별 본사 리테일 연간합계 및 검증
  const perBrandRetailHqAnnualByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const sumKeys = (rec: Record<string, number | null>, keys: readonly string[]) => keys.reduce((s, k) => s + (rec[k] ?? 0), 0);
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const prevTable = perBrandPrevYearTableData[b];
      if (!prevTable) continue;
      const factor = 1 + (growthRateHqByBrand[b] ?? 17) / 100;
      const annualByKey: Record<string, number | null> = {};
      for (const row of prevTable.hq.rows) {
        if (!row.isLeaf) continue;
        annualByKey[row.key] = Math.round((row.hqSalesTotal ?? 0) * factor * 1000);
      }
      annualByKey['의류합계'] = sumKeys(annualByKey, SEASON_KEYS);
      annualByKey['ACC합계']  = sumKeys(annualByKey, ACC_KEYS);
      annualByKey['매출합계'] = (annualByKey['의류합계'] ?? 0) + (annualByKey['ACC합계'] ?? 0);
      result[b] = annualByKey;
    }
    return result;
  }, [year, perBrandPrevYearTableData, growthRateHqByBrand]);

  const perBrandRetailHqValidationByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const adjData = perBrandAdjustedHqRetailData[b];
      const annualByKey = perBrandRetailHqAnnualByKey[b];
      if (!adjData || !annualByKey) continue;
      const validation: Record<string, number | null> = {};
      for (const row of adjData.rows) {
        const monthlySum = row.monthly.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
        const annualTotal = annualByKey[row.key] ?? null;
        validation[row.key] = monthlySum != null && annualTotal != null ? monthlySum - annualTotal : null;
      }
      result[b] = validation;
    }
    return result;
  }, [year, perBrandAdjustedHqRetailData, perBrandRetailHqAnnualByKey]);

  // 2026년 상단 재고자산표 display용: 대리상 Sell-out → 대리상 리테일 연간합계, 본사 본사판매 → 본사 리테일 연간합계
  const topTableDisplayData = useMemo<{ dealer: InventoryTableData; hq: InventoryTableData } | null>(() => {
    if (year !== 2026 || !topTableData) return null;

    const inventoryKeyToRetailKey = (key: string) =>
      key === '재고자산합계' ? '매출합계' : key;

    const scaleMonthly = (monthly: number[], oldTotal: number, newTotal: number): number[] => {
      if (oldTotal === 0) return monthly.map(() => Math.round(newTotal / 12));
      return monthly.map((v) => Math.round(v * (newTotal / oldTotal)));
    };

    // ACC Sell-in 재계산 대상 키 (Sell-out 교체 후 기말+Sell-out-기초로 역산)
    const ACC_LEAF_KEYS = new Set(['신발', '모자', '가방', '기타']);

    // 대리상: leaf 행만 수정 후 rebuildTableFromLeafs로 소계 재계산
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
          // ACC: Sell-in = 기말 + Sell-out - 기초
          const newSellInTotal = updatedRow.closing + updatedRow.sellOutTotal - updatedRow.opening;
          updatedRow = {
            ...updatedRow,
            sellIn: scaleMonthly(updatedRow.sellIn, updatedRow.sellInTotal, newSellInTotal),
            sellInTotal: newSellInTotal,
          };
        } else {
          // 의류: 기말재고 = 기초 + Sell-in - Sell-out
          const newClosing = updatedRow.opening + updatedRow.sellInTotal - updatedRow.sellOutTotal;
          updatedRow = {
            ...updatedRow,
            closing: newClosing,
            delta: newClosing - updatedRow.opening,
          };
        }

        return updatedRow;
      });
    const dealerRows = rebuildTableFromLeafs(dealerLeafRows, 366);

    // 대리상 ACC Sell-in 결과를 본사 ACC 대리상출고에 연동하기 위한 Map
    const dealerAccSellInMap = new Map(
      dealerLeafRows
        .filter((row) => ACC_LEAF_KEYS.has(row.key))
        .map((row) => [row.key, { sellIn: row.sellIn, sellInTotal: row.sellInTotal }])
    );

    // 본사: leaf 행만 수정 후 rebuildTableFromLeafs로 소계 재계산
    // - ACC: 대리상출고(sellOut) = dealerLeafRows에서 계산된 ACC Sell-in으로 연동
    // - 의류: hqSales/hqSalesTotal만 교체 (sellOut 건드리지 않음)
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

        // ACC: 대리상출고(sellOut) = 대리상 ACC Sell-in으로 연동
        // 기말재고는 topTableData 원래 값 유지 (applyAccTargetWoiOverlay의 목표WOI 기준값)
        // 상품매입(sellIn) = 기말(유지) + 새 대리상출고 + 본사판매 - 기초 로 재계산
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

        // 의류: hqSales만 교체
        return {
          ...row,
          hqSales: newHqSales,
          hqSalesTotal: newTotalK ?? row.hqSalesTotal,
        };
      });
    const hqRows = rebuildTableFromLeafs(hqLeafRows, 366);

    return {
      dealer: { rows: dealerRows },
      hq: { rows: hqRows },
    };
  }, [year, topTableData, retailDealerAnnualTotalByRowKey, retailHqAnnualTotalByRowKey]);

  const shouldUseTopTableOnly = year === 2025 || year === 2026;
  const dealerTableData = shouldUseTopTableOnly
    ? (topTableData?.dealer ?? null)
    : (topTableData?.dealer ?? data?.dealer ?? null);
  const hqTableData = shouldUseTopTableOnly
    ? (topTableData?.hq ?? null)
    : (topTableData?.hq ?? data?.hq ?? null);
  const purchaseAnnualTotalByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !hqTableData) return null;
    const result: Record<string, number | null> = {};
    const leafRows = hqTableData.rows.filter((row) => row.isLeaf);
    const leafByKey = new Map(leafRows.map((row) => [row.key, row]));
    const sumLeafTotals = (keys: string[]): number | null => {
      const values = keys
        .map((key) => leafByKey.get(key)?.sellInTotal)
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0) * 1000;
    };

    for (const row of leafRows) {
      result[row.key] = row.sellInTotal * 1000;
    }
    result['의류합계'] = sumLeafTotals(SEASON_KEYS);
    result['ACC합계'] = sumLeafTotals(ACC_KEYS);
    result['매입합계'] = sumLeafTotals([...SEASON_KEYS, ...ACC_KEYS]);
    return result;
  }, [year, hqTableData]);
  const dealerDriverTotalRow = dealerTableData?.rows.find((row) => row.isTotal) ?? null;
  const hqDriverTotalRow = hqTableData?.rows.find((row) => row.isTotal) ?? null;
  const buildBrand2026TopTable = useCallback((planBrand: AnnualPlanBrand): TopTablePair | null => {
    if (year !== 2026) return null;
    const mData = monthlyDataByBrand[planBrand] ?? null;
    const baseRetailData = retailDataByBrand[planBrand] ?? null;
    const sData = shipmentDataByBrand[planBrand] ?? null;
    const pData = purchaseDataByBrand[planBrand] ?? null;
    const prevMData = prevYearMonthlyDataByBrand[planBrand];
    const prevRData = prevYearRetailDataByBrand[planBrand];
    const prevSData = prevYearShipmentDataByBrand[planBrand];
    const rData =
      baseRetailData && prevMData && prevRData && prevSData
        ? applyAdjustedDealerRetailPlanBase(baseRetailData, prevMData, prevRData, prevSData, growthRateByBrand[planBrand] ?? growthRate)
        : baseRetailData;
    if (!mData || !rData || !sData) return null;
    const built = buildTableDataFromMonthly(
      mData,
      rData,
      sData,
      pData ?? undefined,
      year,
    );
    const withWoi = applyAccTargetWoiOverlay(
      built.dealer,
      built.hq,
      rData,
      accTargetWoiDealer,
      accTargetWoiHq,
      accHqHoldingWoi,
      year,
    );
    const otbDealerSellIn = otbToDealerSellInPlan(otbData, planBrand);
    const mergedSellOutPlan = {
      ...hqSellOutPlan,
      ...otbDealerSellIn,
    };
    return applyHqSellInSellOutPlanOverlay(
      withWoi.dealer,
      withWoi.hq,
      annualPlanToHqSellInPlan(annualShipmentPlan2026, planBrand),
      mergedSellOutPlan,
      year,
    );
  }, [year, brand, monthlyDataByBrand, monthlyData, retailDataByBrand, retailData, shipmentDataByBrand, shipmentData, purchaseDataByBrand, purchaseData, prevYearMonthlyDataByBrand, prevYearRetailDataByBrand, prevYearShipmentDataByBrand, accTargetWoiDealer, accTargetWoiHq, accHqHoldingWoi, otbData, hqSellOutPlan, annualShipmentPlan2026, growthRate, growthRateByBrand]);

  // 브랜드별 당년 top table (buildBrand2026TopTable 이후에 배치)
  const perBrandTopTable = useMemo<Partial<Record<AnnualPlanBrand, TopTablePair>>>(() => {
    const result: Partial<Record<AnnualPlanBrand, TopTablePair>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      if (year === 2026) {
        const t = buildBrand2026TopTable(b);
        if (t) result[b] = t;
      } else if (year === 2025) {
        const mData = monthlyDataByBrand[b];
        const rData = retailDataByBrand[b];
        const sData = shipmentDataByBrand[b];
        const pData = purchaseDataByBrand[b];
        if (mData && rData && sData && pData) {
          result[b] = buildTableDataFromMonthly(mData, rData, sData, pData, year);
        }
      }
    }
    return result;
  }, [year, brand, buildBrand2026TopTable, monthlyDataByBrand, monthlyData,
      retailDataByBrand, retailData, shipmentDataByBrand, shipmentData,
      purchaseDataByBrand, purchaseData]);

  // 브랜드별 2026 display overlay (리테일 연간합계 교체)
  const perBrandTopTableDisplayData = useMemo<Partial<Record<AnnualPlanBrand, TopTablePair>>>(() => {
    if (year !== 2026) return {};
    const inventoryKeyToRetailKey = (key: string) => key === '재고자산합계' ? '매출합계' : key;
    const scaleMonthly = (monthly: number[], oldTotal: number, newTotal: number): number[] => {
      if (oldTotal === 0) return monthly.map(() => Math.round(newTotal / 12));
      return monthly.map((v) => Math.round(v * (newTotal / oldTotal)));
    };
    const ACC_LEAF_KEYS = new Set(['신발', '모자', '가방', '기타']);
    const sumKeys = (rec: Record<string, number | null>, keys: readonly string[]) =>
      keys.reduce((s, k) => s + (rec[k] ?? 0), 0);

    const result: Partial<Record<AnnualPlanBrand, TopTablePair>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const topTable = perBrandTopTable[b];
      const prevTable = perBrandPrevYearTableData[b];
      if (!topTable || !prevTable) continue;

      const factorDealer = 1 + (growthRateByBrand[b] ?? 5) / 100;
      const factorHq    = 1 + (growthRateHqByBrand[b] ?? 17) / 100;

      const dealerAnnual: Record<string, number | null> = {};
      for (const row of prevTable.dealer.rows) {
        if (!row.isLeaf) continue;
        dealerAnnual[row.key] = Math.round(row.sellOutTotal * factorDealer * 1000);
      }
      if (b === 'MLB') dealerAnnual['1년차'] = MLB_1YEAR_OVERRIDE_K * 1000;
      dealerAnnual['의류합계'] = sumKeys(dealerAnnual, SEASON_KEYS);
      dealerAnnual['ACC합계']  = sumKeys(dealerAnnual, ACC_KEYS);
      dealerAnnual['매출합계'] = (dealerAnnual['의류합계'] ?? 0) + (dealerAnnual['ACC합계'] ?? 0);

      const hqAnnual: Record<string, number | null> = {};
      for (const row of prevTable.hq.rows) {
        if (!row.isLeaf) continue;
        hqAnnual[row.key] = Math.round((row.hqSalesTotal ?? 0) * factorHq * 1000);
      }
      hqAnnual['의류합계'] = sumKeys(hqAnnual, SEASON_KEYS);
      hqAnnual['ACC합계']  = sumKeys(hqAnnual, ACC_KEYS);
      hqAnnual['매출합계'] = (hqAnnual['의류합계'] ?? 0) + (hqAnnual['ACC합계'] ?? 0);

      const dealerLeafRows = topTable.dealer.rows
        .filter((row) => row.isLeaf)
        .map((row) => {
          const retailKey = inventoryKeyToRetailKey(row.key);
          const newTotalWon = dealerAnnual[retailKey] ?? null;
          let updatedRow = row;
          if (newTotalWon != null) {
            const newSellOutK = newTotalWon / 1000;
            updatedRow = { ...updatedRow, sellOut: scaleMonthly(row.sellOut, row.sellOutTotal, newSellOutK), sellOutTotal: newSellOutK };
          }
          if (ACC_LEAF_KEYS.has(row.key)) {
            const newSellInTotal = updatedRow.closing + updatedRow.sellOutTotal - updatedRow.opening;
            updatedRow = { ...updatedRow, sellIn: scaleMonthly(updatedRow.sellIn, updatedRow.sellInTotal, newSellInTotal), sellInTotal: newSellInTotal };
          } else {
            const newClosing = updatedRow.opening + updatedRow.sellInTotal - updatedRow.sellOutTotal;
            updatedRow = { ...updatedRow, closing: newClosing, delta: newClosing - updatedRow.opening };
          }
          return updatedRow;
        });
      const dealerRows = rebuildTableFromLeafs(dealerLeafRows, 366);

      const dealerAccSellInMap = new Map(
        dealerLeafRows.filter((row) => ACC_LEAF_KEYS.has(row.key))
          .map((row) => [row.key, { sellIn: row.sellIn, sellInTotal: row.sellInTotal }])
      );

      const hqLeafRows = topTable.hq.rows
        .filter((row) => row.isLeaf)
        .map((row) => {
          const retailKey = inventoryKeyToRetailKey(row.key);
          const newTotalWon = hqAnnual[retailKey] ?? null;
          const newTotalK = newTotalWon != null ? newTotalWon / 1000 : null;
          const oldHqTotal = row.hqSalesTotal ?? 0;
          const newHqSales = newTotalK != null && row.hqSales
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
              return { ...row, sellIn: newSellIn, sellInTotal: newSellInTotal, sellOut: newSellOut, sellOutTotal: newSellOutTotal, hqSales: newHqSales, hqSalesTotal: newTotalK ?? row.hqSalesTotal };
            }
          }
          return { ...row, hqSales: newHqSales, hqSalesTotal: newTotalK ?? row.hqSalesTotal };
        });
      const hqRows = rebuildTableFromLeafs(hqLeafRows, 366);
      result[b] = { dealer: { rows: dealerRows }, hq: { rows: hqRows } };
    }
    return result;
  }, [year, perBrandTopTable, perBrandPrevYearTableData, growthRateByBrand, growthRateHqByBrand]);

  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026 || !dealerTableData) return;
    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') return;

    const accRow = dealerTableData.rows.find((r) => r.key === 'ACC합계');
    if (!accRow) return;

    const currentRaw = localStorage.getItem('inventory_dealer_acc_sellin');
    let currentValues: Record<'MLB' | 'MLB KIDS' | 'DISCOVERY', number> = {
      MLB: 0,
      'MLB KIDS': 0,
      DISCOVERY: 0,
    };
    try {
      const parsed = currentRaw ? JSON.parse(currentRaw) : null;
      if (parsed?.values) {
        currentValues = {
          MLB: Number(parsed.values.MLB) || 0,
          'MLB KIDS': Number(parsed.values['MLB KIDS']) || 0,
          DISCOVERY: Number(parsed.values.DISCOVERY) || 0,
        };
      }
    } catch {
      // ignore parse errors and overwrite with fresh value below
    }

    const nextValues = { ...currentValues, [brand]: accRow.sellInTotal };
    publishDealerAccSellIn(nextValues);
  }, [year, brand, dealerTableData, publishDealerAccSellIn]);

  // 2026 YOY: 전년(2025) 테이블 구성 → 재고자산합계 sellIn/sellOut/hqSales 추출
  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026) return;

    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') {
      const nextValues: Partial<HqClosingByBrand> = {};
      for (const planBrand of ANNUAL_PLAN_BRANDS) {
        const table = buildBrand2026TopTable(planBrand);
        const totalRow = table?.hq.rows.find((row) => row.isTotal);
        if (totalRow && Number.isFinite(totalRow.closing)) {
          nextValues[planBrand] = totalRow.closing;
        }
      }
      if (Object.keys(nextValues).length > 0) {
        publishHqClosingByBrand(nextValues);
      }
      return;
    }

    if (!hqTableData) return;
    const totalRow = hqTableData.rows.find((row) => row.isTotal);
    if (!totalRow || !Number.isFinite(totalRow.closing)) return;

    // 현재 브랜드 + 데이터가 있는 다른 브랜드도 함께 publish (백그라운드 fetch로 채워진 경우)
    const nextValues: Partial<HqClosingByBrand> = { [brand]: totalRow.closing };
    for (const planBrand of ANNUAL_PLAN_BRANDS) {
      if (planBrand === brand) continue;
      const table = buildBrand2026TopTable(planBrand);
      const otherTotalRow = table?.hq.rows.find((row) => row.isTotal);
      if (otherTotalRow && Number.isFinite(otherTotalRow.closing)) {
        nextValues[planBrand] = otherTotalRow.closing;
      }
    }
    publishHqClosingByBrand(nextValues);
  }, [year, brand, hqTableData, buildBrand2026TopTable, publishHqClosingByBrand]);
  const prevYearTableData = useMemo(() => {
    if (year !== 2026 || !prevYearMonthlyData || !prevYearRetailData || !prevYearShipmentData) return null;
    return buildTableDataFromMonthly(
      prevYearMonthlyData,
      prevYearRetailData,
      prevYearShipmentData,
      prevYearPurchaseData ?? undefined,
      year - 1,
    );
  }, [year, prevYearMonthlyData, prevYearRetailData, prevYearShipmentData, prevYearPurchaseData]);
  const prevYearHqDriverTotalRow = prevYearTableData?.hq.rows.find((row) => row.isTotal) ?? null;
  const plLatestActualMonth = useMemo(() => {
    if (plActualAvailableMonths.length === 0) return 0;
    return Math.max(...plActualAvailableMonths);
  }, [plActualAvailableMonths]);
  const shipmentPlanFromMonth = year === 2026 && plLatestActualMonth < 12 ? plLatestActualMonth + 1 : undefined;
  const effectiveShipmentDisplayData = useMemo<TableData | null>(() => {
    if (!shipmentData) return null;
    if (
      year !== 2026 ||
      brand === '전체' ||
      shipmentPlanFromMonth == null ||
      shipmentPlanFromMonth <= 1 ||
      !hqTableData
    ) {
      return shipmentData.data as TableData;
    }

    const brandKey = brand as AnnualPlanBrand;
    const progressS = shipmentProgressRows.find((row) => row.brand === brandKey && row.season === '당년S');
    const progressF = shipmentProgressRows.find((row) => row.brand === brandKey && row.season === '당년F');
    const accRatio = accShipmentRatioRows.find((row) => row.brand === brandKey)?.monthly ?? new Array(12).fill(null);
    const seasonSRates = buildShipmentProgressRates(progressS);
    const seasonFRates = buildShipmentProgressRates(progressF);
    const hqByKey = new Map(hqTableData.rows.map((row) => [row.key, row]));
    const planStartIndex = shipmentPlanFromMonth - 1;

    const leafRows = shipmentData.data.rows
      .filter((row) => row.isLeaf)
      .map((row) => {
        const annualTarget = (hqByKey.get(row.key)?.sellOutTotal ?? 0) * 1000;
        const monthly = [...row.monthly];
        const actualSum = monthly.slice(0, planStartIndex).reduce<number>((sum, value) => sum + (value ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const rawWeights = monthly.map((_, monthIndex) => {
          if (monthIndex < planStartIndex) return 0;
          if (row.key === '당년S') return seasonSRates[monthIndex] ?? 0;
          if (ACC_KEYS.includes(row.key as AccKey)) return Math.max(accRatio[monthIndex] ?? 0, 0);
          return seasonFRates[monthIndex] ?? 0;
        });
        const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
        const usableWeights =
          weightTotal > 0
            ? rawWeights
            : rawWeights.map((_, monthIndex) => (monthIndex < planStartIndex ? 0 : 1));
        const usableTotal = usableWeights.reduce((sum, value) => sum + value, 0);
        let allocatedSum = 0;
        let lastPlanMonth = -1;
        for (let monthIndex = planStartIndex; monthIndex < 12; monthIndex += 1) {
          if (usableWeights[monthIndex] > 0) lastPlanMonth = monthIndex;
        }
        for (let monthIndex = planStartIndex; monthIndex < 12; monthIndex += 1) {
          if (monthIndex === lastPlanMonth) {
            monthly[monthIndex] = remaining - allocatedSum;
            continue;
          }
          const nextValue = usableTotal > 0 ? Math.round((remaining * usableWeights[monthIndex]) / usableTotal) : 0;
          monthly[monthIndex] = nextValue;
          allocatedSum += nextValue;
        }
        return { ...row, monthly };
      });

    const sumMonth = (rows: typeof leafRows, monthIndex: number): number | null => {
      const values = rows
        .map((row) => row.monthly[monthIndex] ?? null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const clothingLeafRows = leafRows.slice(0, 6);
    const accLeafRows = leafRows.slice(6);
    const totalTemplate = shipmentData.data.rows.find((row) => row.isTotal);
    const subtotalTemplates = shipmentData.data.rows.filter((row) => row.isSubtotal);
    const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
    const accSubtotalTemplate = subtotalTemplates[1] ?? null;
    const clothingSubtotal =
      clothingSubtotalTemplate == null
        ? null
        : {
            ...clothingSubtotalTemplate,
            monthly: clothingSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(clothingLeafRows, monthIndex)),
          };
    const accSubtotal =
      accSubtotalTemplate == null
        ? null
        : {
            ...accSubtotalTemplate,
            monthly: accSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(accLeafRows, monthIndex)),
          };
    const grandTotal =
      totalTemplate == null
        ? null
        : {
            ...totalTemplate,
            monthly: totalTemplate.monthly.map((_, monthIndex) => sumMonth(leafRows, monthIndex)),
          };

    return {
      rows: [
        ...(grandTotal ? [grandTotal] : []),
        ...(clothingSubtotal ? [clothingSubtotal] : []),
        ...clothingLeafRows,
        ...(accSubtotal ? [accSubtotal] : []),
        ...accLeafRows,
      ],
    };
  }, [year, brand, shipmentData, shipmentPlanFromMonth, hqTableData, shipmentProgressRows, accShipmentRatioRows]);

  // 브랜드별 출고매출 display 데이터 (3개 브랜드 동시 계산)
  const perBrandShipmentDisplayData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026 || shipmentPlanFromMonth == null || shipmentPlanFromMonth <= 1) return {};
    const buildShipmentRows = (
      srcData: (typeof shipmentData),
      hqRows: InventoryTableData['rows'] | undefined,
      brandKey: AnnualPlanBrand,
    ): TableData | null => {
      if (!srcData || !hqRows) return null;
      const hqByKey = new Map(hqRows.map((row) => [row.key, row]));
      const progressS = shipmentProgressRows.find((row) => row.brand === brandKey && row.season === '당년S');
      const progressF = shipmentProgressRows.find((row) => row.brand === brandKey && row.season === '당년F');
      const accRatio = accShipmentRatioRows.find((row) => row.brand === brandKey)?.monthly ?? new Array(12).fill(null);
      const seasonSRates = buildShipmentProgressRates(progressS);
      const seasonFRates = buildShipmentProgressRates(progressF);
      const planStartIndex = shipmentPlanFromMonth - 1;
      const leafRows = srcData.data.rows.filter((row) => row.isLeaf).map((row) => {
        const annualTarget = (hqByKey.get(row.key)?.sellOutTotal ?? 0) * 1000;
        const monthly = [...row.monthly];
        const actualSum = monthly.slice(0, planStartIndex).reduce<number>((sum, value) => sum + (value ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const rawWeights = monthly.map((_, monthIndex) => {
          if (monthIndex < planStartIndex) return 0;
          if (row.key === '당년S') return seasonSRates[monthIndex] ?? 0;
          if (ACC_KEYS.includes(row.key as AccKey)) return Math.max(accRatio[monthIndex] ?? 0, 0);
          return seasonFRates[monthIndex] ?? 0;
        });
        const weightTotal = rawWeights.reduce((sum, v) => sum + v, 0);
        const usableWeights = weightTotal > 0 ? rawWeights : rawWeights.map((_, i) => (i < planStartIndex ? 0 : 1));
        const usableTotal = usableWeights.reduce((sum, v) => sum + v, 0);
        let allocatedSum = 0;
        let lastPlanMonth = -1;
        for (let i = planStartIndex; i < 12; i++) { if (usableWeights[i] > 0) lastPlanMonth = i; }
        for (let i = planStartIndex; i < 12; i++) {
          if (i === lastPlanMonth) { monthly[i] = remaining - allocatedSum; continue; }
          const nextValue = usableTotal > 0 ? Math.round((remaining * usableWeights[i]) / usableTotal) : 0;
          monthly[i] = nextValue;
          allocatedSum += nextValue;
        }
        return { ...row, monthly };
      });
      const sumMonth = (rows: typeof leafRows, idx: number) => {
        const vals = rows.map((r) => r.monthly[idx] ?? null).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
      };
      const clothingLeafRows = leafRows.slice(0, 6);
      const accLeafRows = leafRows.slice(6);
      const totalTemplate = srcData.data.rows.find((row) => row.isTotal);
      const subtotalTemplates = srcData.data.rows.filter((row) => row.isSubtotal);
      const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
      const accSubtotalTemplate = subtotalTemplates[1] ?? null;
      const clothingSubtotal = clothingSubtotalTemplate == null ? null : { ...clothingSubtotalTemplate, monthly: clothingSubtotalTemplate.monthly.map((_, i) => sumMonth(clothingLeafRows, i)) };
      const accSubtotal = accSubtotalTemplate == null ? null : { ...accSubtotalTemplate, monthly: accSubtotalTemplate.monthly.map((_, i) => sumMonth(accLeafRows, i)) };
      const grandTotal = totalTemplate == null ? null : { ...totalTemplate, monthly: totalTemplate.monthly.map((_, i) => sumMonth(leafRows, i)) };
      return { rows: [...(grandTotal ? [grandTotal] : []), ...(clothingSubtotal ? [clothingSubtotal] : []), ...clothingLeafRows, ...(accSubtotal ? [accSubtotal] : []), ...accLeafRows] };
    };
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const srcData = shipmentDataByBrand[b] ?? null;
      const hqRows = perBrandTopTable[b]?.hq.rows;
      const built = buildShipmentRows(srcData, hqRows, b);
      if (built) result[b] = built;
    }
    return result;
  }, [year, shipmentPlanFromMonth, shipmentDataByBrand, perBrandTopTable, shipmentProgressRows, accShipmentRatioRows]);

  const shipmentValidationByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || brand === '전체' || !effectiveShipmentDisplayData) return null;
    const result: Record<string, number | null> = {};
    for (const row of effectiveShipmentDisplayData.rows) {
      void row;
      result[row.key] = 0;
    }
    return result;
  }, [year, brand, effectiveShipmentDisplayData]);
  const effectivePurchaseDisplayData = useMemo<TableData | null>(() => {
    if (
      !purchaseData ||
      !effectiveShipmentDisplayData ||
      year !== 2026 ||
      shipmentPlanFromMonth == null ||
      shipmentPlanFromMonth <= 1
    ) {
      return purchaseData?.data as TableData | null;
    }

    const annualByKey = purchaseAnnualTotalByRowKey ?? {};
    const shipmentByKey = new Map(effectiveShipmentDisplayData.rows.map((row) => [row.key, row]));
    const planStartIndex = shipmentPlanFromMonth - 1;

    const leafRows = purchaseData.data.rows
      .filter((row) => row.isLeaf)
      .map((row) => {
        const monthly = [...row.monthly];
        const annualTarget = annualByKey[row.key] ?? null;
        if (annualTarget == null) return { ...row, monthly };

        const actualSum = monthly
          .slice(0, planStartIndex)
          .reduce<number>((sum, value) => sum + (value ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const shipmentMonthly = shipmentByKey.get(row.key)?.monthly ?? [];
        const rawWeights = monthly.map((_, monthIndex) => {
          if (monthIndex < planStartIndex) return 0;
          return Math.max(shipmentMonthly[monthIndex] ?? 0, 0);
        });
        const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
        const usableWeights =
          weightTotal > 0
            ? rawWeights
            : rawWeights.map((_, monthIndex) => (monthIndex < planStartIndex ? 0 : 1));
        const usableTotal = usableWeights.reduce((sum, value) => sum + value, 0);

        let assigned = 0;
        for (let monthIndex = planStartIndex; monthIndex < 12; monthIndex += 1) {
          if (usableTotal <= 0) {
            monthly[monthIndex] = 0;
            continue;
          }
          if (monthIndex === 11) {
            monthly[monthIndex] = remaining - assigned;
          } else {
            const nextValue = Math.round((remaining * usableWeights[monthIndex]) / usableTotal);
            monthly[monthIndex] = nextValue;
            assigned += nextValue;
          }
        }

        return { ...row, monthly };
      });

    const sumMonth = (rows: typeof leafRows, monthIndex: number): number | null => {
      const values = rows
        .map((row) => row.monthly[monthIndex] ?? null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0);
    };

    const clothingLeafRows = leafRows.slice(0, 6);
    const accLeafRows = leafRows.slice(6);
    const totalTemplate = purchaseData.data.rows.find((row) => row.isTotal) ?? null;
    const subtotalTemplates = purchaseData.data.rows.filter((row) => row.isSubtotal);
    const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
    const accSubtotalTemplate = subtotalTemplates[1] ?? null;
    const clothingSubtotal =
      clothingSubtotalTemplate == null
        ? null
        : {
            ...clothingSubtotalTemplate,
            monthly: clothingSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(clothingLeafRows, monthIndex)),
          };
    const accSubtotal =
      accSubtotalTemplate == null
        ? null
        : {
            ...accSubtotalTemplate,
            monthly: accSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(accLeafRows, monthIndex)),
          };
    const grandTotal =
      totalTemplate == null
        ? null
        : {
            ...totalTemplate,
            monthly: totalTemplate.monthly.map((_, monthIndex) => sumMonth(leafRows, monthIndex)),
          };

    return {
      rows: [
        ...(grandTotal ? [grandTotal] : []),
        ...(clothingSubtotal ? [clothingSubtotal] : []),
        ...clothingLeafRows,
        ...(accSubtotal ? [accSubtotal] : []),
        ...accLeafRows,
      ],
    };
  }, [year, purchaseData, effectiveShipmentDisplayData, shipmentPlanFromMonth, purchaseAnnualTotalByRowKey]);
  // 브랜드별 본사 매입상품 display 데이터 (3개 브랜드 동시 계산)
  const perBrandPurchaseDisplayData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026 || shipmentPlanFromMonth == null || shipmentPlanFromMonth <= 1) return {};
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const srcData = purchaseDataByBrand[b];
      const shipmentDisplay = perBrandShipmentDisplayData[b];
      const topHqRows = perBrandTopTable[b]?.hq.rows;
      if (!srcData || !shipmentDisplay || !topHqRows) continue;

      // 브랜드별 연간 매입 목표 (perBrandTopTable의 hq sellIn × 1000)
      const annualByKey: Record<string, number | null> = {};
      const leafRows2 = topHqRows.filter((r) => r.isLeaf);
      const leafByKey = new Map(leafRows2.map((r) => [r.key, r]));
      for (const r of leafRows2) annualByKey[r.key] = r.sellInTotal * 1000;
      const sumLeaf = (keys: string[]) => {
        const vals = keys.map((k) => leafByKey.get(k)?.sellInTotal).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) * 1000;
      };
      annualByKey['의류합계'] = sumLeaf(SEASON_KEYS as unknown as string[]);
      annualByKey['ACC합계']  = sumLeaf(ACC_KEYS as unknown as string[]);
      annualByKey['매입합계'] = sumLeaf([...SEASON_KEYS as unknown as string[], ...ACC_KEYS as unknown as string[]]);

      const shipmentByKey = new Map(shipmentDisplay.rows.map((row) => [row.key, row]));
      const planStartIndex = shipmentPlanFromMonth - 1;
      const leafRows = srcData.data.rows.filter((row) => row.isLeaf).map((row) => {
        const monthly = [...row.monthly];
        const annualTarget = annualByKey[row.key] ?? null;
        if (annualTarget == null) return { ...row, monthly };
        const actualSum = monthly.slice(0, planStartIndex).reduce<number>((sum, v) => sum + (v ?? 0), 0);
        const remaining = annualTarget - actualSum;
        const shipmentMonthly = shipmentByKey.get(row.key)?.monthly ?? [];
        const rawWeights = monthly.map((_, i) => (i < planStartIndex ? 0 : Math.max(shipmentMonthly[i] ?? 0, 0)));
        const weightTotal = rawWeights.reduce((sum, v) => sum + v, 0);
        const usableWeights = weightTotal > 0 ? rawWeights : rawWeights.map((_, i) => (i < planStartIndex ? 0 : 1));
        const usableTotal = usableWeights.reduce((sum, v) => sum + v, 0);
        let assigned = 0;
        for (let i = planStartIndex; i < 12; i++) {
          if (usableTotal <= 0) { monthly[i] = 0; continue; }
          if (i === 11) { monthly[i] = remaining - assigned; } else { const v = Math.round((remaining * usableWeights[i]) / usableTotal); monthly[i] = v; assigned += v; }
        }
        return { ...row, monthly };
      });
      const sumMonth = (rows: typeof leafRows, idx: number) => {
        const vals = rows.map((r) => r.monthly[idx] ?? null).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
      };
      const clothingLeafRows = leafRows.slice(0, 6);
      const accLeafRows = leafRows.slice(6);
      const totalTemplate = srcData.data.rows.find((row) => row.isTotal);
      const subtotalTemplates = srcData.data.rows.filter((row) => row.isSubtotal);
      const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
      const accSubtotalTemplate = subtotalTemplates[1] ?? null;
      const clothingSubtotal = clothingSubtotalTemplate == null ? null : { ...clothingSubtotalTemplate, monthly: clothingSubtotalTemplate.monthly.map((_, i) => sumMonth(clothingLeafRows, i)) };
      const accSubtotal = accSubtotalTemplate == null ? null : { ...accSubtotalTemplate, monthly: accSubtotalTemplate.monthly.map((_, i) => sumMonth(accLeafRows, i)) };
      const grandTotal = totalTemplate == null ? null : { ...totalTemplate, monthly: totalTemplate.monthly.map((_, i) => sumMonth(leafRows, i)) };
      result[b] = { rows: [...(grandTotal ? [grandTotal] : []), ...(clothingSubtotal ? [clothingSubtotal] : []), ...clothingLeafRows, ...(accSubtotal ? [accSubtotal] : []), ...accLeafRows] };
    }
    return result;
  }, [year, shipmentPlanFromMonth, purchaseDataByBrand, purchaseData, brand, perBrandShipmentDisplayData, perBrandTopTable]);

  // 브랜드별 본사 매입 연간합계 및 검증
  const perBrandPurchaseAnnualByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const hqRows = perBrandTopTable[b]?.hq.rows;
      if (!hqRows) continue;
      const leafRows = hqRows.filter((r) => r.isLeaf);
      const leafByKey = new Map(leafRows.map((r) => [r.key, r]));
      const annualByKey: Record<string, number | null> = {};
      for (const r of leafRows) annualByKey[r.key] = r.sellInTotal * 1000;
      const sumLeaf = (keys: string[]) => {
        const vals = keys.map((k) => leafByKey.get(k)?.sellInTotal).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) * 1000;
      };
      annualByKey['의류합계'] = sumLeaf(SEASON_KEYS as unknown as string[]);
      annualByKey['ACC합계']  = sumLeaf(ACC_KEYS as unknown as string[]);
      annualByKey['매입합계'] = sumLeaf([...SEASON_KEYS as unknown as string[], ...ACC_KEYS as unknown as string[]]);
      result[b] = annualByKey;
    }
    return result;
  }, [year, perBrandTopTable]);

  const perBrandPurchaseValidationByKey = useMemo<Partial<Record<AnnualPlanBrand, Record<string, number | null>>>>(() => {
    if (year !== 2026) return {};
    const result: Partial<Record<AnnualPlanBrand, Record<string, number | null>>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const displayData = perBrandPurchaseDisplayData[b];
      const annualByKey = perBrandPurchaseAnnualByKey[b];
      if (!displayData || !annualByKey) continue;
      const validation: Record<string, number | null> = {};
      for (const row of displayData.rows) {
        const monthlySum = row.monthly.reduce<number>((sum, v) => sum + (v ?? 0), 0);
        const annualTarget = annualByKey[row.key];
        validation[row.key] = annualTarget == null ? null : monthlySum - annualTarget;
      }
      result[b] = validation;
    }
    return result;
  }, [year, perBrandPurchaseDisplayData, perBrandPurchaseAnnualByKey]);

  const purchaseValidationByRowKey = useMemo<Record<string, number | null> | null>(() => {
    if (year !== 2026 || !effectivePurchaseDisplayData || !purchaseAnnualTotalByRowKey) return null;
    const result: Record<string, number | null> = {};
    for (const row of effectivePurchaseDisplayData.rows) {
      const monthlySum = row.monthly.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      const annualTarget = purchaseAnnualTotalByRowKey[row.key];
      result[row.key] = annualTarget == null ? null : monthlySum - annualTarget;
    }
    return result;
  }, [year, effectivePurchaseDisplayData, purchaseAnnualTotalByRowKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026) return;
    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') return;
    if (!effectivePurchaseDisplayData?.rows?.length) return;
    const row = effectivePurchaseDisplayData.rows.find((r) => r.key === '매입합계');
    if (!row?.monthly || !Array.isArray(row.monthly)) return;
    publishPurchaseMonthlyByBrand({ [brand]: row.monthly });
  }, [year, brand, effectivePurchaseDisplayData, publishPurchaseMonthlyByBrand]);

  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026) return;
    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') return;
    if (!effectiveShipmentDisplayData?.rows?.length) return;
    const row = effectiveShipmentDisplayData.rows.find((r) => r.key === '출고매출합계');
    if (!row?.monthly || !Array.isArray(row.monthly)) return;
    publishShipmentMonthlyByBrand({ [brand]: row.monthly });
  }, [year, brand, effectiveShipmentDisplayData, publishShipmentMonthlyByBrand]);

  // 백그라운드 fetch로 3개 브랜드 데이터가 모두 채워지면 현재 브랜드 외 나머지 브랜드의
  // 원시(raw) 데이터를 publish. 현재 브랜드는 위의 개별 효과들이 plan overlay 적용 값으로 처리.
  // 과거 실적 월: 실제값, 계획 월: null (사용자가 해당 브랜드 탭 방문 시 정확한 값으로 덮어씀)
  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026) return;
    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') return;

    const otherBrands = ANNUAL_PLAN_BRANDS.filter((b) => b !== brand);
    const missingBrands = otherBrands.filter(
      (b) => !monthlyDataByBrand[b] || !purchaseDataByBrand[b] || !shipmentDataByBrand[b],
    );
    if (missingBrands.length > 0) return; // 아직 백그라운드 fetch 완료 전

    const purchasePartial: Partial<MonthlyInventoryTotalByBrand> = {};
    const shipmentPartial: Partial<MonthlyInventoryTotalByBrand> = {};
    const monthlyPartial: Partial<MonthlyInventoryTotalByBrand> = {};

    for (const b of otherBrands) {
      const pData = purchaseDataByBrand[b];
      const sData = shipmentDataByBrand[b];
      const mData = monthlyDataByBrand[b];

      const purchaseRow = pData?.data?.rows?.find((r: { key: string }) => r.key === '매입합계');
      if (purchaseRow?.monthly && Array.isArray(purchaseRow.monthly)) {
        purchasePartial[b] = purchaseRow.monthly as (number | null)[];
      }

      const shipmentRow = sData?.data?.rows?.find((r: { key: string }) => r.key === '출고매출합계');
      if (shipmentRow?.monthly && Array.isArray(shipmentRow.monthly)) {
        shipmentPartial[b] = shipmentRow.monthly as (number | null)[];
      }

      const hqTotalRow = mData?.hq?.rows?.find((r: { isTotal?: boolean }) => r.isTotal);
      if (hqTotalRow?.monthly && Array.isArray(hqTotalRow.monthly)) {
        monthlyPartial[b] = hqTotalRow.monthly as (number | null)[];
      }
    }

    if (Object.keys(purchasePartial).length > 0) publishPurchaseMonthlyByBrand(purchasePartial);
    if (Object.keys(shipmentPartial).length > 0) publishShipmentMonthlyByBrand(shipmentPartial);
    if (Object.keys(monthlyPartial).length > 0) publishMonthlyInventoryTotalByBrand(monthlyPartial);
  }, [
    year,
    brand,
    monthlyDataByBrand,
    purchaseDataByBrand,
    shipmentDataByBrand,
    publishPurchaseMonthlyByBrand,
    publishShipmentMonthlyByBrand,
    publishMonthlyInventoryTotalByBrand,
  ]);

  // 백그라운드 3개 브랜드 로드 완료 시 plan overlay 적용된 데이터를 자동 publish
  useEffect(() => {
    if (!allBrandsBgLoaded || year !== 2026) return;

    const closingValues: Partial<HqClosingByBrand> = {};
    const monthlyPartial: Partial<MonthlyInventoryTotalByBrand> = {};
    const purchasePartial: Partial<MonthlyInventoryTotalByBrand> = {};
    const shipmentPartial: Partial<MonthlyInventoryTotalByBrand> = {};

    for (const b of ANNUAL_PLAN_BRANDS) {
      // plan overlay → 연간 기말재고(K) 계산
      const table = buildBrand2026TopTable(b);
      const planClosingK = table?.hq.rows.find((r) => r.isTotal)?.closing ?? null;
      if (planClosingK != null && Number.isFinite(planClosingK)) {
        closingValues[b] = planClosingK;
      }

      // 월별 기말재고: Snowflake 실적(1-2월) + 계획 기말까지 선형보간
      const mDataForBrand = monthlyDataByBrand[b];
      if (mDataForBrand) {
        const stockTotalRow = mDataForBrand.hq.rows.find((r) => r.isTotal || r.key === '재고자산합계');
        if (stockTotalRow && Array.isArray(stockTotalRow.monthly)) {
          // CNY → K CNY, 미마감 월은 null 유지
          const actualMonthly: (number | null)[] = stockTotalRow.monthly.map((v) =>
            v != null ? v / 1000 : null,
          );
          // 마지막 실적월 인덱스
          let lastActualIdx = -1;
          for (let i = 11; i >= 0; i--) {
            if (actualMonthly[i] != null) { lastActualIdx = i; break; }
          }
          // 미래 월 선형보간: 마지막 실적값 → 계획 기말
          const monthly: (number | null)[] = [...actualMonthly];
          if (planClosingK != null && lastActualIdx >= 0 && lastActualIdx < 11) {
            const lastVal = actualMonthly[lastActualIdx]!;
            const futureCount = 11 - lastActualIdx;
            for (let i = lastActualIdx + 1; i <= 11; i++) {
              const progress = (i - lastActualIdx) / futureCount;
              monthly[i] = Math.round(lastVal + progress * (planClosingK - lastVal));
            }
          }
          monthlyPartial[b] = monthly;
        }
      }

      // 매입 월별: purchaseDataByBrand의 '매입합계' 행 (CNY → K CNY)
      const pDataForBrand = purchaseDataByBrand[b];
      if (pDataForBrand) {
        const purchaseRow = pDataForBrand.data.rows.find((r) => r.isTotal || r.key === '매입합계');
        if (purchaseRow && Array.isArray(purchaseRow.monthly)) {
          purchasePartial[b] = purchaseRow.monthly.map((v) => (v != null ? v / 1000 : null));
        }
      }

      // 출고 월별: shipmentDataByBrand의 '출고매출합계' 행 (CNY → K CNY)
      const sDataForBrand = shipmentDataByBrand[b];
      if (sDataForBrand) {
        const shipmentRow = sDataForBrand.data.rows.find((r) => r.isTotal || r.key === '출고매출합계');
        if (shipmentRow && Array.isArray(shipmentRow.monthly)) {
          shipmentPartial[b] = shipmentRow.monthly.map((v) => (v != null ? v / 1000 : null));
        }
      }
    }

    if (Object.keys(closingValues).length > 0) publishHqClosingByBrand(closingValues);
    if (Object.keys(monthlyPartial).length > 0) publishMonthlyInventoryTotalByBrand(monthlyPartial);
    if (Object.keys(purchasePartial).length > 0) publishPurchaseMonthlyByBrand(purchasePartial);
    if (Object.keys(shipmentPartial).length > 0) publishShipmentMonthlyByBrand(shipmentPartial);
  }, [allBrandsBgLoaded, year, buildBrand2026TopTable, brand, monthlyDataByBrand, monthlyData, purchaseDataByBrand, purchaseData, shipmentDataByBrand, shipmentData, publishHqClosingByBrand, publishMonthlyInventoryTotalByBrand, publishPurchaseMonthlyByBrand, publishShipmentMonthlyByBrand]);

  const monthlyPlanFromMonth = useMemo(() => {
    if (year !== 2026 || brand === '전체' || !monthlyData) return undefined;
    const closedThrough = monthlyData.closedThrough ?? '';
    const closedMonth =
      closedThrough.length >= 6 && closedThrough.startsWith(String(year))
        ? Number(closedThrough.slice(4, 6))
        : NaN;
    if (!Number.isInteger(closedMonth) || closedMonth < 1 || closedMonth >= 12) return undefined;
    return closedMonth + 1;
  }, [year, brand, monthlyData]);
  const monthlyPlanSummaryText = useMemo(() => {
    if (year !== 2026 || brand === '전체' || monthlyPlanFromMonth == null) return null;
    const actualEndMonth = monthlyPlanFromMonth - 1;
    const actualText =
      actualEndMonth <= 1 ? '1월: 실적 고정' : `1~${actualEndMonth}월: 실적 고정`;
    const adjustmentText =
      monthlyPlanFromMonth <= 11 ? `${monthlyPlanFromMonth}~11월` : `${monthlyPlanFromMonth}월`;
    return `${actualText}, 12월에서 거꾸로 역산 후 연간 차액은 ${adjustmentText}에서 보정`;
  }, [year, brand, monthlyPlanFromMonth]);
  const monthlyPlanLegendText = useMemo(() => {
    if (year !== 2026 || brand === '전체' || monthlyPlanFromMonth == null) return null;
    const actualEndMonth = monthlyPlanFromMonth - 1;
    const actualText =
      actualEndMonth <= 1 ? '1월: 실적 고정' : `1~${actualEndMonth}월: 실적 고정`;
    const reverseStartText = `12월 기말: 상단 재고자산표 기말로 고정 / 11~${monthlyPlanFromMonth}월: 12월에서 거꾸로 역산`;
    const adjustmentText =
      monthlyPlanFromMonth <= 11
        ? `이후 ${actualEndMonth}월 실적과 역산된 ${monthlyPlanFromMonth}월 사이의 연결 차이(gap)를 ${monthlyPlanFromMonth}~11월 계획월에 비중으로 분산 보정`
        : `이후 ${actualEndMonth}월 실적과 역산된 ${monthlyPlanFromMonth}월 사이의 연결 차이(gap)를 ${monthlyPlanFromMonth}월에 반영`;
    return `${actualText} / ${reverseStartText} / ${adjustmentText} / 최종적으로 ${actualEndMonth}월까지는 실적 유지, 12월은 목표 기말 유지, ${monthlyPlanFromMonth}~11월만 중간 연결용으로 조정`;
  }, [year, brand, monthlyPlanFromMonth]);
  const effectiveDealerMonthlyDisplayData = useMemo<TableData | null>(() => {
    if (
      !monthlyData ||
      !effectiveShipmentDisplayData ||
      !effectiveRetailData ||
      year !== 2026 ||
      brand === '전체' ||
      monthlyPlanFromMonth == null ||
      monthlyPlanFromMonth <= 1
    ) {
      return monthlyData?.dealer as TableData | null;
    }
    const shipmentByKey = new Map(effectiveShipmentDisplayData.rows.map((row) => [row.key, row]));
    const retailByKey = new Map(effectiveRetailData.dealer.rows.map((row) => [row.key, row]));
    const dealerClosingByKey = new Map(
      (dealerTableData?.rows ?? []).map((row) => [row.key, row.closing * 1000]),
    );
    const planStartIndex = monthlyPlanFromMonth - 1;
    const leafRows = monthlyData.dealer.rows
      .filter((row) => row.isLeaf)
      .map((row) => {
        const monthly = [...row.monthly];
        let prevClosing = row.opening;
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          const currentBase = monthly[monthIndex] ?? null;
          if (currentBase != null) prevClosing = currentBase;
          if (monthIndex < planStartIndex) continue;
          const shipVal = shipmentByKey.get(row.key)?.monthly[monthIndex] ?? 0;
          const retailVal = retailByKey.get(row.key)?.monthly[monthIndex] ?? 0;
          if (prevClosing == null) {
            monthly[monthIndex] = null;
          } else {
            monthly[monthIndex] = prevClosing + shipVal - retailVal;
            prevClosing = monthly[monthIndex];
          }
        }
        const targetClosing = dealerClosingByKey.get(row.key) ?? null;
        const currentClosing = monthly[11] ?? null;
        if (targetClosing != null && currentClosing != null) {
          const gap = targetClosing - currentClosing;
          if (gap !== 0) {
            const rawWeights = monthly.map((_, monthIndex) => {
              if (monthIndex < planStartIndex) return 0;
              const shipVal = Math.max(shipmentByKey.get(row.key)?.monthly[monthIndex] ?? 0, 0);
              const retailVal = Math.max(retailByKey.get(row.key)?.monthly[monthIndex] ?? 0, 0);
              return shipVal + retailVal;
            });
            const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
            const usableWeights =
              weightTotal > 0
                ? rawWeights
                : rawWeights.map((_, monthIndex) => (monthIndex < planStartIndex ? 0 : 1));
            const usableTotal = usableWeights.reduce((sum, value) => sum + value, 0);
            let assigned = 0;
            let cumulativeAdjustment = 0;
            for (let monthIndex = planStartIndex; monthIndex < 12; monthIndex += 1) {
              const monthAdjustment =
                usableTotal <= 0
                  ? 0
                  : monthIndex === 11
                    ? gap - assigned
                    : Math.round((gap * usableWeights[monthIndex]) / usableTotal);
              assigned += monthAdjustment;
              cumulativeAdjustment += monthAdjustment;
              const currentValue = monthly[monthIndex];
              if (currentValue != null) {
                monthly[monthIndex] = currentValue + cumulativeAdjustment;
              }
            }
          }
        }
        return { ...row, monthly };
      });
    const sumMonth = (rows: typeof leafRows, monthIndex: number): number | null => {
      const values = rows
        .map((row) => row.monthly[monthIndex] ?? null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const sumOpening = (rows: typeof leafRows): number | null => {
      const values = rows
        .map((row) => row.opening ?? null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const clothingLeafRows = leafRows.slice(0, 6);
    const accLeafRows = leafRows.slice(6);
    const totalTemplate = monthlyData.dealer.rows.find((row) => row.isTotal);
    const subtotalTemplates = monthlyData.dealer.rows.filter((row) => row.isSubtotal);
    const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
    const accSubtotalTemplate = subtotalTemplates[1] ?? null;
    const clothingSubtotal =
      clothingSubtotalTemplate == null
        ? null
        : {
            ...clothingSubtotalTemplate,
            opening: sumOpening(clothingLeafRows),
            monthly: clothingSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(clothingLeafRows, monthIndex)),
          };
    const accSubtotal =
      accSubtotalTemplate == null
        ? null
        : {
            ...accSubtotalTemplate,
            opening: sumOpening(accLeafRows),
            monthly: accSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(accLeafRows, monthIndex)),
          };
    const grandTotal =
      totalTemplate == null
        ? null
        : {
            ...totalTemplate,
            opening: sumOpening(leafRows),
            monthly: totalTemplate.monthly.map((_, monthIndex) => sumMonth(leafRows, monthIndex)),
          };
    if (clothingSubtotal && dealerClosingByKey.has('의류합계')) {
      clothingSubtotal.monthly[11] = dealerClosingByKey.get('의류합계') ?? clothingSubtotal.monthly[11];
    }
    if (accSubtotal && dealerClosingByKey.has('ACC합계')) {
      accSubtotal.monthly[11] = dealerClosingByKey.get('ACC합계') ?? accSubtotal.monthly[11];
    }
    if (grandTotal && dealerClosingByKey.has('재고자산합계')) {
      grandTotal.monthly[11] = dealerClosingByKey.get('재고자산합계') ?? grandTotal.monthly[11];
    }
    return {
      rows: [
        ...(grandTotal ? [grandTotal] : []),
        ...(clothingSubtotal ? [clothingSubtotal] : []),
        ...clothingLeafRows,
        ...(accSubtotal ? [accSubtotal] : []),
        ...accLeafRows,
      ],
    };
  }, [year, brand, monthlyData, monthlyPlanFromMonth, effectiveShipmentDisplayData, effectiveRetailData, dealerTableData]);
  const effectiveHqMonthlyDisplayData = useMemo<TableData | null>(() => {
    if (
      !monthlyData ||
      !effectivePurchaseDisplayData ||
      !effectiveShipmentDisplayData ||
      !effectiveRetailData ||
      year !== 2026 ||
      brand === '전체' ||
      monthlyPlanFromMonth == null ||
      monthlyPlanFromMonth <= 1
    ) {
      return monthlyData?.hq as TableData | null;
    }
    const purchaseByKey = new Map(effectivePurchaseDisplayData.rows.map((row) => [row.key, row]));
    const shipmentByKey = new Map(effectiveShipmentDisplayData.rows.map((row) => [row.key, row]));
    const retailByKey = new Map(effectiveRetailData.hq.rows.map((row) => [row.key, row]));
    const hqClosingByKey = new Map(
      (hqTableData?.rows ?? []).map((row) => [row.key, row.closing * 1000]),
    );
    const planStartIndex = monthlyPlanFromMonth - 1;
    const leafRows = monthlyData.hq.rows
      .filter((row) => row.isLeaf)
      .map((row) => {
        const monthly = [...row.monthly];
        const targetClosing = hqClosingByKey.get(row.key) ?? null;
        const actualBoundaryClosing = planStartIndex > 0 ? (monthly[planStartIndex - 1] ?? null) : (row.opening ?? null);
        if (targetClosing != null) {
          monthly[11] = targetClosing;
          let impliedBoundaryClosing: number | null = null;
          for (let monthIndex = 11; monthIndex >= planStartIndex; monthIndex -= 1) {
            const currentClosing = monthly[monthIndex] ?? null;
            if (currentClosing == null) continue;
            const purchaseVal = purchaseByKey.get(row.key)?.monthly[monthIndex] ?? 0;
            const shipVal = shipmentByKey.get(row.key)?.monthly[monthIndex] ?? 0;
            const retailVal = retailByKey.get(row.key)?.monthly[monthIndex] ?? 0;
            const prevClosing = currentClosing - purchaseVal + shipVal + retailVal;
            if (monthIndex - 1 >= planStartIndex) {
              monthly[monthIndex - 1] = prevClosing;
            } else {
              impliedBoundaryClosing = prevClosing;
            }
          }

          if (actualBoundaryClosing != null && impliedBoundaryClosing != null) {
            const gap = actualBoundaryClosing - impliedBoundaryClosing;
            if (gap !== 0) {
              const tailMonths = Array.from({ length: Math.max(0, 11 - planStartIndex) }, (_, index) => planStartIndex + 1 + index);
              const rawWeights = tailMonths.map((monthIndex) => {
                const purchaseVal = Math.max(purchaseByKey.get(row.key)?.monthly[monthIndex] ?? 0, 0);
                const shipVal = Math.max(shipmentByKey.get(row.key)?.monthly[monthIndex] ?? 0, 0);
                const retailVal = Math.max(retailByKey.get(row.key)?.monthly[monthIndex] ?? 0, 0);
                return purchaseVal + shipVal + retailVal;
              });
              const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0);
              const usableWeights =
                weightTotal > 0
                  ? rawWeights
                  : rawWeights.map(() => 1);
              const usableTotal = usableWeights.reduce((sum, value) => sum + value, 0);
              const portionByMonth = new Map<number, number>();
              let assigned = 0;
              tailMonths.forEach((monthIndex, index) => {
                const portion =
                  usableTotal <= 0
                    ? 0
                    : index === tailMonths.length - 1
                      ? gap - assigned
                      : Math.round((gap * usableWeights[index]) / usableTotal);
                assigned += portion;
                portionByMonth.set(monthIndex, portion);
              });

              let runningAdjustment = gap;
              for (let monthIndex = planStartIndex; monthIndex < 12; monthIndex += 1) {
                const currentValue = monthly[monthIndex];
                if (currentValue != null) {
                  monthly[monthIndex] = currentValue + runningAdjustment;
                }
                if (monthIndex < 11) {
                  runningAdjustment -= portionByMonth.get(monthIndex + 1) ?? 0;
                }
              }
            }
          }
        }
        return { ...row, monthly };
      });
    const sumMonth = (rows: typeof leafRows, monthIndex: number): number | null => {
      const values = rows
        .map((row) => row.monthly[monthIndex] ?? null)
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0);
    };
    const clothingLeafRows = leafRows.slice(0, 6);
    const accLeafRows = leafRows.slice(6);
    const totalTemplate = monthlyData.hq.rows.find((row) => row.isTotal) ?? null;
    const subtotalTemplates = monthlyData.hq.rows.filter((row) => row.isSubtotal);
    const clothingSubtotalTemplate = subtotalTemplates[0] ?? null;
    const accSubtotalTemplate = subtotalTemplates[1] ?? null;
    const clothingSubtotal =
      clothingSubtotalTemplate == null
        ? null
        : {
            ...clothingSubtotalTemplate,
            monthly: clothingSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(clothingLeafRows, monthIndex)),
          };
    const accSubtotal =
      accSubtotalTemplate == null
        ? null
        : {
            ...accSubtotalTemplate,
            monthly: accSubtotalTemplate.monthly.map((_, monthIndex) => sumMonth(accLeafRows, monthIndex)),
          };
    const grandTotal =
      totalTemplate == null
        ? null
        : {
            ...totalTemplate,
            monthly: totalTemplate.monthly.map((_, monthIndex) => sumMonth(leafRows, monthIndex)),
          };
    if (clothingSubtotal && hqClosingByKey.has('의류합계')) {
      clothingSubtotal.monthly[11] = hqClosingByKey.get('의류합계') ?? clothingSubtotal.monthly[11];
    }
    if (accSubtotal && hqClosingByKey.has('ACC합계')) {
      accSubtotal.monthly[11] = hqClosingByKey.get('ACC합계') ?? accSubtotal.monthly[11];
    }
    if (grandTotal && hqClosingByKey.has('재고자산합계')) {
      grandTotal.monthly[11] = hqClosingByKey.get('재고자산합계') ?? grandTotal.monthly[11];
    }

    return {
      rows: [
        ...(grandTotal ? [grandTotal] : []),
        ...(clothingSubtotal ? [clothingSubtotal] : []),
        ...clothingLeafRows,
        ...(accSubtotal ? [accSubtotal] : []),
        ...accLeafRows,
      ],
    };
  }, [year, brand, monthlyData, monthlyPlanFromMonth, effectivePurchaseDisplayData, effectiveShipmentDisplayData, effectiveRetailData, hqTableData]);

  // 브랜드별 대리상 월별 재고잔액 display 데이터 (3개 브랜드 동시 계산)
  const perBrandDealerMonthlyDisplayData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026 || shipmentPlanFromMonth == null || shipmentPlanFromMonth <= 1) return {};
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const mData = monthlyDataByBrand[b];
      const shipDisplay = perBrandShipmentDisplayData[b];
      const effRetail = perBrandEffectiveRetailData[b];  // applyAdjustedDealerRetailPlanBase만 적용 (월별재배분 X)
      const dealerRows = perBrandTopTable[b]?.dealer.rows;
      if (!mData || !shipDisplay || !effRetail || !dealerRows) continue;
      const shipmentByKey = new Map(shipDisplay.rows.map((row) => [row.key, row]));
      const retailByKey = new Map(effRetail.dealer.rows.map((row) => [row.key, row]));
      const dealerClosingByKey = new Map(dealerRows.map((row) => [row.key, row.closing * 1000]));
      const planStartIndex = shipmentPlanFromMonth - 1;
      const leafRows = mData.dealer.rows.filter((row) => row.isLeaf).map((row) => {
        const monthly = [...row.monthly];
        let prevClosing = row.opening;
        for (let i = 0; i < 12; i++) {
          const currentBase = monthly[i] ?? null;
          if (currentBase != null) prevClosing = currentBase;
          if (i < planStartIndex) continue;
          const shipVal = shipmentByKey.get(row.key)?.monthly[i] ?? 0;
          const retailVal = retailByKey.get(row.key)?.monthly[i] ?? 0;
          monthly[i] = prevClosing == null ? null : prevClosing + shipVal - retailVal;
          prevClosing = monthly[i];
        }
        const targetClosing = dealerClosingByKey.get(row.key) ?? null;
        const currentClosing = monthly[11] ?? null;
        if (targetClosing != null && currentClosing != null) {
          const gap = targetClosing - currentClosing;
          if (gap !== 0) {
            const rawWeights = monthly.map((_, i) => {
              if (i < planStartIndex) return 0;
              return Math.max(shipmentByKey.get(row.key)?.monthly[i] ?? 0, 0) + Math.max(retailByKey.get(row.key)?.monthly[i] ?? 0, 0);
            });
            const wTotal = rawWeights.reduce((s, v) => s + v, 0);
            const usableW = wTotal > 0 ? rawWeights : rawWeights.map((_, i) => (i < planStartIndex ? 0 : 1));
            const uTotal = usableW.reduce((s, v) => s + v, 0);
            let assigned = 0; let cumAdj = 0;
            for (let i = planStartIndex; i < 12; i++) {
              const adj = uTotal <= 0 ? 0 : i === 11 ? gap - assigned : Math.round((gap * usableW[i]) / uTotal);
              assigned += adj; cumAdj += adj;
              if (monthly[i] != null) monthly[i] = (monthly[i] as number) + cumAdj;
            }
          }
        }
        return { ...row, monthly };
      });
      const sumMonth = (rows: typeof leafRows, idx: number) => {
        const vals = rows.map((r) => r.monthly[idx] ?? null).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
      };
      const clothingLeafRows = leafRows.slice(0, 6);
      const accLeafRows = leafRows.slice(6);
      const totalTemplate = mData.dealer.rows.find((row) => row.isTotal) ?? null;
      const subtotalTemplates = mData.dealer.rows.filter((row) => row.isSubtotal);
      const clothingSubtotal = subtotalTemplates[0] == null ? null : { ...subtotalTemplates[0], monthly: subtotalTemplates[0].monthly.map((_, i) => sumMonth(clothingLeafRows, i)) };
      const accSubtotal = subtotalTemplates[1] == null ? null : { ...subtotalTemplates[1], monthly: subtotalTemplates[1].monthly.map((_, i) => sumMonth(accLeafRows, i)) };
      const grandTotal = totalTemplate == null ? null : { ...totalTemplate, monthly: totalTemplate.monthly.map((_, i) => sumMonth(leafRows, i)) };
      result[b] = { rows: [...(grandTotal ? [grandTotal] : []), ...(clothingSubtotal ? [clothingSubtotal] : []), ...clothingLeafRows, ...(accSubtotal ? [accSubtotal] : []), ...accLeafRows] };
    }
    return result;
  }, [year, shipmentPlanFromMonth, monthlyDataByBrand, monthlyData, brand, perBrandShipmentDisplayData, perBrandEffectiveRetailData, perBrandTopTable]);

  // 브랜드별 본사 월별 재고잔액 display 데이터 (3개 브랜드 동시 계산)
  const perBrandHqMonthlyDisplayData = useMemo<Partial<Record<AnnualPlanBrand, TableData>>>(() => {
    if (year !== 2026 || shipmentPlanFromMonth == null || shipmentPlanFromMonth <= 1) return {};
    const result: Partial<Record<AnnualPlanBrand, TableData>> = {};
    for (const b of ANNUAL_PLAN_BRANDS) {
      const mData = monthlyDataByBrand[b];
      const purchaseDisplay = perBrandPurchaseDisplayData[b];
      const shipDisplay = perBrandShipmentDisplayData[b];
      const effRetail = perBrandEffectiveRetailData[b];  // applyAdjustedDealerRetailPlanBase만 적용 (월별재배분 X)
      const hqRows = perBrandTopTable[b]?.hq.rows;
      if (!mData || !purchaseDisplay || !shipDisplay || !effRetail || !hqRows) continue;
      const purchaseByKey = new Map(purchaseDisplay.rows.map((row) => [row.key, row]));
      const shipmentByKey = new Map(shipDisplay.rows.map((row) => [row.key, row]));
      const retailByKey = new Map(effRetail.hq.rows.map((row) => [row.key, row]));
      const hqClosingByKey = new Map(hqRows.map((row) => [row.key, row.closing * 1000]));
      const planStartIndex = shipmentPlanFromMonth - 1;
      const leafRows = mData.hq.rows.filter((row) => row.isLeaf).map((row) => {
        const monthly = [...row.monthly];
        const targetClosing = hqClosingByKey.get(row.key) ?? null;
        const actualBoundaryClosing = planStartIndex > 0 ? (monthly[planStartIndex - 1] ?? null) : (row.opening ?? null);
        if (targetClosing != null) {
          monthly[11] = targetClosing;
          let impliedBoundaryClosing: number | null = null;
          for (let i = 11; i >= planStartIndex; i--) {
            const cur = monthly[i] ?? null;
            if (cur == null) continue;
            const pv = purchaseByKey.get(row.key)?.monthly[i] ?? 0;
            const sv = shipmentByKey.get(row.key)?.monthly[i] ?? 0;
            const rv = retailByKey.get(row.key)?.monthly[i] ?? 0;
            const prev = cur - pv + sv + rv;
            if (i - 1 >= planStartIndex) { monthly[i - 1] = prev; } else { impliedBoundaryClosing = prev; }
          }
          if (actualBoundaryClosing != null && impliedBoundaryClosing != null) {
            const gap = actualBoundaryClosing - impliedBoundaryClosing;
            if (gap !== 0) {
              const tailMonths = Array.from({ length: Math.max(0, 11 - planStartIndex) }, (_, idx) => planStartIndex + 1 + idx);
              const rawWeights = tailMonths.map((mi) =>
                Math.max(purchaseByKey.get(row.key)?.monthly[mi] ?? 0, 0) + Math.max(shipmentByKey.get(row.key)?.monthly[mi] ?? 0, 0) + Math.max(retailByKey.get(row.key)?.monthly[mi] ?? 0, 0)
              );
              const wTotal = rawWeights.reduce((s, v) => s + v, 0);
              const usableW = wTotal > 0 ? rawWeights : rawWeights.map(() => 1);
              const uTotal = usableW.reduce((s, v) => s + v, 0);
              const portionByMonth = new Map<number, number>();
              let assigned = 0;
              tailMonths.forEach((mi, idx) => {
                const portion = uTotal <= 0 ? 0 : idx === tailMonths.length - 1 ? gap - assigned : Math.round((gap * usableW[idx]) / uTotal);
                assigned += portion; portionByMonth.set(mi, portion);
              });
              let runAdj = gap;
              for (let i = planStartIndex; i < 12; i++) {
                if (monthly[i] != null) monthly[i] = (monthly[i] as number) + runAdj;
                if (i < 11) runAdj -= portionByMonth.get(i + 1) ?? 0;
              }
            }
          }
        }
        return { ...row, monthly };
      });
      const sumMonth = (rows: typeof leafRows, idx: number) => {
        const vals = rows.map((r) => r.monthly[idx] ?? null).filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
      };
      const clothingLeafRows = leafRows.slice(0, 6);
      const accLeafRows = leafRows.slice(6);
      const totalTemplate = mData.hq.rows.find((row) => row.isTotal) ?? null;
      const subtotalTemplates = mData.hq.rows.filter((row) => row.isSubtotal);
      const clothingSubtotal = subtotalTemplates[0] == null ? null : { ...subtotalTemplates[0], monthly: subtotalTemplates[0].monthly.map((_, i) => sumMonth(clothingLeafRows, i)) };
      const accSubtotal = subtotalTemplates[1] == null ? null : { ...subtotalTemplates[1], monthly: subtotalTemplates[1].monthly.map((_, i) => sumMonth(accLeafRows, i)) };
      const grandTotal = totalTemplate == null ? null : { ...totalTemplate, monthly: totalTemplate.monthly.map((_, i) => sumMonth(leafRows, i)) };
      if (clothingSubtotal && hqClosingByKey.has('의류합계')) clothingSubtotal.monthly[11] = hqClosingByKey.get('의류합계') ?? clothingSubtotal.monthly[11];
      if (accSubtotal && hqClosingByKey.has('ACC합계')) accSubtotal.monthly[11] = hqClosingByKey.get('ACC합계') ?? accSubtotal.monthly[11];
      if (grandTotal && hqClosingByKey.has('재고자산합계')) grandTotal.monthly[11] = hqClosingByKey.get('재고자산합계') ?? grandTotal.monthly[11];
      result[b] = { rows: [...(grandTotal ? [grandTotal] : []), ...(clothingSubtotal ? [clothingSubtotal] : []), ...clothingLeafRows, ...(accSubtotal ? [accSubtotal] : []), ...accLeafRows] };
    }
    return result;
  }, [year, shipmentPlanFromMonth, monthlyDataByBrand, monthlyData, brand, perBrandPurchaseDisplayData, perBrandShipmentDisplayData, perBrandEffectiveRetailData, perBrandTopTable]);

  useEffect(() => {
    if (typeof window === 'undefined' || year !== 2026) return;
    if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') return;
    if (!effectiveDealerMonthlyDisplayData || !effectiveHqMonthlyDisplayData) return;

    const hqTotalRow = effectiveHqMonthlyDisplayData.rows.find((row) => row.isTotal);
    if (!hqTotalRow) return;

    const monthly = Array.from({ length: 12 }, (_, monthIndex) => {
      const hqValue = hqTotalRow.monthly[monthIndex];
      return hqValue ?? null;
    });

    publishMonthlyInventoryTotalByBrand({ [brand]: monthly });
  }, [year, brand, effectiveDealerMonthlyDisplayData, effectiveHqMonthlyDisplayData, publishMonthlyInventoryTotalByBrand]);
  const yoyPending = year === 2026 && !prevYearError && (prevYearLoading || !prevYearTableData);
  const statusLoading =
    loading || monthlyLoading || retailLoading || shipmentLoading || purchaseLoading || recalcLoading || yoyPending || dependentPlanInitialLoading;
  const statusError = !!error || !!monthlyError || !!retailError || !!shipmentError || !!purchaseError || prevYearError;
  const statusErrorMessage = error || monthlyError || retailError || shipmentError || purchaseError || prevYearError || null;

  // 2026 ACC ???ш퀬二쇱닔 ?몄쭛 ???곹깭 諛섏쁺 (??? ?먮뒗 湲곕낯媛?釉붾줉怨??곕룞)
  const handleWoiChange = useCallback((tableType: 'dealer' | 'hq', rowKey: string, newWoi: number) => {
    if (!ACC_KEYS.includes(rowKey as AccKey)) return;
    if (tableType === 'dealer') {
      setAccTargetWoiDealer((prev) => {
        const next = { ...prev, [rowKey]: newWoi };
        accTargetWoiDealerRef.current = next;
        return next;
      });
    } else {
      setAccTargetWoiHq((prev) => {
        const next = { ...prev, [rowKey]: newWoi };
        accTargetWoiHqRef.current = next;
        return next;
      });
    }
  }, []);

  // 2026 蹂몄궗 ?由ъ긽異쒓퀬(?곌컙) ?몄쭛 ???由ъ긽 ??Sell-in???먮룞 諛섏쁺
  const handleHqHoldingWoiChange = useCallback((rowKey: AccKey, newWoi: number) => {
    setAccHqHoldingWoi((prev) => {
      const next = { ...prev, [rowKey]: newWoi };
      accHqHoldingWoiRef.current = next;
      return next;
    });
  }, []);

  const handleHqSellOutChange = useCallback((rowKey: RowKey, newSellOutTotal: number) => {
    setHqSellOutPlan((prev) => ({ ...prev, [rowKey]: newSellOutTotal }));
  }, []);

  // 저장 시 월별 재고잔액·리테일 매출·출고·매입 4개만 저장
  const handleSave = useCallback(async () => {
    if (!monthlyData || !retailData || !shipmentData || !purchaseData) return;
    if (year === 2026) {
      setSnapshotSaved(false);
      setSnapshotSavedAt(null);
      return;
    }
    const retailActuals =
      year === 2026 && retailData.planFromMonth
        ? stripPlanMonths(retailData, retailData.planFromMonth)
        : retailData;
    const snap: SnapshotData = {
      monthly: monthlyData,
      retailActuals,
      retail2025: retailData.retail2025 ?? retail2025Ref.current ?? null,
      shipment: shipmentData,
      purchase: purchaseData,
      savedAt: new Date().toISOString(),
      planFromMonth: retailData.planFromMonth,
    };
    saveSnapshot(year, brand, snap);
    await saveSnapshotToServer(year, brand, snap);
    setSnapshotSaved(true);
    setSnapshotSavedAt(snap.savedAt);
  }, [year, brand, monthlyData, retailData, shipmentData, purchaseData]);

  // ?? ?ш퀎????
  const handleRecalc = useCallback(async (mode: 'current' | 'annual') => {
    setRecalcLoading(true);
    try {
      // mode? ?? ?? ???? ??, ??? ?? ?? ??? ?? ????? ??
      void mode;

      if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') {
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        return;
      }

      const [fm, fr, fs, fp] = await Promise.all([
        fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<MonthlyStockResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand, growthRate: String(growthRateByBrand[brand as AnnualPlanBrand] ?? growthRate), growthRateHq: String(growthRateHqByBrand[brand as AnnualPlanBrand] ?? growthRateHq) })}`).then(
          (r) => r.json() as Promise<RetailSalesResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<ShipmentSalesResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<PurchaseResponse & { error?: string }>,
        ),
      ]);

      if (fm.error) throw new Error(fm.error);
      if (fr.error) throw new Error(fr.error);
      if (fs.error) throw new Error(fs.error);
      if (fp.error) throw new Error(fp.error);

      setMonthlyData(fm);
      setRetailData(fr);
      setShipmentData(fs);
      setPurchaseData(fp);
      monthlyByBrandRef.current[brand as LeafBrand] = fm;
      retailByBrandRef.current[brand as LeafBrand] = fr;
      shipmentByBrandRef.current[brand as LeafBrand] = fs;
      purchaseByBrandRef.current[brand as LeafBrand] = fp;
      if (fr.retail2025) retail2025Ref.current = fr.retail2025;

      if (year === 2026) {
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        return;
      }

      const retailActuals =
        year === 2026 && fr.planFromMonth
          ? stripPlanMonths(fr, fr.planFromMonth)
          : fr;

      const freshSnapshot: SnapshotData = {
        monthly: fm,
        retailActuals,
        retail2025: fr.retail2025 ?? null,
        shipment: fs,
        purchase: fp,
        savedAt: new Date().toISOString(),
        planFromMonth: fr.planFromMonth,
      };

      saveSnapshot(year, brand, freshSnapshot);
      await saveSnapshotToServer(year, brand, freshSnapshot);
      setSnapshotSaved(true);
      setSnapshotSavedAt(freshSnapshot.savedAt);
    } catch (e) {
      console.error('[recalc] error:', e);
    } finally {
      setRecalcLoading(false);
    }
  }, [year, brand, growthRate, growthRateHq, growthRateByBrand, growthRateHqByBrand, fetchMonthlyData, fetchRetailData, fetchShipmentData, fetchPurchaseData]);

  const handleAnnualPlanCellChange = useCallback((planBrand: AnnualPlanBrand, season: AnnualPlanSeason, value: string) => {
    if (!annualPlanEditMode) return;
    const numeric = parseInt(value.replace(/[^\d-]/g, ''), 10);
    const nextValue = Number.isNaN(numeric) ? 0 : numeric;
    setAnnualShipmentPlanDraft2026((prev) => ({
      ...prev,
      [planBrand]: {
        ...prev[planBrand],
        [season]: nextValue,
      },
    }));
  }, [annualPlanEditMode]);

  const handleAnnualPlanEditStart = useCallback(() => {
    setAnnualShipmentPlanDraft2026(annualShipmentPlan2026);
    setAnnualPlanEditMode(true);
  }, [annualShipmentPlan2026]);

  const handleAnnualPlanSave = useCallback(async () => {
    setAnnualShipmentPlan2026(annualShipmentPlanDraft2026);
    setAnnualPlanEditMode(false);
    await saveAnnualPlanToServer(2026, annualShipmentPlanDraft2026);
  }, [annualShipmentPlanDraft2026]);

  const handleOtbEditStart = useCallback(() => {
    setOtbDraft(otbData ? (JSON.parse(JSON.stringify(otbData)) as OtbData) : null);
    setOtbEditMode(true);
  }, [otbData]);

  const handleOtbCellChange = useCallback((sesn: OtbSeason, brand: OtbBrand, valueK: number) => {
    setOtbDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [sesn]: { ...prev[sesn], [brand]: valueK * 1000 },
      };
    });
  }, []);

  const handleOtbSave = useCallback(async () => {
    if (!otbDraft) return;
    setOtbData(otbDraft);
    setOtbEditMode(false);
    const payload: Record<string, Record<string, number>> = {};
    for (const sesn of OTB_SEASONS_LIST) {
      payload[sesn] = {};
      for (const b of ANNUAL_PLAN_BRANDS) {
        payload[sesn][b] = Math.round((otbDraft[sesn]?.[b] ?? 0) / 1000);
      }
    }
    try {
      await fetch('/api/inventory/otb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload }),
      });
    } catch {
      // 서버 저장 실패 시 로컬 state는 유지
    }
  }, [otbDraft]);

  return (
    <div className="bg-gray-50 overflow-auto h-[calc(100vh-64px)]">
      <InventoryFilterBar
        year={year}
        onYearChange={setYear}
        snapshotSaved={snapshotSaved}
        snapshotSavedAt={snapshotSavedAt}
        recalcLoading={recalcLoading}
        statusLoading={statusLoading}
        statusError={statusError}
        onSave={handleSave}
        onRecalc={handleRecalc}
        canSave={!!(monthlyData && retailData && shipmentData && purchaseData)}
        allBrandsBgLoaded={year === 2026 && allBrandsBgLoaded}
      />

      <div className="px-6 py-5">
        {/* ?? 湲곗〈 Sell-in / Sell-out ???? */}
        {statusLoading && !dealerTableData && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              로딩 중...
            </div>
        )}
        {statusErrorMessage && !statusLoading && !dealerTableData && (
          <div className="py-10 text-center text-red-500 text-sm">{statusErrorMessage}</div>
        )}
        {/* 2026: 리테일 성장율 | 재고관련 주요지표 (상단 이동) */}
        {year === 2026 && (
          <div className="mb-6" style={{ paddingLeft: '1.5%', paddingRight: '1.5%' }}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-1">
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm font-semibold tracking-tight text-slate-900">리테일 성장율</div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="min-w-[100px] border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-white">브랜드</th>
                        <th className="min-w-[84px] border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white">대리상</th>
                        <th className="min-w-[84px] border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white">본사</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ANNUAL_PLAN_BRANDS.map((b) => (
                        <tr key={b} className="bg-white odd:bg-slate-50/70 hover:bg-sky-50/60">
                          <td className="border-b border-slate-200 px-3 py-2.5 font-semibold text-slate-700">{b}</td>
                          <td className="border-b border-slate-200 px-1 py-1 text-center">
                            <input
                              type="number"
                              className="w-[72px] rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold text-slate-950 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              value={100 + growthRateByBrand[b]}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                if (!Number.isFinite(raw)) return;
                                setGrowthRateByBrand((prev) => ({ ...prev, [b]: raw - 100 }));
                              }}
                              step={1}
                            />
                            <span className="ml-0.5 text-xs text-slate-500">%</span>
                          </td>
                          <td className="border-b border-slate-200 px-1 py-1 text-center">
                            <input
                              type="number"
                              className="w-[72px] rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm font-semibold text-slate-950 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              value={100 + growthRateHqByBrand[b]}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                if (!Number.isFinite(raw)) return;
                                setGrowthRateHqByBrand((prev) => ({ ...prev, [b]: raw - 100 }));
                              }}
                              step={1}
                            />
                            <span className="ml-0.5 text-xs text-slate-500">%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="min-w-0 lg:col-span-2">
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm font-semibold tracking-tight text-slate-900">재고관련 주요지표</div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
                  <table key={`dependent-driver-${DRIVER_COLUMN_HEADERS.join('|')}`} className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="min-w-[140px] border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-white">항목</th>
                        <th rowSpan={2} className="min-w-[90px] border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white">전년</th>
                        <th colSpan={2} className="border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white">계획</th>
                        <th colSpan={4} className="border border-[#2e3d5f] bg-[#1f2a44] px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white">Rolling</th>
                      </tr>
                      <tr>
                        <th className="min-w-[90px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">금액</th>
                        <th className="min-w-[70px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">YOY</th>
                        <th className="min-w-[90px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">금액</th>
                        <th className="min-w-[70px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">YOY</th>
                        <th className="min-w-[100px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">계획대비 증감</th>
                        <th className="min-w-[100px] border border-[#3b4b6f] bg-[#2a3654] px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white">계획대비 증감(%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEPENDENT_DRIVER_ROWS.map((rowLabel, rowIndex) => {
                        const isBrandOpen = dependentDriverBrandOpen[rowLabel] ?? false;
                        const pickRolling = (row: typeof hqDriverTotalRow) =>
                          rowIndex === 0 ? row?.sellOutTotal : rowIndex === 1 ? row?.sellInTotal : row?.closing;
                        const pickPrev = (row: typeof prevYearHqDriverTotalRow) =>
                          rowIndex === 0 ? row?.sellOutTotal : rowIndex === 1 ? row?.sellInTotal : row?.closing;

                        const planValue = ANNUAL_PLAN_BRANDS.reduce<number | null>((sum, planBrand) => {
                          const value = dependentPlanValues[rowLabel]?.[planBrand];
                          if (value == null || !Number.isFinite(value)) return sum;
                          return (sum ?? 0) + value;
                        }, null);
                        const prevValue = pickPrev(prevYearHqDriverTotalRow);
                        const rollingValue = pickRolling(hqDriverTotalRow);

                        const yoyByPlanVsPrev =
                          planValue != null && prevValue != null && Number.isFinite(planValue) && Number.isFinite(prevValue) && prevValue !== 0
                            ? `${Math.round((planValue / prevValue) * 100).toLocaleString()}%`
                            : '-';
                        const planVsRolling =
                          planValue != null && rollingValue != null && Number.isFinite(planValue) && Number.isFinite(rollingValue) && planValue !== 0
                            ? `${Math.round((rollingValue / planValue) * 100).toLocaleString()}%`
                            : '-';
                        const planVsRollingAmount =
                          planValue != null && rollingValue != null && Number.isFinite(planValue) && Number.isFinite(rollingValue)
                            ? formatDriverNumber(rollingValue - planValue)
                            : '-';

                        return (
                          <React.Fragment key={`derived-${rowLabel}`}>
                            <tr
                              className="bg-white odd:bg-slate-50/70 hover:bg-amber-50/60 cursor-pointer select-none"
                              onClick={() => setDependentDriverBrandOpen((prev) => ({ ...prev, [rowLabel]: !prev[rowLabel] }))}
                            >
                              <td className="border-b border-slate-200 px-3 py-2.5 font-semibold text-slate-700">
                                <span>{rowLabel}</span>
                                <span className="ml-1.5 text-[10px] text-slate-400">{isBrandOpen ? '▲' : '▼'}</span>
                              </td>
                              {DRIVER_COLUMN_HEADERS.map((column, columnIndex) => {
                                const displayValue =
                                  column === '계획금액'
                                    ? (planValue == null ? '-' : formatDriverNumber(planValue))
                                    : column === '계획YOY'
                                      ? yoyByPlanVsPrev
                                      : column === '계획대비 증감'
                                        ? planVsRollingAmount
                                        : column === '계획대비 증감(%)'
                                          ? planVsRolling
                                          : getDependentDriverCellValue(column, columnIndex, rowIndex, hqDriverTotalRow, prevYearHqDriverTotalRow);
                                return (
                                  <td key={`derived-${rowLabel}-${columnIndex}`} className="border-b border-slate-200 px-3 py-2.5 text-right text-sm font-semibold text-slate-950">
                                    {displayValue}
                                  </td>
                                );
                              })}
                            </tr>
                            {isBrandOpen && ANNUAL_PLAN_BRANDS.map((b) => {
                              const brandRow = perBrandTopTable[b]?.hq.rows.find((r) => r.isTotal) ?? null;
                              const prevBrandRow = perBrandPrevYearTableData[b]?.hq.rows.find((r) => r.isTotal) ?? null;
                              const brandPlanValue = dependentPlanValues[rowLabel]?.[b] ?? null;
                              const brandRolling = pickRolling(brandRow);
                              const brandPrev = pickPrev(prevBrandRow);

                              const brandYoy =
                                brandPlanValue != null && brandPrev != null && Number.isFinite(brandPlanValue) && Number.isFinite(brandPrev) && brandPrev !== 0
                                  ? `${Math.round((brandPlanValue / brandPrev) * 100).toLocaleString()}%`
                                  : '-';
                              const brandPlanVsRolling =
                                brandPlanValue != null && brandRolling != null && Number.isFinite(brandPlanValue) && Number.isFinite(brandRolling) && brandPlanValue !== 0
                                  ? `${Math.round((brandRolling / brandPlanValue) * 100).toLocaleString()}%`
                                  : '-';
                              const brandPlanVsRollingAmt =
                                brandPlanValue != null && brandRolling != null && Number.isFinite(brandPlanValue) && Number.isFinite(brandRolling)
                                  ? formatDriverNumber(brandRolling - brandPlanValue)
                                  : '-';

                              return (
                                <tr key={`derived-${rowLabel}-brand-${b}`} className="bg-amber-50/35 hover:bg-amber-50/65">
                                  <td className="border-b border-slate-100 pl-7 pr-3 py-2 text-xs text-slate-600">
                                    <span className="text-slate-400 mr-1">ㄴ</span>{b}
                                  </td>
                                  {DRIVER_COLUMN_HEADERS.map((column, columnIndex) => {
                                    const val =
                                      column === '전년'
                                        ? formatDriverNumber(brandPrev)
                                        : column === '계획금액'
                                          ? (brandPlanValue == null ? '-' : formatDriverNumber(brandPlanValue))
                                          : column === '계획YOY'
                                            ? brandYoy
                                            : column === 'Rolling금액'
                                              ? formatDriverNumber(brandRolling)
                                              : column === 'RollingYOY'
                                                ? (brandRolling != null && brandPrev != null && Number.isFinite(brandRolling) && Number.isFinite(brandPrev) && brandPrev !== 0
                                                  ? `${Math.round((brandRolling / brandPrev) * 100).toLocaleString()}%`
                                                  : '-')
                                                : column === '계획대비 증감'
                                                  ? brandPlanVsRollingAmt
                                                  : column === '계획대비 증감(%)'
                                                    ? brandPlanVsRolling
                                                    : '-';
                                    return (
                                      <td key={`derived-${rowLabel}-brand-${b}-${columnIndex}`} className="border-b border-slate-100 px-3 py-2 text-right text-xs text-slate-700">
                                        {val}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      {false && DEPENDENT_DRIVER_ROWS.map((rowLabel, rowIndex) => (
                        <tr key={rowLabel} className="bg-white hover:bg-slate-50">
                          <td className="border-b border-slate-200 px-3 py-2 font-medium text-slate-700">{rowLabel}</td>
                          {DRIVER_COLUMN_HEADERS.map((column, columnIndex) => (
                            <td key={`${rowLabel}-${columnIndex}`} className="border-b border-slate-200 px-3 py-2 text-right text-slate-900">
                              {column === '전년'
                                ? getDependentDriverCellValue(column, columnIndex, rowIndex, hqDriverTotalRow, prevYearHqDriverTotalRow)
                                : column === 'Rolling금액'
                                ? rowLabel === '대리상출고'
                                  ? formatDriverNumber(hqDriverTotalRow?.sellOutTotal)
                                  : rowLabel === '본사상품매입'
                                    ? formatDriverNumber(hqDriverTotalRow?.sellInTotal)
                                    : formatDriverNumber(hqDriverTotalRow?.closing)
                                : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="mt-5 border-t border-slate-300/80" />
          </div>
        )}

        {/* 브랜드별 토글 헤더 */}
        <div className="mt-3" style={{ paddingLeft: '1.5%', paddingRight: '1.5%' }}>
          <div className="grid grid-cols-3 gap-4">
            {ANNUAL_PLAN_BRANDS.map((b) => {
              const isOpen = inventoryBrandOpen[b];
              return (
                <button
                  key={`inventory-toggle-${b}`}
                  type="button"
                  onClick={() => setInventoryBrandOpen((prev) => ({ ...prev, [b]: !prev[b] }))}
                  className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left shadow-sm hover:bg-slate-50"
                >
                  <span className="text-sm font-semibold text-slate-800">{`${b} 재고자산표`}</span>
                  <span className="text-xs text-slate-500">{isOpen ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 상단 재고자산표: 대리상 3열 (MLB | MLB KIDS | DISCOVERY) */}
        <div className="mt-4" style={{ paddingLeft: '1.5%', paddingRight: '1.5%' }}>
          <div className="grid grid-cols-3 gap-4">
            {ANNUAL_PLAN_BRANDS.map((b) => {
              const displayData = year === 2026
                ? (perBrandTopTableDisplayData[b] ?? perBrandTopTable[b])
                : perBrandTopTable[b];
              const prevData = perBrandPrevYearTableData[b];
              if (!displayData) return <div key={b} className="min-w-0 text-xs text-gray-400 py-8 text-center">로딩 중…</div>;
              return inventoryBrandOpen[b] ? (
                <div key={b} className="min-w-0">
                  <InventoryTable
                    title={`${b} 대리상 (CNY K)`}
                    data={displayData.dealer}
                    year={year}
                    showLegend={b === 'MLB'}
                    sellInLabel="Sell-in"
                    sellOutLabel="Sell-out"
                    tableType="dealer"
                    prevYearData={prevData?.dealer ?? null}
                    onWoiChange={year === 2026 ? handleWoiChange : undefined}
                    prevYearTotalOpening={undefined}
                    prevYearTotalSellIn={prevData?.dealer.rows.find((r) => r.key === '재고자산합계')?.sellInTotal}
                    prevYearTotalSellOut={prevData?.dealer.rows.find((r) => r.key === '재고자산합계')?.sellOutTotal}
                  />
                </div>
              ) : <div key={b} className="min-w-0" />;
            })}
          </div>
        </div>

        {/* 상단 재고자산표: 본사 3열 (MLB | MLB KIDS | DISCOVERY) */}
        <div className="mt-4" style={{ paddingLeft: '1.5%', paddingRight: '1.5%' }}>
          <div className="grid grid-cols-3 gap-4">
            {ANNUAL_PLAN_BRANDS.map((b) => {
              const displayData = year === 2026
                ? (perBrandTopTableDisplayData[b] ?? perBrandTopTable[b])
                : perBrandTopTable[b];
              const prevData = perBrandPrevYearTableData[b];
              if (!displayData) return <div key={b} className="min-w-0 text-xs text-gray-400 py-8 text-center">로딩 중…</div>;
              return inventoryBrandOpen[b] ? (
                <div key={b} className="min-w-0">
                  <InventoryTable
                    title={`${b} 본사 (CNY K)`}
                    data={displayData.hq}
                    year={year}
                    showLegend={b === 'MLB'}
                    sellInLabel="상품매입"
                    sellOutLabel="대리상출고"
                    tableType="hq"
                    prevYearData={prevData?.hq ?? null}
                    onWoiChange={year === 2026 ? handleWoiChange : undefined}
                    prevYearTotalOpening={undefined}
                    prevYearTotalSellIn={prevData?.hq.rows.find((r) => r.key === '재고자산합계')?.sellInTotal}
                    prevYearTotalSellOut={prevData?.hq.rows.find((r) => r.key === '재고자산합계')?.sellOutTotal}
                    prevYearTotalHqSales={prevData?.hq.rows.find((r) => r.key === '재고자산합계')?.hqSalesTotal}
                    bottomContent={year === 2026 ? (
                      <HqHoldingWoiTable values={accHqHoldingWoi} onChange={handleHqHoldingWoiChange} horizontal />
                    ) : undefined}
                  />
                </div>
              ) : <div key={b} className="min-w-0" />;
            })}
          </div>
        </div>

        {year === 2026 && (
          <div className="mt-10 border-t border-gray-300 pt-8">
            {/* 공통 헤더 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnnualPlanOpen((v) => !v)}
                className="flex items-center gap-2 flex-1 text-left py-1"
              >
                <SectionIcon>
                  <span className="text-lg">{TXT_PLAN_ICON}</span>
                </SectionIcon>
                <span className="text-sm font-bold text-gray-700">
                  {TXT_PLAN_SECTION}
                  <span className="mx-2 text-gray-300">|</span>
                  {TXT_OTB_SECTION}
                </span>
                <span className="ml-auto text-gray-400 text-xs shrink-0">
                  {annualPlanOpen ? TXT_COLLAPSE : TXT_EXPAND}
                </span>
              </button>
              {annualPlanOpen && (
                <div className="flex items-center gap-2">
                  {!annualPlanEditMode ? (
                    <button
                      type="button"
                      onClick={handleAnnualPlanEditStart}
                      className="px-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      {TXT_EDIT}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAnnualPlanSave}
                      className="px-3 py-1.5 text-xs rounded border border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      {TXT_SAVE}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 좌우 2분할 */}
            {annualPlanOpen && (
              <div className="mt-3 flex gap-6 items-start">

                {/* 좌: 연간 출고계획 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">{TXT_PLAN_SECTION}</span>
                    <span className="text-xs text-gray-400">{TXT_PLAN_UNIT}</span>
                  </div>
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="min-w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left bg-[#1a2e5a] text-white border border-[#2e4070] min-w-[100px]">{TXT_BRAND}</th>
                          {ANNUAL_PLAN_SEASONS.map((season) => (
                            <th
                              key={season}
                              className="px-3 py-2 text-center bg-[#1a2e5a] text-white border border-[#2e4070] min-w-[80px]"
                            >
                              {ANNUAL_PLAN_SEASON_LABELS[season]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ANNUAL_PLAN_BRANDS.map((planBrand) => (
                          <tr key={planBrand} className="bg-white hover:bg-gray-50">
                            <td className="px-3 py-2 border-b border-gray-200 font-medium text-gray-700">{planBrand}</td>
                            {ANNUAL_PLAN_SEASONS.map((season) => (
                              <td key={`${planBrand}-${season}`} className="px-2 py-1.5 border-b border-gray-200">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={String((annualPlanEditMode ? annualShipmentPlanDraft2026 : annualShipmentPlan2026)[planBrand][season] || 0)}
                                  onChange={(e) => handleAnnualPlanCellChange(planBrand, season, e.target.value)}
                                  disabled={!annualPlanEditMode}
                                  className={`w-full text-right text-xs px-1.5 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-sky-400 ${
                                    annualPlanEditMode ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-600'
                                  }`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 우: 대리상 OTB */}
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">{TXT_OTB_SECTION}</span>
                    <span className="text-xs text-gray-400">{TXT_OTB_UNIT}</span>
                    {!otbEditMode ? (
                      <button
                        type="button"
                        onClick={handleOtbEditStart}
                        className="px-3 py-1 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        {TXT_EDIT}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOtbSave}
                        className="px-3 py-1 text-xs rounded border border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                      >
                        {TXT_SAVE}
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded border border-gray-200">
                    {otbLoading ? (
                      <div className="px-6 py-4 text-xs text-gray-400">불러오는 중...</div>
                    ) : otbError ? (
                      <div className="px-6 py-4 text-xs text-red-500">{otbError}</div>
                    ) : (
                      <table className="border-collapse text-xs">
                        <thead>
                          <tr>
                            <th className="px-3 py-2 text-left bg-[#2e4a2e] text-white border border-[#3d6b3d] min-w-[60px]">{TXT_SEASON}</th>
                            {ANNUAL_PLAN_BRANDS.map((b) => (
                              <th key={b} className="px-3 py-2 text-center bg-[#2e4a2e] text-white border border-[#3d6b3d] min-w-[90px]">
                                {b}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {OTB_SEASONS_LIST.map((sesn) => (
                            <tr key={sesn} className="bg-white hover:bg-gray-50">
                              <td className="px-3 py-2 border-b border-gray-200 font-medium text-gray-700">{sesn}</td>
                              {ANNUAL_PLAN_BRANDS.map((b) => {
                                const activeData = otbEditMode ? otbDraft : otbData;
                                const raw = activeData?.[sesn]?.[b] ?? 0;
                                const valueK = Math.round(raw / 1000);
                                return (
                                  <td key={b} className="px-2 py-1.5 border-b border-gray-200">
                                    {otbEditMode ? (
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={String(valueK)}
                                        onChange={(e) => {
                                          const n = parseInt(e.target.value.replace(/[^\d-]/g, ''), 10);
                                          handleOtbCellChange(sesn, b as OtbBrand, Number.isNaN(n) ? 0 : n);
                                        }}
                                        className="w-full text-right text-xs px-1.5 py-1 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                                      />
                                    ) : (
                                      <span className="block text-right text-gray-700 tabular-nums">
                                        {valueK === 0 ? '-' : valueK.toLocaleString()}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    ※ MLB·MLB KIDS·DISCOVERY: 별도 목표 적용
                  </p>
                </div>

              </div>
            )}
          </div>
        )}

        {year === 2026 && (
          <div className="mt-10 border-t border-gray-300 pt-8">
            <button
              type="button"
              onClick={() => setDependentPlanOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left py-1"
            >
              <SectionIcon>
                <span className="text-lg">◫</span>
              </SectionIcon>
              <span className="text-sm font-bold text-slate-900">종속변수 계획값</span>
              <span className="ml-auto text-gray-400 text-xs shrink-0">
                {dependentPlanOpen ? TXT_COLLAPSE : TXT_EXPAND}
              </span>
            </button>
            <div className={`${dependentPlanOpen ? 'mt-3' : 'hidden'} overflow-x-auto rounded-xl border border-slate-200 shadow-inner`}>
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="min-w-[140px] border border-slate-300 bg-slate-900 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-white">항목</th>
                    {ANNUAL_PLAN_BRANDS.map((brand) => (
                      <th
                        key={`dependent-plan-header-${brand}`}
                        className="min-w-[100px] border border-slate-300 bg-slate-900 px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-white"
                      >
                        {brand}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEPENDENT_DRIVER_ROWS.map((rowLabel) => (
                    <tr key={`dependent-plan-row-${rowLabel}`} className="bg-white odd:bg-slate-50/80">
                      <td className="border-b border-slate-200 px-3 py-2.5 font-semibold text-slate-700">{rowLabel}</td>
                      {ANNUAL_PLAN_BRANDS.map((brand) => {
                        const value = dependentPlanValues[rowLabel]?.[brand];
                        return (
                          <td
                            key={`dependent-plan-cell-${rowLabel}-${brand}`}
                            className={`border-b border-slate-200 px-3 py-2.5 text-right ${value == null ? 'text-gray-300' : 'text-slate-900'}`}
                          >
                            {value == null ? '-' : formatDriverNumber(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 대리상 리테일매출(보정) */}
        {year === 2025 && ANNUAL_PLAN_BRANDS.some((b) => perBrand2025AdjustedDealerRetailTable[b]) && (
          <div className="mt-10 border-t border-gray-300 pt-8">
            <button
              type="button"
              onClick={() => setAdjustedRetailOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left py-1"
            >
              <SectionIcon>
                <span className="text-lg">💤</span>
              </SectionIcon>
              <span className="text-sm font-bold text-gray-700">대리상 리테일매출</span>
              <span className="text-xs font-normal text-gray-400">(단위: CNY K)</span>
              <span className="text-xs font-normal text-orange-500 ml-1">월별 = 기초재고 + 출고 − 기말재고</span>
              <span className="ml-auto text-gray-400 text-xs shrink-0">
                {adjustedRetailOpen ? '접기' : '펼치기'}
              </span>
            </button>
            {adjustedRetailOpen && (
              <div className="mt-3">
                {ANNUAL_PLAN_BRANDS.map((b) => {
                  const tableData = perBrand2025AdjustedDealerRetailTable[b];
                  if (!tableData) return null;
                  return (
                    <div key={b} className={b === 'MLB' ? '' : 'mt-6'}>
                      <div className="text-sm font-bold text-gray-800 mb-1 pt-1 border-t border-gray-400">{b}</div>
                      <InventoryMonthlyTable
                        firstColumnHeader="대리상 리테일매출"
                        data={tableData}
                        year={year}
                        showOpening={false}
                        annualTotalByRowKey={perBrand2025AdjustedRetailAnnualByKey[b] ?? undefined}
                        validationHeader="검증(월합-연간)"
                        validationByRowKey={perBrand2025RetailDealerValidationByKey[b] ?? undefined}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 월별 재고잔액 */}

        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setMonthlyOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📦</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">월별 재고잔액</span>
            <span className="text-xs font-normal text-gray-400">
              {year === 2025 ? '(단위: CNY K / 실적: 1~12월)' : `(단위: CNY K / 실적 기준: ~${monthlyData?.closedThrough ?? '--'})`}
            </span>
            {monthlyPlanSummaryText && (
              <span className="text-xs font-normal text-red-600">
                {monthlyPlanSummaryText}
              </span>
            )}
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {monthlyOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {monthlyError && !monthlyOpen && (
            <p className="text-red-500 text-xs mt-1">{monthlyError}</p>
          )}
          {monthlyOpen && (
            <>
              {monthlyPlanLegendText && (
                <div className="mt-2 ml-7 mr-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {monthlyPlanLegendText}
                </div>
              )}
              {monthlyLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {monthlyError && (
                <div className="py-8 text-center text-red-500 text-sm">{monthlyError}</div>
              )}
              {!monthlyLoading && ANNUAL_PLAN_BRANDS.map((b) => {
                const brandMonthly = monthlyDataByBrand[b];
                if (!brandMonthly || brandMonthly.dealer.rows.length === 0) return null;
                const dealerData = (year === 2026 ? perBrandDealerMonthlyDisplayData[b] : null) ?? (brandMonthly.dealer as TableData);
                const hqData = (year === 2026 ? perBrandHqMonthlyDisplayData[b] : null) ?? (brandMonthly.hq as TableData);
                return (
                  <div key={b} className={b === 'MLB' ? '' : 'mt-8'}>
                    <div className="text-sm font-bold text-gray-800 mb-1 pt-1 border-t border-gray-400">{b}</div>
                    <InventoryMonthlyTable
                      firstColumnHeader="대리상"
                      data={dealerData}
                      year={year}
                      showOpening={true}
                      showAnnualTotal={false}
                      planFromMonth={year === 2026 ? shipmentPlanFromMonth : undefined}
                    />
                    <InventoryMonthlyTable
                      firstColumnHeader="본사"
                      data={hqData}
                      year={year}
                      showOpening={true}
                      showAnnualTotal={false}
                      planFromMonth={year === 2026 ? shipmentPlanFromMonth : undefined}
                      headerBg="#4db6ac"
                      headerBorderColor="#2a9d8f"
                      totalRowCls="bg-teal-50"
                    />
                  </div>
                );
              })}
              {!monthlyLoading && ANNUAL_PLAN_BRANDS.every((b) => {
                const d = monthlyDataByBrand[b];
                return !d || d.dealer.rows.length === 0;
              }) && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 由ы뀒??留ㅼ텧 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setRetailOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📊</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">{year === 2025 ? '본사 리테일매출' : '리테일 매출'}</span>
            <span className="text-xs font-normal text-gray-400">
              {year === 2025 ? '(단위: CNY K / 실적: 1~12월)' : year === 2026 ? '(단위: CNY K / 실적: 1~2월, 3~12월 성장률 보정)' : `(단위: CNY K / 실적 기준: ~${retailData?.closedThrough ?? '--'})`}
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {retailOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {year === 2026 && (
            <div className="mt-1 pl-7 text-xs text-red-600">
              대리상: 실적월까지 당해 실적, 이후는 전년(2025 보정 대리상 리테일) x 성장률 / 직영: 실적월까지 당해 실적, 이후는 전년 본사 리테일 x 본사 성장률
            </div>
          )}
          {year === 2026 && brand === 'MLB' && (
            <div className="mt-1 pl-7 text-xs text-amber-700 font-medium">
              ※ 대리상 1년차 연간합계: MLB 별도 목표 적용 ({MLB_1YEAR_OVERRIDE_K.toLocaleString()}K)
            </div>
          )}
          {retailError && !retailOpen && (
            <p className="text-red-500 text-xs mt-1">{retailError}</p>
          )}
          {retailOpen && (
            <>
              {retailLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {retailError && (
                <div className="py-8 text-center text-red-500 text-sm">{retailError}</div>
              )}
              {!retailLoading && ANNUAL_PLAN_BRANDS.map((b) => {
                const brandRetail = retailDataByBrand[b];
                if (!brandRetail || brandRetail.dealer.rows.length === 0) return null;
                const dealerData = (year === 2026 ? perBrandAdjustedDealerRetailData[b] : null) ?? (brandRetail.dealer as TableData);
                const hqData = (year === 2026 ? perBrandAdjustedHqRetailData[b] : null) ?? (brandRetail.hq as TableData);
                return (
                  <div key={b} className={b === 'MLB' ? '' : 'mt-8'}>
                    <div className="text-sm font-bold text-gray-800 mb-1 pt-1 border-t border-gray-400">{b}</div>
                    {year !== 2025 && (
                      <InventoryMonthlyTable
                        firstColumnHeader="대리상"
                        data={dealerData}
                        year={year}
                        showOpening={false}
                        planFromMonth={brandRetail.planFromMonth}
                        annualTotalByRowKey={year === 2026 ? (perBrandRetailDealerAnnualByKey[b] ?? undefined) : undefined}
                        validationHeader={year === 2026 ? '검증(월합-연간)' : undefined}
                        validationByRowKey={year === 2026 ? (perBrandRetailDealerValidationByKey[b] ?? undefined) : undefined}
                      />
                    )}
                    <InventoryMonthlyTable
                      firstColumnHeader="본사"
                      data={hqData}
                      year={year}
                      showOpening={false}
                      planFromMonth={year === 2025 ? undefined : brandRetail.planFromMonth}
                      annualTotalByRowKey={year === 2026 ? (perBrandRetailHqAnnualByKey[b] ?? undefined) : undefined}
                      validationHeader={year === 2026 ? '검증(월합-연간)' : undefined}
                      validationByRowKey={year === 2026 ? (perBrandRetailHqValidationByKey[b] ?? undefined) : undefined}
                      headerBg="#4db6ac"
                      headerBorderColor="#2a9d8f"
                      totalRowCls="bg-teal-50"
                    />
                  </div>
                );
              })}
              {!retailLoading && ANNUAL_PLAN_BRANDS.every((b) => {
                const d = retailDataByBrand[b];
                return !d || d.dealer.rows.length === 0;
              }) && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 蹂몄궗?믩?由ъ긽 異쒓퀬留ㅼ텧 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setShipmentOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">🚚</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">본사→대리상 출고매출</span>
            <span className="text-xs font-normal text-gray-400">
              {year === 2025 ? '(단위: CNY K / 실적: 1~12월)' : `(단위: CNY K / 실적 기준: ~${shipmentData?.closedThrough ?? '--'})`}
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {shipmentOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {year === 2026 && shipmentPlanFromMonth != null && (
            <div className="mt-1 pl-7 text-xs text-red-600">
              본사→대리상 출고매출 표만 예외적으로 PL 실적월 이후는 PL 의류 출고진척률 / ACC 출고비율로 월 배분
            </div>
          )}
          {shipmentError && !shipmentOpen && (
            <p className="text-red-500 text-xs mt-1">{shipmentError}</p>
          )}
          {shipmentOpen && (
            <>
              {shipmentLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {shipmentError && (
                <div className="py-8 text-center text-red-500 text-sm">{shipmentError}</div>
              )}
              {!shipmentLoading && ANNUAL_PLAN_BRANDS.map((b) => {
                const brandShipment = shipmentDataByBrand[b];
                if (!brandShipment || brandShipment.data.rows.length === 0) return null;
                const displayData = (year === 2026 ? perBrandShipmentDisplayData[b] : null) ?? (brandShipment.data as TableData);
                return (
                  <div key={b} className={b === 'MLB' ? '' : 'mt-6'}>
                    <InventoryMonthlyTable
                      firstColumnHeader={`${b} 출고`}
                      data={displayData}
                      year={year}
                      showOpening={false}
                      planFromMonth={year === 2026 ? shipmentPlanFromMonth : undefined}
                      validationHeader={year === 2026 ? '검증' : undefined}
                      validationByRowKey={year === 2026 ? (() => {
                        const result: Record<string, number | null> = {};
                        for (const row of displayData.rows) result[row.key] = 0;
                        return result;
                      })() : undefined}
                      headerBg="#4db6ac"
                      headerBorderColor="#2a9d8f"
                      totalRowCls="bg-teal-50"
                    />
                  </div>
                );
              })}
              {!shipmentLoading && ANNUAL_PLAN_BRANDS.every((b) => {
                const d = shipmentDataByBrand[b];
                return !d || d.data.rows.length === 0;
              }) && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 蹂몄궗 留ㅼ엯?곹뭹 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setPurchaseOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📥</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">본사 매입상품</span>
            <span className="text-xs font-normal text-gray-400">
              {year === 2025 ? '(단위: CNY K / 실적: 1~12월)' : `(단위: CNY K / 실적 기준: ~${purchaseData?.closedThrough ?? '--'})`}
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {purchaseOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {year === 2026 && shipmentPlanFromMonth != null && (
            <div className="mt-1 pl-7 text-xs text-red-600">
              본사 매입상품은 1월 실적 유지, 2월(F)부터는 남은 연간매입계획(연간합계-1월 실적)을 본사→대리상 출고매출의 2~12월 행별 비중으로 배분
            </div>
          )}
          {purchaseError && !purchaseOpen && (
            <p className="text-red-500 text-xs mt-1">{purchaseError}</p>
          )}
          {purchaseOpen && (
            <>
              {purchaseLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {purchaseError && (
                <div className="py-8 text-center text-red-500 text-sm">{purchaseError}</div>
              )}
              {!purchaseLoading && ANNUAL_PLAN_BRANDS.map((b) => {
                const brandPurchase = purchaseDataByBrand[b];
                if (!brandPurchase || brandPurchase.data.rows.length === 0) return null;
                const displayData = (year === 2026 ? perBrandPurchaseDisplayData[b] : null) ?? (brandPurchase.data as TableData);
                return (
                  <div key={b} className={b === 'MLB' ? '' : 'mt-6'}>
                    <InventoryMonthlyTable
                      firstColumnHeader={`${b} 본사 매입`}
                      data={displayData}
                      year={year}
                      showOpening={false}
                      planFromMonth={year === 2026 ? shipmentPlanFromMonth : undefined}
                      annualTotalByRowKey={year === 2026 ? (perBrandPurchaseAnnualByKey[b] ?? undefined) : undefined}
                      validationHeader={year === 2026 ? '검증' : undefined}
                      validationByRowKey={year === 2026 ? (perBrandPurchaseValidationByKey[b] ?? undefined) : undefined}
                      headerBg="#4db6ac"
                      headerBorderColor="#2a9d8f"
                      totalRowCls="bg-teal-50"
                    />
                  </div>
                );
              })}
              {!purchaseLoading && ANNUAL_PLAN_BRANDS.every((b) => {
                const d = purchaseDataByBrand[b];
                return !d || d.data.rows.length === 0;
              }) && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
