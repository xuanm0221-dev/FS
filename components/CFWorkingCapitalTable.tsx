'use client';

import { useState, useMemo } from 'react';
import { formatNumber } from '@/lib/utils';
import type { TableRow } from '@/lib/types';

const WC_ACCOUNTS = [
  '운전자본',
  '외상매출금',
  '직영AR',
  '대리상AR',
  '재고자산',
  'MLB',
  'KIDS',
  'DISCOVERY',
  '외상매입금',
  '본사AP',
  '제품AP',
] as const;

interface CFWorkingCapitalTableProps {
  rows: TableRow[];
  monthsCollapsed?: boolean;
  onMonthsToggle?: () => void;
}

export default function CFWorkingCapitalTable({
  rows,
  monthsCollapsed = true,
}: CFWorkingCapitalTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['외상매출금', '외상매입금', '재고자산']));

  const filtered = useMemo(() => rows.filter((r) => WC_ACCOUNTS.includes(r.account as any)), [rows]);

  const getRow = (account: string) => filtered.find((r) => r.account === account);

  const columnLabels = useMemo(() => {
    const base = ['2025년(기말)', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '2026년(기말)', 'YoY'];
    return base;
  }, []);

  const buildRowValues = (row: TableRow | undefined): (number | null)[] => {
    if (!row) return columnLabels.map(() => null);
    const prev = row.comparisons?.prevYearAnnual ?? null;
    const curr = row.comparisons?.currYearAnnual ?? null;
    const yoy = row.comparisons?.annualYoY ?? null;
    const vals = row.values ?? [];
    return [
      prev,
      ...vals.slice(0, 12),
      curr,
      yoy,
    ];
  };

  const 운전자본Values = useMemo(() => buildRowValues(getRow('운전자본')), [filtered, getRow]);
  const year2024Value = getRow('운전자본')?.year2024Value ?? null; // 2024년(기말) — 2025년(기말) 전월대비용
  const 전월대비Values = useMemo(() => {
    const v = 운전자본Values;
    const out: (number | null)[] = [];
    for (let i = 0; i < 15; i++) {
      if (i === 0) {
        // 2025년(기말) 전월대비 = 2025년(기말) − 2024년(기말)
        if (v[0] != null && year2024Value != null) out.push(v[0] - year2024Value);
        else out.push(null);
      } else if (i >= 1 && i <= 12) {
        const prev = v[i - 1];
        const curr = v[i];
        if (prev != null && curr != null) out.push(curr - prev);
        else out.push(null);
      } else if (i === 13) {
        const prev = v[0]; // 2025년(기말)
        const curr = v[13]; // 2026년(기말)
        if (prev != null && curr != null) out.push(curr - prev);
        else out.push(null);
      } else {
        out.push(null); // YoY 컬럼
      }
    }
    return out;
  }, [운전자본Values, year2024Value]);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const displayRows = useMemo(() => {
    const result: { account: string; displayName: string; level: number; isGroup: boolean; values: (number | null)[]; children?: { account: string; displayName: string; values: (number | null)[] }[] }[] = [];

    const wcRow = getRow('운전자본');
    if (wcRow) {
      result.push({
        account: '운전자본',
        displayName: '운전자본 합계',
        level: 0,
        isGroup: false,
        values: buildRowValues(wcRow),
        children: undefined,
      });
    }

    result.push({
      account: '_전월대비',
      displayName: '전월대비',
      level: 0,
      isGroup: false,
      values: 전월대비Values,
      children: undefined,
    });

    const 외상매출금Row = getRow('외상매출금');
    if (외상매출금Row) {
      result.push({
        account: '외상매출금',
        displayName: '매출채권',
        level: 1,
        isGroup: true,
        values: buildRowValues(외상매출금Row),
        children: [
          { account: '직영AR', displayName: '직영AR', values: buildRowValues(getRow('직영AR')) },
          { account: '대리상AR', displayName: '대리상AR', values: buildRowValues(getRow('대리상AR')) },
        ],
      });
    }

    const 재고Row = getRow('재고자산');
    if (재고Row) {
      const mlbRow = getRow('MLB');
      const kidsRow = getRow('KIDS');
      const discoveryRow = getRow('DISCOVERY');
      const children = [mlbRow, kidsRow, discoveryRow].filter(Boolean).map((row) => ({
        account: row!.account,
        displayName: row!.account,
        values: buildRowValues(row),
      }));
      result.push({
        account: '재고자산',
        displayName: '재고자산',
        level: 1,
        isGroup: true,
        values: buildRowValues(재고Row),
        children: children.length > 0 ? children : undefined,
      });
    }

    const 외상매입금Row = getRow('외상매입금');
    if (외상매입금Row) {
      result.push({
        account: '외상매입금',
        displayName: '매입채무',
        level: 1,
        isGroup: true,
        values: buildRowValues(외상매입금Row),
        children: [
          { account: '본사AP', displayName: '본사 AP', values: buildRowValues(getRow('본사AP')) },
          { account: '제품AP', displayName: '제품 AP', values: buildRowValues(getRow('제품AP')) },
        ],
      });
    }

    return result;
  }, [filtered, 전월대비Values]);

  const visibleRows = useMemo(() => {
    const list: { account: string; displayName: string; level: number; isGroup: boolean; values: (number | null)[]; isChild?: boolean }[] = [];
    for (const row of displayRows) {
      list.push({
        account: row.account,
        displayName: row.displayName,
        level: row.level,
        isGroup: row.isGroup,
        values: row.values,
        isChild: false,
      });
      if (row.isGroup && row.children && !collapsed.has(row.account)) {
        for (const ch of row.children) {
          list.push({
            account: ch.account,
            displayName: ch.displayName,
            level: row.level + 1,
            isGroup: false,
            values: ch.values,
            isChild: true,
          });
        }
      }
    }
    return list;
  }, [displayRows, collapsed]);

  const formatCell = (value: number | null, index: number) => {
    if (value === null || value === undefined || (value === 0 && index < 14)) return '-';
    const isYoy = index === 14;
    if (isYoy) {
      const sign = value >= 0 ? '+' : '-';
      return `${sign}${formatNumber(Math.abs(value), false, false)}`;
    }
    return value < 0 ? `(${formatNumber(Math.abs(value), false, false)})` : formatNumber(value, false, false);
  };

  const cellClass = (value: number | null) => {
    const base = 'border border-gray-300 py-2 px-4 text-right';
    if (value == null) return base;
    return value < 0 ? `${base} text-red-600` : base;
  };

  if (filtered.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-gray-800 mb-2">운전자본표</h3>
      <div className="overflow-x-auto border border-gray-300 rounded-lg shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="border border-gray-300 py-3 px-4 text-left sticky left-0 z-20 bg-navy min-w-[200px]">
                계정과목
              </th>
              {monthsCollapsed ? (
                <>
                  <th className="border border-gray-300 py-3 px-4 text-center min-w-[120px]">
                    {columnLabels[0]}
                  </th>
                  <th className="border border-gray-300 py-3 px-4 text-center min-w-[120px]">
                    {columnLabels[13]}
                  </th>
                  <th className="border border-gray-300 py-3 px-4 text-center min-w-[100px]">{columnLabels[14]}</th>
                </>
              ) : (
                columnLabels.map((col, i) => (
                  <th key={i} className="border border-gray-300 py-3 px-4 text-center min-w-[100px]">
                    {col}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => {
              const is합계 = row.account === '운전자본';
              const isLevel1 = is합계 || (row.level === 1 && !row.isChild);
              const is전월대비 = row.account === '_전월대비';
              const indentPx = row.isChild ? 36 : 12;
              const rowBg = is합계 ? 'bg-yellow-50 font-semibold' : isLevel1 ? 'bg-sky-100 font-semibold' : is전월대비 ? 'bg-gray-100' : row.isChild ? 'bg-white' : '';

              return (
                <tr key={ri} className={rowBg}>
                  <td
                    className={`border border-gray-300 py-2 px-4 sticky left-0 z-10 ${is합계 ? 'bg-yellow-50' : isLevel1 ? 'bg-sky-100' : is전월대비 ? 'bg-gray-100' : 'bg-white'}`}
                    style={{ paddingLeft: `${indentPx}px` }}
                  >
                    {row.isGroup ? (
                      <div className="flex items-center gap-1">
                        <span>{row.displayName}</span>
                        <button
                          type="button"
                          onClick={() => toggle(row.account)}
                          className="text-gray-600 hover:text-gray-900 p-0.5 leading-none"
                        >
                          {collapsed.has(row.account) ? '▶' : '▼'}
                        </button>
                      </div>
                    ) : (
                      row.displayName
                    )}
                  </td>
                  {monthsCollapsed
                    ? [
                        <td key="0" className={`${cellClass(row.values[0])} ${is합계 ? 'bg-yellow-50' : ''}`}>
                          {formatCell(row.values[0], 0)}
                        </td>,
                        <td key="13" className={`${cellClass(row.values[13])} ${is합계 ? 'bg-yellow-50' : ''}`}>
                          {formatCell(row.values[13], 13)}
                        </td>,
                        <td key="14" className={`${cellClass(row.values[14])} ${is합계 ? 'bg-yellow-50' : ''}`}>
                          {formatCell(row.values[14], 14)}
                        </td>,
                      ]
                    : row.values.map((v, vi) => (
                        <td key={vi} className={`${cellClass(v)} ${is합계 ? 'bg-yellow-50' : ''}`}>
                          {formatCell(v, vi)}
                        </td>
                      ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
