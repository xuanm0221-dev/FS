'use client';

import { useState, useEffect, useRef } from 'react';
import { Brand } from '@/lib/inventory-types';

const BRANDS: Brand[] = ['전체', 'MLB', 'MLB KIDS', 'DISCOVERY'];
const YEARS = [2025, 2026];

/** 성장률 입력 컨트롤 — 표 제목 우측용 */
export interface GrowthRateControlProps {
  label: string;
  labelCn: string;
  value: number;
  onChange: (displayedMinus100: number) => void;
  title?: string;
}
export function GrowthRateControl({ label, labelCn, value, onChange, title }: GrowthRateControlProps) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-gray-800 leading-tight">{label}</span>
        <span className="text-[10px] text-gray-500 leading-tight">{labelCn}</span>
      </div>
      <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white">
        <input
          type="number"
          min={0}
          max={200}
          step={1}
          value={value}
          onChange={(e) => {
            const raw = e.target.value === '' ? 100 : Number(e.target.value);
            const clamped = Math.min(200, Math.max(0, Math.round(raw)));
            onChange(clamped - 100);
          }}
          onBlur={(e) => {
            const raw = e.target.value === '' ? 100 : Number(e.target.value);
            const clamped = Math.min(200, Math.max(0, Math.round(raw)));
            onChange(clamped - 100);
          }}
          className="w-14 py-1.5 pl-2 pr-1 text-sm text-right font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="flex flex-col border-l border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => onChange(Math.min(100, value - 100 + 1))}
            className="flex items-center justify-center w-6 h-[18px] text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            aria-label="증가"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 2L8 6H2z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.max(-100, value - 100 - 1))}
            className="flex items-center justify-center w-6 h-[18px] text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors border-t border-gray-200"
            aria-label="감소"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 4h6L5 8z" /></svg>
          </button>
        </div>
      </div>
      <span className="text-sm font-medium text-gray-600">%</span>
    </div>
  );
}

interface Props {
  year: number;
  brand: Brand;
  onYearChange: (y: number) => void;
  onBrandChange: (b: Brand) => void;
  snapshotSaved: boolean;
  snapshotSavedAt: string | null;
  recalcLoading: boolean;
  statusLoading: boolean;
  statusError: boolean;
  canSave: boolean;
  onSave: () => void;
  onRecalc: (mode: 'current' | 'annual') => void;
}

export default function InventoryFilterBar({
  year,
  brand,
  onYearChange,
  onBrandChange,
  snapshotSaved,
  snapshotSavedAt,
  recalcLoading,
  statusLoading,
  statusError,
  canSave,
  onSave,
  onRecalc,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      {/* 1레벨: 연도 탭 | 브랜드 · 저장 (한 줄) */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-2.5 border-b border-gray-200 bg-gray-50">
        {/* 연도 탭 */}
        <div className="flex">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => onYearChange(y)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                year === y
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {y}년
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-300 flex-shrink-0" />

        {/* 브랜드 — iOS 스타일 세그먼트 컨트롤 */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-0.5 overflow-hidden">
          {BRANDS.map((b, i) => (
            <button
              key={b}
              type="button"
              onClick={() => onBrandChange(b)}
              className={`
                relative min-w-0 px-4 py-2 text-xs font-medium transition-colors
                ${i < BRANDS.length - 1
                  ? brand === b
                    ? 'border-r border-white/40'
                    : 'border-r border-gray-200'
                  : ''
                }
                ${brand === b
                  ? 'bg-[#8b7bb8] text-white shadow-sm'
                  : 'bg-transparent text-gray-700 hover:text-gray-900'
                }
                ${brand === b && i === 0 ? 'rounded-l-md' : ''}
                ${brand === b && i === BRANDS.length - 1 ? 'rounded-r-md' : ''}
                ${brand === b && i > 0 && i < BRANDS.length - 1 ? 'rounded-none' : ''}
              `}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-300" />

        {/* 재고,리테일,출고,입고 저장 / 저장완료+재계산 */}
        {!snapshotSaved ? (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || recalcLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
              canSave
                ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            }`}
            title="현재 데이터를 로컬에 저장합니다"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-gray-500">
              <path d="M10 1H3L1 3v8h10V1zm-4 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM3 1v3h5V1H3z"/>
            </svg>
            재고,리테일,출고,입고 저장
          </button>
        ) : (
          <div className="relative flex items-center gap-2" ref={dropdownRef}>
            <div className="flex">
              <button
                type="button"
                onClick={onSave}
                disabled={recalcLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-l border bg-[#8b7bb8] text-white border-[#7a6aa7] hover:bg-[#7a6aa7] transition-colors"
                title="다시 저장"
              >
                {recalcLoading ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 8" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M1.5 6.5L4.5 9.5L10.5 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                재고,리테일,출고,입고 저장완료
              </button>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                disabled={recalcLoading}
                className="flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-r border border-l-0 bg-[#8b7bb8] text-white border-[#7a6aa7] hover:bg-[#7a6aa7] transition-colors"
                aria-label="재계산 메뉴"
              >
                {dropdownOpen ? '▲' : '▼'}
              </button>
            </div>
            {dropdownOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded shadow-md z-50 min-w-[130px] py-1">
                <button
                  type="button"
                  onClick={() => { onRecalc('current'); setDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  당월 재계산
                </button>
                <div className="border-t border-gray-100 mx-2" />
                <button
                  type="button"
                  onClick={() => { onRecalc('annual'); setDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  연간 재계산
                </button>
              </div>
            )}
          </div>
        )}

        <div
          className={`rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${
            statusLoading
              ? 'border-red-300 bg-red-100 text-red-700'
              : statusError
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {statusLoading ? '데이터 로딩중' : statusError ? '오류' : '로딩완료'}
        </div>
      </div>
    </div>
  );
}
