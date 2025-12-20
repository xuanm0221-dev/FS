'use client';

interface BaseMonthSelectorProps {
  baseMonth: number;
  onChange: (month: number) => void;
}

export default function BaseMonthSelector({ baseMonth, onChange }: BaseMonthSelectorProps) {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  return (
    <div className="inline-flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">기준월:</label>
      <select
        value={baseMonth}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="px-3 py-2 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy"
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {month}월
          </option>
        ))}
      </select>
    </div>
  );
}

