'use client';

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

/** 재고잔액 / 리테일 매출 공통 행 타입 */
export interface TableRow {
  key: string;
  label: string;
  isTotal: boolean;
  isSubtotal: boolean;
  isLeaf: boolean;
  opening?: number | null;  // 재고잔액에만 존재, 리테일 매출은 undefined
  monthly: (number | null)[];
}

export interface TableData {
  rows: TableRow[];
}

interface Props {
  title?: string;
  titleBg?: string;
  data: TableData;
  year: number;
  /** 첫 열 헤더. 있으면 상단 제목 바를 숨기고 이 문구를 구분 칸 헤더로 사용 */
  firstColumnHeader?: string;
  /** false로 설정하면 기초(전년기말) 컬럼을 숨김. 기본값: true */
  showOpening?: boolean;
  /** 1-based; 이 월부터 계획(F). 있으면 헤더에 "2월(F)" 형태로 표시 */
  planFromMonth?: number;
  /** 헤더 배경색. 기본값 #1a2e5a (네이비). 본사 테이블에는 틸 그린 계열 전달 */
  headerBg?: string;
  /** 헤더 셀 border 색. 기본값 #2e4070 (네이비). 본사는 #2a9d8f */
  headerBorderColor?: string;
  /** 합계 행(isTotal) 배경 Tailwind 클래스. 기본값 bg-sky-100. 본사는 bg-teal-50 */
  totalRowCls?: string;
}

// ─── 스타일 헬퍼 ───────────────────────────────────

const TH = 'px-2 py-2 text-center text-xs font-semibold bg-[#1a2e5a] text-white border whitespace-nowrap';

function cellCls(row: TableRow, extra = ''): string {
  const base = 'px-2 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  return `${base} ${weight} ${extra}`;
}

function labelCls(row: TableRow): string {
  const base = 'py-1.5 text-xs border-b border-gray-200 whitespace-nowrap';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  const indent = row.isLeaf ? 'pl-6 pr-2' : 'pl-2 pr-2';
  return `${base} ${weight} ${indent}`;
}

// ─── 포맷 ─────────────────────────────────────────

function formatAmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value === 0) return '-';
  return Math.round(value / 1000).toLocaleString(); // API 1위안 → 대시보드 표시는 CNY K(천 위안)
}

// ─── 컴포넌트 ──────────────────────────────────────

export default function InventoryMonthlyTable({
  title,
  titleBg = '#f59e0b',
  data,
  year,
  firstColumnHeader,
  showOpening = true,
  planFromMonth,
  headerBg = '#1a2e5a',
  headerBorderColor = '#2e4070',
  totalRowCls = 'bg-sky-100',
}: Props) {
  const getRowBg = (row: TableRow): string => {
    if (row.isTotal) return totalRowCls;
    if (row.isSubtotal) return 'bg-gray-100';
    return 'bg-white hover:bg-gray-50';
  };

  const prevYear = year - 1;
  const monthLabels = MONTHS.map((m, i) => {
    const month1 = i + 1;
    if (planFromMonth != null && month1 >= planFromMonth) return `${m}(F)`;
    return m;
  });
  const labelHeader = firstColumnHeader ?? '구분';

  return (
    <div className="mb-8">
      {!firstColumnHeader && title != null && title !== '' && (
        <div
          className="inline-block px-4 py-1.5 text-sm font-bold text-gray-900 mb-2 rounded-sm"
          style={{ backgroundColor: titleBg }}
        >
          {title}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH} style={{ minWidth: 110, backgroundColor: headerBg, borderColor: headerBorderColor }}>{labelHeader}</th>
              {showOpening && (
                <th className={TH} style={{ minWidth: 80, backgroundColor: headerBg, borderColor: headerBorderColor }}>
                  기초
                  <br />
                  <span className="font-normal text-[10px] text-blue-200">({prevYear}년기말)</span>
                </th>
              )}
              {monthLabels.map((m, i) => (
                <th
                  key={m}
                  className={TH}
                  style={{ minWidth: i === 11 ? 88 : 68, backgroundColor: headerBg, borderColor: headerBorderColor }}
                >
                  {m}
                  {i === 11 && (
                    <>
                      <br />
                      <span className="font-normal text-[10px] text-blue-200">(기말)</span>
                    </>
                  )}
                </th>
              ))}
              <th className={TH} style={{ minWidth: 80, backgroundColor: '#2a9d8f', borderColor: '#1f7a6e' }}>
                연간 합계
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className={`${getRowBg(row)} transition-colors`}>
                {/* 구분 */}
                <td className={labelCls(row)}>
                  {row.isLeaf && <span className="text-gray-400 mr-1">└</span>}
                  {row.label}
                </td>

                {/* 기초 (showOpening=true 일 때만) */}
                {showOpening && (
                  <td className={cellCls(row, row.opening != null ? '' : 'text-gray-300')}>
                    {formatAmt(row.opening)}
                  </td>
                )}

                {/* 1월~12월 */}
                {row.monthly.map((val, i) => (
                  <td
                    key={i}
                    className={cellCls(row, val === null ? 'text-gray-300' : '')}
                  >
                    {formatAmt(val)}
                  </td>
                ))}
                {/* 연간 합계 — 헤더 계열과 통일된 연한 배경 */}
                <td className={`${cellCls(row)} ${totalRowCls === 'bg-teal-50' ? 'bg-teal-50/60' : 'bg-sky-50'}`}>
                  {formatAmt(
                    row.monthly.reduce<number | null>((sum, v) => {
                      if (v == null) return sum;
                      return (sum ?? 0) + v;
                    }, null),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
