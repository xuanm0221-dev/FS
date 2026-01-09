'use client';

import { useState, useEffect, useMemo } from 'react';
import Tabs from '@/components/Tabs';
import YearTabs from '@/components/YearTabs';
import BrandTabs from '@/components/BrandTabs';
import BaseMonthSelector from '@/components/BaseMonthSelector';
import FinancialTable from '@/components/FinancialTable';
import CreditStatus from '@/components/CreditStatus';
import BSAnalysis from '@/components/BSAnalysis';
import ExecutiveSummary from '@/components/ExecutiveSummary';
import { TableRow, CreditData, TabType, ExecutiveSummaryData } from '@/lib/types';

export default function Home() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [plYear, setPlYear] = useState<number>(2025);
  const [plBrand, setPlBrand] = useState<string | null>(null); // null=법인, 'mlb', 'kids' 등
  const [bsYear, setBsYear] = useState<number>(2025);
  const [baseMonth, setBaseMonth] = useState<number>(12); // 기준월 (기본 12월)
  const [cfBaseMonth, setCfBaseMonth] = useState<number>(12); // 현금흐름표 기준월 (기본 12월)
  const [bsMonthsCollapsed, setBsMonthsCollapsed] = useState<boolean>(true); // 재무상태표 & 운전자본 월별 접기
  const [cfMonthsCollapsed, setCfMonthsCollapsed] = useState<boolean>(false); // 현금흐름표 월별 접기
  // 브랜드별 손익 보기는 항상 활성화 (법인 선택 시)
  const [hideYtd, setHideYtd] = useState<boolean>(true); // YTD 숨기기 (기준월 12월일 때, 기본값: 숨김)
  const [summaryData, setSummaryData] = useState<ExecutiveSummaryData | null>(null);
  const [plData, setPlData] = useState<TableRow[] | null>(null);
  const [bsData, setBsData] = useState<TableRow[] | null>(null);
  const [previousBsData, setPreviousBsData] = useState<TableRow[] | null>(null);
  const [workingCapitalData, setWorkingCapitalData] = useState<TableRow[] | null>(null);
  const [cfData, setCfData] = useState<TableRow[] | null>(null);
  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // 비고 데이터 관리
  const [bsRemarks, setBsRemarks] = useState<Map<string, string>>(new Map());
  const [wcRemarks, setWcRemarks] = useState<Map<string, string>>(new Map());
  const [wcRemarksAuto, setWcRemarksAuto] = useState<{ [key: string]: string } | null>(null);

  // 비고 데이터 로드
  useEffect(() => {
    const loadRemarks = async (type: 'bs' | 'wc') => {
      try {
        const response = await fetch(`/api/remarks?type=${type}`);
        if (response.ok) {
          const data = await response.json();
          if (data.remarks) {
            const remarksMap = new Map<string, string>(Object.entries(data.remarks) as [string, string][]);
            if (type === 'bs') {
              setBsRemarks(remarksMap);
            } else {
              setWcRemarks(remarksMap);
            }
          }
        }
      } catch (error) {
        console.error('비고 로드 실패:', error);
      }
    };

    // 재무상태표 탭일 때만 로드
    if (activeTab === 2) {
      loadRemarks('bs');
      loadRemarks('wc');
    }
  }, [activeTab]);

  // 비고 저장 함수 (디바운스)
  const saveRemarkDebounced = useMemo(() => {
    const timeouts: { [key: string]: NodeJS.Timeout } = {};
    
    return async (account: string, remark: string, type: 'bs' | 'wc') => {
      const key = `${type}-${account}`;
      if (timeouts[key]) {
        clearTimeout(timeouts[key]);
      }
      
      timeouts[key] = setTimeout(async () => {
        try {
          const response = await fetch('/api/remarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account, remark, type })
          });
          
          const data = await response.json();
          
          if (!data.success) {
            console.error('비고 저장 실패:', data.error || 'Unknown error');
            // 에러가 발생해도 사용자 경험을 위해 조용히 실패 (콘솔에만 로그)
          } else {
            console.log('비고 저장 성공:', account);
          }
        } catch (error) {
          console.error('비고 저장 실패:', error);
        }
      }, 1000); // 1초 디바운스
    };
  }, []);

  // 브랜드 목록
  const brands = [
    { id: null, label: '법인' },
    { id: 'mlb', label: 'MLB' },
    { id: 'kids', label: 'KIDS' },
    { id: 'discovery', label: 'DISCOVERY' },
    { id: 'duvetica', label: 'DUVETICA' },
    { id: 'supra', label: 'SUPRA' },
  ];

  const tabs = ['경영요약', '손익계산서', '재무상태표', '현금흐름표', '여신사용현황'];
  const tabTypes: TabType[] = ['SUMMARY', 'PL', 'BS', 'CF', 'CREDIT'];

  // 데이터 로딩
  const loadData = async (type: TabType, year?: number, month?: number, brand?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      let url = '';
      if (type === 'PL') {
        // 브랜드별 또는 법인 PL
        if (brand) {
          url = `/api/fs/pl/brand?brand=${brand}&year=${year}`;
          if (year === 2025 && month !== undefined) {
            url += `&baseMonth=${month}`;
          }
        } else {
          url = `/api/fs/pl?year=${year}`;
          if (year === 2025 && month !== undefined) {
            url += `&baseMonth=${month}`;
          }
        }
      } else if (type === 'BS') {
        url = `/api/fs/bs?year=${year}`;
      } else if (type === 'CF') {
        url = `/api/fs/cf`;
      } else if (type === 'CREDIT') {
        url = `/api/fs/credit`;
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
        setWcRemarksAuto(result.wcRemarksAuto || null);
        
        // 전년도 데이터 로드 (2025, 2026년일 경우)
        if (year === 2025 || year === 2026) {
          const prevYear = year - 1;
          try {
            const prevResponse = await fetch(`/api/fs/bs?year=${prevYear}`);
            if (prevResponse.ok) {
              const prevResult = await prevResponse.json();
              setPreviousBsData(prevResult.rows);
            }
          } catch (err) {
            console.error('전년도 BS 데이터 로드 실패:', err);
            setPreviousBsData(null);
          }
        } else {
          setPreviousBsData(null);
        }
      } else if (type === 'CF') {
        setCfData(result.rows);
      } else if (type === 'CREDIT') {
        setCreditData(result);
      }
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 경영요약 데이터 로드
  const loadSummaryData = async () => {
    try {
      setLoading(true);
      
      // 1순위: localStorage에서 확인 (개인 수정본)
      const savedData = localStorage.getItem('executive-summary');
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setSummaryData(parsed);
          setLoading(false);
          return;
        } catch (parseErr) {
          console.error('localStorage 파싱 실패:', parseErr);
        }
      }
      
      // 2순위: 프로젝트 기본 파일에서 불러오기
      try {
        const fileResponse = await fetch('/data/executive-summary.json');
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          setSummaryData(fileData);
          // localStorage에도 저장 (다음부터는 여기서 로드)
          localStorage.setItem('executive-summary', JSON.stringify(fileData));
          setLoading(false);
          return;
        }
      } catch (fileErr) {
        console.log('프로젝트 기본 파일 없음, API에서 생성합니다.');
      }
      
      // 3순위: API에서 생성 (최초 1회)
      const response = await fetch('/api/fs/summary');
      if (!response.ok) {
        throw new Error('경영요약 데이터를 불러올 수 없습니다.');
      }
      const result = await response.json();
      setSummaryData(result);
      localStorage.setItem('executive-summary', JSON.stringify(result));
    } catch (err) {
      console.error(err);
      setError('경영요약 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 경영요약 초기값으로 리셋
  const resetSummaryData = async () => {
    try {
      // localStorage 초기화
      localStorage.removeItem('executive-summary');
      
      // API에서 새로 불러오기
      setSummaryData(null);
      setLoading(true);
      const response = await fetch('/api/fs/summary');
      if (!response.ok) {
        throw new Error('경영요약 데이터를 불러올 수 없습니다.');
      }
      const result = await response.json();
      setSummaryData(result);
      // localStorage에도 저장
      localStorage.setItem('executive-summary', JSON.stringify(result));
      alert('초기값으로 리셋되었습니다.');
    } catch (err) {
      console.error(err);
      setError('초기값 불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    const currentType = tabTypes[activeTab];
    
    if (currentType === 'SUMMARY' && !summaryData) {
      loadSummaryData();
    } else if (currentType === 'PL' && !plData) {
      if (plBrand === null) {
        loadBrandBreakdownData();
      } else {
        loadData('PL', plYear, baseMonth, plBrand);
      }
    } else if (currentType === 'BS' && !bsData) {
      loadData('BS', bsYear);
    } else if (currentType === 'CF' && !cfData) {
      loadData('CF');
    } else if (currentType === 'CREDIT' && !creditData) {
      loadData('CREDIT');
    }
  }, [activeTab]);

  // 연도 변경 시 데이터 리로드
  useEffect(() => {
    if (tabTypes[activeTab] === 'PL') {
      if (plBrand === null) {
        loadBrandBreakdownData();
      } else {
        loadData('PL', plYear, baseMonth, plBrand);
      }
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
      if (plBrand === null) {
        loadBrandBreakdownData();
      } else {
        loadData('PL', plYear, baseMonth, plBrand);
      }
    }
  }, [baseMonth]);

  // 브랜드 변경 시 데이터 리로드
  useEffect(() => {
    if (tabTypes[activeTab] === 'PL') {
      if (plBrand === null) {
        // 법인 선택 시 항상 브랜드별 손익 데이터 로드
        loadBrandBreakdownData();
      } else {
        loadData('PL', plYear, baseMonth, plBrand);
      }
    }
  }, [plBrand]);

  // 브랜드별 손익 보기 데이터 로드
  const loadBrandBreakdownData = async () => {
    setLoading(true);
    setError(null);

    try {
      let url = `/api/fs/pl/breakdown?year=${plYear}`;
      if (plYear === 2025) {
        url += `&baseMonth=${baseMonth}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('데이터를 불러올 수 없습니다.');
      }

      const result = await response.json();
      setPlData(result.rows);
    } catch (err) {
      console.error(err);
      setError('브랜드별 손익 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 월 컬럼 (1월~12월)
  const monthColumns = ['계정과목', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  
  // CF 컬럼 (합계 포함)
  const cfColumns = [...monthColumns, '2025년(합계)'];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 상단 탭 */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* 내용 - 상단 탭 높이만큼 패딩 추가 */}
      <div className="p-0 pt-16">
        {/* 경영요약 */}
        {activeTab === 0 && (
          <ExecutiveSummary 
            data={summaryData}
            onChange={setSummaryData}
            onReset={resetSummaryData}
          />
        )}

        {/* PL - 손익계산서 */}
        {activeTab === 1 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300">
              <div className="flex items-center gap-4 px-6 py-3">
                <YearTabs years={[2024, 2025]} activeYear={plYear} onChange={setPlYear} />
                {plYear === 2025 && (
                  <BaseMonthSelector baseMonth={baseMonth} onChange={setBaseMonth} />
                )}
                <div className="h-8 w-px bg-gray-400 mx-2"></div>
                <BrandTabs brands={brands} activeBrand={plBrand} onChange={setPlBrand} />
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
                  showBrandBreakdown={plBrand === null}
                  hideYtd={hideYtd}
                  onHideYtdToggle={plYear === 2025 ? () => setHideYtd(!hideYtd) : undefined}
                />
              </div>
            )}
          </div>
        )}

        {/* BS - 재무상태표 */}
        {activeTab === 2 && (
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
                    showRemarks={bsYear === 2025 || bsYear === 2026}
                    remarks={bsRemarks}
                    onRemarkChange={(account, remark) => {
                      const newRemarks = new Map(bsRemarks);
                      newRemarks.set(account, remark);
                      setBsRemarks(newRemarks);
                      saveRemarkDebounced(account, remark, 'bs');
                    }}
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
                      showRemarks={bsYear === 2025 || bsYear === 2026}
                      remarks={wcRemarks}
                      autoRemarks={wcRemarksAuto || undefined}
                      onRemarkChange={(account, remark) => {
                        const newRemarks = new Map(wcRemarks);
                        newRemarks.set(account, remark);
                        setWcRemarks(newRemarks);
                        saveRemarkDebounced(account, remark, 'wc');
                      }}
                    />
                  </div>
                )}
                
                {/* 재무분석 (2025년, 2026년만) */}
                {workingCapitalData && bsData && (bsYear === 2025 || bsYear === 2026) && (
                  <BSAnalysis 
                    bsData={bsData}
                    year={bsYear}
                    previousYearData={previousBsData || undefined}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* CF - 현금흐름표 */}
        {activeTab === 3 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300">
              <div className="flex items-center gap-4 px-6 py-3">
                <span className="text-sm font-medium text-gray-700">2025년</span>
                <BaseMonthSelector baseMonth={cfBaseMonth} onChange={setCfBaseMonth} />
                <button
                  onClick={() => setCfMonthsCollapsed(!cfMonthsCollapsed)}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors shadow-sm"
                >
                  {cfMonthsCollapsed ? '월별 데이터 펼치기 ▶' : '월별 데이터 접기 ◀'}
                </button>
              </div>
            </div>
            {loading && <div className="p-6 text-center">로딩 중...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {cfData && !loading && (
              <div className="p-6">
                <FinancialTable 
                  data={cfData} 
                  columns={cfColumns} 
                  showTotal 
                  isCashFlow={true}
                  compactLayout={true}
                  baseMonth={cfBaseMonth}
                  monthsCollapsed={cfMonthsCollapsed}
                  onMonthsToggle={() => setCfMonthsCollapsed(!cfMonthsCollapsed)}
                />
              </div>
            )}
          </div>
        )}

        {/* 여신사용현황 */}
        {activeTab === 4 && (
          <div>
            <div className="bg-gray-100 border-b border-gray-300 px-6 py-3">
              <span className="text-sm font-medium text-gray-700">2025년 12월말 기준</span>
            </div>
            {loading && <div className="p-6 text-center">로딩 중...</div>}
            {error && <div className="p-6 text-center text-red-500">{error}</div>}
            {creditData && !loading && (
              <div className="p-6">
                <CreditStatus data={creditData} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

