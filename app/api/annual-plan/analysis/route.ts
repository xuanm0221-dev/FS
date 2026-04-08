import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { generateCashFlowInsights } from '@/lib/analysis';
import { EditableAnalysis } from '@/lib/types';

export const dynamic = 'force-dynamic';

// 분석 데이터 저장 경로
const ANALYSIS_FILE_PATH = path.join(process.cwd(), '파일', 'analysis.json');

// GET: 분석 데이터 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : 2025;
    
    // 분석 파일 로드 시도
    try {
      const fileContent = await fs.readFile(ANALYSIS_FILE_PATH, 'utf-8');
      const allAnalyses: EditableAnalysis[] = JSON.parse(fileContent);
      
      // 해당 연도의 분석 데이터 찾기
      const analysis = allAnalyses.find(a => a.year === year);
      
      if (analysis) {
        return NextResponse.json({ data: analysis });
      }
    } catch (err) {
      // 파일이 없거나 읽기 실패 - 자동 생성으로 진행
      console.log('분석 파일 없음, 자동 생성 진행');
    }
    
    // 자동 생성: CF 데이터와 운전자본 데이터로부터 인사이트 생성
    // (여기서는 CF API와 운전자본 API를 다시 호출하여 데이터를 가져와야 함)
    // 간단히 빈 분석 데이터 반환
    const defaultAnalysis: EditableAnalysis = {
      year,
      keyInsights: ['데이터 분석이 준비 중입니다.'],
      cfCategories: [],
      wcCategories: [],
      wcInsights: {},
      riskFactors: [],
      actionItems: [],
      lastModified: new Date().toISOString(),
    };
    
    return NextResponse.json({ data: defaultAnalysis });
  } catch (error) {
    console.error('분석 데이터 API 에러:', error);
    return NextResponse.json(
      { error: '분석 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 분석 데이터 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const analysisData: EditableAnalysis = body;
    
    // 기존 분석 데이터 로드
    let allAnalyses: EditableAnalysis[] = [];
    try {
      const fileContent = await fs.readFile(ANALYSIS_FILE_PATH, 'utf-8');
      allAnalyses = JSON.parse(fileContent);
    } catch (err) {
      // 파일이 없으면 빈 배열로 시작
      allAnalyses = [];
    }
    
    // 해당 연도의 분석 데이터 업데이트 또는 추가
    const existingIndex = allAnalyses.findIndex(a => a.year === analysisData.year);
    
    analysisData.lastModified = new Date().toISOString();
    
    if (existingIndex !== -1) {
      allAnalyses[existingIndex] = analysisData;
    } else {
      allAnalyses.push(analysisData);
    }
    
    // 파일에 저장
    await fs.writeFile(ANALYSIS_FILE_PATH, JSON.stringify(allAnalyses, null, 2), 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      data: analysisData 
    });
  } catch (error) {
    console.error('분석 데이터 저장 에러:', error);
    return NextResponse.json(
      { error: '분석 데이터를 저장하는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
