import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { FinancialData } from './types';
import { cleanNumericValue, parseMonthColumn } from './utils';

// CSV 파일 읽기 (인코딩 자동 감지)
export async function readCSV(filePath: string, year: number): Promise<FinancialData[]> {
  let content: string;

  try {
    // UTF-8 시도
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    try {
      // CP949(EUC-KR) 시도
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

  if (parsed.errors.length > 0) {
    console.error('CSV 파싱 에러:', parsed.errors);
  }

  const rows = parsed.data;
  if (rows.length < 2) {
    throw new Error('CSV 파일이 비어있거나 형식이 잘못되었습니다.');
  }

  // 헤더 행 (첫 번째 행)
  const headers = rows[0];
  
  // 월 컬럼 인덱스 찾기
  const monthColumns: { index: number; month: number }[] = [];
  headers.forEach((header, index) => {
    if (index === 0) return; // 첫 번째 컬럼은 "계정과목"
    const month = parseMonthColumn(header);
    if (month !== null) {
      monthColumns.push({ index, month });
    }
  });

  // 데이터 행 파싱
  const result: FinancialData[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const account = row[0]?.trim();
    
    if (!account) continue;

    for (const { index, month } of monthColumns) {
      const valueStr = row[index];
      const value = cleanNumericValue(valueStr || '0');
      
      result.push({
        year,
        month,
        account,
        value,
      });
    }
  }

  // 중복 account+month 합산
  const aggregated = new Map<string, number>();
  for (const item of result) {
    const key = `${item.year}-${item.month}-${item.account}`;
    const current = aggregated.get(key) || 0;
    aggregated.set(key, current + item.value);
  }

  const finalResult: FinancialData[] = [];
  for (const [key, value] of aggregated) {
    const [yearStr, monthStr, account] = key.split('-');
    finalResult.push({
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
      account,
      value,
    });
  }

  return finalResult;
}

// 월별 데이터 맵 생성 (account -> [month1, ..., month12])
export function createMonthDataMap(data: FinancialData[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  
  for (const item of data) {
    if (!map.has(item.account)) {
      map.set(item.account, new Array(12).fill(0));
    }
    const values = map.get(item.account)!;
    values[item.month - 1] = item.value;
  }
  
  return map;
}

// 계정 값 가져오기 (없으면 0 배열)
export function getAccountValues(map: Map<string, number[]>, account: string): number[] {
  return map.get(account) || new Array(12).fill(0);
}

// 여러 계정 합산
export function sumAccounts(map: Map<string, number[]>, accounts: string[]): number[] {
  const result = new Array(12).fill(0);
  for (const account of accounts) {
    const values = getAccountValues(map, account);
    for (let i = 0; i < 12; i++) {
      result[i] += values[i];
    }
  }
  return result;
}

