import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';

type SalesBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';
type CsvRow = Record<string, string>;

interface TagCostRatioResponse {
  brands: Record<SalesBrand, (number | null)[]>;
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

    const filePath = path.join(process.cwd(), '보조파일(simu)', 'Tag대비원가율.csv');
    const result: TagCostRatioResponse = {
      brands: {
        MLB: empty12(),
        'MLB KIDS': empty12(),
        DISCOVERY: empty12(),
      },
    };

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });

    for (const row of parsed.data) {
      const brand = (row['브랜드'] ?? '').trim() as SalesBrand;
      if (!BRANDS.includes(brand)) continue;

      const monthly = empty12();
      for (let month = 1; month <= 12; month += 1) {
        monthly[month - 1] = toNullableNumber(row[`${month}월`]);
      }
      result.brands[brand] = monthly;
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Tag대비원가율 CSV 조회 오류: ${message}` }, { status: 500 });
  }
}
