'use client';

interface YearTabsProps {
  years: number[];
  activeYear: number;
  onChange: (year: number) => void;
}

export default function YearTabs({ years, activeYear, onChange }: YearTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {years.map((year) => {
        const isActive = activeYear === year;
        return (
          <button
            key={year}
            onClick={() => onChange(year)}
            className={`
              rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all
              ${isActive
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'}
            `}
            aria-pressed={isActive}
          >
            {year}년
          </button>
        );
      })}
    </div>
  );
}
