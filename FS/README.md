# 재무제표 대시보드

Next.js 앱 라우터 + TypeScript로 구현한 재무제표 대시보드입니다.

## 기능

- **손익계산서 (PL)**: 2024년, 2025년 데이터
- **재무상태표 (BS)**: 2024년, 2025년, 2026년 데이터
- **현금흐름표 (CF)**: 2025년 데이터
- **여신사용현황**: 추후 구현 예정

## 주요 특징

- 트리형 계정과목 구조 (접기/펼치기)
- 스티키 헤더 및 첫 번째 열 고정
- 자동 계산식 적용
- UTF-8/CP949 인코딩 자동 감지
- 천단위 콤마 표시

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 http://localhost:3000 접속

## CSV 파일 경로

- PL: `C:\대시보드\FS\PL\{year}.csv`
- BS: `C:\대시보드\FS\BS\{year}.csv`
- CF: `C:\대시보드\FS\CF\2025.csv`

## 기술 스택

- Next.js 14
- TypeScript
- Tailwind CSS
- PapaParse (CSV 파싱)
- iconv-lite (인코딩 처리)




