'use client';

interface TabsProps {
  tabs: string[];
  activeTab: number;
  onChange: (index: number) => void;
}

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="bg-navy">
      <div className="flex border-b border-gray-700">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => onChange(index)}
            className={`
              px-6 py-4 text-sm font-medium transition-colors relative
              ${activeTab === index 
                ? 'text-white' 
                : 'text-gray-300 hover:text-white'}
            `}
          >
            {tab}
            {activeTab === index && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent-yellow" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

