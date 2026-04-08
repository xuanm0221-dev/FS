import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { BalanceData } from '@/lib/types';
import { cleanNumericValue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : 2026;
    
    if (![2025, 2026].includes(year)) {
      return NextResponse.json(
        { error: '유효하지 않은 연도입니다.' },
        { status: 400 }
      );
    }
    
    const filePath = path.join(process.cwd(), '파일', '현금차입금잔액', `${year}.csv`);
    
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
    if (rows.length < 3) {
      throw new Error('CSV 파일 형식이 잘못되었습니다.');
    }
    
    // 첫 번째 행은 헤더, 두 번째 행은 현금잔액, 세 번째 행은 차입금잔액
    const cashRow = rows[1];
    const debtRow = rows[2];
    
    // 현금잔액 데이터 추출 (기초잔액, 1월~12월, 기말잔액)
    const cashMonthly: number[] = [];
    for (let i = 2; i <= 13; i++) { // 인덱스 2~13이 1월~12월
      cashMonthly.push(cleanNumericValue(cashRow[i] || '0'));
    }
    
    // 차입금잔액 데이터 추출
    const debtMonthly: number[] = [];
    for (let i = 2; i <= 13; i++) {
      debtMonthly.push(cleanNumericValue(debtRow[i] || '0'));
    }
    
    const balanceData: BalanceData = {
      현금잔액: {
        기초잔액: cleanNumericValue(cashRow[1] || '0'),
        monthly: cashMonthly,
        기말잔액: cleanNumericValue(cashRow[14] || '0'),
      },
      차입금잔액: {
        기초잔액: cleanNumericValue(debtRow[1] || '0'),
        monthly: debtMonthly,
        기말잔액: cleanNumericValue(debtRow[14] || '0'),
      },
    };
    
    return NextResponse.json({
      year,
      data: balanceData,
    });
  } catch (error) {
    console.error('현금차입금잔액 API 에러:', error);
    return NextResponse.json(
      { error: '현금차입금잔액 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
