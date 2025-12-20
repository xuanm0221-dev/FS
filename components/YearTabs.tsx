'use client';

interface YearTabsProps {
  years: number[];
  activeYear: number;
  onChange: (year: number) => void;
}

export default function YearTabs({ years, activeYear, onChange }: YearTabsProps) {
  return (
    <div className="inline-flex gap-2">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onChange(year)}
          className={`
            px-4 py-2 text-sm font-medium rounded transition-colors
            ${activeYear === year
              ? 'bg-navy text-white'
              : 'bg-white text-gray-700 hover:bg-gray-200 border border-gray-300'}
          `}
        >
          {year}년
        </button>
      ))}
    </div>
  );
}

