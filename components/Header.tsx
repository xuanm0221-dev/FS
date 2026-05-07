'use client';

import { JapaneseYen } from 'lucide-react';

interface HeaderProps {
  baseMonth: number;
  onBaseMonthChange: (month: number) => void;
}

export default function Header({ baseMonth, onBaseMonthChange }: HeaderProps) {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1e3a5f] shadow-md">
      <div className="flex h-full items-center gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <JapaneseYen className="h-4 w-4 text-yellow-300" strokeWidth={2.5} />
          </div>
          <h1 className="text-[15px] font-bold tracking-tight text-white">
            F&amp;F CHINA 재무제표
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="header-base-month" className="text-xs font-medium text-blue-200">
            기준월
          </label>
          <select
            id="header-base-month"
            value={baseMonth}
            onChange={(e) => onBaseMonthChange(parseInt(e.target.value, 10))}
            className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs font-medium text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
          >
            {months.map((m) => (
              <option key={m} value={m} className="text-gray-900">
                {m}월
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
