'use client';

import { useState, useMemo } from 'react';
import { TableRow } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/utils';

interface FinancialTableProps {
  data: TableRow[];
  columns: string[]; // ["계정과목", "1월", ..., "12월"] 또는 [..., "2025년(합계)"]
  showTotal?: boolean; // CF에서 합계 컬럼 표시 여부
  showComparisons?: boolean; // PL 2025년 또는 BS 2025/2026에서 비교 컬럼 표시 여부
  baseMonth?: number; // 기준월 (1~12)
  isBalanceSheet?: boolean; // 재무상태표 여부
  currentYear?: number; // 현재 년도 (BS 기말 컬럼 헤더에 사용)
  monthsCollapsed?: boolean; // 월별 데이터 접기 상태 (외부 제어)
  onMonthsToggle?: () => void; // 월별 데이터 토글 핸들러
}

export default function FinancialTable({ 
  data, 
  columns, 
  showTotal = false,
  showComparisons = false,
  baseMonth = 11,
  isBalanceSheet = false,
  currentYear,
  monthsCollapsed: externalMonthsCollapsed,
  onMonthsToggle,
}: FinancialTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [internalMonthsCollapsed, setInternalMonthsCollapsed] = useState<boolean>(false);
  const [allRowsCollapsed, setAllRowsCollapsed] = useState<boolean>(false);
  
  // 외부에서 monthsCollapsed를 제어하는 경우와 내부에서 제어하는 경우 모두 지원
  const monthsCollapsed = externalMonthsCollapsed !== undefined ? externalMonthsCollapsed : internalMonthsCollapsed;
  const toggleMonths = onMonthsToggle || (() => setInternalMonthsCollapsed(!internalMonthsCollapsed));

  // 그룹 접기/펼치기 토글
  const toggleCollapse = (account: string) => {
    const newCollapsed = new Set(collapsed);
    if (newCollapsed.has(account)) {
      newCollapsed.delete(account);
    } else {
      newCollapsed.add(account);
    }
    setCollapsed(newCollapsed);
  };

  // 모든 행 접기/펼치기
  const toggleAllRows = () => {
    if (allRowsCollapsed) {
      // 모두 펼치기
      setCollapsed(new Set());
      setAllRowsCollapsed(false);
    } else {
      // 모두 접기 (그룹인 행만)
      const allGroups = data.filter(row => row.isGroup).map(row => row.account);
      setCollapsed(new Set(allGroups));
      setAllRowsCollapsed(true);
    }
  };

  // 표시할 행 필터링 (접힌 그룹의 자식은 숨김)
  const visibleRows = useMemo(() => {
    const result: TableRow[] = [];
    let skipUntilLevel = -1;

    for (const row of data) {
      // 접힌 그룹의 자식인지 확인
      if (skipUntilLevel >= 0 && row.level > skipUntilLevel) {
        continue; // 숨김
      } else {
        skipUntilLevel = -1; // 스킵 종료
      }

      result.push(row);

      // 이 행이 접힌 그룹이면 다음 행부터 스킵
      if (row.isGroup && collapsed.has(row.account)) {
        skipUntilLevel = row.level;
      }
    }

    return result;
  }, [data, collapsed]);

  // 값 포맷팅
  const formatValue = (
    value: number | null, 
    format?: 'number' | 'percent', 
    showSign: boolean = false,
    useParentheses: boolean = false
  ) => {
    if (format === 'percent') {
      return formatPercent(value, showSign, useParentheses);
    }
    return formatNumber(value, showSign, useParentheses);
  };

  // 음수 값인지 확인
  const isNegative = (value: number | null | undefined): boolean => {
    return value !== null && value !== undefined && value < 0;
  };

  // 배경색 클래스
  const getHighlightClass = (highlight?: 'sky' | 'yellow' | 'gray' | 'none') => {
    if (highlight === 'sky') return 'bg-highlight-sky';
    if (highlight === 'yellow') return 'bg-highlight-yellow';
    if (highlight === 'gray') return 'bg-highlight-gray';
    return '';
  };

  // 비교 컬럼 정의
  const comparisonColumns = useMemo(() => {
    if (!showComparisons) return [];
    
    if (isBalanceSheet) {
      // 재무상태표
      const prevYear = currentYear ? currentYear - 1 : 24;
      const currYear = currentYear ? currentYear % 100 : 25;
      
      if (currentYear === 2026) {
        // 2026년: 25년기말 vs 26년6월만
        return [
          `${prevYear}년기말`,
          `${currYear}년6월`,
          'YoY',
        ];
      } else {
        // 2025년: 월별 + 기말 비교
        return [
          `전년(${baseMonth}월)`,
          `당년(${baseMonth}월)`,
          'YoY',
          `${prevYear}년기말`,
          `${currYear}년기말`,
          'YoY',
        ];
      }
    } else {
      // 손익계산서: 월별, YTD, 연간
      return [
        `전년(${baseMonth}월)`,
        `당년(${baseMonth}월)`,
        'YoY',
        '전년YTD',
        '당년YTD',
        'YoY',
        '24년연간',
        '25년연간',
        'YoY',
      ];
    }
  }, [showComparisons, isBalanceSheet, baseMonth, currentYear]);

  // 실제 표시할 컬럼 (월 토글 고려, 빈 컬럼 포함)
  const displayColumns = useMemo(() => {
    const accountCol = [columns[0]]; // "계정과목"
    
    if (showComparisons) {
      if (isBalanceSheet) {
        // 재무상태표
        if (currentYear === 2026) {
          // 2026년: 1~6월 + 25년기말 26년6월 YoY
          if (monthsCollapsed) {
            return [
              ...accountCol,
              '', // 빈 컬럼
              comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
            ];
          } else {
            const monthCols = columns.slice(1, 7); // 1월~6월만 (index 1~6)
            return [
              ...accountCol,
              ...monthCols,
              '', // 빈 컬럼
              comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
            ];
          }
        } else {
          // 2025년: 1~12월 + 전년(11월) 당년(11월) + 기말
          if (monthsCollapsed) {
            return [
              ...accountCol,
              '', // 빈 컬럼
              comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
              '', // 빈 컬럼
              comparisonColumns[3], comparisonColumns[4], comparisonColumns[5],
            ];
          } else {
            const monthCols = columns.slice(1);
            return [
              ...accountCol,
              ...monthCols,
              '', // 빈 컬럼 (12월 뒤)
              comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
              '', // 빈 컬럼
              comparisonColumns[3], comparisonColumns[4], comparisonColumns[5],
            ];
          }
        }
      } else {
        // 손익계산서: YTD 포함
        if (monthsCollapsed) {
          return [
            ...accountCol,
            '', // 빈 컬럼
            comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
            '', // 빈 컬럼
            comparisonColumns[3], comparisonColumns[4], comparisonColumns[5],
            '', // 빈 컬럼
            comparisonColumns[6], comparisonColumns[7], comparisonColumns[8],
          ];
        } else {
          const monthCols = columns.slice(1);
          return [
            ...accountCol,
            ...monthCols,
            '', // 빈 컬럼 (12월 뒤)
            comparisonColumns[0], comparisonColumns[1], comparisonColumns[2],
            '', // 빈 컬럼 (월별 YoY 뒤)
            comparisonColumns[3], comparisonColumns[4], comparisonColumns[5],
            '', // 빈 컬럼 (YTD YoY 뒤)
            comparisonColumns[6], comparisonColumns[7], comparisonColumns[8],
          ];
        }
      }
    } else {
      // 기본: 모든 컬럼
      return columns;
    }
  }, [columns, showComparisons, monthsCollapsed, comparisonColumns, isBalanceSheet]);

  return (
    <div>
      {/* 컨트롤 버튼들 */}
      <div className="mb-4 flex items-center gap-2">
        {/* 모든 행 접기/펼치기 버튼 */}
        <button
          onClick={toggleAllRows}
          className="px-4 py-2 text-sm font-medium rounded bg-gray-600 text-white hover:bg-gray-700 transition-colors"
        >
          {allRowsCollapsed ? '펼치기 ▼' : '접기 ▲'}
        </button>
        
        {/* 월 컬럼 토글 버튼 (PL 2025년만) */}
        {showComparisons && (
          <>
            <button
              onClick={toggleMonths}
              className="px-4 py-2 text-sm font-medium rounded bg-navy text-white hover:bg-navy-light transition-colors"
            >
              {monthsCollapsed ? '월별 데이터 펼치기 ▶' : '월별 데이터 접기 ◀'}
            </button>
            <span className="text-sm text-gray-600">
              (비교 컬럼은 항상 표시됩니다)
            </span>
          </>
        )}
      </div>

      <div className="relative overflow-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-navy text-white">
            <tr>
              {displayColumns.map((col, index) => {
                const isAccountCol = index === 0;
                const isSpacer = col === ''; // 빈 컬럼인지 확인
                
                // 빈 컬럼이면 특별한 스타일 적용
                if (isSpacer) {
                  return (
                    <th
                      key={index}
                      className="bg-white border-0 w-4"
                      style={{ minWidth: '16px', maxWidth: '16px', padding: 0 }}
                    >
                    </th>
                  );
                }
                
                const isComparisonCol = showComparisons && comparisonColumns.includes(col);
                
                return (
                  <th
                    key={index}
                    className={`
                      border border-gray-300 py-3 text-center font-semibold text-white
                      ${isAccountCol ? 'sticky left-0 z-20 bg-navy min-w-[200px] px-4' : 'min-w-[100px] px-4'}
                      ${isComparisonCol ? 'bg-navy-light' : !isAccountCol ? 'bg-navy' : ''}
                    `}
                  >
                    {col}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => {
              // Balance Check 행 스타일링 (절대값 10 미만이면 정합)
              const isBalanceCheck = row.account === 'Balance Check';
              const isBalanceOk = isBalanceCheck && row.values.every(v => v === null || Math.abs(v) < 10);
              
              return (
              <tr
                key={rowIndex}
                className={`
                  ${isBalanceCheck && isBalanceOk ? 'bg-green-100' : ''}
                  ${isBalanceCheck && !isBalanceOk ? 'bg-red-100' : ''}
                  ${!isBalanceCheck ? getHighlightClass(row.isHighlight) : ''}
                  ${row.isBold ? 'font-semibold' : ''}
                  hover:bg-gray-50
                `}
              >
                {/* 계정과목 열 (고정) */}
                <td
                  className={`
                    border border-gray-300 px-4 py-2 sticky left-0 z-10
                    ${isBalanceCheck && isBalanceOk ? 'bg-green-100' : ''}
                    ${isBalanceCheck && !isBalanceOk ? 'bg-red-100' : ''}
                    ${!isBalanceCheck && (getHighlightClass(row.isHighlight))}
                    ${!isBalanceCheck && (!row.isHighlight || row.isHighlight === 'none') ? 'bg-white' : ''}
                    ${row.isGroup ? 'cursor-pointer' : ''}
                    ${row.isBold ? 'font-semibold' : ''}
                  `}
                  style={{ paddingLeft: `${8 + row.level * 16}px` }}
                  onClick={() => row.isGroup && toggleCollapse(row.account)}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {isBalanceCheck ? (
                        isBalanceOk ? 'Balance Check ✓ 정합' : 'Balance Check (차대변 불일치)'
                      ) : (
                        row.account
                      )}
                    </span>
                    {row.isGroup && (
                      <span className="text-gray-500">
                        {collapsed.has(row.account) ? '▶' : '▼'}
                      </span>
                    )}
                  </div>
                </td>

                {/* 월별 값 (토글에 따라 표시/숨김) */}
                {!monthsCollapsed && row.values.map((value, colIndex) => {
                  // 2026년 재무상태표: 1~6월만 표시 (index 0~5)
                  if (isBalanceSheet && currentYear === 2026 && colIndex > 5) {
                    return null;
                  }
                  const isValueOk = value === null || Math.abs(value) < 10;
                  return (
                    <td
                      key={`month-${colIndex}`}
                      className={`
                        border border-gray-300 px-4 py-2 text-right
                        ${isBalanceCheck && isValueOk ? 'bg-green-100' : ''}
                        ${isBalanceCheck && !isValueOk ? 'bg-red-100' : ''}
                        ${!isBalanceCheck ? getHighlightClass(row.isHighlight) : ''}
                        ${row.isBold ? 'font-semibold' : ''}
                        ${isNegative(value) ? 'text-red-600' : ''}
                      `}
                    >
                      {formatValue(value, row.format, false, isBalanceSheet ? true : !row.isCalculated)}
                    </td>
                  );
                })}

                {/* 빈 컬럼들 및 비교 컬럼 (PL 2025년 또는 BS 2025/2026, 항상 표시) */}
                {showComparisons && row.comparisons && (
                  <>
                    {/* 월별 데이터 뒤 빈 컬럼 */}
                    <td className="bg-white border-0" style={{ minWidth: '16px', maxWidth: '16px', padding: 0 }}></td>
                    
                    {/* 2026년 재무상태표: 월별 비교 없이 기말 비교만 */}
                    {isBalanceSheet && currentYear === 2026 ? (
                      <>
                        {/* 25년기말 26년6월 YoY */}
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.prevYearAnnual === null || Math.abs(row.comparisons.prevYearAnnual) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.prevYearAnnual) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.prevYearAnnual, row.format, false, true)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.currYearAnnual === null || Math.abs(row.comparisons.currYearAnnual) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.currYearAnnual) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.currYearAnnual, row.format, false, true)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.annualYoY === null || Math.abs(row.comparisons.annualYoY) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.annualYoY) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.annualYoY, row.format, true, false)}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* 월별 비교 그룹 */}
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.prevYearMonth === null || Math.abs(row.comparisons.prevYearMonth) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.prevYearMonth) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.prevYearMonth, row.format, false, isBalanceSheet ? true : !row.isCalculated)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.currYearMonth === null || Math.abs(row.comparisons.currYearMonth) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.currYearMonth) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.currYearMonth, row.format, false, isBalanceSheet ? true : !row.isCalculated)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.monthYoY === null || Math.abs(row.comparisons.monthYoY) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.monthYoY) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.monthYoY, row.format, true, false)}
                        </td>
                        
                        {/* 월별 YoY 뒤 빈 컬럼 */}
                        <td className="bg-white border-0" style={{ minWidth: '16px', maxWidth: '16px', padding: 0 }}></td>
                        
                        {/* YTD 비교 그룹 (손익계산서만) */}
                        {!isBalanceSheet && (
                          <>
                            <td className={`border border-gray-300 px-4 py-2 text-right ${getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.prevYearYTD) ? 'text-red-600' : ''}`}>
                              {formatValue(row.comparisons.prevYearYTD, row.format, false, false)}
                            </td>
                            <td className={`border border-gray-300 px-4 py-2 text-right ${getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.currYearYTD) ? 'text-red-600' : ''}`}>
                              {formatValue(row.comparisons.currYearYTD, row.format, false, false)}
                            </td>
                            <td className={`border border-gray-300 px-4 py-2 text-right ${getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.ytdYoY) ? 'text-red-600' : ''}`}>
                              {formatValue(row.comparisons.ytdYoY, row.format, true, false)}
                            </td>
                            
                            {/* YTD YoY 뒤 빈 컬럼 */}
                            <td className="bg-white border-0" style={{ minWidth: '16px', maxWidth: '16px', padding: 0 }}></td>
                          </>
                        )}
                        
                        {/* 연간/기말 비교 그룹 */}
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.prevYearAnnual === null || Math.abs(row.comparisons.prevYearAnnual) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.prevYearAnnual) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.prevYearAnnual, row.format, false, isBalanceSheet)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.currYearAnnual === null || Math.abs(row.comparisons.currYearAnnual) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.currYearAnnual) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.currYearAnnual, row.format, false, isBalanceSheet)}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 text-right ${isBalanceCheck ? (row.comparisons.annualYoY === null || Math.abs(row.comparisons.annualYoY) < 10 ? 'bg-green-100' : 'bg-red-100') : getHighlightClass(row.isHighlight)} ${row.isBold ? 'font-semibold' : ''} ${isNegative(row.comparisons.annualYoY) ? 'text-red-600' : ''}`}>
                          {formatValue(row.comparisons.annualYoY, row.format, true, false)}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
