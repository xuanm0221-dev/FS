import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { TableRow } from '@/lib/types';
import { cleanNumericValue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : 2025;
    
    if (![2023, 2024, 2025, 2026].includes(year)) {
      return NextResponse.json(
        { error: '유효하지 않은 연도입니다.' },
        { status: 400 }
      );
    }
    
    const filePath = path.join(process.cwd(), '파일', '운전자본', `${year}.csv`);
    
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
      throw new Error('CSV 파일이 비어있거나 형식이 잘못되었습니다.');
    }
    
    // 헤더 행
    const headers = rows[0];
    
    // 데이터 변환
    const accountMap = new Map<string, number[]>();
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const account = row[1] || row[0]; // 중분류 또는 대분류
      if (!account) continue;
      
      const monthlyValues: number[] = [];
      
      for (let j = 2; j <= 13; j++) { // 1월~12월 (2번째 인덱스부터)
        const valueStr = row[j] || '0';
        const value = cleanNumericValue(valueStr);
        monthlyValues.push(value);
      }
      
      accountMap.set(account.trim(), monthlyValues);
    }
    
    // TableRow 형식으로 변환
    const tableRows: TableRow[] = [];
    
    accountMap.forEach((values, account) => {
      const total = values.reduce((sum, v) => sum + v, 0);
      
      tableRows.push({
        account,
        level: 0,
        isGroup: false,
        isCalculated: false,
        values: [...values, total], // 12개월 + 합계
      });
    });
    
    // 전년도 데이터 로드 (YoY 계산용)
    let previousYearTotals: Map<string, number> | undefined = undefined;
    if (year > 2023) {
      try {
        const prevFilePath = path.join(process.cwd(), '파일', '운전자본', `${year - 1}.csv`);
        
        let prevContent: string;
        try {
          prevContent = fs.readFileSync(prevFilePath, 'utf-8');
        } catch (err) {
          const buffer = fs.readFileSync(prevFilePath);
          prevContent = iconv.decode(buffer, 'cp949');
        }
        
        const prevParsed = Papa.parse<string[]>(prevContent, {
          header: false,
          skipEmptyLines: true,
        });
        
        const prevRows = prevParsed.data;
        previousYearTotals = new Map<string, number>();
        
        for (let i = 1; i < prevRows.length; i++) {
          const row = prevRows[i];
          const account = row[1] || row[0];
          if (!account) continue;
          
          let total = 0;
          for (let j = 2; j <= 13; j++) {
            const valueStr = row[j] || '0';
            const value = cleanNumericValue(valueStr);
            total += value;
          }
          
          previousYearTotals.set(account.trim(), total);
        }
      } catch (err) {
        console.error(`${year - 1}년 데이터 로드 실패:`, err);
      }
    }
    
    // YoY 계산 추가
    if (previousYearTotals) {
      for (const row of tableRows) {
        const prevTotal = previousYearTotals.get(row.account);
        if (prevTotal !== undefined && row.values.length > 12) {
          const currTotal = row.values[12] ?? 0;
          const yoyAbsolute = currTotal - prevTotal;
          row.values.push(yoyAbsolute); // YoY 절대값
          row.year2024Value = prevTotal; // 전년도 값 저장
        }
      }
    }
    
    return NextResponse.json({
      year,
      rows: tableRows,
    });
  } catch (error) {
    console.error('운전자본표 API 에러:', error);
    return NextResponse.json(
      { error: '운전자본표 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
