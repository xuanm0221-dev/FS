'use client';

import { useMemo } from 'react';
import { formatNumber, getRecoveryMonthLabelsAsN월 } from '@/lib/utils';
import type { CreditRecoveryData } from '@/lib/types';

interface DealerCreditRecoveryTableProps {
  data: CreditRecoveryData;
}

export default function DealerCreditRecoveryTable({ data }: DealerCreditRecoveryTableProps) {
  const { baseYearMonth, 대리상선수금, 대리상채권, recoveries } = data;
  const formatCell = (v: number) =>
    v < 0 ? `(${formatNumber(Math.abs(v), false, false)})` : formatNumber(v, false, false);
  const cellClass = (v: number) =>
    'border border-slate-200 py-2 px-4 text-right' + (v < 0 ? ' text-red-600' : '');

  const recoveryHeaders = useMemo(
    () => getRecoveryMonthLabelsAsN월(baseYearMonth, recoveries.length),
    [baseYearMonth, recoveries.length]
  );
  const tableHeaders = ['대리상선수금', '대리상 채권', ...recoveryHeaders];
  const tableValues = [대리상선수금, 대리상채권, ...recoveries];

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-gray-800 mb-2">
        대리상 여신회수 계획 ({baseYearMonth} 기준)
      </h3>
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-navy text-white">
            <tr>
              {tableHeaders.map((h, i) => (
                <th
                  key={i}
                  className="border border-slate-200 py-3 px-4 text-center min-w-[100px]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-gray-50">
            <tr>
              {tableValues.map((v, i) => (
                <td key={i} className={cellClass(v)}>
                  {formatCell(v)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
