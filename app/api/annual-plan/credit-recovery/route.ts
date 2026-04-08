import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { CreditRecoveryData } from '@/lib/types';
import { cleanNumericValue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const baseYearMonth = searchParams.get('baseYearMonth') || '26.01';
    
    // 파일명 구성 (예: 26.01.csv)
    const fileName = `${baseYearMonth}.csv`;
    const filePath = path.join(process.cwd(), '파일', '여신회수계획', fileName);
    
    // CSV 파일 읽기 (인코딩 처리)
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      try {
        const buffer = fs.readFileSync(filePath);
        content = iconv.decode(buffer, 'cp949');
      } catch (err2) {
        throw new Error(`CSV 파일을 읽을 수 없습니다: ${filePath}`);
      }
    }
    
    // CSV 파싱
    const parsed = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
    });
    
    const rows = parsed.data;
    if (rows.length < 2) {
      throw new Error('데이터가 없습니다.');
    }
    
    // 헤더 행과 데이터 행
    const headers_row = rows[0];
    const data_row = rows[1];
    
    const 대리상선수금 = cleanNumericValue(data_row[0] || '0');
    const 대리상채권 = cleanNumericValue(data_row[1] || '0');
    
    // 동적으로 회수 컬럼들을 찾기 (인덱스 2부터)
    const recoveries: number[] = [];
    const headers: string[] = [];
    
    for (let i = 2; i < data_row.length; i++) {
      const value = cleanNumericValue(data_row[i] || '0');
      recoveries.push(value);
      headers.push(headers_row[i] || `회수${i - 1}`);
    }
    
    // 뒤쪽 연속된 0 제거 (예: 7~8월이 0이면 6월까지만 표시)
    while (recoveries.length > 0 && recoveries[recoveries.length - 1] === 0) {
      recoveries.pop();
      headers.pop();
    }

    const creditRecoveryData: CreditRecoveryData = {
      baseYearMonth,
      대리상선수금,
      대리상채권,
      recoveries,
      headers,
    };
    
    return NextResponse.json({
      data: creditRecoveryData,
    });
  } catch (error) {
    console.error('여신회수계획 API 에러:', error);
    return NextResponse.json(
      { error: '여신회수계획 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
