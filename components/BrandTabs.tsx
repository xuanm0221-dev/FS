'use client';

interface BrandTabsProps {
  brands: { id: string | null; label: string }[];
  activeBrand: string | null;
  onChange: (brand: string | null) => void;
}

const BRAND_DOT_COLOR: Record<string, string> = {
  mlb: '#3b82f6',        // blue-500
  kids: '#a855f7',       // purple-500
  discovery: '#10b981',  // emerald-500
  duvetica: '#f97316',   // orange-500
  supra: '#ec4899',      // pink-500
};

export default function BrandTabs({ brands, activeBrand, onChange }: BrandTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {brands.map((brand) => {
        const isActive = activeBrand === brand.id;
        const dotColor = brand.id ? BRAND_DOT_COLOR[brand.id] : null;
        return (
          <button
            key={brand.id || 'entity'}
            onClick={() => onChange(brand.id)}
            className={`
              inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all
              ${isActive
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'}
            `}
            aria-pressed={isActive}
          >
            {dotColor && (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-hidden="true"
              />
            )}
            {brand.label}
          </button>
        );
      })}
    </div>
  );
}
