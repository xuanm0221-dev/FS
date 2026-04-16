import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SalesBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY' | 'DUVETICA' | 'SUPRA';
type Category = '실판매출(V+)' | '리테일매출';
type CsvRow = Record<string, string>;

const BRANDS: SalesBrand[] = ['MLB', 'MLB KIDS', 'DISCOVERY', 'DUVETICA', 'SUPRA'];
const CATEGORIES: Category[] = ['실판매출(V+)', '리테일매출'];

function empty12(): (number | null)[] {
  return new Array(12).fill(null);
}

function emptyBrand(): Record<Category, (number | null)[]> {
  return { '실판매출(V+)': empty12(), '리테일매출': empty12() };
}

function toNullableNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '보조파일(simu)', '2025년리테일,실판(V+).csv');
    const brands: Record<SalesBrand, Record<Category, (number | null)[]>> = {
      MLB: emptyBrand(),
      'MLB KIDS': emptyBrand(),
      DISCOVERY: emptyBrand(),
      DUVETICA: emptyBrand(),
      SUPRA: emptyBrand(),
    };

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ brands }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });

    const MONTH_KEYS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

    for (const row of parsed.data) {
      const category = (row['구분'] ?? '').trim() as Category;
      const brand = (row['브랜드'] ?? '').trim() as SalesBrand;
      if (!BRANDS.includes(brand)) continue;
      if (!CATEGORIES.includes(category)) continue;

      for (let i = 0; i < 12; i++) {
        brands[brand][category][i] = toNullableNumber(row[MONTH_KEYS[i]]);
      }
    }

    return NextResponse.json({ brands }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `2025년 리테일,실판 CSV 조회 오류: ${message}` }, { status: 500 });
  }
}
