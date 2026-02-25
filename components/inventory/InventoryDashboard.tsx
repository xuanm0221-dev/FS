'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand, InventoryApiResponse, AccKey, ACC_KEYS, RowKey } from '@/lib/inventory-types';
import { MonthlyStockResponse } from '@/lib/inventory-monthly-types';
import { RetailSalesResponse } from '@/lib/retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';
import { buildTableDataFromMonthly } from '@/lib/build-inventory-from-monthly';
import { applyAccTargetWoiOverlay, applyHqSellInSellOutPlanOverlay } from '@/lib/inventory-calc';
import {
  saveSnapshot,
  loadSnapshot,
  mergeLatestMonthIntoSnapshot,
  getLatestActualMonthIdx,
  type SnapshotData,
} from '@/lib/inventory-snapshot';
import { stripPlanMonths, applyPlanToSnapshot, PLAN_FROM_MONTH } from '@/lib/retail-plan';
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

const ICON_BG = 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)';

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl w-8 h-8 flex-shrink-0 shadow-sm border border-sky-200/60"
      style={{ background: ICON_BG }}
    >
      {children}
    </div>
  );
}

export default function InventoryDashboard() {
  const [year, setYear] = useState<number>(2026);
  const [brand, setBrand] = useState<Brand>('전체');
  const [growthRate, setGrowthRate] = useState<number>(5);

  // 기존 Sell-in/Sell-out 표 데이터
  const [data, setData] = useState<InventoryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 월별 재고잔액 표 데이터
  const [monthlyData, setMonthlyData] = useState<MonthlyStockResponse | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  // 리테일 매출 표 데이터
  const [retailData, setRetailData] = useState<RetailSalesResponse | null>(null);
  const [retailLoading, setRetailLoading] = useState<boolean>(false);
  const [retailError, setRetailError] = useState<string | null>(null);

  // 본사→대리상 출고매출 표 데이터
  const [shipmentData, setShipmentData] = useState<ShipmentSalesResponse | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState<boolean>(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

  // 본사 매입상품 표 데이터
  const [purchaseData, setPurchaseData] = useState<PurchaseResponse | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState<boolean>(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // 월별 섹션 토글 (기본 접힘)
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [retailOpen, setRetailOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // 스냅샷 상태
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  // 2026 ACC 기말 목표 재고주수 (대리상/본사별 신발·모자·가방·기타)
  const [accTargetWoiDealer, setAccTargetWoiDealer] = useState<Record<AccKey, number>>({
    신발: 29, 모자: 29, 가방: 25, 기타: 39,
  });
  const [accTargetWoiHq, setAccTargetWoiHq] = useState<Record<AccKey, number>>({
    신발: 10, 모자: 8, 가방: 10, 기타: 10,
  });
  const accTargetWoiDealerRef = useRef(accTargetWoiDealer);
  const accTargetWoiHqRef = useRef(accTargetWoiHq);
  useEffect(() => {
    accTargetWoiDealerRef.current = accTargetWoiDealer;
  }, [accTargetWoiDealer]);
  useEffect(() => {
    accTargetWoiHqRef.current = accTargetWoiHq;
  }, [accTargetWoiHq]);
  // 2026 본사 상품매입·대리상출고 편집 계획 (연간 K). 2025는 사용하지 않음.
  const [hqSellInPlan, setHqSellInPlan] = useState<Partial<Record<RowKey, number>>>({});
  const [hqSellOutPlan, setHqSellOutPlan] = useState<Partial<Record<RowKey, number>>>({});
  // 2026 재고자산표 편집 모드 (수정 클릭 시에만 편집 가능한 박스 표시)
  const [editMode, setEditMode] = useState(false);
  // 2026 계획월 계산용 2025 실적 보관 (API 응답에 포함됨)
  const retail2025Ref = useRef<RetailSalesResponse['retail2025'] | null>(null);

  const DEFAULT_ACC_WOI_DEALER: Record<AccKey, number> = { 신발: 29, 모자: 29, 가방: 25, 기타: 39 };
  const DEFAULT_ACC_WOI_HQ: Record<AccKey, number> = { 신발: 10, 모자: 8, 가방: 10, 기타: 10 };

  // ── 기존 표 fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        growthRate: String(growthRate),
        brand,
      });
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error('데이터 로드 실패');
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [year, brand, growthRate]);

  // ── 월별 재고잔액 fetch ──
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
        const jsons = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if (j.error) throw new Error(j.error);
        setMonthlyData(aggregateMonthlyStock(jsons));
      } else {
        const res = await fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand })}`);
        if (!res.ok) throw new Error('월별 데이터 로드 실패');
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setMonthlyData(json);
      }
    } catch (e) {
      setMonthlyError(String(e));
    } finally {
      setMonthlyLoading(false);
    }
  }, [year, brand]);

  // ── 리테일 매출 fetch ──
  const fetchRetailData = useCallback(async () => {
    setRetailLoading(true);
    setRetailError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand: b, growthRate: String(growthRate) })}`),
          ),
        );
        const jsons: RetailSalesResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error);
        const aggregated = aggregateRetailSales(jsons);
        if (aggregated.retail2025) retail2025Ref.current = aggregated.retail2025;
        setRetailData(aggregated);
      } else {
        const res = await fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand, growthRate: String(growthRate) })}`);
        if (!res.ok) throw new Error('리테일 매출 데이터 로드 실패');
        const json: RetailSalesResponse = await res.json();
        if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
        if (json.retail2025) retail2025Ref.current = json.retail2025;
        setRetailData(json);
      }
    } catch (e) {
      setRetailError(String(e));
    } finally {
      setRetailLoading(false);
    }
  }, [year, brand, growthRate]);

  // ── 출고매출 fetch ──
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
        const jsons = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if (j.error) throw new Error(j.error ?? '출고매출 데이터 로드 실패');
        setShipmentData(aggregateShipmentSales(jsons));
      } else {
        const res = await fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand })}`);
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? '출고매출 데이터 로드 실패');
        setShipmentData(json);
      }
    } catch (e) {
      setShipmentError(String(e));
    } finally {
      setShipmentLoading(false);
    }
  }, [year, brand]);

  // ── 본사 매입상품 fetch ──
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
        const jsons = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if (j.error) throw new Error(j.error ?? '매입상품 데이터 로드 실패');
        setPurchaseData(aggregatePurchase(jsons));
      } else {
        const res = await fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand })}`);
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? '매입상품 데이터 로드 실패');
        setPurchaseData(json);
      }
    } catch (e) {
      setPurchaseError(String(e));
    } finally {
      setPurchaseLoading(false);
    }
  }, [year, brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 스냅샷이 있으면 API 생략, 없으면 4개 API 호출 (전체 탭은 스냅샷 미사용, 항상 API 집계)
  useEffect(() => {
    if (brand === '전체') {
      setSnapshotSaved(false);
      setSnapshotSavedAt(null);
      fetchMonthlyData();
      fetchRetailData();
      fetchShipmentData();
      fetchPurchaseData();
      return;
    }
    const snap = loadSnapshot(year, brand);
    if (snap) {
      setMonthlyData(snap.monthly);
      setShipmentData(snap.shipment);
      setPurchaseData(snap.purchase);
      if (snap.hqSellInPlan && Object.keys(snap.hqSellInPlan).length) setHqSellInPlan(snap.hqSellInPlan);
      if (snap.hqSellOutPlan && Object.keys(snap.hqSellOutPlan).length) setHqSellOutPlan(snap.hqSellOutPlan);
      if (snap.accTargetWoiDealer) setAccTargetWoiDealer(snap.accTargetWoiDealer);
      if (snap.accTargetWoiHq) setAccTargetWoiHq(snap.accTargetWoiHq);
      // 계획월은 현재 growthRate로 동적 재계산
      if (year === 2026 && snap.planFromMonth && snap.retail2025) {
        retail2025Ref.current = snap.retail2025;
        setRetailData(
          applyPlanToSnapshot(snap.retailActuals, snap.retail2025 as RetailSalesResponse, snap.planFromMonth, growthRate),
        );
      } else {
        setRetailData(snap.retailActuals);
      }
      setSnapshotSaved(true);
      setSnapshotSavedAt(snap.savedAt);
      return;
    }
    // 스냅샷 없음 → API 호출
    setSnapshotSaved(false);
    setSnapshotSavedAt(null);
    fetchMonthlyData();
    fetchRetailData();
    fetchShipmentData();
    fetchPurchaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, brand]); // growthRate는 의도적으로 제외

  useEffect(() => {
    setEditMode(false);
  }, [year, brand]);

  // growthRate 변경 시 — 스냅샷 로드 상태이면 계획월만 재계산 (API 없음)
  useEffect(() => {
    if (!snapshotSaved) return;
    const snap = loadSnapshot(year, brand);
    if (!snap || year !== 2026 || !snap.planFromMonth || !snap.retail2025) return;
    setRetailData(
      applyPlanToSnapshot(snap.retailActuals, snap.retail2025 as RetailSalesResponse, snap.planFromMonth, growthRate),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthRate]);

  // 2025·2026일 때 상단 표는 월별 재고잔액 + 리테일 매출 + 출고매출 + 매입상품으로 구성
  // 2026일 때만 ACC 목표 재고주수 오버레이 적용
  const topTableData = useMemo(() => {
    if (
      (year !== 2025 && year !== 2026) ||
      !monthlyData ||
      !retailData ||
      !shipmentData ||
      monthlyData.dealer.rows.length === 0 ||
      retailData.dealer.rows.length === 0 ||
      shipmentData.data.rows.length === 0
    ) {
      return null;
    }
    const built = buildTableDataFromMonthly(
      monthlyData,
      retailData,
      shipmentData,
      purchaseData ?? undefined,
      year,
    );
    if (year === 2026 && brand !== '전체') {
      const withWoi = applyAccTargetWoiOverlay(
        built.dealer,
        built.hq,
        retailData,
        accTargetWoiDealer,
        accTargetWoiHq,
        year,
      );
      return applyHqSellInSellOutPlanOverlay(
        withWoi.dealer,
        withWoi.hq,
        hqSellInPlan,
        hqSellOutPlan,
        year,
      );
    }
    return built;
  }, [year, brand, monthlyData, retailData, shipmentData, purchaseData, accTargetWoiDealer, accTargetWoiHq, hqSellInPlan, hqSellOutPlan]);

  const dealerTableData = topTableData?.dealer ?? data?.dealer ?? null;
  const hqTableData = topTableData?.hq ?? data?.hq ?? null;

  // 2026 ACC 행 재고주수 편집 시 상태 반영 (표 셀 또는 기본값 블록과 연동)
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

  // 2026 본사 상품매입(연간) 편집
  const handleHqSellInChange = useCallback((rowKey: RowKey, newSellInTotal: number) => {
    setHqSellInPlan((prev) => ({ ...prev, [rowKey]: newSellInTotal }));
  }, []);

  // 2026 본사 대리상출고(연간) 편집 — 대리상 표 Sell-in에 자동 반영
  const handleHqSellOutChange = useCallback((rowKey: RowKey, newSellOutTotal: number) => {
    setHqSellOutPlan((prev) => ({ ...prev, [rowKey]: newSellOutTotal }));
  }, []);

  // ── 스냅샷 저장 ──
  const handleSave = useCallback(() => {
    if (!monthlyData || !retailData || !shipmentData || !purchaseData) return;
    const retailActuals =
      year === 2026 && retailData.planFromMonth
        ? stripPlanMonths(retailData, retailData.planFromMonth)
        : retailData;
    const snap: SnapshotData = {
      monthly: monthlyData,
      retailActuals,
      retail2025: retail2025Ref.current ?? null,
      shipment: shipmentData,
      purchase: purchaseData,
      savedAt: new Date().toISOString(),
      planFromMonth: retailData.planFromMonth,
    };
    if (year === 2026) {
      snap.hqSellInPlan = Object.keys(hqSellInPlan).length ? hqSellInPlan : undefined;
      snap.hqSellOutPlan = Object.keys(hqSellOutPlan).length ? hqSellOutPlan : undefined;
      snap.accTargetWoiDealer = accTargetWoiDealerRef.current;
      snap.accTargetWoiHq = accTargetWoiHqRef.current;
    }
    saveSnapshot(year, brand, snap);
    setSnapshotSaved(true);
    setSnapshotSavedAt(snap.savedAt);
    setEditMode(false);
  }, [year, brand, monthlyData, retailData, shipmentData, purchaseData, hqSellInPlan, hqSellOutPlan]);

  // ── 2026 편집값 초기값 리셋 ──
  const handleResetToDefault = useCallback(() => {
    setHqSellInPlan({});
    setHqSellOutPlan({});
    setAccTargetWoiDealer(DEFAULT_ACC_WOI_DEALER);
    setAccTargetWoiHq(DEFAULT_ACC_WOI_HQ);
    setEditMode(false);
  }, []);

  // ── 재계산 ──
  const handleRecalc = useCallback(async (mode: 'current' | 'annual') => {
    setRecalcLoading(true);
    try {
      if (mode === 'annual') {
        // 연간: 4개 API 전체 재호출 → 완료 후 스냅샷 교체
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        // fetchRetailData 내에서 상태 업데이트가 되므로 잠시 후 저장
        // (setTimeout 없이는 최신 state를 바로 읽기 어려워 별도 저장 로직 사용)
        setSnapshotSaved(false); // 저장 버튼 다시 활성화 (사용자가 확인 후 저장)
      } else {
        // 당월: onlyLatest=true API 3개 호출 → 최신 월 컬럼만 병합
        const p = new URLSearchParams({ year: String(year), brand, onlyLatest: 'true' });
        const [fm, fs, fp] = await Promise.all([
          fetch(`/api/inventory/monthly-stock?${p}`).then((r) => r.json() as Promise<MonthlyStockResponse>),
          fetch(`/api/inventory/shipment-sales?${p}`).then((r) => r.json() as Promise<ShipmentSalesResponse>),
          fetch(`/api/inventory/purchase?${p}`).then((r) => r.json() as Promise<PurchaseResponse>),
        ]);
        const snap = loadSnapshot(year, brand);
        if (!snap) {
          // 스냅샷 없으면 전체 API 호출
          await Promise.all([fetchMonthlyData(), fetchShipmentData(), fetchPurchaseData()]);
          setSnapshotSaved(false);
          return;
        }
        const latestIdx = getLatestActualMonthIdx(year, fm.closedThrough);
        const merged = mergeLatestMonthIntoSnapshot(snap, { monthly: fm, shipment: fs, purchase: fp }, latestIdx);
        setMonthlyData(merged.monthly);
        setShipmentData(merged.shipment);
        setPurchaseData(merged.purchase);
        saveSnapshot(year, brand, merged);
        setSnapshotSavedAt(merged.savedAt);
        setSnapshotSaved(true);
      }
    } catch (e) {
      console.error('[recalc] error:', e);
    } finally {
      setRecalcLoading(false);
    }
  }, [year, brand, fetchMonthlyData, fetchRetailData, fetchShipmentData, fetchPurchaseData]);

  return (
    <div className="bg-gray-50 overflow-auto h-[calc(100vh-64px)]">
      <InventoryFilterBar
        year={year}
        brand={brand}
        growthRate={growthRate}
        onYearChange={setYear}
        onBrandChange={setBrand}
        onGrowthRateChange={setGrowthRate}
        snapshotSaved={snapshotSaved}
        snapshotSavedAt={snapshotSavedAt}
        recalcLoading={recalcLoading}
        onSave={handleSave}
        onRecalc={handleRecalc}
        canSave={!!(monthlyData && retailData && shipmentData && purchaseData)}
        editMode={year === 2026 && brand !== '전체' ? editMode : false}
        onEditModeEnter={year === 2026 && brand !== '전체' ? () => setEditMode(true) : undefined}
        onResetToDefault={year === 2026 && brand !== '전체' ? handleResetToDefault : undefined}
      />

      <div className="px-6 py-5">
        {/* ── 기존 Sell-in / Sell-out 표 ── */}
        {loading && !dealerTableData && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            로딩 중...
          </div>
        )}
        {error && !dealerTableData && (
          <div className="py-10 text-center text-red-500 text-sm">{error}</div>
        )}
        {dealerTableData && hqTableData && (
          <>
            <div className="flex flex-wrap gap-6 items-stretch">
            <div className="min-w-0 flex-1 flex flex-col" style={{ minWidth: '320px' }}>
              <InventoryTable
                title="대리상 (CNY K)"
                data={dealerTableData!}
                year={year}
                editMode={year === 2026 && brand !== '전체' ? editMode : false}
                sellInLabel="Sell-in"
                sellOutLabel="Sell-out"
                tableType="dealer"
                onWoiChange={year === 2026 && brand !== '전체' ? handleWoiChange : undefined}
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col" style={{ minWidth: '320px' }}>
              <InventoryTable
                title="본사 (CNY K)"
                titleNote={year === 2026 && brand !== '전체' ? '편집가능: 의류 상품매입, 대리상출고 | ACC: 재고주수' : undefined}
                data={hqTableData!}
                year={year}
                editMode={year === 2026 && brand !== '전체' ? editMode : false}
                sellInLabel="상품매입"
                sellOutLabel="대리상출고"
                tableType="hq"
                onWoiChange={year === 2026 && brand !== '전체' ? handleWoiChange : undefined}
                onHqSellInChange={year === 2026 && brand !== '전체' ? handleHqSellInChange : undefined}
                onHqSellOutChange={year === 2026 && brand !== '전체' ? handleHqSellOutChange : undefined}
              />
            </div>
          </div>
          </>
        )}

        {/* ── 월별 재고잔액 표 ── */}
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
              (단위: CNY K / 실적 기준: ~{monthlyData?.closedThrough ?? '…'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {monthlyOpen ? '▲ 접기' : '▼ 펼치기'}
            </span>
          </button>
          {monthlyError && !monthlyOpen && (
            <p className="text-red-500 text-xs mt-1">{monthlyError}</p>
          )}
          {monthlyOpen && (
            <>
              {monthlyLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {monthlyError && (
                <div className="py-8 text-center text-red-500 text-sm">{monthlyError}</div>
              )}
              {monthlyData && !monthlyLoading && monthlyData.dealer.rows.length > 0 && (
                <>
                  <InventoryMonthlyTable
                    firstColumnHeader="대리상"
                    data={monthlyData.dealer as TableData}
                    year={year}
                    showOpening={true}
                  />
                  <InventoryMonthlyTable
                    firstColumnHeader="본사"
                    data={monthlyData.hq as TableData}
                    year={year}
                    showOpening={true}
                    headerBg="#4db6ac"
                    headerBorderColor="#2a9d8f"
                    totalRowCls="bg-teal-50"
                  />
                </>
              )}
              {monthlyData && !monthlyLoading && monthlyData.dealer.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 리테일 매출 표 ── */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setRetailOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📊</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">리테일 매출</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{retailData?.closedThrough ?? '…'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {retailOpen ? '▲ 접기' : '▼ 펼치기'}
            </span>
          </button>
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
              {retailData && !retailLoading && retailData.dealer.rows.length > 0 && (
                <>
                  <InventoryMonthlyTable
                    firstColumnHeader="대리상"
                    data={retailData.dealer as TableData}
                    year={year}
                    showOpening={false}
                    planFromMonth={retailData.planFromMonth}
                  />
                  <InventoryMonthlyTable
                    firstColumnHeader="본사"
                    data={retailData.hq as TableData}
                    year={year}
                    showOpening={false}
                    planFromMonth={retailData.planFromMonth}
                    headerBg="#4db6ac"
                    headerBorderColor="#2a9d8f"
                    totalRowCls="bg-teal-50"
                  />
                </>
              )}
              {retailData && !retailLoading && retailData.dealer.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 본사→대리상 출고매출 표 ── */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setShipmentOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📊</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">본사→대리상 출고매출</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{shipmentData?.closedThrough ?? '…'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {shipmentOpen ? '▲ 접기' : '▼ 펼치기'}
            </span>
          </button>
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
              {shipmentData && !shipmentLoading && shipmentData.data.rows.length > 0 && (
                <InventoryMonthlyTable
                  firstColumnHeader="본사→대리상 출고"
                  data={shipmentData.data as TableData}
                  year={year}
                  showOpening={false}
                  headerBg="#4db6ac"
                  headerBorderColor="#2a9d8f"
                  totalRowCls="bg-teal-50"
                />
              )}
              {shipmentData && !shipmentLoading && shipmentData.data.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 본사 매입상품 표 ── */}
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
              (단위: CNY K / 실적 기준: ~{purchaseData?.closedThrough ?? '…'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {purchaseOpen ? '▲ 접기' : '▼ 펼치기'}
            </span>
          </button>
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
              {purchaseData && !purchaseLoading && purchaseData.data.rows.length > 0 && (
                <InventoryMonthlyTable
                  firstColumnHeader="본사 매입"
                  data={purchaseData.data as TableData}
                  year={year}
                  showOpening={false}
                  headerBg="#4db6ac"
                  headerBorderColor="#2a9d8f"
                  totalRowCls="bg-teal-50"
                />
              )}
              {purchaseData && !purchaseLoading && purchaseData.data.rows.length === 0 && (
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
