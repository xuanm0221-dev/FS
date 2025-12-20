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

// CF 전용 CSV 읽기 (2024년 컬럼 포함)
export async function readCFCSV(filePath: string, year: number): Promise<{ data: FinancialData[], year2024Values: Map<string, number> }> {
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

  // 헤더 행
  const headers = rows[0];
  
  // 2024년 컬럼 찾기
  let year2024Index = -1;
  headers.forEach((header, index) => {
    if (header.includes('2024')) {
      year2024Index = index;
    }
  });

  // 월 컬럼 인덱스 찾기
  const monthColumns: { index: number; month: number }[] = [];
  headers.forEach((header, index) => {
    if (index === 0) return; // 첫 번째 컬럼은 "계정과목"
    if (index === year2024Index) return; // 2024년 컬럼 제외
    const month = parseMonthColumn(header);
    if (month !== null) {
      monthColumns.push({ index, month });
    }
  });

  // 데이터 행 파싱
  const result: FinancialData[] = [];
  const year2024Values = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const account = row[0]?.trim();
    
    if (!account) continue;

    // 2024년 값 저장
    if (year2024Index >= 0) {
      const value2024 = cleanNumericValue(row[year2024Index] || '0');
      year2024Values.set(account, value2024);
    }

    // 월별 값 파싱
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

  return { data: finalResult, year2024Values };
}

// Credit CSV 읽기 (대리상별 외상매출금, 선수금)
export async function readCreditCSV(filePath: string) {
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

  const rows = parsed.data;
  if (rows.length < 2) {
    throw new Error('CSV 데이터가 부족합니다.');
  }

  // 첫 행은 헤더, 둘째 행부터 데이터
  const dealers: Array<{ name: string; 외상매출금: number; 선수금: number }> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const name = row[0]?.trim() || '';
    const 외상매출금Str = row[1]?.trim() || '0';
    const 선수금Str = row[2]?.trim() || '0';

    // 숫자 파싱 (콤마, 공백, 따옴표 제거)
    const parse = (str: string): number => {
      if (!str || str === '-') return 0;
      const cleaned = str.replace(/[",\s]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    dealers.push({
      name,
      외상매출금: parse(외상매출금Str),
      선수금: parse(선수금Str),
    });
  }

  return dealers;
}

