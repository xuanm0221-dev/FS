'use client';
import { useEffect, useState } from 'react';
import { ExecutiveSummaryData } from '@/lib/types';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  loadError?: string | null;
  onChange: (data: ExecutiveSummaryData) => void;
  onReset: () => void;
  onSaveToServer?: (data: ExecutiveSummaryData, password?: string) => Promise<{ ok: boolean; requirePassword?: boolean }>;
}

const textareaClass = 'w-full p-3 border border-gray-200 rounded-md bg-gray-50/50 text-gray-700 text-[15px] leading-relaxed focus:outline-none focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:bg-white';

const bulletLine = (s: string) => s.replace(/^[•·]\s*/, '');

export default function ExecutiveSummary({ data, loadError, onChange, onReset, onSaveToServer }: ExecutiveSummaryProps) {
  const [editMode, setEditMode] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [serverSavePassword, setServerSavePassword] = useState('');
  const [serverSaveError, setServerSaveError] = useState<string | null>(null);

  // data가 변경될 때마다 localStorage에 자동 저장
  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem('executive-summary', JSON.stringify(data));
      } catch (err) {
        console.error('localStorage 저장 실패:', err);
      }
    }
  }, [data]);

  if (!data) {
    return (
      <div className="p-6 text-center">
        {loadError ? (
          <div className="text-red-600">{loadError}</div>
        ) : (
          <div className="text-gray-500">경영요약 데이터를 불러오는 중...</div>
        )}
      </div>
    );
  }

  // 텍스트 변경 핸들러
  const handleTextChange = (
    section: keyof ExecutiveSummaryData['sections'],
    subsection: string,
    value: string
  ) => {
    const lines = value.split('\n').filter(line => line.trim());
    if (section === '심층분석') {
      const base = data.sections.심층분석 ?? {
        수익성악화원인: [], 재고관리이슈: [], 여신리스크개선: [], 재무건전성: [], 긍정적요소: [], 재무구조개선: []
      };
      onChange({
        ...data,
        sections: {
          ...data.sections,
          심층분석: { ...base, [subsection]: lines }
        }
      });
      return;
    }
    if (['주요성과', '핵심분석', '핵심인사이트', '핵심이슈권고사항', '결론'].includes(section)) {
      onChange({ ...data, sections: { ...data.sections, [section]: lines } });
      return;
    }
    onChange({
      ...data,
      sections: {
        ...data.sections,
        [section]: {
          ...data.sections[section],
          [subsection]: lines
        }
      }
    });
  };

  // 서버 저장 (비밀번호 모달에서 확인 클릭 시)
  const handleServerSaveWithPassword = async () => {
    if (!onSaveToServer || !data) return;
    setServerSaveError(null);
    const result = await onSaveToServer(data, serverSavePassword);
    if (result.ok) {
      setShowPasswordModal(false);
      setServerSavePassword('');
      alert('서버에 저장되었습니다.');
    } else if (result.requirePassword) {
      setServerSaveError('비밀번호가 올바르지 않습니다.');
    } else {
      setServerSaveError('서버 저장에 실패했습니다.');
    }
  };

  // 저장 (localStorage + JSON 백업 다운로드 + 서버 저장)
  const handleSave = async () => {
    try {
      // localStorage에 저장
      localStorage.setItem('executive-summary', JSON.stringify(data));
      
      // JSON 파일로도 백업 다운로드
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `executive-summary.json`;
      a.click();
      URL.revokeObjectURL(url);

      // 서버에 저장 (배포 환경이면 비밀번호 필요 시 모달 표시)
      if (onSaveToServer) {
        const result = await onSaveToServer(data);
        if (result.ok) {
          alert('저장되었습니다. (로컬 + 서버)');
        } else if (result.requirePassword) {
          setServerSaveError(null);
          setShowPasswordModal(true);
        } else {
          alert('로컬에는 저장되었으나 서버 저장에 실패했습니다.');
        }
      } else {
        alert('저장되었습니다!\n\n📌 팁: 다운로드된 executive-summary.json 파일을\n프로젝트의 /public/data/ 폴더에 복사하고\nGitHub에 푸시하면 팀 전체가 최신 버전을 사용할 수 있습니다.');
      }
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장에 실패했습니다.');
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    setEditMode(false);
  };

  const 주요성과 = data.sections.주요성과 ?? [];
  const 핵심분석 = data.sections.핵심분석 ?? [];
  const 핵심인사이트 = data.sections.핵심인사이트 ?? [];
  const 핵심이슈권고사항 = data.sections.핵심이슈권고사항 ?? [];
  const 결론 = data.sections.결론 ?? [];

  return (
    <div className="p-6">
      {/* 제목 + 버튼 (우측 상단 고정) */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{data.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            💾 저장하기
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors shadow-sm"
          >
            🔄 초기값으로
          </button>
          {!editMode ? (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
            >
              수정
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-500 text-white hover:bg-gray-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
              >
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 좌측 컬럼 */}
        <div className="space-y-6">
          {/* 수익성 분석 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-800">
              📊 수익성 분석
            </h2>
            {!editMode ? (
              <>
                <div className="border-l-4 border-blue-500 pl-4 mb-4">
                  <h4 className="font-bold text-base mb-2 text-blue-900">매출 성장 vs 수익성 약세</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.수익성분석.매출성장.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-blue-900">비용 증가</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.수익성분석.비용증가.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="font-medium text-blue-700 mb-2.5 text-base">매출 성장 vs 수익성 약세</h3>
                  <textarea
                    value={data.sections.수익성분석.매출성장.join('\n')}
                    onChange={(e) => handleTextChange('수익성분석', '매출성장', e.target.value)}
                    className={textareaClass}
                    rows={4}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-red-700 mb-2.5 text-base">비용 증가</h3>
                  <textarea
                    value={data.sections.수익성분석.비용증가.join('\n')}
                    onChange={(e) => handleTextChange('수익성분석', '비용증가', e.target.value)}
                    className={textareaClass}
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          {/* 재무 현황 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-orange-800">
              🔥 재무 현황
            </h2>
            {!editMode ? (
              <div className="space-y-4">
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-orange-900">자산 규모</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.재무현황.자산규모.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-orange-900">
                    {data.sections.재무현황.부채증가[0]?.includes('△') ? '부채 감소' : '부채 증가'}
                  </h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.재무현황.부채증가.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-orange-900">재고자산</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.재무현황.재고자산.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-orange-900">자본 안정</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.재무현황.자본안정.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">자산 규모</h3>
                  <textarea
                    value={data.sections.재무현황.자산규모.join('\n')}
                    onChange={(e) => handleTextChange('재무현황', '자산규모', e.target.value)}
                    className={textareaClass}
                    rows={2}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">
                    {data.sections.재무현황.부채증가[0]?.includes('△') ? '부채 감소' : '부채 증가'}
                  </h3>
                  <textarea
                    value={data.sections.재무현황.부채증가.join('\n')}
                    onChange={(e) => handleTextChange('재무현황', '부채증가', e.target.value)}
                    className={textareaClass}
                    rows={2}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">재고자산</h3>
                  <textarea
                    value={data.sections.재무현황.재고자산.join('\n')}
                    onChange={(e) => handleTextChange('재무현황', '재고자산', e.target.value)}
                    className={textareaClass}
                    rows={3}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">자본 안정</h3>
                  <textarea
                    value={data.sections.재무현황.자본안정.join('\n')}
                    onChange={(e) => handleTextChange('재무현황', '자본안정', e.target.value)}
                    className={textareaClass}
                    rows={1}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 실적 분석 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-800">
              🔍 실적 분석
            </h2>
            {!editMode ? (
              <div className="space-y-4">
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-green-900">주요 지표</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.실적분석.주요지표.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-bold text-base mb-2 text-green-900">부채비율</h4>
                  <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {data.sections.실적분석.부채비율.map((line, i) => (
                      <li key={i}>• {bulletLine(line)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">주요 지표</h3>
                  <textarea
                    value={data.sections.실적분석.주요지표.join('\n')}
                    onChange={(e) => handleTextChange('실적분석', '주요지표', e.target.value)}
                    className={textareaClass}
                    rows={4}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-gray-800 mb-2.5 text-base">부채비율</h3>
                  <textarea
                    value={data.sections.실적분석.부채비율.join('\n')}
                    onChange={(e) => handleTextChange('실적분석', '부채비율', e.target.value)}
                    className={textareaClass}
                    rows={1}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 우측 컬럼 */}
        <div className="space-y-6">
          {/* 주요 성과 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-800">
              🏆 주요 성과
            </h2>
            {!editMode ? (
              <div className="border-l-4 border-indigo-500 pl-4">
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  {주요성과.map((line, i) => (
                    <li key={i}>• {bulletLine(line)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <textarea
                value={주요성과.join('\n')}
                onChange={(e) => handleTextChange('주요성과', '', e.target.value)}
                className={textareaClass}
                rows={4}
              />
            )}
          </div>
          {/* 핵심 분석 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-sky-800">
              📋 핵심 분석
            </h2>
            {!editMode ? (
              <div className="border-l-4 border-sky-500 pl-4">
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  {핵심분석.map((line, i) => (
                    <li key={i}>• {bulletLine(line)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <textarea
                value={핵심분석.join('\n')}
                onChange={(e) => handleTextChange('핵심분석', '', e.target.value)}
                className={textareaClass}
                rows={5}
              />
            )}
          </div>
          {/* 핵심 인사이트 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-800">
              💡 핵심 인사이트
            </h2>
            {!editMode ? (
              <div className="border-l-4 border-emerald-500 pl-4">
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  {핵심인사이트.map((line, i) => (
                    <li key={i}>• {bulletLine(line)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <textarea
                value={핵심인사이트.join('\n')}
                onChange={(e) => handleTextChange('핵심인사이트', '', e.target.value)}
                className={textareaClass}
                rows={5}
              />
            )}
          </div>
          {/* 핵심 이슈 및 권고사항 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-800">
              ⚠️ 핵심 이슈 및 권고사항
            </h2>
            {!editMode ? (
              <div className="border-l-4 border-amber-500 pl-4">
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  {핵심이슈권고사항.map((line, i) => (
                    <li key={i}>• {bulletLine(line)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <textarea
                value={핵심이슈권고사항.join('\n')}
                onChange={(e) => handleTextChange('핵심이슈권고사항', '', e.target.value)}
                className={textareaClass}
                rows={4}
              />
            )}
          </div>
          {/* 결론 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
              ✅ 결론
            </h2>
            {!editMode ? (
              <div className="border-l-4 border-slate-500 pl-4 space-y-3 text-sm text-gray-700 leading-relaxed">
                {결론.map((line, i) => (
                  <p key={i}>{bulletLine(line)}</p>
                ))}
              </div>
            ) : (
              <textarea
                value={결론.join('\n')}
                onChange={(e) => handleTextChange('결론', '', e.target.value)}
                className={textareaClass}
                rows={6}
              />
            )}
          </div>
        </div>
      </div>

      {/* 서버 저장 비밀번호 모달 (배포 환경) */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-800 mb-2">서버에 저장</h3>
            <p className="text-sm text-gray-600 mb-3">비밀번호를 입력하세요.</p>
            <input
              type="password"
              value={serverSavePassword}
              onChange={(e) => setServerSavePassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
              placeholder="비밀번호"
            />
            {serverSaveError && <p className="text-sm text-red-600 mb-2">{serverSaveError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowPasswordModal(false); setServerSavePassword(''); setServerSaveError(null); }}
                className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleServerSaveWithPassword}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
