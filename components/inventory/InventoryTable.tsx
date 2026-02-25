'use client';

import { InventoryRow, InventoryTableData } from '@/lib/inventory-types';
import { formatKValue, formatPct, formatWoi } from '@/lib/inventory-calc';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

interface Props {
  title: string;
  titleBg?: string;
  data: InventoryTableData;
  year: number;
  sellInLabel?: string;
  sellOutLabel?: string;
  sellInExpanded: boolean;
  sellOutExpanded: boolean;
  tableType?: 'dealer' | 'hq';
  onWoiChange?: (tableType: 'dealer' | 'hq', rowKey: string, newWoi: number) => void;
}

// 헤더 스타일
const TH = 'px-2 py-2 text-center text-xs font-semibold bg-[#1a2e5a] text-white border border-[#2e4070] whitespace-nowrap';
const TH_GROUP = 'px-2 py-1 text-center text-xs font-semibold bg-[#223366] text-white border border-[#2e4070]';

// 행 배경색
function rowBg(row: InventoryRow): string {
  if (row.isTotal) return 'bg-sky-100';
  if (row.isSubtotal) return 'bg-gray-100';
  return 'bg-white hover:bg-gray-50';
}

// 셀 스타일
function cellCls(row: InventoryRow, extra = ''): string {
  const base = 'px-2 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  return `${base} ${weight} ${extra}`;
}

function labelCls(row: InventoryRow): string {
  const base = 'py-1.5 text-xs border-b border-gray-200 whitespace-nowrap';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  const indent = row.isLeaf ? 'pl-6 pr-2' : 'pl-2 pr-2';
  return `${base} ${weight} ${indent}`;
}

export default function InventoryTable({
  title,
  titleBg = '#f59e0b',
  data,
  year,
  sellInLabel = 'Sell-in',
  sellOutLabel = 'Sell-out',
  sellInExpanded,
  sellOutExpanded,
  tableType = 'dealer',
  onWoiChange,
}: Props) {
  const isWoiEditable = year === 2026 && !!onWoiChange;
  const prevYear = year - 1;

  return (
    <div className="mb-8">
      {/* 테이블 제목 */}
      <div
        className="inline-block px-4 py-1.5 text-sm font-bold text-gray-900 mb-2 rounded-sm"
        style={{ backgroundColor: titleBg }}
      >
        {title}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            {/* 그룹 헤더 행 (월별 펼침 시) */}
            {(sellInExpanded || sellOutExpanded) && (
              <tr>
                <th className={TH} rowSpan={2} style={{ minWidth: 100 }}>구분</th>
                <th className={TH} rowSpan={2} style={{ minWidth: 70 }}>
                  기초<br />
                  <span className="font-normal text-[10px] text-blue-200">({prevYear}년기말)</span>
                </th>
                {sellInExpanded ? (
                  <th className={TH_GROUP} colSpan={13}>{sellInLabel}</th>
                ) : (
                  <th className={TH} rowSpan={2} style={{ minWidth: 70 }}>{sellInLabel}<br /><span className="font-normal text-[10px] text-blue-200">(연간)</span></th>
                )}
                {sellOutExpanded ? (
                  <th className={TH_GROUP} colSpan={13}>{sellOutLabel}</th>
                ) : (
                  <th className={TH} rowSpan={2} style={{ minWidth: 70 }}>{sellOutLabel}<br /><span className="font-normal text-[10px] text-blue-200">(연간)</span></th>
                )}
                <th className={TH} rowSpan={2} style={{ minWidth: 70 }}>
                  기말<br />
                  <span className="font-normal text-[10px] text-blue-200">({year}년기말)</span>
                </th>
                <th className={TH} rowSpan={2} style={{ minWidth: 55 }}>증감</th>
                <th className={TH} rowSpan={2} style={{ minWidth: 65 }}>Sell-through</th>
                <th className={TH} rowSpan={2} style={{ minWidth: 55 }}>재고주수</th>
              </tr>
            )}
            {/* 일반 헤더 */}
            <tr>
              {!(sellInExpanded || sellOutExpanded) && (
                <>
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
                  <th className={TH} style={{ minWidth: 70 }}>
                    기말<br />
                    <span className="font-normal text-[10px] text-blue-200">({year}년기말)</span>
                  </th>
                  <th className={TH} style={{ minWidth: 55 }}>증감</th>
                  <th className={TH} style={{ minWidth: 65 }}>Sell-through</th>
                  <th className={TH} style={{ minWidth: 55 }}>재고주수</th>
                </>
              )}
              {/* 월별 서브헤더 (펼침 시) */}
              {(sellInExpanded || sellOutExpanded) && (
                <>
                  {sellInExpanded &&
                    MONTHS.map((m) => (
                      <th key={`si-${m}`} className={TH} style={{ minWidth: 48 }}>{m}</th>
                    ))}
                  {sellInExpanded && <th className={TH} style={{ minWidth: 60 }}>합계</th>}
                  {sellOutExpanded &&
                    MONTHS.map((m) => (
                      <th key={`so-${m}`} className={TH} style={{ minWidth: 48 }}>{m}</th>
                    ))}
                  {sellOutExpanded && <th className={TH} style={{ minWidth: 60 }}>합계</th>}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className={`${rowBg(row)} transition-colors`}>
                {/* 구분 */}
                <td className={labelCls(row)}>
                  {row.isLeaf && <span className="text-gray-400 mr-1">└</span>}
                  {row.label}
                </td>
                {/* 기초 */}
                <td className={cellCls(row)}>{formatKValue(row.opening)}</td>
                {/* Sell-in */}
                {sellInExpanded ? (
                  <>
                    {row.sellIn.map((v, i) => (
                      <td key={`si-${i}`} className={cellCls(row)}>{v > 0 ? v.toLocaleString() : '-'}</td>
                    ))}
                    <td className={cellCls(row, 'font-semibold')}>{formatKValue(row.sellInTotal)}</td>
                  </>
                ) : (
                  <td className={cellCls(row)}>{formatKValue(row.sellInTotal)}</td>
                )}
                {/* Sell-out */}
                {sellOutExpanded ? (
                  <>
                    {row.sellOut.map((v, i) => (
                      <td key={`so-${i}`} className={cellCls(row)}>{v > 0 ? v.toLocaleString() : '-'}</td>
                    ))}
                    <td className={cellCls(row, 'font-semibold')}>{formatKValue(row.sellOutTotal)}</td>
                  </>
                ) : (
                  <td className={cellCls(row)}>{formatKValue(row.sellOutTotal)}</td>
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
                  {isWoiEditable && row.isLeaf ? (
                    <span className="flex items-center justify-end gap-0.5">
                      <input
                        type="number"
                        min={0.1}
                        max={99}
                        step={0.5}
                        value={row.woi > 0 ? row.woi : ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v > 0) onWoiChange!(tableType, row.key, v);
                        }}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (isNaN(v) || v <= 0) onWoiChange!(tableType, row.key, row.woi || 1);
                        }}
                        className="w-12 px-1 py-0.5 text-right text-xs border border-gray-300 rounded bg-white"
                      />
                      <span className="text-[10px] text-gray-400">주</span>
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

      {/* Sell-through · 재고주수 계산 방식 범례 */}
      <div className="mt-2 px-1 text-[11px] text-gray-500 space-y-1">
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
      </div>
    </div>
  );
}
