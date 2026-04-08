import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SalesBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';

type CsvRow = Record<string, string>;

interface OpexForecastResponse {
  brands: Record<SalesBrand, Record<string, (number | null)[]>>;
}

const BRANDS: SalesBrand[] = ['MLB', 'MLB KIDS', 'DISCOVERY'];

function empty12(): (number | null)[] {
  return new Array(12).fill(null);
}

function toNullableNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const yearRaw = req.nextUrl.searchParams.get('year') ?? '2026';
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: '유효한 year 파라미터가 필요합니다.' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), '보조파일(simu)', 'pl_brand_forecast_영업비');
    const result: OpexForecastResponse = {
      brands: {
        MLB: {},
        'MLB KIDS': {},
        DISCOVERY: {},
      },
    };

    if (!fs.existsSync(dirPath)) {
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    for (const brand of BRANDS) {
      const filePath = path.join(dirPath, `${brand}.csv`);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });

      for (const row of parsed.data) {
        const account = (row.level1 ?? '').trim();
        if (!account) continue;
        const monthly = empty12();
        for (let month = 2; month <= 12; month += 1) {
          const v = toNullableNumber(row[`${month}월`]);
          monthly[month - 1] = v === null ? null : v * 1000; // CSV is CNY K; PL internal uses CNY.
        }
        result.brands[brand][account] = monthly;
      }
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `영업비 계획 CSV 조회 오류: ${message}` }, { status: 500 });
  }
}

