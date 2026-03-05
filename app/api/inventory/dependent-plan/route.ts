import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { cleanNumericValue } from '@/lib/utils';

type Brand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';
type RowLabel = '대리상출고' | '본사상품매입' | '본사기말재고';

const TARGET_FILE = 'plan_대리상출고,본사상품매입,본사기말재고.csv';
const BRANDS: Brand[] = ['MLB', 'MLB KIDS', 'DISCOVERY'];
const ROW_LABELS: RowLabel[] = ['대리상출고', '본사상품매입', '본사기말재고'];

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '보조파일(simu)', TARGET_FILE);

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      const buffer = fs.readFileSync(filePath);
      content = iconv.decode(buffer, 'cp949');
    }

    const parsed = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
    });

    const rows = parsed.data;
    if (rows.length < 2) {
      return NextResponse.json({ rows: [] });
    }

    const header = rows[0];
    const brandColumnIndex: Record<Brand, number> = {
      MLB: header.findIndex((v) => (v ?? '').trim() === 'MLB'),
      'MLB KIDS': header.findIndex((v) => (v ?? '').trim() === 'MLB KIDS'),
      DISCOVERY: header.findIndex((v) => (v ?? '').trim() === 'DISCOVERY'),
    };

    const result = ROW_LABELS.map((label) => {
      const source = rows.find((row) => (row[0] ?? '').trim() === label) ?? [];
      const values: Record<Brand, number | null> = {
        MLB: null,
        'MLB KIDS': null,
        DISCOVERY: null,
      };

      for (const brand of BRANDS) {
        const idx = brandColumnIndex[brand];
        if (idx < 0) continue;
        values[brand] = cleanNumericValue(source[idx] || '0');
      }

      return { label, values };
    });

    return NextResponse.json({
      fileName: TARGET_FILE,
      unit: 'K',
      rows: result,
    });
  } catch (error) {
    console.error('dependent-plan API error:', error);
    return NextResponse.json({ error: '종속변수 계획값 CSV를 불러오는데 실패했습니다.' }, { status: 500 });
  }
}

