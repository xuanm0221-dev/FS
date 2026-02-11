'use client';

import { formatNumber } from '@/lib/utils';

interface CashBorrowingBalanceProps {
  year: number;
  columns: string[];
  cash: number[];
  borrowing: number[];
  prevCash?: number[];
  prevBorrowing?: number[];
  monthsCollapsed?: boolean;
}

export default function CashBorrowingBalance({
  year,
  columns,
  cash,
  borrowing,
  prevCash = [],
  prevBorrowing = [],
  monthsCollapsed = true,
}: CashBorrowingBalanceProps) {
  const is2026 = year === 2026 && prevCash.length > 0;

  if (cash.length === 0 && borrowing.length === 0) return null;

  const formatCell = (v: number) =>
    v < 0 ? `(${formatNumber(Math.abs(v), false, false)})` : formatNumber(v, false, false);
  const formatYoy = (v: number) => {
    const sign = v >= 0 ? '+' : '-';
    return `${sign}${formatNumber(Math.abs(v), false, false)}`;
  };
  const cellClass = (v: number, options?: { isYoy?: boolean; rowType?: 'cash' | 'borrowing' }) => {
    const base = 'border border-gray-300 py-2 px-4 text-right';
    if (v >= 0) return base;
    if (options?.isYoy && options?.rowType === 'borrowing') return `${base} text-blue-600`;
    return `${base} text-red-600`;
  };

  let displayCols: string[];
  let cashValues: number[];
  let borrowingValues: number[];

  if (is2026) {
    const 기초Cash = prevCash[13];
    const 기초Borrowing = prevBorrowing[13];
    const 기말Cash = cash[13];
    const 기말Borrowing = borrowing[13];
    const yoyCash = 기말Cash - 기초Cash;
    const yoyBorrowing = 기말Borrowing - 기초Borrowing;
    displayCols = monthsCollapsed
      ? ['기초잔액', '기말잔액', 'YoY']
      : ['기초잔액', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '기말잔액', 'YoY'];
    if (monthsCollapsed) {
      cashValues = [기초Cash, 기말Cash, yoyCash];
      borrowingValues = [기초Borrowing, 기말Borrowing, yoyBorrowing];
    } else {
      cashValues = [기초Cash, ...cash.slice(1, 13), 기말Cash, yoyCash];
      borrowingValues = [기초Borrowing, ...borrowing.slice(1, 13), 기말Borrowing, yoyBorrowing];
    }
  } else {
    displayCols = monthsCollapsed ? ['기말잔액'] : columns;
    cashValues = monthsCollapsed ? [cash[13]] : cash;
    borrowingValues = monthsCollapsed ? [borrowing[13]] : borrowing;
  }

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-gray-800 mb-2">현금잔액과 차입금잔액표</h3>
      <div className="overflow-x-auto border border-gray-300 rounded-lg shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="border border-gray-300 py-2.5 px-4 text-left sticky left-0 z-10 bg-navy min-w-[200px]">
                구분
              </th>
              {displayCols.map((col, i) => {
                const dataColMinW =
                  monthsCollapsed && is2026
                    ? i < 2
                      ? 'min-w-[120px]'
                      : 'min-w-[100px]'
                    : 'min-w-[100px]';
                return (
                  <th key={i} className={`border border-gray-300 py-2.5 px-4 text-center ${dataColMinW}`}>
                    {col}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-gray-50">
            <tr className="bg-gray-50">
              <td className="border border-gray-300 py-2 px-4 font-medium sticky left-0 z-10 bg-gray-100 text-gray-800">
                현금잔액
              </td>
              {cashValues.map((v, i) => {
                const isYoyCol = is2026 && i === cashValues.length - 1;
                return (
                  <td key={i} className={`${cellClass(v, { isYoy: isYoyCol, rowType: 'cash' })} bg-gray-50`}>
                    {isYoyCol ? formatYoy(v) : formatCell(v)}
                  </td>
                );
              })}
            </tr>
            <tr className="bg-gray-50">
              <td className="border border-gray-300 py-2 px-4 font-medium sticky left-0 z-10 bg-gray-100 text-gray-800">
                차입금잔액
              </td>
              {borrowingValues.map((v, i) => {
                const isYoyCol = is2026 && i === borrowingValues.length - 1;
                return (
                  <td key={i} className={`${cellClass(v, { isYoy: isYoyCol, rowType: 'borrowing' })} bg-gray-50`}>
                    {isYoyCol ? formatYoy(v) : formatCell(v)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
