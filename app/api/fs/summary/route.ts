import { NextResponse } from 'next/server';
import path from 'path';
import { readCSV } from '@/lib/csv';
import { calculatePL, calculateBS } from '@/lib/fs-mapping';
import { ExecutiveSummaryData, TableRow } from '@/lib/types';

// 값 가져오기 헬퍼 함수
function getValue(data: TableRow[], account: string, monthIndex: number): number {
  const row = data.find(r => r.account === account);
  return row?.values[monthIndex] || 0;
}

// 경영요약 자동 생성 함수
function generateSummary(
  pl2024: TableRow[],
  pl2025: TableRow[],
  bs2024: TableRow[],
  bs2025: TableRow[]
): ExecutiveSummaryData {
  
  const month = 11; // 12월 (index 11)
  
  // PL 데이터 추출 (12월 기준, K 단위)
  const tag매출24 = getValue(pl2024, 'Tag매출', month);
  const tag매출25 = getValue(pl2025, 'Tag매출', month);
  const 실판매출24 = getValue(pl2024, '실판매출', month);
  const 실판매출25 = getValue(pl2025, '실판매출', month);
  const 매출총이익24 = getValue(pl2024, '매출총이익', month);
  const 매출총이익25 = getValue(pl2025, '매출총이익', month);
  const 영업이익24 = getValue(pl2024, '영업이익', month);
  const 영업이익25 = getValue(pl2025, '영업이익', month);
  const 영업이익률24 = getValue(pl2024, '영업이익률', month);
  const 영업이익률25 = getValue(pl2025, '영업이익률', month);
  const 영업비24 = getValue(pl2024, '영업비', month);
  const 영업비25 = getValue(pl2025, '영업비', month);
  const 광고비24 = getValue(pl2024, '광고비', month);
  const 광고비25 = getValue(pl2025, '광고비', month);
  
  // BS 데이터 추출 (12월 기준, K 단위)
  const 자산24 = getValue(bs2024, '자산', month);
  const 자산25 = getValue(bs2025, '자산', month);
  const 부채24 = getValue(bs2024, '부채', month);
  const 부채25 = getValue(bs2025, '부채', month);
  const 자본24 = getValue(bs2024, '자본', month);
  const 자본25 = getValue(bs2025, '자본', month);
  const 유동자산24 = getValue(bs2024, '유동자산', month);
  const 유동자산25 = getValue(bs2025, '유동자산', month);
  const 유동부채24 = getValue(bs2024, '유동부채', month);
  const 유동부채25 = getValue(bs2025, '유동부채', month);
  const 이익잉여금24 = getValue(bs2024, '이익잉여금', month);
  const 이익잉여금25 = getValue(bs2025, '이익잉여금', month);
  const 재고24 = getValue(bs2024, '재고자산', month);
  const 재고25 = getValue(bs2025, '재고자산', month);
  const 직영AR24 = getValue(bs2024, '직영AR', month);
  const 대리상AR24 = getValue(bs2024, '대리상AR', month);
  const AR24 = 직영AR24 + 대리상AR24;
  const 직영AR25 = getValue(bs2025, '직영AR', month);
  const 대리상AR25 = getValue(bs2025, '대리상AR', month);
  const AR25 = 직영AR25 + 대리상AR25;
  const 차입금24 = getValue(bs2024, '차입금', month);
  const 차입금25 = getValue(bs2025, '차입금', month);
  
  // 브랜드별 매출 (12월 기준, K 단위)
  const mlb25 = getValue(pl2025, 'MLB', month);
  const kids25 = getValue(pl2025, 'KIDS', month);
  const discovery24 = getValue(pl2024, 'DISCOVERY', month);
  const discovery25 = getValue(pl2025, 'DISCOVERY', month);
  // Duvetica와 Supra는 사업 중단으로 분석에서 제외
  
  // 계산
  const tag매출증가율 = ((tag매출25 - tag매출24) / tag매출24) * 100;
  const 실판매출증가율 = ((실판매출25 - 실판매출24) / 실판매출24) * 100;
  const 영업이익증가율 = ((영업이익25 - 영업이익24) / 영업이익24) * 100;
  
  // 영업이익 흑자/적자 전환 감지
  const 영업이익상태 = 
    영업이익24 < 0 && 영업이익25 > 0 ? '흑자전환' :
    영업이익24 > 0 && 영업이익25 < 0 ? '적자전환' :
    null;
  
  const 영업비증가율 = ((영업비25 - 영업비24) / 영업비24) * 100;
  const 광고비증가율 = ((광고비25 - 광고비24) / 광고비24) * 100;
  const 자산증가율 = ((자산25 - 자산24) / 자산24) * 100;
  const 부채증가율 = ((부채25 - 부채24) / 부채24) * 100;
  const 자본증가율 = ((자본25 - 자본24) / 자본24) * 100;
  const 재고증가율 = ((재고25 - 재고24) / 재고24) * 100;
  const AR증가율 = ((AR25 - AR24) / AR24) * 100;
  const 부채비율24 = 자본24 !== 0 ? (부채24 / 자본24) * 100 : 0;
  const 부채비율25 = 자본25 !== 0 ? (부채25 / 자본25) * 100 : 0;
  const discovery증가율 = discovery24 !== 0 ? ((discovery25 - discovery24) / discovery24) * 100 : 0;
  
  // 주요지표 계산
  // 당기순이익 (이익잉여금 YoY 차이, K 단위)
  // 2024년은 전년도(2023) 데이터가 없으므로 당기순이익 계산 불가
  const 당기순이익25 = 이익잉여금25 - 이익잉여금24; // 2025년 당기순이익
  
  // ROE (자기자본순이익률) - 2024년은 전년도 데이터 없어 계산 불가
  const ROE24 = 0; // 2024년은 전년도 데이터 없어 계산 불가
  const ROE25 = 자본25 !== 0 ? (당기순이익25 / 자본25) * 100 : 0;
  
  // ROA (총자산순이익률) - 2024년은 전년도 데이터 없어 계산 불가
  const ROA24 = 0; // 2024년은 전년도 데이터 없어 계산 불가
  const ROA25 = 자산25 !== 0 ? (당기순이익25 / 자산25) * 100 : 0;
  
  // 유동비율
  const 유동비율24 = 유동부채24 !== 0 ? (유동자산24 / 유동부채24) * 100 : 0;
  const 유동비율25 = 유동부채25 !== 0 ? (유동자산25 / 유동부채25) * 100 : 0;
  
  // 매출총이익률
  const 매출총이익률24 = 실판매출24 !== 0 ? (매출총이익24 / 실판매출24) * 100 : 0;
  const 매출총이익률25 = 실판매출25 !== 0 ? (매출총이익25 / 실판매출25) * 100 : 0;
  
  // K 단위로 콤마 포맷팅 (1위안 단위 → K 단위 변환)
  const toKWithComma = (val: number) => {
    return Math.round(val / 1000).toLocaleString('ko-KR');
  };
  
  // M 단위로 변환 (K / 1000) - 재무현황 등에서 사용하지 않으므로 제거 가능하지만 일단 유지
  const toM = (val: number) => Math.round(val / 1000);
  
  return {
    title: 'F&F CHINA 2025 재무 성과 종합 분석 (12월 기준)',
    baseMonth: 12,
    sections: {
      수익성분석: {
        매출성장: [
          `• Tag매출 24년 ${toKWithComma(tag매출24)}K → 25년 ${toKWithComma(tag매출25)}K (${tag매출증가율 > 0 ? '+' : ''}${tag매출증가율.toFixed(1)}%)`,
          `• 실판매출 ${toKWithComma(실판매출24)}K → ${toKWithComma(실판매출25)}K (${실판매출증가율 > 0 ? '+' : '△'}${Math.abs(실판매출증가율).toFixed(1)}%)`,
          `• 영업이익 ${toKWithComma(영업이익24)}K → ${toKWithComma(영업이익25)}K (${영업이익상태 || `${영업이익증가율 > 0 ? '+' : '△'}${Math.abs(영업이익증가율).toFixed(1)}%`})`,
          `• 영업이익률 ${영업이익률24.toFixed(1)}% → ${영업이익률25.toFixed(1)}% (${(영업이익률25 - 영업이익률24) > 0 ? '+' : '△'}${Math.abs(영업이익률25 - 영업이익률24).toFixed(1)}%p)`
        ],
        비용증가: [
          `• 영업비 ${toKWithComma(영업비24)}K → ${toKWithComma(영업비25)}K (+${영업비증가율.toFixed(1)}%)`,
          `• 광고비 ${toKWithComma(광고비24)}K → ${toKWithComma(광고비25)}K (+${광고비증가율.toFixed(0)}%)`
        ]
      },
      재무현황: {
        자산규모: [
          `• 총자산: ${toKWithComma(자산24)}K → ${toKWithComma(자산25)}K (+${toKWithComma(자산25 - 자산24)}K, +${자산증가율.toFixed(1)}%)`,
          `• 현금: ${toKWithComma(getValue(bs2024, '현금 및 현금성자산', month))}K → ${toKWithComma(getValue(bs2025, '현금 및 현금성자산', month))}K`
        ],
        부채증가: [
          `• 부채: ${toKWithComma(부채24)}K → ${toKWithComma(부채25)}K (${부채증가율 > 0 ? '+' : '△'}${toKWithComma(Math.abs(부채25 - 부채24))}K, ${부채증가율 > 0 ? '+' : '△'}${Math.abs(부채증가율).toFixed(1)}%)`,
          `• 차입금: ${toKWithComma(차입금24)}K → ${toKWithComma(차입금25)}K`
        ],
        재고자산: [
          `• 재고: ${toKWithComma(재고24)}K → ${toKWithComma(재고25)}K (+${toKWithComma(재고25 - 재고24)}K, +${재고증가율.toFixed(1)}%)`,
          `• 외상매출금: ${toKWithComma(AR24)}K → ${toKWithComma(AR25)}K (+${toKWithComma(AR25 - AR24)}K, +${AR증가율.toFixed(1)}%)`
        ],
        자본안정: [
          `• 총자본: ${toKWithComma(자본24)}K → ${toKWithComma(자본25)}K (+${toKWithComma(자본25 - 자본24)}K, +${자본증가율.toFixed(1)}%)`
        ]
      },
      실적분석: {
        주요지표: [
          `• ROE (자기자본순이익률): ${ROE25.toFixed(1)}% (당기순이익 ${toKWithComma(당기순이익25)}K)`,
          `• ROA (총자산순이익률): ${ROA25.toFixed(1)}%`,
          `• 유동비율: ${유동비율24.toFixed(0)}% → ${유동비율25.toFixed(0)}% (${(유동비율25 - 유동비율24) > 0 ? '+' : '△'}${Math.abs(유동비율25 - 유동비율24).toFixed(0)}%p)`,
          `• 매출총이익률: ${매출총이익률24.toFixed(1)}% → ${매출총이익률25.toFixed(1)}% (${(매출총이익률25 - 매출총이익률24) > 0 ? '+' : '△'}${Math.abs(매출총이익률25 - 매출총이익률24).toFixed(1)}%p)`,
          `• 부채비율: ${부채비율24.toFixed(0)}% → ${부채비율25.toFixed(0)}% (${(부채비율25 - 부채비율24) > 0 ? '+' : '△'}${Math.abs(부채비율25 - 부채비율24).toFixed(0)}%p)`
        ],
        부채비율: [
          `• 부채비율: ${부채비율24.toFixed(0)}% → ${부채비율25.toFixed(0)}% (${(부채비율25 - 부채비율24) > 0 ? '+' : ''}${(부채비율25 - 부채비율24).toFixed(0)}%p)`
        ]
      },
      브랜드포트폴리오: {
        기존브랜드: [
          `• MLB: ${toKWithComma(mlb25)}K (${((mlb25 / tag매출25) * 100).toFixed(1)}%)`,
          `• KIDS: ${toKWithComma(kids25)}K (${((kids25 / tag매출25) * 100).toFixed(1)}%)`
        ],
        신규브랜드: [
          `• Discovery: ${discovery증가율 > 0 ? '+' : ''}${discovery증가율.toFixed(0)}% (${toKWithComma(discovery25)}K)`
        ]
      }
    }
  };
}

export async function GET() {
  try {
    // CSV 파일에서 직접 데이터 읽기
    const pl2024Path = path.join(process.cwd(), 'PL', '2024.csv');
    const pl2025Path = path.join(process.cwd(), 'PL', '2025.csv');
    const bs2024Path = path.join(process.cwd(), 'BS', '2024.csv');
    const bs2025Path = path.join(process.cwd(), 'BS', '2025.csv');
    
    const pl2024Data = await readCSV(pl2024Path, 2024);
    const pl2025Data = await readCSV(pl2025Path, 2025);
    const bs2024Data = await readCSV(bs2024Path, 2024);
    const bs2025Data = await readCSV(bs2025Path, 2025);
    
    // PL, BS 계산
    const pl2024Rows = calculatePL(pl2024Data);
    const pl2025Rows = calculatePL(pl2025Data);
    const bs2024Rows = calculateBS(bs2024Data);
    const bs2025Rows = calculateBS(bs2025Data);
    
    // 경영요약 생성
    const summary = generateSummary(pl2024Rows, pl2025Rows, bs2024Rows, bs2025Rows);
    
    return NextResponse.json(summary);
  } catch (error) {
    console.error('경영요약 API 에러:', error);
    return NextResponse.json(
      { error: '경영요약 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
