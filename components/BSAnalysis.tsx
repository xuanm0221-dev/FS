'use client';
import { useState } from 'react';
import { TableRow } from '@/lib/types';

interface BSAnalysisProps {
  bsData: TableRow[];
  year: number; // 2025 또는 2026
  previousYearData?: TableRow[]; // YoY 계산용
}

export default function BSAnalysis({ bsData, year, previousYearData }: BSAnalysisProps) {
  const [loanLimitOpen, setLoanLimitOpen] = useState(false);
  
  // 월 인덱스
  const month = year === 2026 ? 5 : 11; // 6월 또는 12월
  const prevMonth = 11; // 전년 12월
  
  // 값 추출 함수
  const getAccountValue = (account: string, data: TableRow[], monthIdx: number) => {
    const row = data.find(r => r.account === account);
    return row?.values[monthIdx] || 0;
  };
  
  // 당년 재무제표 값
  const 자산 = getAccountValue('자산', bsData, month);
  const 부채 = getAccountValue('부채', bsData, month);
  const 자본 = getAccountValue('자본', bsData, month);
  const 유동자산 = getAccountValue('유동자산', bsData, month);
  const 유동부채 = getAccountValue('유동부채', bsData, month);
  const 차입금 = getAccountValue('차입금', bsData, month);
  const 이익잉여금 = getAccountValue('이익잉여금', bsData, month);
  
  // 전년 값 (YoY 계산용)
  const 전년자본 = previousYearData ? getAccountValue('자본', previousYearData, prevMonth) : 0;
  const 전년부채 = previousYearData ? getAccountValue('부채', previousYearData, prevMonth) : 0;
  const 전년자산 = previousYearData ? getAccountValue('자산', previousYearData, prevMonth) : 0;
  const 전년차입금 = previousYearData ? getAccountValue('차입금', previousYearData, prevMonth) : 0;
  const 전년이익잉여금 = previousYearData ? getAccountValue('이익잉여금', previousYearData, prevMonth) : 0;
  
  // 당기순이익 계산 (이익잉여금 YoY, M 단위)
  const 당기순이익 = (이익잉여금 - 전년이익잉여금) / 1000; // M 단위
  
  // 재무비율 계산
  const 부채비율 = 자본 !== 0 ? (부채 / 자본) * 100 : 0;
  const 차입금비율 = 자산 !== 0 ? (차입금 / 자산) * 100 : 0;
  const 유동비율 = 유동부채 !== 0 ? (유동자산 / 유동부채) * 100 : 0;
  const ROE = 자본 !== 0 ? (당기순이익 * 1000 / 자본) * 100 : 0;
  
  // 전년 비율
  const 전년부채비율 = 전년자본 !== 0 ? (전년부채 / 전년자본) * 100 : 0;
  const 전년차입금비율 = 전년자산 !== 0 ? (전년차입금 / 전년자산) * 100 : 0;
  
  // 차입가능한도 state
  const [loanLimits, setLoanLimits] = useState({
    합계: { current: 350000, total: 1000000 },
    산업은행: { current: 120000, total: 120000 },
    조상은행: { current: 150000, total: 150000 },
    KDB: { current: 0, total: 140000 },
    KB: { current: 0, total: 140000 },
    중국은행: { current: 0, total: 200000 },
    광대은행: { current: 0, total: 150000 },
    공상은행: { current: 80000, total: 100000 },
  });
  
  const updateLoanLimit = (bank: string, field: 'current' | 'total', value: number) => {
    setLoanLimits(prev => ({
      ...prev,
      [bank]: { ...prev[bank as keyof typeof prev], [field]: value }
    }));
  };
  
  // 천단위 콤마 포맷팅
  const formatWithCommas = (value: number): string => {
    return value.toLocaleString('ko-KR');
  };
  
  // 콤마 제거 및 숫자 파싱
  const parseNumber = (value: string): number => {
    const cleaned = value.replace(/,/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  };
  
  return (
    <div className="px-6 pb-6">
      {/* 제목 */}
      <div className="mb-4 border-t-2 border-gray-400 pt-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          📊 재무비율 분석 ({year}년 {year === 2026 ? '6월' : '기말'} 기준)
        </h2>
      </div>
      
      {/* 4개 재무비율 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* 부채비율 */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">부채비율</div>
          <div className="text-3xl font-bold text-green-600">
            {부채비율.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            (25년말 {전년부채비율.toFixed(0)}%)
          </div>
          <div className="text-xs text-gray-600 mt-2">
            25년말 대비 {(부채비율 - 전년부채비율).toFixed(0)}%p 개선<br/>
            차입금 상환 및 자본 증가
          </div>
        </div>
        
        {/* 차입금비율 */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">차입금비율</div>
          <div className="text-3xl font-bold text-blue-600">
            {차입금비율.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            (25년말 {전년차입금비율.toFixed(0)}%)
          </div>
          <div className="text-xs text-gray-600 mt-2">
            차입금 {(차입금 / 1000).toFixed(0)}M 상환으로<br/>
            {Math.abs(차입금비율 - 전년차입금비율).toFixed(0)}%p 대폭 개선
          </div>
        </div>
        
        {/* 유동비율 */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">유동비율</div>
          <div className="text-3xl font-bold text-purple-600">
            {유동비율.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">(양호)</div>
          <div className="text-xs text-gray-600 mt-2">
            단기 채무상환<br/>
            능력 양호
          </div>
        </div>
        
        {/* ROE */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">자기자본순이익률</div>
          <div className="text-3xl font-bold text-orange-600">
            {ROE.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ({year === 2026 ? '상반기' : '통년'} 기준)
          </div>
          <div className="text-xs text-gray-600 mt-2">
            당기순이익 {당기순이익.toFixed(0)}M<br/>
            안정적 수익성 유지
          </div>
        </div>
      </div>
      
      {/* 해석 + 차입가능한도 2열 레이아웃 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 좌측: 해석 박스 */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <h3 className="font-semibold text-blue-900 mb-2">💡 해석:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 부채비율 {부채비율.toFixed(0)}%: 25년말 {전년부채비율.toFixed(0)}% 대비 {Math.abs(부채비율 - 전년부채비율).toFixed(0)}%p 개선, 재무 안정성 크게 향상</li>
            <li>• 유동비율 {유동비율.toFixed(0)}%: 단기 채무상환 능력 양호</li>
            <li>• ROE {ROE.toFixed(1)}%: {year === 2026 ? '상반기' : '통년'} 순이익 {당기순이익.toFixed(0)}M, 안정적 수익성 유지</li>
            <li>• 차입금비율 {차입금비율.toFixed(0)}%: 25년말 {전년차입금비율.toFixed(0)}% 대비 {Math.abs(차입금비율 - 전년차입금비율).toFixed(0)}%p 개선, 재무 레버리지 최적화</li>
          </ul>
        </div>
        
        {/* 우측: 차입가능한도 테이블 */}
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden shadow-sm">
        <button
          onClick={() => setLoanLimitOpen(!loanLimitOpen)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            💰 차입가능한도
          </h3>
          <span className="text-gray-600">{loanLimitOpen ? '▼' : '▶'}</span>
        </button>
        
        {loanLimitOpen && (
          <div className="p-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-orange-100">
                  <th className="border border-gray-300 py-2 px-3 text-center font-semibold">은행명</th>
                  <th className="border border-gray-300 py-2 px-3 text-center font-semibold">2026년6월</th>
                  <th className="border border-gray-300 py-2 px-3 text-center font-semibold">총 한도</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-yellow-100">
                  <td className="border border-gray-300 py-2 px-3 font-semibold">▼ 합계</td>
                  <td className="border border-gray-300 py-2 px-3">
                    <input
                      type="text"
                      value={formatWithCommas(loanLimits.합계.current)}
                      onChange={(e) => updateLoanLimit('합계', 'current', parseNumber(e.target.value))}
                      className="w-full px-2 py-1 text-right bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="border border-gray-300 py-2 px-3">
                    <input
                      type="text"
                      value={formatWithCommas(loanLimits.합계.total)}
                      onChange={(e) => updateLoanLimit('합계', 'total', parseNumber(e.target.value))}
                      className="w-full px-2 py-1 text-right bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
                {Object.entries(loanLimits)
                  .filter(([name]) => name !== '합계')
                  .map(([name, limits]) => (
                    <tr key={name}>
                      <td className="border border-gray-300 py-2 px-3">{name}</td>
                      <td className="border border-gray-300 py-2 px-3">
                        <input
                          type="text"
                          value={formatWithCommas(limits.current)}
                          onChange={(e) => updateLoanLimit(name, 'current', parseNumber(e.target.value))}
                          className="w-full px-2 py-1 text-right bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="border border-gray-300 py-2 px-3">
                        <input
                          type="text"
                          value={formatWithCommas(limits.total)}
                          onChange={(e) => updateLoanLimit(name, 'total', parseNumber(e.target.value))}
                          className="w-full px-2 py-1 text-right bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

