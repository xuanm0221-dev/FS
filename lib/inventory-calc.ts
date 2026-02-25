import { InventoryRow, InventoryRowRaw, InventoryTableData, RowKey } from './inventory-types';

const SEASON_KEYS: RowKey[] = ['당년F', '당년S', '1년차', '2년차', '차기시즌', '과시즌'];
const ACC_KEYS: RowKey[] = ['신발', '모자', '가방', '기타'];

const LABELS: Record<string, string> = {
  '당년F': '당년F',
  '당년S': '당년S',
  '1년차': '1년차',
  '2년차': '2년차',
  '차기시즌': '차기시즌',
  '과시즌': '과시즌',
  '신발': '신발',
  '모자': '모자',
  '가방': '가방',
  '기타': '기타',
  '의류합계': '의류합계',
  'ACC합계': 'ACC합계',
  '재고자산합계': '재고자산합계',
};

function sumArr(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

/** Sell-through 분모: 의류는 기초+매입, 재고합계·ACC는 매입만 */
function sellThroughDenominator(
  key: string,
  opening: number,
  sellInTotal: number
): number {
  if (key === '재고자산합계') return sellInTotal;
  if (key === '의류합계' || SEASON_KEYS.includes(key as RowKey)) return opening + sellInTotal;
  // ACC합계, 신발, 모자, 가방, 기타
  return sellInTotal;
}

function calcRow(raw: InventoryRowRaw, yearDays: number): InventoryRow {
  const sellInTotal = raw.sellIn.reduce((s, v) => s + v, 0);
  const sellOutTotal = raw.sellOut.reduce((s, v) => s + v, 0);
  const delta = raw.closing - raw.opening;

  // Sell-through: 행 타입별 분모 적용 (의류=기초+매입, 재고합계·ACC=매입만)
  const stDenominator = sellThroughDenominator(raw.key, raw.opening, sellInTotal);
  const sellThrough = stDenominator > 0 ? (sellOutTotal / stDenominator) * 100 : 0;

  // WOI: 기말재고 / 주매출 (주매출 = woiSellOut / (연도일수 / 7))
  const woiSellOut = raw.woiSellOut ?? raw.sellOut;
  const woiSellOutTotal = woiSellOut.reduce((s, v) => s + v, 0);
  const weeklyRate = woiSellOutTotal / (yearDays / 7);
  const woi = weeklyRate > 0 ? raw.closing / weeklyRate : 0;

  return {
    key: raw.key,
    label: LABELS[raw.key] ?? raw.key,
    isTotal: false,
    isSubtotal: false,
    isLeaf: true,
    opening: raw.opening,
    sellIn: raw.sellIn,
    sellInTotal,
    sellOut: raw.sellOut,
    sellOutTotal,
    closing: raw.closing,
    delta,
    sellThrough,
    woi,
    woiSellOut,
  };
}

function calcSubtotal(
  key: string,
  rows: InventoryRow[],
  yearDays: number,
): InventoryRow {
  const opening = rows.reduce((s, r) => s + r.opening, 0);
  const closing = rows.reduce((s, r) => s + r.closing, 0);
  const sellIn = rows.reduce((acc, r) => sumArr(acc, r.sellIn), new Array(12).fill(0));
  const sellOut = rows.reduce((acc, r) => sumArr(acc, r.sellOut), new Array(12).fill(0));
  const woiSellOut = rows.reduce((acc, r) => sumArr(acc, r.woiSellOut), new Array(12).fill(0));
  const sellInTotal = sellIn.reduce((s, v) => s + v, 0);
  const sellOutTotal = sellOut.reduce((s, v) => s + v, 0);
  const woiSellOutTotal = woiSellOut.reduce((s, v) => s + v, 0);
  const delta = closing - opening;
  const stDenominator = sellThroughDenominator(key, opening, sellInTotal);
  const sellThrough = stDenominator > 0 ? (sellOutTotal / stDenominator) * 100 : 0;
  const weeklyRate = woiSellOutTotal / (yearDays / 7);
  const woi = weeklyRate > 0 ? closing / weeklyRate : 0;

  return {
    key,
    label: LABELS[key] ?? key,
    isTotal: key === '재고자산합계',
    isSubtotal: key !== '재고자산합계',
    isLeaf: false,
    opening,
    sellIn,
    sellInTotal,
    sellOut,
    sellOutTotal,
    closing,
    delta,
    sellThrough,
    woi,
    woiSellOut,
  };
}

export function buildTableData(rawRows: InventoryRowRaw[], yearDays: number = 365): InventoryTableData {
  const byKey = Object.fromEntries(rawRows.map((r) => [r.key, calcRow(r, yearDays)]));

  const clothingLeafs = SEASON_KEYS.map((k) => byKey[k]).filter(Boolean);
  const accLeafs = ACC_KEYS.map((k) => byKey[k]).filter(Boolean);

  const clothingSubtotal = calcSubtotal('의류합계', clothingLeafs, yearDays);
  const accSubtotal = calcSubtotal('ACC합계', accLeafs, yearDays);
  const grandTotal = calcSubtotal('재고자산합계', [clothingSubtotal, accSubtotal], yearDays);

  const rows: InventoryRow[] = [
    grandTotal,
    clothingSubtotal,
    ...clothingLeafs,
    accSubtotal,
    ...accLeafs,
  ];

  return { rows };
}

export function formatK(value: number): string {
  if (value === 0) return '-';
  return `${Math.round(value).toLocaleString()}K`;
}

/** 재고자산표 셀용: K 접미사 없이 숫자만 (제목에 CNY K 표기 시 사용) */
export function formatKValue(value: number): string {
  if (value === 0) return '-';
  return Math.round(value).toLocaleString();
}

export function formatPct(value: number): string {
  if (value === 0) return '-';
  return `${value.toFixed(1)}%`;
}

export function formatWoi(value: number): string {
  if (value === 0) return '-';
  return `${value.toFixed(1)}주`;
}

// 2026년 역산: 목표 재고주수 → 목표 기말재고 → 필요 매입(Sell-in)
// 대리상용: sellOut = POS 판매계획
export function applyTargetWOI(
  raw2025: InventoryRowRaw[],
  targetWOI: number,
  growthRate: number
): InventoryRowRaw[] {
  const factor = 1 + growthRate / 100;
  return raw2025.map((r) => {
    const opening = r.closing;
    const sellOut = r.sellOut.map((v) => Math.round(v * factor));
    const sellOutTotal = sellOut.reduce((s, v) => s + v, 0);
    const weeklyRate = sellOutTotal / 52;
    const targetClosing = weeklyRate > 0 ? Math.round(weeklyRate * targetWOI) : 0;
    const requiredSellInTotal = targetClosing + sellOutTotal - opening;

    let sellIn: number[];
    const prevSellInTotal = r.sellIn.reduce((s, v) => s + v, 0);
    if (requiredSellInTotal <= 0) {
      sellIn = new Array(12).fill(0);
    } else if (prevSellInTotal > 0) {
      const scale = requiredSellInTotal / prevSellInTotal;
      sellIn = r.sellIn.map((v) => Math.round(v * scale));
      const sum = sellIn.reduce((s, v) => s + v, 0);
      if (sum !== requiredSellInTotal) {
        sellIn[11] += requiredSellInTotal - sum;
      }
    } else {
      sellIn = new Array(12).fill(0);
      const perMonth = Math.floor(requiredSellInTotal / 12);
      for (let i = 0; i < 12; i++) sellIn[i] = perMonth;
      sellIn[11] += requiredSellInTotal - perMonth * 12;
    }

    return {
      key: r.key,
      opening,
      sellIn,
      sellOut,
      closing: targetClosing,
    };
  });
}

// 본사용: sellOut = 대리상 sellIn (본사→대리상 출고)
export function applyTargetWOIForHq(
  raw2025: InventoryRowRaw[],
  dealerRaw2026: InventoryRowRaw[],
  targetHqWOI: number
): InventoryRowRaw[] {
  const byKey = Object.fromEntries(dealerRaw2026.map((r) => [r.key, r]));
  return raw2025.map((r) => {
    const opening = r.closing;
    const dealerRow = byKey[r.key];
    const sellOut = dealerRow ? dealerRow.sellIn : new Array(12).fill(0);
    const sellOutTotal = sellOut.reduce((s, v) => s + v, 0);
    const weeklyRate = sellOutTotal / 52;
    const targetClosing = weeklyRate > 0 ? Math.round(weeklyRate * targetHqWOI) : 0;
    const requiredSellInTotal = targetClosing + sellOutTotal - opening;

    let sellIn: number[];
    const prevSellInTotal = r.sellIn.reduce((s, v) => s + v, 0);
    if (requiredSellInTotal <= 0) {
      sellIn = new Array(12).fill(0);
    } else if (prevSellInTotal > 0) {
      const scale = requiredSellInTotal / prevSellInTotal;
      sellIn = r.sellIn.map((v) => Math.round(v * scale));
      const sum = sellIn.reduce((s, v) => s + v, 0);
      if (sum !== requiredSellInTotal) {
        sellIn[11] += requiredSellInTotal - sum;
      }
    } else {
      sellIn = new Array(12).fill(0);
      const perMonth = Math.floor(requiredSellInTotal / 12);
      for (let i = 0; i < 12; i++) sellIn[i] = perMonth;
      sellIn[11] += requiredSellInTotal - perMonth * 12;
    }

    return {
      key: r.key,
      opening,
      sellIn,
      sellOut,
      closing: targetClosing,
    };
  });
}

// 표 내 WOI 편집 시 역산 (2026년)
function recalcLeafFromWoi(row: InventoryRow, newWoi: number): InventoryRow {
  if (!row.isLeaf) return row;
  const sellOutTotal = row.sellOutTotal;
  const weeklyRate = sellOutTotal / 52;
  const newClosing = weeklyRate > 0 ? Math.round(weeklyRate * newWoi) : 0;
  const newSellInTotal = newClosing + sellOutTotal - row.opening;

  let sellIn: number[];
  const prevTotal = row.sellInTotal;
  if (newSellInTotal <= 0) {
    sellIn = new Array(12).fill(0);
  } else if (prevTotal > 0) {
    const scale = newSellInTotal / prevTotal;
    sellIn = row.sellIn.map((v) => Math.round(v * scale));
    const sum = sellIn.reduce((s, v) => s + v, 0);
    if (sum !== newSellInTotal) sellIn[11] += newSellInTotal - sum;
  } else {
    sellIn = new Array(12).fill(0);
    const perMonth = Math.floor(newSellInTotal / 12);
    for (let i = 0; i < 12; i++) sellIn[i] = perMonth;
    sellIn[11] += newSellInTotal - perMonth * 12;
  }

  const delta = newClosing - row.opening;
  const stDenom = sellThroughDenominator(row.key, row.opening, newSellInTotal);
  const sellThrough = stDenom > 0 ? (sellOutTotal / stDenom) * 100 : 0;

  return {
    ...row,
    sellIn,
    sellInTotal: newSellInTotal,
    closing: newClosing,
    delta,
    sellThrough,
    woi: newWoi,
  };
}

function rebuildTableFromLeafs(leafRows: InventoryRow[], yearDays: number = 365): InventoryRow[] {
  const clothingLeafs = SEASON_KEYS.map((k) => leafRows.find((r) => r.key === k)).filter(Boolean) as InventoryRow[];
  const accLeafs = ACC_KEYS.map((k) => leafRows.find((r) => r.key === k)).filter(Boolean) as InventoryRow[];
  const clothingSubtotal = calcSubtotal('의류합계', clothingLeafs, yearDays);
  const accSubtotal = calcSubtotal('ACC합계', accLeafs, yearDays);
  const grandTotal = calcSubtotal('재고자산합계', [clothingSubtotal, accSubtotal], yearDays);
  return [grandTotal, clothingSubtotal, ...clothingLeafs, accSubtotal, ...accLeafs];
}

export function recalcOnDealerWoiChange(
  data: { dealer: InventoryTableData; hq: InventoryTableData },
  rowKey: string,
  newWoi: number
): { dealer: InventoryTableData; hq: InventoryTableData } {
  const leafRows = [...SEASON_KEYS, ...ACC_KEYS];
  const dealerByKey = Object.fromEntries(
    data.dealer.rows.filter((r) => r.isLeaf).map((r) => [r.key, r])
  );
  const hqByKey = Object.fromEntries(
    data.hq.rows.filter((r) => r.isLeaf).map((r) => [r.key, r])
  );

  const updatedDealerLeaf = recalcLeafFromWoi(dealerByKey[rowKey]!, newWoi);
  dealerByKey[rowKey] = updatedDealerLeaf;
  const newDealerLeafs = leafRows.map((k) => dealerByKey[k]!);
  const dealerRows = rebuildTableFromLeafs(newDealerLeafs);

  // HQ sellOut = dealer sellIn; HQ 해당 행 갱신
  const hqRow = hqByKey[rowKey];
  if (hqRow) {
    const sellOut = updatedDealerLeaf.sellIn;
    const sellOutTotal = sellOut.reduce((s, v) => s + v, 0);
    const weeklyRate = sellOutTotal / 52;
    const newClosing = weeklyRate > 0 ? Math.round(weeklyRate * hqRow.woi) : 0;
    const newSellInTotal = newClosing + sellOutTotal - hqRow.opening;

    let sellIn: number[];
    const prevTotal = hqRow.sellInTotal;
    if (newSellInTotal <= 0) {
      sellIn = new Array(12).fill(0);
    } else if (prevTotal > 0) {
      const scale = newSellInTotal / prevTotal;
      sellIn = hqRow.sellIn.map((v) => Math.round(v * scale));
      const sum = sellIn.reduce((s, v) => s + v, 0);
      if (sum !== newSellInTotal) sellIn[11] += newSellInTotal - sum;
    } else {
      sellIn = new Array(12).fill(0);
      const perMonth = Math.floor(newSellInTotal / 12);
      for (let i = 0; i < 12; i++) sellIn[i] = perMonth;
      sellIn[11] += newSellInTotal - perMonth * 12;
    }

    const stDenom = sellThroughDenominator(rowKey, hqRow.opening, newSellInTotal);
    hqByKey[rowKey] = {
      ...hqRow,
      sellOut,
      sellOutTotal,
      sellIn,
      sellInTotal: newSellInTotal,
      closing: newClosing,
      delta: newClosing - hqRow.opening,
      sellThrough: stDenom > 0 ? (sellOutTotal / stDenom) * 100 : 0,
    };
  }
  const newHqLeafs = leafRows.map((k) => hqByKey[k]!);
  const hqRows = rebuildTableFromLeafs(newHqLeafs);

  return {
    dealer: { rows: dealerRows },
    hq: { rows: hqRows },
  };
}

export function recalcOnHqWoiChange(
  data: { dealer: InventoryTableData; hq: InventoryTableData },
  rowKey: string,
  newWoi: number
): { dealer: InventoryTableData; hq: InventoryTableData } {
  const leafRows = [...SEASON_KEYS, ...ACC_KEYS];
  const hqByKey = Object.fromEntries(
    data.hq.rows.filter((r) => r.isLeaf).map((r) => [r.key, r])
  );

  const updatedHqLeaf = recalcLeafFromWoi(hqByKey[rowKey]!, newWoi);
  hqByKey[rowKey] = updatedHqLeaf;
  const newHqLeafs = leafRows.map((k) => hqByKey[k]!);
  return {
    ...data,
    hq: { rows: rebuildTableFromLeafs(newHqLeafs) },
  };
}
