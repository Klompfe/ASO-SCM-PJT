import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VisionService, PROMPT, RESPONSE_SCHEMA } from './vision.service';
import { checkComposition } from './utils/vision-guardrails.util';

// PR-260: 작지 인식 프롬프트에 "혼용률 칸의 위치"를 명시한다(문구 검사 + 모의 응답). 실제 Gemini 호출 없음, 값은 전부 합성(X/Y=60/40).
describe('작지 인식 — 혼용률 칸 위치 (PR-260)', () => {
  // 프롬프트의 혼용률 문단(다음 문단 "materialSubTypeCandidate:" 앞까지)
  const section = PROMPT.slice(PROMPT.indexOf('composition(혼용률):'), PROMPT.indexOf('materialSubTypeCandidate:'));

  it('혼용률 문단에 위치 핵심어가 모두 들어 있다', () => {
    expect(section.length).toBeGreaterThan(0);
    for (const word of ['맨 아래', '오른쪽', '혼용률', '겉감', '안감', '세탁표시', '그대로', 'null']) expect(section).toContain(word);
    expect(section).toContain('"혼 용 률"');
    expect(section).toContain('"겉 감" 칸과 "안 감" 칸');
    expect(section).toContain('먼저 이 구역을 찾으세요');
  });

  it('위치를 모르던 구 문구는 남아 있지 않다', () => {
    expect(PROMPT).not.toContain('Fiber content');
    expect(PROMPT).not.toContain('혼용률/Composition');
    expect(PROMPT).not.toContain('작지에 인쇄·기재된 혼용률 문구');
    expect(PROMPT).not.toContain('대응해서 적혀 있을 때만');
    expect(PROMPT.split('composition(혼용률):')).toHaveLength(2); // 문단은 하나뿐
  });

  it('행 대응 지시: 겉감 칸→겉감 행, 안감 칸→안감 행, 겉감 여러 줄은 같은 값, 칸 값 뒤바꿈·새 행 생성 금지, 수기 메모 후보로 보내지 않음', () => {
    expect(section).toContain('구분(category)이 겉감인 자재 행(맨 위 소재 표의 행)의 composition');
    expect(section).toContain('"안감" 칸의 값은 구분이 안감인 자재 행의 composition');
    expect(section).toContain('겉감 행이 여러 줄(색상별 등)이면 같은 원단이므로 모든 겉감 행에 같은 값');
    expect(section).toContain('"위·아래 줄의 값 복사 금지"는 표의 빈 칸에 대한 것');
    expect(section).toContain('서로 바꿔 넣지 마세요');
    expect(section).toContain('새 자재 행을 만들지 마세요');
    expect(section).toContain('handwrittenCandidates에 넣지 말고');
  });

  it('그대로 읽기·추측 금지·부자재 제외 지시는 유지한다', () => {
    for (const phrase of [
      '보이는 그대로',
      '약어(예: C/P=60/40)를 풀어 쓰지 말고',
      '% 를 임의로 붙이지 말고',
      '비율을 계산하거나 보정하거나 합계를 맞추지 마세요',
      '추측하지 말고 반드시 null로 두고',
      '안감 기본값은 별도 규칙이 처리합니다',
      '다른 자재 행에 복사하지 마세요',
      '부자재(지퍼·단추·라벨·택·폴리백 등) 행에는 넣지 마세요',
      '실·테이프 행도 마찬가지',
    ]) {
      expect(section).toContain(phrase);
    }
    expect(section).toContain('위 예시의 글자는 형식을 보여 줄 뿐이므로 그대로 옮겨 적지 마세요'); // 예시 값이 인식 결과로 새지 않게
  });

  it('다른 문단(수기 메모 후보, 판독 규칙의 빈 칸 규칙, 헤더 소재=겉감)은 그대로다', () => {
    expect(PROMPT).toContain('5. handwrittenCandidates(수기 메모 후보)');
    expect(PROMPT).toContain('빈 칸은 null입니다. 위·아래 줄의 값을 복사하지 마세요');
    expect(PROMPT).toContain('헤더의 "소재/소재명"은 겉감을 뜻합니다');
  });

  it('응답 스키마의 composition 은 그대로 nullable 이고 required 가 아니다', () => {
    const itemSchema = (RESPONSE_SCHEMA as any).items.properties.bomItems.items;
    expect(itemSchema.properties.composition).toMatchObject({ nullable: true });
    expect(itemSchema.required).toEqual(['itemName']);
  });

  describe('후처리 — % 없는 약어 보존 (모의 응답)', () => {
    const overview = { styleNo: null, styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null };
    const bomRow = (extra: Record<string, unknown>) => ({ category: '겉감', itemName: 'FABRIC A', spec: null, colorCode: 'BK', consumption: null, requiredQty: null, supplier: null, remarks: null, ...extra });
    const analyze = async (bomItems: unknown[]) => {
      const module = await Test.createTestingModule({ providers: [VisionService, { provide: ConfigService, useValue: { get: jest.fn(() => 'fake-api-key-for-test') } }] }).compile();
      const service = module.get(VisionService);
      const generateContent = jest.fn().mockResolvedValue({
        response: { candidates: [{ finishReason: 'STOP' }], text: () => JSON.stringify([{ overview, bomItems, sizeSpecs: [], workNotes: null }]), usageMetadata: { promptTokenCount: 1, totalTokenCount: 2 } },
      });
      (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };
      return (await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any)).results[0].bomItems;
    };

    it('겉감 행의 X/Y=60/40 은 변형 없이 보존되고, 안감·부자재 행의 null 은 null 로 남는다(안감 기본값은 인식 후처리에서 붙지 않는다)', async () => {
      const [shell, shell2, lining, button] = await analyze([
        bomRow({ composition: 'X/Y=60/40' }),
        bomRow({ colorCode: 'NV', composition: 'X/Y=60/40' }),
        bomRow({ category: '안감', itemName: 'LINING A', composition: null }),
        bomRow({ category: '단추', itemName: 'BUTTON A', composition: null }),
      ]);
      expect(shell.composition).toBe('X/Y=60/40');
      expect(shell2.composition).toBe('X/Y=60/40');
      expect(lining.composition).toBeNull();
      expect(button.composition).toBeNull();
      expect(shell.warnings?.some((w: { code: string }) => w.code.startsWith('COMPOSITION'))).toBeFalsy();
    });

    it.each(['X/Y=60/40', 'a/b=50/50', 'X/Y/Z=50/30/20', 'X 60 Y 40'])('checkComposition 은 % 없는 약어 %p 를 버리거나 바꾸지 않는다', (value) => {
      expect(checkComposition(value, '겉감').composition).toBe(value);
    });
  });
});
