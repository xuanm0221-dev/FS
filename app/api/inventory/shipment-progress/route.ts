import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';

type ProgressBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';
type ProgressSeason = '당년S' | '당년F' | '1년차' | '차기시즌';

export interface ShipmentProgressRow {
  brand: ProgressBrand;
  season: ProgressSeason;
  prevYearProgress: number | null;
  monthly: (number | null)[];
}

function toNullableNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrand(raw: string): ProgressBrand | null {
  const v = raw.trim().toUpperCase();
  if (v === 'MLB') return 'MLB';
  if (v === 'MLB KIDS') return 'MLB KIDS';
  if (v === 'DISCOVERY' || v === 'DX') return 'DISCOVERY';
  return null;
}

function normalizeSeason(raw: string): ProgressSeason | null {
  const v = raw.trim();
  if (v === '당년S') return '당년S';
  if (v === '당년F') return '당년F';
  if (v === '1년차') return '1년차';
  if (v === '차기시즌') return '차기시즌';
  return null;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '보조파일(simu)', '출고진척률.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const rows: ShipmentProgressRow[] = [];
    for (const row of parsed.data) {
      const brand = normalizeBrand(row['브랜드'] ?? '');
      const season = normalizeSeason(row['시즌'] ?? '');
      if (!brand || !season) continue;

      const monthly = Array.from({ length: 12 }, (_, idx) => toNullableNumber(row[`${idx + 1}월`]));
      rows.push({
        brand,
        season,
        prevYearProgress: toNullableNumber(row['전년까지']),
        monthly,
      });
    }

    return NextResponse.json(
      {
        rows,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `출고진척률 조회 오류: ${message}` }, { status: 500 });
  }
}

