'use client';

import { useState, useEffect, useMemo } from 'react';
import { CreditData } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface CreditStatusProps {
  data: CreditData;
}

export default function CreditStatus({ data }: CreditStatusProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [wuhanMemo, setWuhanMemo] = useState<string>('생태니스로 에스크로 계좌 운용중');
  const [editingWuhan, setEditingWuhan] = useState<boolean>(false);
  const [recoveryPlan, setRecoveryPlan] = useState<string>(
    '여신회수: 11월 390m(회수 실적 388m), 12월 258m, 1월 62m, 2월 179m, 3월 81m'
  );
  const [editingRecovery, setEditingRecovery] = useState<boolean>(false);
  const [othersCollapsed, setOthersCollapsed] = useState<boolean>(true);

  // 비고 데이터 로드
  useEffect(() => {
    const loadCreditRemarks = async () => {
      try {
        const response = await fetch('/api/remarks?type=credit');
        if (response.ok) {
          const data = await response.json();
          if (data.remarks) {
            if (data.remarks.wuhanMemo) {
              setWuhanMemo(data.remarks.wuhanMemo);
            }
            if (data.remarks.recoveryPlan) {
              setRecoveryPlan(data.remarks.recoveryPlan);
            }
          }
        }
      } catch (error) {
        console.error('여신 비고 로드 실패:', error);
      }
    };

    loadCreditRemarks();
  }, []);

  // 비고 저장 함수 (디바운스)
  const saveCreditRemarkDebounced = useMemo(() => {
    const timeouts: { [key: string]: NodeJS.Timeout } = {};
    
    return async (key: 'wuhanMemo' | 'recoveryPlan', value: string) => {
      if (timeouts[key]) {
        clearTimeout(timeouts[key]);
      }
      
      timeouts[key] = setTimeout(async () => {
        try {
          const response = await fetch('/api/remarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              account: key, 
              remark: value, 
              type: 'credit' 
            })
          });
          
          const data = await response.json();
          
          if (!data.success) {
            console.error('여신 비고 저장 실패:', data.error || 'Unknown error');
          } else {
            console.log('여신 비고 저장 성공:', key);
          }
        } catch (error) {
          console.error('여신 비고 저장 실패:', error);
        }
      }, 1000); // 1초 디바운스
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* 상단 카드 2개 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 총여신현황 카드 */}
        <div className="bg-sky-100 border border-sky-300 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📊</span>
            <h3 className="text-lg font-semibold text-sky-900">총 여신 현황</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">외상매출금:</span>
              <span className="text-lg font-semibold text-gray-900">
                {formatNumber(data.total.외상매출금)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">선수금:</span>
              <span className="text-lg font-semibold text-gray-900">
                {formatNumber(data.total.선수금)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-sky-300">
              <span className="text-gray-700 font-semibold">순여신:</span>
              <span className="text-xl font-bold text-red-600">
                {formatNumber(data.total.순여신)}
              </span>
            </div>
          </div>
        </div>

        {/* 리스크 분석 카드 */}
        <div className="bg-orange-100 border border-orange-300 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="text-lg font-semibold text-orange-900">리스크 분석(순여신 잔액 기준)</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">상위 17개 비율:</span>
              <span className="text-lg font-semibold text-gray-900">
                {data.analysis.top17Ratio.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">최대 거래처 비율:</span>
              <span className="text-lg font-semibold text-gray-900">
                {data.analysis.top1Ratio.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-orange-300">
              <span className="text-gray-700 font-semibold">집중 리스크:</span>
              <span className={`text-xl font-bold ${data.analysis.riskLevel === '높음' ? 'text-red-600' : 'text-green-600'}`}>
                {data.analysis.riskLevel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="relative overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-30 bg-navy text-white">
            <tr>
              <th className="border border-gray-300 py-3 px-4 text-center sticky top-0 left-0 z-40 bg-navy min-w-[60px]">
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="text-white hover:text-yellow-300 transition-colors"
                >
                  {collapsed ? '▶' : '▼'} 정렬
                </button>
              </th>
              <th className="border border-gray-300 py-3 px-4 text-left min-w-[300px]">
                대리상 명칭
              </th>
              <th className="border border-gray-300 py-3 px-4 text-right min-w-[120px]">
                외상매출금
              </th>
              <th className="border border-gray-300 py-3 px-4 text-right min-w-[120px]">
                선수금
              </th>
              <th className="border border-gray-300 py-3 px-4 text-right min-w-[120px]">
                순여신
              </th>
            </tr>
          </thead>
          <tbody>
            {/* 1. 합계 행 (맨 위, 연한 하늘색) */}
            <tr className="bg-sky-100 font-bold">
              <td className="border border-gray-300 py-3 px-4 text-center sticky left-0 z-20 bg-sky-100">
                ▼ 합계
              </td>
              <td className="border border-gray-300 py-3 px-4"></td>
              <td className="border border-gray-300 py-3 px-4 text-right">
                {formatNumber(data.total.외상매출금)}
              </td>
              <td className="border border-gray-300 py-3 px-4 text-right">
                {formatNumber(data.total.선수금)}
              </td>
              <td className="border border-gray-300 py-3 px-4 text-right text-red-600">
                {formatNumber(data.total.순여신)}
              </td>
            </tr>

            {/* 2. 여신회수계획 행 (편집 가능, 노란색) */}
            <tr className="bg-yellow-50">
              <td 
                colSpan={5} 
                className="border border-gray-300 py-3 px-4 text-sm"
              >
                {editingRecovery ? (
                  <input
                    type="text"
                    value={recoveryPlan}
                    onChange={(e) => {
                      setRecoveryPlan(e.target.value);
                      saveCreditRemarkDebounced('recoveryPlan', e.target.value);
                    }}
                    onBlur={() => setEditingRecovery(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingRecovery(false);
                    }}
                    className="w-full px-2 py-1 border border-yellow-400 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                    autoFocus
                  />
                ) : (
                  <span
                    onClick={() => setEditingRecovery(true)}
                    className="cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded inline-block"
                    title="클릭하여 편집"
                  >
                    {recoveryPlan}
                  </span>
                )}
              </td>
            </tr>

            {/* 3. 상위 17개 대리상 (접기/펼치기 가능) */}
            {!collapsed && data.top17.map((dealer, index) => {
              const isWuhanModing = dealer.name.includes('Wuhan Moding');
              
              return (
                <tr 
                  key={index} 
                  className={`${isWuhanModing ? 'bg-red-50' : ''} hover:bg-gray-50`}
                >
                  <td className="border border-gray-300 py-2 px-4 text-center sticky left-0 z-20 bg-white">
                    {index + 1}
                  </td>
                  <td className="border border-gray-300 py-2 px-4">
                    {dealer.name}
                    {isWuhanModing && (
                      <span className="ml-2 text-xs text-red-600">
                        (
                        {editingWuhan ? (
                          <input
                            type="text"
                            value={wuhanMemo}
                            onChange={(e) => {
                              setWuhanMemo(e.target.value);
                              saveCreditRemarkDebounced('wuhanMemo', e.target.value);
                            }}
                            onBlur={() => setEditingWuhan(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingWuhan(false);
                            }}
                            className="inline-block w-64 px-1 border-b border-red-400 focus:outline-none bg-red-50"
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => setEditingWuhan(true)}
                            className="cursor-pointer hover:underline"
                            title="클릭하여 편집"
                          >
                            {wuhanMemo}
                          </span>
                        )}
                        )
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right">
                    {formatNumber(dealer.외상매출금)}
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right">
                    {formatNumber(dealer.선수금)}
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right font-semibold">
                    {formatNumber(dealer.순여신)}
                  </td>
                </tr>
              );
            })}

            {/* 4. 기타 행 (토글 가능) */}
            {!collapsed && (
              <>
                {/* 기타 합계 행 */}
                <tr className="bg-gray-100">
                  <td className="border border-gray-300 py-2 px-4 text-center sticky left-0 z-20 bg-gray-100">
                    <button
                      onClick={() => setOthersCollapsed(!othersCollapsed)}
                      className="text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      {othersCollapsed ? '▶' : '▼'}
                    </button>
                  </td>
                  <td className="border border-gray-300 py-2 px-4 font-semibold">
                    기타 {data.others.count}개
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right">
                    {formatNumber(data.others.외상매출금)}
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right">
                    {formatNumber(data.others.선수금)}
                  </td>
                  <td className="border border-gray-300 py-2 px-4 text-right font-semibold">
                    {formatNumber(data.others.순여신)}
                  </td>
                </tr>

                {/* 기타 개별 대리상 (펼쳤을 때만) */}
                {!othersCollapsed && data.othersList && data.othersList.map((dealer, index) => (
                  <tr key={`other-${index}`} className="bg-gray-50 hover:bg-gray-100">
                    <td className="border border-gray-300 py-2 px-4 text-center sticky left-0 z-20 bg-gray-50 text-sm text-gray-600">
                      {17 + index + 1}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 pl-8 text-sm text-gray-700">
                      {dealer.name}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-right text-sm">
                      {formatNumber(dealer.외상매출금)}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-right text-sm">
                      {formatNumber(dealer.선수금)}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-right text-sm">
                      {formatNumber(dealer.순여신)}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* 분석 내용 */}
      <div className="space-y-4 mt-6">
        {/* 여신 현황 요약 */}
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
          <div className="flex items-start gap-2">
            <span className="text-xl">📊</span>
            <div>
              <h4 className="font-semibold text-orange-900 mb-2">여신 현황 요약</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                <li>
                  <strong>총 외상매출금:</strong> {formatNumber(data.total.외상매출금)} 
                  (전체 {data.dealers.length}개 대리상)
                </li>
                <li>
                  <strong>총 선수금:</strong> {formatNumber(data.total.선수금)}
                </li>
                <li>
                  <strong>순여신:</strong> {formatNumber(data.total.순여신)} 
                  <span className="text-red-600 font-semibold"> (= 외상매출금 - 선수금)</span>
                </li>
                <li>
                  <strong>상위 17개 대리상 집중도:</strong> {data.analysis.top17Ratio.toFixed(1)}%
                  {data.top17[0] && (
                    <span> - {data.top17[0].name} 최대 거래처 ({data.analysis.top1Ratio.toFixed(1)}%)</span>
                  )}
                </li>
                {data.others.count > 0 && (
                  <li>
                    <strong>기타 대리상:</strong> {data.others.count}개, 외상매출금 {formatNumber(data.others.외상매출금)}, 순여신 {formatNumber(data.others.순여신)}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* 여신 관리 포인트 */}
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
          <div className="flex items-start gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <h4 className="font-semibold text-orange-900 mb-2">여신 관리 포인트</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                <li>
                  <strong>상위 17개 대리상의 집중도</strong>가 {data.analysis.top17Ratio.toFixed(1)}%로 {data.analysis.top17Ratio > 70 ? '지속 위험 수준' : '적정 수준'}
                  {data.top17[0] && data.analysis.top1Ratio > 20 && (
                    <span> - <strong>{data.top17[0].name}</strong> 최대 거래처 ({data.analysis.top1Ratio.toFixed(1)}%)의 회수 차질 시 영향 큼</span>
                  )}
                </li>
                <li>
                  <strong>총 외상매출금:</strong> {formatNumber(data.total.외상매출금)} (전체 {data.dealers.length}개 대리상)
                </li>
                <li>
                  <strong>순여신:</strong> {formatNumber(data.total.순여신)} 
                  {data.total.순여신 > 0 && (
                    <span className="text-red-600"> - 회수 진행 필요</span>
                  )}
                  {data.total.순여신 <= 0 && (
                    <span className="text-green-600"> - 양호한 상태</span>
                  )}
                </li>
                <li>
                  <strong>지속적인 신용평가</strong> 및 여신 회수 독촉 필요
                  {data.analysis.riskLevel === '높음' && (
                    <span className="text-red-600 font-semibold"> - 리스크 관리 강화 필요</span>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

