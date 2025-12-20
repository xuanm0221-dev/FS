'use client';

import { useState, useEffect } from 'react';
import Tabs from '@/components/Tabs';
import YearTabs from '@/components/YearTabs';
import BaseMonthSelector from '@/components/BaseMonthSelector';
import FinancialTable from '@/components/FinancialTable';
import { TableRow } from '@/lib/types';

type TabType = 'PL' | 'BS' | 'CF' | 'CREDIT';

export default function Home() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [plYear, setPlYear] = useState<number>(2025);
  const [bsYear, setBsYear] = useState<number>(2025);
  const [baseMonth, setBaseMonth] = useState<number>(11); // 기준월 (기본 11월)
  const [bsMonthsCollapsed, setBsMonthsCollapsed] = useState<boolean>(false); // 재무상태표 & 운전자본 월별 접기
  const [plData, setPlData] = useState<TableRow[] | null>(null);
  const [bsData, setBsData] = useState<TableRow[] | null>(null);
  const [workingCapitalData, setWorkingCapitalData] = useState<TableRow[] | null>(null);
  const [cfData, setCfData] = useState<TableRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const tabs = ['손익계산서', '재무상태표', '현금흐름표', '여신사용현황'];
  const tabTypes: TabType[] = ['PL', 'BS', 'CF', 'CREDIT'];

  // 데이터 로딩
  const loadData = async (type: TabType, year?: number, month?: number) => {
    setLoading(true);
    setError(null);

    try {
      let url = '';
      if (type === 'PL') {
        url = `/api/fs/pl?year=${year}`;
        // 2025년이고 month가 지정된 경우 baseMonth 추가
        if (year === 2025 && month !== undefined) {
          url += `&baseMonth=${month}`;
        }
      } else if (type === 'BS') {
        url = `/api/fs/bs?year=${year}`;
      } else if (type === 'CF') {
        url = `/api/fs/cf`;
      }

      if (!url) return;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('데이터를 불러올 수 없습니다.');
      }

      const result = await response.json();

      if (type === 'PL') {
        setPlData(result.rows);
      } else if (type === 'BS') {
        setBsData(result.rows);
        setWorkingCapitalData(result.workingCapital || null);
      } else if (type === 'CF') {
        setCfData(result.rows);
      }
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    const currentType = tabTypes[activeTab];
    
    if (currentType === 'PL' && !plData) {
      loadData('PL', plYear, baseMonth);
    } else if (currentType === 'BS' && !bsData) {
      loadData('BS', bsYear);
    } else if (currentType === 'CF' && !cfData) {
      loadData('CF');
    }
  }, [activeTab]);

  // 연도 변경 시 데이터 리로드
  useEffect(() => {
    if (tabTypes[activeTab] === 'PL') {
      loadData('PL', plYear, baseMonth);
    }
  }, [plYear]);

  useEffect(() => {
    if (tabTypes[activeTab] === 'BS') {
      loadData('BS', bsYear);
    }
  }, [bsYear]);

  // 기준월 변경 시 데이터 리로드 (PL 2025년만)
  useEffect(() => {
    if (tabTypes[activeTab] === 'PL' && plYear === 2025) {
      loadData('PL', plYear, baseMonth);
    }
  }, [baseMonth]);

  // 월 컬럼 (1월~12월)
  const monthColumns = ['계정과목', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  
  // CF 컬럼 (합계 포함)
  const cfColumns = [...monthColumns, '2025년(합계)'];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 상단 탭 */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* 내용 */}
      <div className="p-0">
        {/* PL - 손익계산서 */}
        {activeTab === 0 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300">
              <div className="flex items-center gap-4 px-6 py-3">
                <YearTabs years={[2024, 2025]} activeYear={plYear} onChange={setPlYear} />
                {plYear === 2025 && (
                  <BaseMonthSelector baseMonth={baseMonth} onChange={setBaseMonth} />
                )}
              </div>
            </div>
            {loading && <div className="p-6 text-center">로딩 중...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {plData && !loading && (
              <div className="p-6">
                <FinancialTable 
                  data={plData} 
                  columns={monthColumns}
                  showComparisons={plYear === 2025}
                  baseMonth={baseMonth}
                />
              </div>
            )}
          </div>
        )}

        {/* BS - 재무상태표 */}
        {activeTab === 1 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300">
              <div className="flex items-center gap-4 px-6 py-3">
                <YearTabs years={[2024, 2025, 2026]} activeYear={bsYear} onChange={setBsYear} />
              </div>
            </div>
            {loading && <div className="p-6 text-center">로딩 중...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {bsData && !loading && (
              <>
                <div className="p-6">
                  <FinancialTable 
                    data={bsData} 
                    columns={monthColumns} 
                    showComparisons={bsYear === 2025 || bsYear === 2026}
                    baseMonth={11}
                    isBalanceSheet={true}
                    currentYear={bsYear}
                    monthsCollapsed={bsMonthsCollapsed}
                    onMonthsToggle={() => setBsMonthsCollapsed(!bsMonthsCollapsed)}
                  />
                </div>
                
                {/* 운전자본 표 */}
                {workingCapitalData && (
                  <div className="px-6 pb-6">
                    <div className="mb-4 border-t-2 border-gray-400 pt-6">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">운전자본 분석</h2>
                    </div>
                    <FinancialTable 
                      data={workingCapitalData} 
                      columns={monthColumns} 
                      showComparisons={bsYear === 2025 || bsYear === 2026}
                      baseMonth={11}
                      isBalanceSheet={true}
                      currentYear={bsYear}
                      monthsCollapsed={bsMonthsCollapsed}
                      onMonthsToggle={() => setBsMonthsCollapsed(!bsMonthsCollapsed)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* CF - 현금흐름표 */}
        {activeTab === 2 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300 px-6 py-3">
              <span className="text-sm font-medium text-gray-700">2025년</span>
            </div>
            {loading && <div className="p-6 text-center">로딩 중...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {cfData && !loading && (
              <div className="p-6">
                <FinancialTable data={cfData} columns={cfColumns} showTotal />
              </div>
            )}
          </div>
        )}

        {/* 여신사용현황 - 추후 구현 */}
        {activeTab === 3 && (
          <div className="p-12 text-center text-gray-500">
            <div className="text-xl font-semibold mb-2">여신사용현황</div>
            <div>추후 구현 예정입니다.</div>
          </div>
        )}
      </div>
    </main>
  );
}

