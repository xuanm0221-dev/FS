import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';

type SalesBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';
type SalesSupportKey = '당년S' | '당년F' | '1년차' | '차기시즌' | 'ACC';

interface SalesSupportActualResponse {
  brands: Record<SalesBrand, Record<SalesSupportKey, (number | null)[]>>;
  availableMonths: number[];
}

const BRANDS: SalesBrand[] = ['MLB', 'MLB KIDS', 'DISCOVERY'];
const SUPPORT_KEYS: SalesSupportKey[] = ['당년S', '당년F', '1년차', '차기시즌', 'ACC'];

function empty12(): (number | null)[] {
  return new Array(12).fill(null);
}

function makeBrandRows(): Record<SalesSupportKey, (number | null)[]> {
  return {
    당년S: empty12(),
    당년F: empty12(),
    '1년차': empty12(),
    차기시즌: empty12(),
    ACC: empty12(),
  };
}

function toNullableNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const normalized = raw.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(raw: string | undefined): SalesSupportKey | null {
  const value = (raw ?? '').replace(/\s+/g, '');
  if (value === '당년S') return '당년S';
  if (value === '당년F') return '당년F';
  if (value === '1년차') return '1년차';
  if (value === '차기시즌') return '차기시즌';
  if (value.toUpperCase() === 'ACC') return 'ACC';
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const yearRaw = req.nextUrl.searchParams.get('year') ?? '2026';
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: '유효한 year 파라미터가 필요합니다.' }, { status: 400 });
    }

    const dirPath = path.join(process.cwd(), '보조파일(simu)', '매출보조지표_actual');
    const empty: SalesSupportActualResponse = {
      brands: {
        MLB: makeBrandRows(),
        'MLB KIDS': makeBrandRows(),
        DISCOVERY: makeBrandRows(),
      },
      availableMonths: [],
    };

    if (!fs.existsSync(dirPath)) {
      return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } });
    }

    const monthFiles = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .map((name) => {
        const match = name.match(/^(\d{4})-(\d{2})\.csv$/i);
        if (!match) return null;
        const fileYear = Number(match[1]);
        const month = Number(match[2]);
        if (fileYear !== year || month < 1 || month > 12) return null;
        return { name, month };
      })
      .filter((v): v is { name: string; month: number } => v !== null)
      .sort((a, b) => a.month - b.month);

    const result: SalesSupportActualResponse = {
      brands: {
        MLB: makeBrandRows(),
        'MLB KIDS': makeBrandRows(),
        DISCOVERY: makeBrandRows(),
      },
      availableMonths: monthFiles.map((f) => f.month),
    };

    for (const file of monthFiles) {
      const csvPath = path.join(dirPath, file.name);
      const content = fs.readFileSync(csvPath, 'utf-8');
      const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });
      const rows = parsed.data ?? [];
      if (!Array.isArray(rows) || rows.length < 2) continue;

      const header = rows[0].map((v) => (v ?? '').trim());
      const brandColumnIndex: Record<SalesBrand, number> = {
        MLB: header.indexOf('MLB'),
        'MLB KIDS': header.indexOf('MLB KIDS'),
        DISCOVERY: header.indexOf('DISCOVERY'),
      };

      for (let r = 1; r < rows.length; r += 1) {
        const row = rows[r];
        const key = normalizeKey(row?.[0]);
        if (!key) continue;

        for (const brand of BRANDS) {
          const colIdx = brandColumnIndex[brand];
          if (colIdx < 0) continue;
          const value = toNullableNumber(row?.[colIdx]);
          if (value === null) continue;
          // CSV unit is CNY K, internal uses CNY.
          result.brands[brand][key][file.month - 1] = value * 1000;
        }
      }
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `매출보조지표 actual 조회 오류: ${message}` }, { status: 500 });
  }
}

