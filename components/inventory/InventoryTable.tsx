'use client';

import { useRef, useState } from 'react';
import { InventoryRow, InventoryTableData, ACC_KEYS, SEASON_KEYS, AccKey, RowKey, SeasonKey } from '@/lib/inventory-types';
import { formatKValue, formatPct, formatWoi } from '@/lib/inventory-calc';

interface Props {
  title: string;
  /** 사용 안 함. tableType 기준으로 스타일 적용 */
  titleBg?: string;
  /** 제목 우측에 표시할 안내 문구 (예: 편집가능 안내) */
  titleNote?: string;
  data: InventoryTableData;
  year: number;
  /** 편집 모드일 때만 상품매입·대리상출고·재고주수 편집 UI 표시. false면 다른 열과 동일하게 숫자만 표시 */
  editMode?: boolean;
  sellInLabel?: string;
  sellOutLabel?: string;
  tableType?: 'dealer' | 'hq';
  onWoiChange?: (tableType: 'dealer' | 'hq', rowKey: string, newWoi: number) => void;
  onHqSellInChange?: (rowKey: RowKey, newSellInTotal: number) => void;
  onHqSellOutChange?: (rowKey: RowKey, newSellOutTotal: number) => void;
}

// 헤더 스타일
const TH = 'px-2 py-2 text-center text-xs font-semibold bg-[#1a2e5a] text-white border border-[#2e4070] whitespace-nowrap';

// 행 배경색
function rowBg(row: InventoryRow): string {
  if (row.isTotal) return 'bg-sky-100';
  if (row.isSubtotal) return 'bg-gray-100';
  return 'bg-white hover:bg-gray-50';
}

// 셀 스타일
function cellCls(row: InventoryRow, extra = ''): string {
  const base = 'px-2 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums align-middle';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  return `${base} ${weight} ${extra}`;
}

function labelCls(row: InventoryRow): string {
  const base = 'py-1.5 text-xs border-b border-gray-200 whitespace-nowrap align-middle';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  const indent = row.isLeaf ? 'pl-6 pr-2' : 'pl-2 pr-2';
  return `${base} ${weight} ${indent}`;
}

function formatWithComma(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '';
}

