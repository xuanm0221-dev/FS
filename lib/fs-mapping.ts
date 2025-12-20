import { FinancialData, TableRow, ComparisonData } from './types';

// 월별 데이터를 Map으로 변환
export function createMonthDataMap(data: FinancialData[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  
  data.forEach(({ account, month, value }) => {
    if (!map.has(account)) {
      map.set(account, new Array(12).fill(0));
    }
    const arr = map.get(account)!;
    arr[month - 1] = value;
  });
  
  return map;
}

// 계정 값 가져오기 (없으면 0으로 채워진 배열)
export function getAccountValues(map: Map<string, number[]>, account: string): number[] {
  return map.get(account) || new Array(12).fill(0);
}

// ==================== PL (손익계산서) ====================
export function calculatePL(data: FinancialData[]): TableRow[] {
  const map = createMonthDataMap(data);
  
  // Tag매출
  const MLB = getAccountValues(map, 'MLB');
  const KIDS = getAccountValues(map, 'KIDS');
  const Discovery = getAccountValues(map, 'DISCOVERY');
  const Duvetica = getAccountValues(map, 'DUVETICA');
  const Supra = getAccountValues(map, 'SUPRA');
  const Tag매출 = MLB.map((v, i) => v + KIDS[i] + Discovery[i] + Duvetica[i] + Supra[i]);
  
  // 실판매출 (파일에서 직접 읽기)
  const 실판매출 = getAccountValues(map, '실판매출');
  
  // 매출원가
  const 매출원가 = getAccountValues(map, '매출원가');
  const 평가감 = getAccountValues(map, '평가감');
  const 매출원가합계 = 매출원가.map((v, i) => v + 평가감[i]);
  const Tag대비원가율 = Tag매출.map((v, i) => (v !== 0 ? (매출원가[i] * 1.13) / v : null));
  
  // 매출총이익
  const 매출총이익 = 실판매출.map((v, i) => v - 매출원가합계[i]);
  
  // 직접비
  const 직접비항목 = [
    '급여(매장)',
    '복리후생비(매장)',
    '플랫폼수수료',
    'TP수수료',
    '직접광고비',
    '대리상지원금',
    '물류비',
    '매장임차료',
    '감가상각비',
    '기타(직접비)'
  ];
  const 직접비values = 직접비항목.map(acc => getAccountValues(map, acc));
  const 직접비합계 = 직접비values[0].map((_, i) =>
    직접비values.reduce((sum, arr) => sum + arr[i], 0)
  );
  
  // 영업비
  const 영업비항목 = [
    '급여(사무실)',
    '복리후생비(사무실)',
    '광고비',
    '수주회',
    '지급수수료',
    '임차료',
    '감가상각비(영업비)',
    '세금과공과',
    '기타(영업비)'
  ];
  const 영업비values = 영업비항목.map(acc => getAccountValues(map, acc));
  const 영업비합계 = 영업비values[0].map((_, i) =>
    영업비values.reduce((sum, arr) => sum + arr[i], 0)
  );
  
  // 영업이익
  const 영업이익 = 매출총이익.map((v, i) => v - 직접비합계[i] - 영업비합계[i]);
  
  // 영업이익률
  const 영업이익률 = 실판매출.map((v, i) => (v !== 0 ? 영업이익[i] / v : null));
  
  const rows: TableRow[] = [
    {
      account: 'Tag매출',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: Tag매출,
      format: 'number',
    },
    { account: 'MLB', level: 1, isGroup: false, isCalculated: false, values: MLB, format: 'number' },
    { account: 'KIDS', level: 1, isGroup: false, isCalculated: false, values: KIDS, format: 'number' },
    { account: 'DISCOVERY', level: 1, isGroup: false, isCalculated: false, values: Discovery, format: 'number' },
    { account: 'DUVETICA', level: 1, isGroup: false, isCalculated: false, values: Duvetica, format: 'number' },
    { account: 'SUPRA', level: 1, isGroup: false, isCalculated: false, values: Supra, format: 'number' },
    {
      account: '실판매출',
      level: 0,
      isGroup: false,
      isCalculated: false,
      isBold: true,
      isHighlight: 'sky',
      values: 실판매출,
      format: 'number',
    },
    {
      account: '매출원가 합계',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 매출원가합계,
      format: 'number',
    },
    { account: '매출원가', level: 1, isGroup: false, isCalculated: false, values: 매출원가, format: 'number' },
    { account: '평가감', level: 1, isGroup: false, isCalculated: false, values: 평가감, format: 'number' },
    { account: '(Tag 대비 원가율)', level: 1, isGroup: false, isCalculated: true, values: Tag대비원가율, format: 'percent' },
    {
      account: '매출총이익',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 매출총이익,
      format: 'number',
    },
    {
      account: '직접비',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 직접비합계,
      format: 'number',
    },
    ...직접비항목.map((acc, idx) => ({
      account: acc,
      level: 1,
      isGroup: false,
      isCalculated: false,
      values: 직접비values[idx],
      format: 'number' as const,
    })),
    {
      account: '영업비',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 영업비합계,
      format: 'number',
    },
    ...영업비항목.map((acc, idx) => ({
      account: acc,
      level: 1,
      isGroup: false,
      isCalculated: false,
      values: 영업비values[idx],
      format: 'number' as const,
    })),
    {
      account: '영업이익',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 영업이익,
      format: 'number',
    },
    {
      account: '영업이익률',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 영업이익률,
      format: 'percent',
    },
  ];
  
  return rows;
}

// PL 비교 데이터 계산
export function calculateComparisonData(
  currentYearData: TableRow[],
  previousYearData: TableRow[],
  baseMonth: number
): TableRow[] {
  const prevAccountMap = new Map<string, TableRow>();
  previousYearData.forEach(row => {
    prevAccountMap.set(row.account, row);
  });
  
  const calculateYoY = (curr: number | null, prev: number | null): number | null => {
    if (curr === null || prev === null) return null;
    return curr - prev;
  };
  
  const result = currentYearData.map(row => {
    const prevRow = prevAccountMap.get(row.account);
    
    if (!prevRow) {
      return {
        ...row,
        comparisons: {
          prevYearMonth: null,
          currYearMonth: null,
          monthYoY: null,
          prevYearYTD: null,
          currYearYTD: null,
          ytdYoY: null,
          prevYearAnnual: null,
          currYearAnnual: null,
          annualYoY: null,
        },
      };
    }
    
    const prev2024 = prevRow.values;
    const curr2025 = row.values;
    
    // 월별 비교
    const prevYearMonth = prev2024[baseMonth - 1] ?? null;
    const currYearMonth = curr2025[baseMonth - 1] ?? null;
    const monthYoY = calculateYoY(currYearMonth, prevYearMonth);
    
    // YTD 비교
    let prevYearYTD = 0;
    let currYearYTD = 0;
    for (let i = 0; i < baseMonth; i++) {
      prevYearYTD += prev2024[i] || 0;
      currYearYTD += curr2025[i] || 0;
    }
    const ytdYoY = calculateYoY(currYearYTD, prevYearYTD);
    
    // 연간 합계
    const prevYearAnnual = prev2024.reduce((sum: number, v) => sum + (v || 0), 0);
    const currYearAnnual = curr2025.reduce((sum: number, v) => sum + (v || 0), 0);
    const annualYoY = calculateYoY(currYearAnnual, prevYearAnnual);
    
    const comparisons: ComparisonData = {
      prevYearMonth,
      currYearMonth,
      monthYoY,
      prevYearYTD,
      currYearYTD,
      ytdYoY,
      prevYearAnnual,
      currYearAnnual,
      annualYoY,
    };
    
    return { ...row, comparisons };
  });
  
  return result;
}

// ==================== BS (재무상태표) ====================
export function calculateBS(data: FinancialData[]): TableRow[] {
  const map = createMonthDataMap(data);
  
  // 기본 계정
  const 현금및현금성자산 = getAccountValues(map, '현금 및 현금성자산');
  const 직영AR = getAccountValues(map, '직영AR');
  const 대리상AR = getAccountValues(map, '대리상AR');
  const 재고자산 = getAccountValues(map, '재고자산');
  const 선급금본사 = getAccountValues(map, '선급금(본사)');
  const 선급금기타 = getAccountValues(map, '선급금(기타)');
  const 기타유동자산 = getAccountValues(map, '기타 유동자산');
  const 사용권자산 = getAccountValues(map, '사용권자산');
  const 이연법인세자산 = getAccountValues(map, '이연법인세자산');
  const 유무형자산 = getAccountValues(map, '유,무형자산');
  const 본사AP = getAccountValues(map, '본사 AP');
  const 제품AP = getAccountValues(map, '제품 AP');
  const 차입금 = getAccountValues(map, '차입금');
  const 대리상선수금 = getAccountValues(map, '대리상선수금');
  const 대리상지원금 = getAccountValues(map, '대리상지원금');
  const 기타유동부채 = getAccountValues(map, '기타 유동부채');
  const 리스부채 = getAccountValues(map, '리스부채(장,단기)');
  const 장기보증금 = getAccountValues(map, '장기보증금');
  const 자본금 = getAccountValues(map, '자본금');
  const 이익잉여금 = getAccountValues(map, '이익잉여금');
  
  // 계산
  const 외상매출금 = 직영AR.map((v, i) => v + 대리상AR[i]);
  const 유동자산 = 현금및현금성자산.map((v, i) => 
    v + 외상매출금[i] + 재고자산[i] + 선급금본사[i] + 선급금기타[i] + 기타유동자산[i]
  );
  const 비유동자산 = 사용권자산.map((v, i) => v + 이연법인세자산[i] + 유무형자산[i]);
  const 자산 = 유동자산.map((v, i) => v + 비유동자산[i]);
  
  const 외상매입금 = 본사AP.map((v, i) => v + 제품AP[i]);
  const 유동부채 = 외상매입금.map((v, i) => 
    v + 차입금[i] + 대리상선수금[i] + 대리상지원금[i] + 기타유동부채[i]
  );
  const 비유동부채 = 리스부채.map((v, i) => v + 장기보증금[i]);
  const 부채 = 유동부채.map((v, i) => v + 비유동부채[i]);
  
  const 자본 = 자본금.map((v, i) => v + 이익잉여금[i]);
  
  const rows: TableRow[] = [
    {
      account: '자산',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 자산,
      format: 'number',
    },
    {
      account: '유동자산',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 유동자산,
      format: 'number',
    },
    { account: '현금 및 현금성자산', level: 2, isGroup: false, isCalculated: false, values: 현금및현금성자산, format: 'number' },
    {
      account: '외상매출금',
      level: 2,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: 외상매출금,
      format: 'number',
    },
    { account: '직영AR', level: 3, isGroup: false, isCalculated: false, values: 직영AR, format: 'number' },
    { account: '대리상AR', level: 3, isGroup: false, isCalculated: false, values: 대리상AR, format: 'number' },
    { account: '재고자산', level: 2, isGroup: false, isCalculated: false, values: 재고자산, format: 'number' },
    { account: '선급금(본사)', level: 2, isGroup: false, isCalculated: false, values: 선급금본사, format: 'number' },
    { account: '선급금(기타)', level: 2, isGroup: false, isCalculated: false, values: 선급금기타, format: 'number' },
    { account: '기타 유동자산', level: 2, isGroup: false, isCalculated: false, values: 기타유동자산, format: 'number' },
    {
      account: '비유동자산',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 비유동자산,
      format: 'number',
    },
    { account: '사용권자산', level: 2, isGroup: false, isCalculated: false, values: 사용권자산, format: 'number' },
    { account: '이연법인세자산', level: 2, isGroup: false, isCalculated: false, values: 이연법인세자산, format: 'number' },
    { account: '유,무형자산', level: 2, isGroup: false, isCalculated: false, values: 유무형자산, format: 'number' },
    {
      account: '부채',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 부채,
      format: 'number',
    },
    {
      account: '유동부채',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 유동부채,
      format: 'number',
    },
    {
      account: '외상매입금',
      level: 2,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: 외상매입금,
      format: 'number',
    },
    { account: '본사 AP', level: 3, isGroup: false, isCalculated: false, values: 본사AP, format: 'number' },
    { account: '제품 AP', level: 3, isGroup: false, isCalculated: false, values: 제품AP, format: 'number' },
    { account: '차입금', level: 2, isGroup: false, isCalculated: false, values: 차입금, format: 'number' },
    { account: '대리상선수금', level: 2, isGroup: false, isCalculated: false, values: 대리상선수금, format: 'number' },
    { account: '대리상지원금', level: 2, isGroup: false, isCalculated: false, values: 대리상지원금, format: 'number' },
    { account: '기타 유동부채', level: 2, isGroup: false, isCalculated: false, values: 기타유동부채, format: 'number' },
    {
      account: '비유동부채',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: 비유동부채,
      format: 'number',
    },
    { account: '리스부채(장,단기)', level: 2, isGroup: false, isCalculated: false, values: 리스부채, format: 'number' },
    { account: '장기보증금', level: 2, isGroup: false, isCalculated: false, values: 장기보증금, format: 'number' },
    {
      account: '자본',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 자본,
      format: 'number',
    },
    { account: '자본금', level: 1, isGroup: false, isCalculated: false, values: 자본금, format: 'number' },
    { account: '이익잉여금', level: 1, isGroup: false, isCalculated: false, values: 이익잉여금, format: 'number' },
  ];
  
  return rows;
}

// 운전자본 계산
export function calculateWorkingCapital(data: FinancialData[]): TableRow[] {
  const map = createMonthDataMap(data);
  
  // 기본 계정 (재무상태표에서 가져옴)
  const 직영AR = getAccountValues(map, '직영AR');
  const 대리상AR = getAccountValues(map, '대리상AR');
  const 재고자산 = getAccountValues(map, '재고자산');
  const 선급금본사 = getAccountValues(map, '선급금(본사)');
  const 본사AP = getAccountValues(map, '본사 AP');
  const 제품AP = getAccountValues(map, '제품 AP');
  const 대리상선수금 = getAccountValues(map, '대리상선수금');
  const 대리상지원금 = getAccountValues(map, '대리상지원금');
  const 현금및현금성자산 = getAccountValues(map, '현금 및 현금성자산');
  const 차입금 = getAccountValues(map, '차입금');
  const 이익잉여금 = getAccountValues(map, '이익잉여금');
  const 선급금기타 = getAccountValues(map, '선급금(기타)');
  const 이연법인세자산 = getAccountValues(map, '이연법인세자산');
  const 유무형자산 = getAccountValues(map, '유,무형자산');
  const 장기보증금 = getAccountValues(map, '장기보증금');
  const 기타유동자산 = getAccountValues(map, '기타 유동자산');
  const 기타유동부채 = getAccountValues(map, '기타 유동부채');
  const 사용권자산 = getAccountValues(map, '사용권자산');
  const 리스부채 = getAccountValues(map, '리스부채(장,단기)');
  const 자본금 = getAccountValues(map, '자본금');
  
  // 계산
  const 외상매출금 = 직영AR.map((v, i) => v + 대리상AR[i]);
  const 외상매입금 = 본사AP.map((v, i) => -(v + 제품AP[i])); // 마이너스
  const 운전자본 = 외상매출금.map((v, i) => v + 재고자산[i] + 선급금본사[i] + 외상매입금[i]);
  
  const from대리상 = 대리상선수금.map((v, i) => -(v + 대리상지원금[i])); // 마이너스
  const from현금차입금 = 현금및현금성자산.map((v, i) => v - 차입금[i]);
  const from이익창출 = 이익잉여금.map((v, i) => -v); // 마이너스
  
  const 선급비용 = 선급금기타.map((v, i) => v + 이연법인세자산[i]);
  const 고정자산보증금 = 유무형자산.map((v, i) => v - 장기보증금[i]);
  const 미수금미지급금 = 기타유동자산.map((v, i) => v - 기타유동부채[i]);
  const 기타운전자본 = 선급비용.map((v, i) => v + 고정자산보증금[i] + 미수금미지급금[i]);
  
  const 리스관련 = 사용권자산.map((v, i) => v - 리스부채[i]);
  
  const balanceCheck = 운전자본.map((v, i) => 
    v + from대리상[i] + from현금차입금[i] + from이익창출[i] + 기타운전자본[i] + 리스관련[i] - 자본금[i]
  );
  
  const rows: TableRow[] = [
    {
      account: '운전자본',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 운전자본,
      format: 'number',
    },
    {
      account: '외상매출금',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: 외상매출금,
      format: 'number',
    },
    { account: '직영AR', level: 2, isGroup: false, isCalculated: false, values: 직영AR, format: 'number' },
    { account: '대리상AR', level: 2, isGroup: false, isCalculated: false, values: 대리상AR, format: 'number' },
    { account: '재고자산', level: 1, isGroup: false, isCalculated: false, values: 재고자산, format: 'number' },
    { account: '본사선급금', level: 1, isGroup: false, isCalculated: false, values: 선급금본사, format: 'number' },
    {
      account: '외상매입금',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: 외상매입금,
      format: 'number',
    },
    { account: '본사AP', level: 2, isGroup: false, isCalculated: false, values: 본사AP.map(v => -v), format: 'number' },
    { account: '제품AP', level: 2, isGroup: false, isCalculated: false, values: 제품AP.map(v => -v), format: 'number' },
    {
      account: 'from대리상',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: from대리상,
      format: 'number',
    },
    { account: '대리상선수금', level: 1, isGroup: false, isCalculated: false, values: 대리상선수금.map(v => -v), format: 'number' },
    { account: '대리상지원금', level: 1, isGroup: false, isCalculated: false, values: 대리상지원금.map(v => -v), format: 'number' },
    {
      account: 'from 현금/차입금',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: from현금차입금,
      format: 'number',
    },
    { account: '현금', level: 1, isGroup: false, isCalculated: false, values: 현금및현금성자산, format: 'number' },
    { account: '차입금', level: 1, isGroup: false, isCalculated: false, values: 차입금.map(v => -v), format: 'number' },
    {
      account: 'from 이익창출',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: from이익창출,
      format: 'number',
    },
    { account: '이익잉여금', level: 1, isGroup: false, isCalculated: false, values: 이익잉여금.map(v => -v), format: 'number' },
    {
      account: '기타운전자본',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 기타운전자본,
      format: 'number',
    },
    { account: '선급비용', level: 1, isGroup: false, isCalculated: true, values: 선급비용, format: 'number' },
    { account: '고정자산/보증금', level: 1, isGroup: false, isCalculated: true, values: 고정자산보증금, format: 'number' },
    { account: '미수금/미지급금', level: 1, isGroup: false, isCalculated: true, values: 미수금미지급금, format: 'number' },
    {
      account: '리스관련',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: 리스관련,
      format: 'number',
    },
    { account: '사용권자산', level: 1, isGroup: false, isCalculated: false, values: 사용권자산, format: 'number' },
    { account: '리스부채', level: 1, isGroup: false, isCalculated: false, values: 리스부채.map(v => -v), format: 'number' },
    {
      account: 'Balance Check',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'none',
      values: balanceCheck,
      format: 'number',
    },
  ];
  
  return rows;
}

// BS 비교 데이터 계산 (2025 vs 2024, 2026 vs 2025)
export function calculateComparisonDataBS(
  currentYearData: TableRow[],
  previousYearData: TableRow[],
  currentYear: number
): TableRow[] {
  const baseMonth = 11; // 고정: 11월
  
  // 계정별 매핑
  const prevAccountMap = new Map<string, TableRow>();
  previousYearData.forEach(row => {
    prevAccountMap.set(row.account, row);
  });
  
  const calculateYoY = (curr: number | null, prev: number | null): number | null => {
    if (curr === null || prev === null) return null;
    return curr - prev; // 차이값
  };
  
  const result = currentYearData.map(row => {
    const prevRow = prevAccountMap.get(row.account);
    
    if (!prevRow) {
      // 이전 년도에 해당 계정이 없으면 비교 불가
      return {
        ...row,
        comparisons: {
          prevYearMonth: null,
          currYearMonth: null,
          monthYoY: null,
          prevYearYTD: null,
          currYearYTD: null,
          ytdYoY: null,
          prevYearAnnual: null,
          currYearAnnual: null,
          annualYoY: null,
        },
      };
    }
    
    const prevValues = prevRow.values;
    const currValues = row.values;
    
    let comparisons: ComparisonData;
    
    if (currentYear === 2026) {
      // 2026년: 25년기말 vs 26년6월
      const prevYearAnnual = prevValues[11] ?? null; // 25년 12월 (index 11)
      const currYearMonth = currValues[5] ?? null; // 26년 6월 (index 5)
      const monthYoY = calculateYoY(currYearMonth, prevYearAnnual);
      
      comparisons = {
        prevYearMonth: null, // 사용 안 함
        currYearMonth: null, // 사용 안 함
        monthYoY: null, // 사용 안 함
        prevYearYTD: null,
        currYearYTD: null,
        ytdYoY: null,
        prevYearAnnual, // 25년기말
        currYearAnnual: currYearMonth, // 26년6월
        annualYoY: monthYoY,
      };
    } else {
      // 2025년: 전년(11월) 당년(11월) + 24년기말 25년기말
      const prevYearMonth = prevValues[baseMonth - 1] ?? null;
      const currYearMonth = currValues[baseMonth - 1] ?? null;
      const monthYoY = calculateYoY(currYearMonth, prevYearMonth);
      
      const prevYearAnnual = prevValues[11] ?? null; // 12월 (index 11)
      const currYearAnnual = currValues[11] ?? null;
      const annualYoY = calculateYoY(currYearAnnual, prevYearAnnual);
      
      comparisons = {
        prevYearMonth,
        currYearMonth,
        monthYoY,
        prevYearYTD: null, // BS는 YTD 없음
        currYearYTD: null,
        ytdYoY: null,
        prevYearAnnual,
        currYearAnnual,
        annualYoY,
      };
    }
    
    return { ...row, comparisons };
  });
  
  return result;
}

// ==================== CF (현금흐름표) ====================
export function calculateCF(data: FinancialData[], year2024Values: Map<string, number>): TableRow[] {
  const map = createMonthDataMap(data);
  
  const INITIAL_CASH = 140853827.859988;
  
  // 2024년 값 가져오기 헬퍼
  const get2024Value = (account: string): number | null => {
    return year2024Values.get(account) ?? null;
  };
  
  const sum2024Values = (accounts: string[]): number | null => {
    let sum = 0;
    let hasValue = false;
    for (const acc of accounts) {
      const val = year2024Values.get(acc);
      if (val !== undefined) {
        sum += val;
        hasValue = true;
      }
    }
    return hasValue ? sum : null;
  };
  
  // 매출수금
  const MLB = getAccountValues(map, 'MLB');
  const KIDS = getAccountValues(map, 'KIDS');
  const Discovery = getAccountValues(map, 'Discovery');
  const Duvetica = getAccountValues(map, 'Duvetica');
  const Supra = getAccountValues(map, 'Supra');
  const 매출수금 = MLB.map((v, i) => v + KIDS[i] + Discovery[i] + Duvetica[i] + Supra[i]);
  
  // 기타수익
  const 대리상선금 = getAccountValues(map, '대리상선금');
  const 대리상보증금 = getAccountValues(map, '대리상보증금');
  const 정부보조금 = getAccountValues(map, '정부보조금');
  const 기타수익 = getAccountValues(map, '기타수익');
  const 기타수익합계 = 대리상선금.map((v, i) => v + 대리상보증금[i] + 정부보조금[i] + 기타수익[i]);
  
  const 입금 = 매출수금.map((v, i) => v + 기타수익합계[i]);
  
  // 상품대
  const 본사 = getAccountValues(map, '본사');
  const 위탁생산 = getAccountValues(map, '위탁생산');
  const 상품대 = 본사.map((v, i) => v + 위탁생산[i]);
  
  const 본사선급금 = getAccountValues(map, '본사선급금');
  const 운영비 = getAccountValues(map, '운영비');
  const 출금 = 상품대.map((v, i) => v + 본사선급금[i] + 운영비[i]);
  
  const 영업활동 = 입금.map((v, i) => v + 출금[i]);
  
  // 재무활동
  const 차입금입금 = getAccountValues(map, '차입금입금');
  const 차입금상환 = getAccountValues(map, '차입금상환');
  const 재무활동 = 차입금입금.map((v, i) => v + 차입금상환[i]);
  
  // 투자활동
  const 자산성지출 = getAccountValues(map, '자산성지출');
  const 투자활동 = 자산성지출;
  
  // 합계 계산 (12개월)
  const sumArray = (arr: number[]) => arr.reduce((sum: number, v) => sum + v, 0);
  
  // 2024년 데이터 계산
  const 기초현금2024 = 140853827.859988; // 2024년 1월 기초현금 (고정값)
  const 영업활동2024 = sum2024Values(['MLB', 'KIDS', 'Discovery', 'Duvetica', 'Supra', '대리상선금', '대리상보증금', '정부보조금', '기타수익', '본사', '위탁생산', '본사선급금', '운영비']);
  const 입금2024 = sum2024Values(['MLB', 'KIDS', 'Discovery', 'Duvetica', 'Supra', '대리상선금', '대리상보증금', '정부보조금', '기타수익']);
  const 매출수금2024 = sum2024Values(['MLB', 'KIDS', 'Discovery', 'Duvetica', 'Supra']);
  const 기타수익2024 = sum2024Values(['대리상선금', '대리상보증금', '정부보조금', '기타수익']);
  const 출금2024 = sum2024Values(['본사', '위탁생산', '본사선급금', '운영비']);
  const 상품대2024 = sum2024Values(['본사', '위탁생산']);
  const 재무활동2024 = sum2024Values(['차입금입금', '차입금상환']);
  const 투자활동2024 = sum2024Values(['자산성지출']);
  // 2024년 기말현금 계산 (기초현금 + 영업활동 + 재무활동 + 투자활동)
  const 기말현금2024 = 기초현금2024 + (영업활동2024 ?? 0) + (재무활동2024 ?? 0) + (투자활동2024 ?? 0);
  
  // 2025년 기말현금 계산
  // 2025년 1월 기초현금 = 2024년 기말현금
  const 기초현금 = new Array(12).fill(0);
  const 기말현금 = new Array(12).fill(0);
  기초현금[0] = 기말현금2024; // 2024년 기말현금을 2025년 1월 기초현금으로
  기말현금[0] = 기초현금[0] + 영업활동[0] + 재무활동[0] + 투자활동[0];
  
  for (let i = 1; i < 12; i++) {
    기초현금[i] = 기말현금[i - 1];
    기말현금[i] = 기초현금[i] + 영업활동[i] + 재무활동[i] + 투자활동[i];
  }

  const rows: TableRow[] = [
    {
      account: '기초현금',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: [...기초현금, 기말현금2024], // 2025년(합계) = 2024년 기말현금
      format: 'number',
      year2024Value: 기초현금2024,
    },
    {
      account: '1. 영업활동',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: [...영업활동, sumArray(영업활동)],
      format: 'number',
      year2024Value: 영업활동2024,
    },
    {
      account: '입금',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'gray',
      values: [...입금, sumArray(입금)],
      format: 'number',
      year2024Value: 입금2024,
    },
    {
      account: '매출수금',
      level: 2,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: [...매출수금, sumArray(매출수금)],
      format: 'number',
      year2024Value: 매출수금2024,
    },
    { account: 'MLB', level: 3, isGroup: false, isCalculated: false, values: [...MLB, sumArray(MLB)], format: 'number', year2024Value: get2024Value('MLB') },
    { account: 'KIDS', level: 3, isGroup: false, isCalculated: false, values: [...KIDS, sumArray(KIDS)], format: 'number', year2024Value: get2024Value('KIDS') },
    { account: 'Discovery', level: 3, isGroup: false, isCalculated: false, values: [...Discovery, sumArray(Discovery)], format: 'number', year2024Value: get2024Value('Discovery') },
    { account: 'Duvetica', level: 3, isGroup: false, isCalculated: false, values: [...Duvetica, sumArray(Duvetica)], format: 'number', year2024Value: get2024Value('Duvetica') },
    { account: 'Supra', level: 3, isGroup: false, isCalculated: false, values: [...Supra, sumArray(Supra)], format: 'number', year2024Value: get2024Value('Supra') },
    {
      account: '기타수익',
      level: 2,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: [...기타수익합계, sumArray(기타수익합계)],
      format: 'number',
      year2024Value: 기타수익2024,
    },
    { account: '대리상선금', level: 3, isGroup: false, isCalculated: false, values: [...대리상선금, sumArray(대리상선금)], format: 'number', year2024Value: get2024Value('대리상선금') },
    { account: '대리상보증금', level: 3, isGroup: false, isCalculated: false, values: [...대리상보증금, sumArray(대리상보증금)], format: 'number', year2024Value: get2024Value('대리상보증금') },
    { account: '정부보조금', level: 3, isGroup: false, isCalculated: false, values: [...정부보조금, sumArray(정부보조금)], format: 'number', year2024Value: get2024Value('정부보조금') },
    { account: '기타수익', level: 3, isGroup: false, isCalculated: false, values: [...기타수익, sumArray(기타수익)], format: 'number', year2024Value: get2024Value('기타수익') },
    {
      account: '출금',
      level: 1,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'gray',
      values: [...출금, sumArray(출금)],
      format: 'number',
      year2024Value: 출금2024,
    },
    {
      account: '상품대',
      level: 2,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      values: [...상품대, sumArray(상품대)],
      format: 'number',
      year2024Value: 상품대2024,
    },
    { account: '본사', level: 3, isGroup: false, isCalculated: false, values: [...본사, sumArray(본사)], format: 'number', year2024Value: get2024Value('본사') },
    { account: '위탁생산', level: 3, isGroup: false, isCalculated: false, values: [...위탁생산, sumArray(위탁생산)], format: 'number', year2024Value: get2024Value('위탁생산') },
    { account: '본사선급금', level: 2, isGroup: false, isCalculated: false, values: [...본사선급금, sumArray(본사선급금)], format: 'number', year2024Value: get2024Value('본사선급금') },
    { account: '운영비', level: 2, isGroup: false, isCalculated: false, values: [...운영비, sumArray(운영비)], format: 'number', year2024Value: get2024Value('운영비') },
    {
      account: '2. 재무활동',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: [...재무활동, sumArray(재무활동)],
      format: 'number',
      year2024Value: 재무활동2024,
    },
    { account: '차입금입금', level: 1, isGroup: false, isCalculated: false, values: [...차입금입금, sumArray(차입금입금)], format: 'number', year2024Value: get2024Value('차입금입금') },
    { account: '차입금상환', level: 1, isGroup: false, isCalculated: false, values: [...차입금상환, sumArray(차입금상환)], format: 'number', year2024Value: get2024Value('차입금상환') },
    {
      account: '3. 투자활동',
      level: 0,
      isGroup: true,
      isCalculated: true,
      isBold: true,
      isHighlight: 'sky',
      values: [...투자활동, sumArray(투자활동)],
      format: 'number',
      year2024Value: 투자활동2024,
    },
    { account: '자산성지출', level: 1, isGroup: false, isCalculated: false, values: [...자산성지출, sumArray(자산성지출)], format: 'number', year2024Value: get2024Value('자산성지출') },
    {
      account: '기말현금',
      level: 0,
      isGroup: false,
      isCalculated: true,
      isBold: true,
      isHighlight: 'yellow',
      values: [...기말현금, 기말현금[11]], // 2025년(합계) = 2025년 12월 기말현금
      format: 'number',
      year2024Value: 기말현금2024,
    },
  ];
  
  return rows;
}

