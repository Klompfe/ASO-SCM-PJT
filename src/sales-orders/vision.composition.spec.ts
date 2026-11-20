import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VisionService, PROMPT, RESPONSE_SCHEMA } from './vision.service';
import { checkComposition } from './utils/vision-guardrails.util';

// PR-247: 작지 인식이 혼용률(composition)을 읽는다 — 스키마·프롬프트·후처리. 실제 Gemini 호출 없음
// (generateContent 스텁 + 합성 값만). 인식값은 "후보"이며 글자 하나 바꾸지 않고 통과해야 한다.
describe('작지 인식 — 혼용률 (PR-247)', () => {
  const buildService = async (): Promise<VisionService> => {
    const module = await Test.createTestingModule({
      providers: [VisionService, { provide: ConfigService, useValue: { get: jest.fn(() => 'fake-api-key-for-test') } }],
    }).compile();
    return module.get(VisionService);
  };
  const overview = { styleNo: null, styleName: null, itemType: null, brand: null, productionType: null, factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null };
  const bomRow = (extra: Record<string, unknown>) => ({
    category: '겉감', itemName: 'FABRIC A', spec: null, colorCode: 'BK', consumption: null, requiredQty: null, supplier: null, remarks: null, ...extra,
  });
  const analyze = async (bomItems: unknown[]) => {
    const service = await buildService();
    const generateContent = jest.fn().mockResolvedValue({
      response: {
        candidates: [{ finishReason: 'STOP' }],
        text: () => JSON.stringify([{ overview, bomItems, sizeSpecs: [], workNotes: null }]),
        usageMetadata: { promptTokenCount: 100, totalTokenCount: 300 },
      },
    });
    (service as any).genAI = { getGenerativeModel: jest.fn(() => ({ generateContent })) };
    return (await service.analyzeSalesOrder({ buffer: Buffer.from(''), mimetype: 'image/png' } as any)).results[0].bomItems;
  };

  describe('스키마·프롬프트', () => {
    const itemSchema = (RESPONSE_SCHEMA as any).items.properties.bomItems.items;

    it('자재 행 스키마에 composition(문자열, nullable)이 있고 required 에는 없다', () => {
      expect(itemSchema.properties.composition).toMatchObject({ nullable: true });
      expect(itemSchema.properties.composition.description).toContain('그대로');
      expect(itemSchema.required).not.toContain('composition');
    });

    it('프롬프트에 그대로 읽기·변환 금지·추측 금지·행 대응·부자재 제외 문구가 있다', () => {
      expect(PROMPT).toContain('composition(혼용률)');
      expect(PROMPT).toContain('보이는 그대로');
      expect(PROMPT).toContain('약어(예: C/P=60/40)를 풀어 쓰지 말고');
      expect(PROMPT).toContain('비율을 계산하거나 보정하거나 합계를 맞추지 마세요');
      expect(PROMPT).toContain('반드시 null로 두고');
      expect(PROMPT).toContain('다른 자재 행에 복사하지 마세요');
      expect(PROMPT).toContain('부자재(지퍼·단추·라벨·택·폴리백 등) 행에는 넣지 마세요');
    });

    it('기존 프롬프트 규칙(실/테이프 후보, 새 항목은 표에서만)은 그대로 남아 있다', () => {
      expect(PROMPT).toContain('materialSubTypeCandidate');
      expect(PROMPT).toContain('새 항목(bomItems)은 표에서만 만드세요');
    });
  });

  describe('후처리 — 인식 응답(모의)', () => {
    it.each([
      'R/N/SP=56/40/4',
      'c/p=60/40',
      'Cotton 60% polyester 40%',
      'SHELL : COTTON 60%,  POLYESTER 40% / LINING : P100%',
      '면 60% 폴리에스터 40%',
    ])('값 %p 는 글자 하나 바뀌지 않고 그대로 통과한다', async (value) => {
      const [item] = await analyze([bomRow({ composition: value })]);
      expect(item.composition).toBe(value);
      expect(item.warnings?.some((w) => w.code.startsWith('COMPOSITION'))).toBeFalsy();
    });

    it('앞뒤 공백만 제거한다(내부 공백·기호 유지)', async () => {
      const [item] = await analyze([bomRow({ composition: '  A/B = 60/40 \n' })]);
      expect(item.composition).toBe('A/B = 60/40');
    });

    it.each([undefined, null, '', '   ', '-', '—', 'N/A', 'n/a', 'NA', '없음', '해당없음', 'NULL', 'null', ' Null '])('빈 값/자리표시자 %p 는 null', async (value) => {
      const [item] = await analyze([bomRow({ composition: value })]);
      expect(item.composition).toBeNull();
    });

    it('목록 밖 비슷한 값(예: "N/A 100%")은 자리표시자가 아니므로 그대로 둔다', async () => {
      const [item] = await analyze([bomRow({ composition: 'NA 100%' })]);
      expect(item.composition).toBe('NA 100%');
    });

    it.each([60, ['COTTON'], { a: 1 }, true])('문자열이 아닌 값 %p 는 문자열화하지 않고 null', async (value) => {
      const [item] = await analyze([bomRow({ composition: value })]);
      expect(item.composition).toBeNull();
    });

    it('길이 500자 초과는 잘라 내지 않고 null + COMPOSITION_TOO_LONG 경고, 500자는 통과', async () => {
      const [tooLong, ok] = await analyze([bomRow({ composition: 'A'.repeat(501) }), bomRow({ itemName: 'FABRIC B', composition: 'A'.repeat(500) })]);
      expect(tooLong.composition).toBeNull();
      expect(tooLong.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COMPOSITION_TOO_LONG' })]));
      expect(ok.composition).toBe('A'.repeat(500));
    });

    it('부자재 구분 행의 값은 버리지 않고 그대로 두며 COMPOSITION_ON_NON_FABRIC 경고만 남긴다', async () => {
      const [item] = await analyze([bomRow({ category: '단추', itemName: 'BUTTON A', composition: 'ZINC 100%' })]);
      expect(item.composition).toBe('ZINC 100%');
      expect(item.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COMPOSITION_ON_NON_FABRIC' })]));
    });

    it('원단류 구분(겉감/안감/배색/배색감/퀼팅안감/폴리트윌안감)과 구분 없음(null)은 경고하지 않는다', async () => {
      for (const category of ['겉감', '안감', '배색', '배색감', '퀼팅안감', '폴리트윌안감', null]) {
        const [item] = await analyze([bomRow({ category, composition: 'X 100%' })]);
        expect(item.composition).toBe('X 100%');
        expect(item.warnings?.some((w) => w.code === 'COMPOSITION_ON_NON_FABRIC')).toBeFalsy();
      }
    });

    it('한 행의 혼용률이 다른 행으로 복사되지 않는다', async () => {
      const [a, b] = await analyze([bomRow({ composition: 'A 100%' }), bomRow({ itemName: 'FABRIC B', composition: null })]);
      expect(a.composition).toBe('A 100%');
      expect(b.composition).toBeNull();
    });
  });

  describe('checkComposition (순수 함수)', () => {
    it('입력 문자열을 변환하지 않는다', () => {
      expect(checkComposition('r/n/sp=56/40/4', '겉감').composition).toBe('r/n/sp=56/40/4');
    });
  });
});