const PencilIcon = () => (
  <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export default function InventoryTable({
  title,
  titleNote,
  data,
  year,
  editMode = false,
  sellInLabel = 'Sell-in',
  sellOutLabel = 'Sell-out',
  tableType = 'dealer',
  onWoiChange,
  onHqSellInChange,
  onHqSellOutChange,
}: Props) {
  const isWoiEditable = year === 2026 && !!onWoiChange && editMode;
  const isAccRow = (key: string) => ACC_KEYS.includes(key as AccKey);
  const isWoiEditableForRow = (row: InventoryRow) => isWoiEditable && row.isLeaf && isAccRow(row.key);
  const isHqSellEditableForRow = (row: InventoryRow) =>
    year === 2026 &&
    tableType === 'hq' &&
    row.isLeaf &&
    SEASON_KEYS.includes(row.key as SeasonKey) &&
    (!!onHqSellInChange || !!onHqSellOutChange) &&
    editMode;
  const prevYear = year - 1;

  type EditField = 'sellIn' | 'sellOut' | 'woi';
  const [editingCell, setEditingCell] = useState<{ rowKey: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = (rowKey: string, field: EditField) =>
    editingCell?.rowKey === rowKey && editingCell?.field === field;

  const startEdit = (row: InventoryRow, field: EditField, currentValue: number) => {
    setEditingCell({ rowKey: row.key, field });
    setEditValue(currentValue > 0 ? String(Math.round(currentValue)) : '');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = (rowKey: string, field: EditField, fallback: number) => {
    if (field === 'woi') {
      const v = parseFloat(editValue);
      if (!isNaN(v) && v > 0 && v <= 99) onWoiChange?.(tableType, rowKey, v);
      else onWoiChange?.(tableType, rowKey, fallback || 1);
    } else {
      const v = parseInt(editValue.replace(/\D/g, ''), 10);
      const num = isNaN(v) || v < 0 ? fallback : v;
      if (field === 'sellIn') onHqSellInChange?.(rowKey as RowKey, num);
      else onHqSellOutChange?.(rowKey as RowKey, num);
    }
    setEditingCell(null);
    setEditValue('');
  };

  const editableCellCls = 'group relative flex items-center justify-end gap-1 min-h-[28px] w-full cursor-text';
  const hoverBgCls = 'hover:bg-sky-50';
  const inputCls = 'w-full min-w-0 text-right text-xs border-0 bg-transparent outline-none tabular-nums px-1 py-0.5';

  return (
    <div className="mb-8 flex flex-col flex-1 min-h-0">
      {/* 테이블 제목 */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div
          className={`
            border-l-4 rounded-r-md px-4 py-2 text-sm font-semibold tracking-tight
            ${tableType === 'dealer'
              ? 'border-slate-500 bg-slate-50 text-slate-800'
              : 'border-teal-600 bg-teal-50/80 text-slate-800'
            }
          `}
        >
          {title}
        </div>
        {titleNote && (
          <span className="text-xs text-gray-500">
            {titleNote}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm flex-1 min-h-0 flex flex-col">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH} style={{ minWidth: 100 }}>구분</th>
              <th className={TH} style={{ minWidth: 70 }}>
                기초<br />
                <span className="font-normal text-[10px] text-blue-200">({prevYear}년기말)</span>
              </th>
              <th className={TH} style={{ minWidth: 70 }}>
                {sellInLabel}<br />
                <span className="font-normal text-[10px] text-blue-200">(연간)</span>
              </th>
              <th className={TH} style={{ minWidth: 70 }}>
                {sellOutLabel}<br />
                <span className="font-normal text-[10px] text-blue-200">(연간)</span>
              </th>
              {tableType === 'hq' && (
                <th className={TH} style={{ minWidth: 70 }}>
                  본사판매<br />
                  <span className="font-normal text-[10px] text-blue-200">(연간)</span>
                </th>
              )}
              <th className={TH} style={{ minWidth: 70 }}>
                기말<br />
                <span className="font-normal text-[10px] text-blue-200">({year}년기말)</span>
              </th>
              <th className={TH} style={{ minWidth: 55 }}>증감</th>
              <th className={TH} style={{ minWidth: 65 }}>Sell-through</th>
              <th className={TH} style={{ minWidth: 55 }}>재고주수</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className={`${rowBg(row)} transition-colors min-h-[28px]`}>
                {/* 구분 */}
                <td className={labelCls(row)}>
                  {row.isLeaf && <span className="text-gray-400 mr-1">└</span>}
                  {row.label}
                </td>
                {/* 기초 */}
                <td className={cellCls(row)}>{formatKValue(row.opening)}</td>
                {/* Sell-in (연간) — 2026 본사 leaf면 편집 가능 */}
                <td className={cellCls(row)}>
                  {isHqSellEditableForRow(row) && onHqSellInChange ? (
                    <div
                      className={`${editableCellCls} ${hoverBgCls}`}
                      onClick={() => !isEditing(row.key, 'sellIn') && startEdit(row, 'sellIn', row.sellInTotal || 0)}
                    >
                      {isEditing(row.key, 'sellIn') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))}
                          onBlur={() => commitEdit(row.key, 'sellIn', row.sellInTotal || 0)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={inputCls}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWithComma(row.sellInTotal || 0)}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    formatKValue(row.sellInTotal)
                  )}
                </td>
                {/* Sell-out (연간) — 2026 본사 leaf면 편집 가능 */}
                <td className={cellCls(row)}>
                  {isHqSellEditableForRow(row) && onHqSellOutChange ? (
                    <div
                      className={`${editableCellCls} ${hoverBgCls}`}
                      onClick={() => !isEditing(row.key, 'sellOut') && startEdit(row, 'sellOut', row.sellOutTotal || 0)}
                    >
                      {isEditing(row.key, 'sellOut') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))}
                          onBlur={() => commitEdit(row.key, 'sellOut', row.sellOutTotal || 0)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={inputCls}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWithComma(row.sellOutTotal || 0)}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    formatKValue(row.sellOutTotal)
                  )}
                </td>
                {/* 본사판매 (본사 테이블 전용) */}
                {tableType === 'hq' && (
                  <td className={cellCls(row)}>
                    {row.hqSalesTotal != null ? formatKValue(row.hqSalesTotal) : '-'}
                  </td>
                )}
                {/* 기말 */}
                <td className={cellCls(row)}>{formatKValue(row.closing)}</td>
                {/* 증감 */}
                <td className={`${cellCls(row)} ${row.delta < 0 ? 'text-blue-600' : row.delta > 0 ? 'text-red-500' : ''}`}>
                  {row.delta > 0 ? '+' : ''}{formatKValue(row.delta)}
                </td>
                {/* Sell-through */}
                <td className={`${cellCls(row)} ${
                  row.sellThrough >= 70 ? 'text-green-600' :
                  row.sellThrough >= 50 ? 'text-yellow-600' :
                  row.sellThrough > 0 ? 'text-red-500' : ''
                }`}>
                  {formatPct(row.sellThrough)}
                </td>
                {/* 재고주수 (2026년 리프 행 편집 가능) */}
                <td className={`${cellCls(row)} ${
                  row.woi > 0 && row.woi <= 10 ? 'text-green-600' :
                  row.woi > 10 && row.woi <= 20 ? 'text-yellow-600' :
                  row.woi > 20 ? 'text-red-500' : ''
                }`}>
                  {isWoiEditableForRow(row) ? (
                    <span
                      className={`flex items-center justify-end gap-0.5 ${editableCellCls} ${hoverBgCls}`}
                      onClick={() => !isEditing(row.key, 'woi') && startEdit(row, 'woi', row.woi || 0)}
                    >
                      {isEditing(row.key, 'woi') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.]/g, '');
                            const parts = raw.split('.');
                            if (parts.length <= 2 && (parts[1]?.length ?? 0) <= 1) setEditValue(raw);
                          }}
                          onBlur={() => commitEdit(row.key, 'woi', row.woi || 1)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={`${inputCls} w-12`}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWoi(row.woi)}</span>
                          <span
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); startEdit(row, 'woi', row.woi || 0); }}
                          >
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    formatWoi(row.woi)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례: 2025 = Sell-through·재고주수 / 2026 = ACC 계산로직 */}
      <div className="mt-2 px-1 text-[11px] text-gray-500 space-y-1">
        {year === 2026 ? (
          <p>
            <strong className="text-gray-600">ACC 계산로직:</strong>
            {' 목표 재고주수 편집 → 기말 = 목표주수 × 주간매출 → Sell-in = 기말 + Sell-out − 기초. '}
            {'대리상 Sell-in = 본사 대리상출고. 본사 상품매입 = 기말 + 대리상출고 + 본사판매 − 기초.'}
          </p>
        ) : (
          <>
            <p>
              <strong className="text-gray-600">Sell-through:</strong>
              {tableType === 'dealer'
                ? ' 재고자산 합계·ACC = Sell-out ÷ Sell-in / 의류 = Sell-out ÷ (기초 + Sell-in)'
                : ' 재고자산 합계·ACC = 대리상출고 ÷ 상품매입 / 의류 = 대리상출고 ÷ (기초 + 상품매입)'}
            </p>
            <p>
              <strong className="text-gray-600">재고주수:</strong>
              {tableType === 'dealer'
                ? ' 주 매출 = Sell-out 연간합 ÷ (당연도 일수 × 7), 재고주수 = 기말재고자산 ÷ 주매출'
                : ' 주 매출 = (대리상 리테일 + 본사 리테일) 연간합 ÷ (당연도 일수 × 7), 재고주수 = 기말재고자산 ÷ 주매출'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
