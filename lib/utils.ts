// 숫자 포맷팅 유틸리티 (K 단위)
export function formatNumber(
  value: number | null | undefined, 
  showSign: boolean = false,
  useParentheses: boolean = false
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  // K 단위로 변환 (÷ 1000)
  const kValue = value / 1000;
  const absValue = Math.abs(Math.round(kValue));
  const formatted = new Intl.NumberFormat('ko-KR').format(absValue);
  
  // 음수일 때
  if (value < 0) {
    // 괄호 형식 (원본 데이터)
    if (useParentheses) {
      return '(' + formatted + ')';
    }
    // 삼각형 형식 (계산된 값)
    return '△' + formatted;
  }
  
  // 양수일 때 '+' 기호 추가 (옵션)
  if (showSign && value > 0) {
    return '+' + formatted;
  }
  
  return formatted;
}

// 퍼센트 포맷팅 (소수점 자릿수 옵션)
export function formatPercent(
  value: number | null | undefined, 
  showSign: boolean = false,
  useParentheses: boolean = false,
  decimalPlaces: number = 1
): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '-';
  }
  const absPercentValue = Math.abs(value * 100).toFixed(decimalPlaces);
  
  // 음수일 때
  if (value < 0) {
    // 괄호 형식 (원본 데이터)
    if (useParentheses) {
      return '(' + absPercentValue + '%)';
    }
    // 삼각형 형식 (계산된 값)
    return '△' + absPercentValue + '%';
  }
  
  // 양수일 때 '+' 기호 추가 (옵션)
  if (showSign && value > 0) {
    return '+' + absPercentValue + '%';
  }
  
  return absPercentValue + '%';
}

// 천단위 콤마 제거 및 숫자 파싱
export function cleanNumericValue(value: string | number): number {
  if (typeof value === 'number') return value;
  if (!value || value === '-') return 0;
  
  // 쉼표 제거 및 숫자 변환
  const cleaned = value.toString().replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// 안전한 나눗셈 (0으로 나누기 방지)
export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !isFinite(denominator) || !isFinite(numerator)) {
    return null;
  }
  const result = numerator / denominator;
  return isFinite(result) ? result : null;
}

// 월 컬럼명 파싱 (Jan-24, 2024-01, 1월 등)
export function parseMonthColumn(columnName: string): number | null {
  const col = columnName.trim();
  
  // 패턴1: "1월", "2월" ... "12월"
  const koreanMatch = col.match(/^(\d{1,2})월$/);
  if (koreanMatch) {
    const month = parseInt(koreanMatch[1], 10);
    return month >= 1 && month <= 12 ? month : null;
  }
  
  // 패턴2: "Jan-24", "Feb-25" 등
  const monthMap: { [key: string]: number } = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const engMatch = col.match(/^([a-z]{3})-\d{2}$/i);
  if (engMatch) {
    const monthStr = engMatch[1].toLowerCase();
    return monthMap[monthStr] || null;
  }
  
  // 패턴3: "2024-01", "2024-1", "202401"
  const isoMatch = col.match(/^(\d{4})-?(\d{1,2})$/);
  if (isoMatch) {
    const month = parseInt(isoMatch[2], 10);
    return month >= 1 && month <= 12 ? month : null;
  }
  
  return null;
}

