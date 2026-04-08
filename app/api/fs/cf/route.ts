import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readCFCSV } from '@/lib/csv';
import { calculateCF } from '@/lib/fs-mapping';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : 2025;
    
    if (![2025, 2026].includes(year)) {
      return NextResponse.json(
        { error: '유효하지 않은 연도입니다. 2025 또는 2026을 선택하세요.' },
        { status: 400 }
      );
    }
    
    const filePath = path.join(process.cwd(), '파일', 'cashflow', `${year}.csv`);
    const { data, year2024Values } = await readCFCSV(filePath, year);
    
    // 2026년일 때 2025년 합계 계산
    let previousYearTotals: Map<string, number> | undefined = undefined;
    if (year === 2026) {
      try {
        const prevFilePath = path.join(process.cwd(), '파일', 'cashflow', '2025.csv');
        const { data: prevData, year2024Values: prevYear2024Values } = await readCFCSV(prevFilePath, 2025);
        const prevRows = calculateCF(prevData, prevYear2024Values, 2025);
        
        // 2025년 합계를 Map으로 변환 (각 row의 합계는 values[12]에 있음)
        previousYearTotals = new Map<string, number>();
        for (const row of prevRows) {
          if (row.values && row.values.length > 12) {
            const total = row.values[12]; // 합계 컬럼
            if (total !== null && total !== undefined) {
              previousYearTotals.set(row.account, total);
            }
          }
        }
      } catch (err) {
        console.error('2025년 데이터 로드 실패:', err);
      }
    }
    
    const tableRows = calculateCF(data, year2024Values, year, previousYearTotals);
    
    return NextResponse.json({
      year,
      type: 'CF',
      rows: tableRows,
    });
  } catch (error) {
    console.error('CF API 에러:', error);
    return NextResponse.json(
      { error: 'CF 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

