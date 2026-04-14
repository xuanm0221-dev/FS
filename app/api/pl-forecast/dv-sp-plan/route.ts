import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Brand = 'DUVETICA' | 'SUPRA';
type Channel = 'dealer' | 'direct';

interface BrandPlan {
  tag: Record<Channel, (number | null)[]> & { dealerCloth: (number | null)[]; dealerAcc: (number | null)[] };
  sales: Record<Channel, (number | null)[]> & { dealerCloth: (number | null)[]; dealerAcc: (number | null)[] };
  retail: Record<Channel, (number | null)[]>;
  accounts: Record<string, (number | null)[]>;
}

type CsvRow = Record<string, string>;

const BRANDS: Brand[] = ['DUVETICA', 'SUPRA'];
const MONTH_KEYS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function empty12(): (number | null)[] {
  return new Array(12).fill(null);
}

function makeBrandPlan(): BrandPlan {
  return {
    tag: { dealer: empty12(), direct: empty12(), dealerCloth: empty12(), dealerAcc: empty12() },
    sales: { dealer: empty12(), direct: empty12(), dealerCloth: empty12(), dealerAcc: empty12() },
    retail: { dealer: empty12(), direct: empty12() },
    accounts: {},
  };
}

function toNullableNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  try {
    const dirPath = path.join(process.cwd(), '보조파일(simu)', 'DV,SP연간plan');
    const result: Record<Brand, BrandPlan> = {
      DUVETICA: makeBrandPlan(),
      SUPRA: makeBrandPlan(),
    };

    for (const brand of BRANDS) {
      const csvPath = path.join(dirPath, `${brand}.csv`);
      if (!fs.existsSync(csvPath)) continue;
      const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
      const parsed = Papa.parse<CsvRow>(content, { header: true, skipEmptyLines: true });
      const bd = result[brand];

      for (const row of parsed.data) {
        const level1 = (row.level1 ?? '').trim();
        const level2 = (row.level2 ?? '').trim();
        if (!level1) continue;

        for (let i = 0; i < 12; i++) {
          const raw = toNullableNumber(row[MONTH_KEYS[i]]);
          if (raw === null) continue;
          const value = raw * 1000; // CSV는 천위안 → base CNY

          if (level1 === '리테일매출') {
            if (level2 === '대리상') bd.retail.dealer[i] = value;
            else if (level2 === '직영') bd.retail.direct[i] = value;
            continue;
          }
          if (level1 === 'Tag매출') {
            if (level2 === '대리상(의류)') bd.tag.dealerCloth[i] = value;
            else if (level2 === '대리상(ACC)') bd.tag.dealerAcc[i] = value;
            else if (level2 === '직영') bd.tag.direct[i] = value;
            continue;
          }
          if (level1 === '실판매출') {
            if (level2 === '대리상(의류)') bd.sales.dealerCloth[i] = value;
            else if (level2 === '대리상(ACC)') bd.sales.dealerAcc[i] = value;
            else if (level2 === '직영') bd.sales.direct[i] = value;
            continue;
          }
          if (level2) continue;
          if (!bd.accounts[level1]) bd.accounts[level1] = empty12();
          bd.accounts[level1][i] = value;
        }
      }

      for (let i = 0; i < 12; i++) {
        const tc = bd.tag.dealerCloth[i];
        const ta = bd.tag.dealerAcc[i];
        if (tc !== null || ta !== null) bd.tag.dealer[i] = (tc ?? 0) + (ta ?? 0);
        const sc = bd.sales.dealerCloth[i];
        const sa = bd.sales.dealerAcc[i];
        if (sc !== null || sa !== null) bd.sales.dealer[i] = (sc ?? 0) + (sa ?? 0);
      }
    }

    return NextResponse.json({ brands: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `DV/SP 계획 CSV 조회 오류: ${message}` }, { status: 500 });
  }
}
