import { isOuterFabricCategory } from '../../sales-orders/utils/vision-guardrails.util';

// PR-256: 겉감 혼용률 점검 — 순수 계산(DB 접근 없음). 프런트 outerFabricStatus(compositionReview.ts)와 같은 규칙이며
// 서버·프런트 대조 테스트가 고정한다. 판정 불가·이상 값은 "문제 없음"으로 숨기지 않고 누락 쪽으로 둔다(fail-closed).

export type OuterFabricAuditStatus = 'noBom' | 'noRow' | 'blank';
export type OuterFabricAuditFilter = 'all' | OuterFabricAuditStatus;

export interface AuditStyleInput {
  styleNo: string;
  styleName: string | null;
}
export interface AuditBomInput {
  id: number;
  styleNo: string;
  isActive: unknown;
}
export interface AuditItemInput {
  bomId: number;
  category: unknown;
  composition: unknown;
}

export interface OuterFabricAuditItem {
  styleNo: string;
  styleName: string | null;
  status: OuterFabricAuditStatus;
  outerRowCount: number;
  blankOuterRows: number;
  totalRows: number;
  // 이 스타일(사용 중인 BOM)에 있는 구분 값(중복 제거, 한 줄로 정리) — 비표준 구분 때문에 "겉감 없음"으로 보이는 경우를 알아보는 용도.
  categories: string[];
}

export interface OuterFabricAuditCounts {
  noBom: number;
  noRow: number;
  blank: number;
  total: number; // 누락 전체(noBom + noRow + blank)
}

export interface OuterFabricAuditResponse {
  items: OuterFabricAuditItem[];
  total: number; // 현재 상태 필터를 적용한 건수
  page: number;
  pageSize: number;
  counts: OuterFabricAuditCounts; // 검색어만 적용한 상태별 건수
  styleCount: number; // 점검한 전체 스타일 수(검색어 적용 전)
}

export const AUDIT_DEFAULT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 200;
const MAX_CATEGORIES_PER_STYLE = 30;
const STATUS_ORDER: Record<OuterFabricAuditStatus, number> = { noRow: 0, blank: 1, noBom: 2 };

// DB 드라이버마다 불리언이 true/false, 1/0, '1'/'0' 으로 온다. 명확히 "비활성"인 값만 비활성으로 본다(pickActiveBom 과 같은 기준).
const isInactiveFlag = (v: unknown): boolean => v === false || v === 0 || v === '0' || v === 'false';

// pickActiveBom 과 같은 선택: 활성 BOM 이 있으면 그중, 없으면 전체 중 id 가 가장 큰 BOM.
function pickActive(boms: AuditBomInput[]): AuditBomInput | null {
  if (boms.length === 0) return null;
  const active = boms.filter((b) => !isInactiveFlag(b.isActive));
  const pool = active.length > 0 ? active : boms;
  return pool.reduce((latest, b) => (b.id > latest.id ? b : latest));
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function buildOuterFabricAudit(
  styles: AuditStyleInput[],
  boms: AuditBomInput[],
  items: AuditItemInput[],
  options: { status?: OuterFabricAuditFilter; q?: string; page?: number; pageSize?: number } = {},
): OuterFabricAuditResponse {
  const bomsByStyle = new Map<string, AuditBomInput[]>();
  for (const b of boms) {
    if (typeof b.styleNo !== 'string' || b.styleNo === '') continue;
    const list = bomsByStyle.get(b.styleNo);
    if (list) list.push(b);
    else bomsByStyle.set(b.styleNo, [b]);
  }
  const itemsByBom = new Map<number, AuditItemInput[]>();
  for (const it of items) {
    const list = itemsByBom.get(it.bomId);
    if (list) list.push(it);
    else itemsByBom.set(it.bomId, [it]);
  }

  const all: OuterFabricAuditItem[] = [];
  for (const s of styles) {
    const bom = pickActive(bomsByStyle.get(s.styleNo) ?? []);
    const rows = bom ? itemsByBom.get(bom.id) ?? [] : [];
    let status: OuterFabricAuditStatus | null;
    let outerRowCount = 0;
    let blankOuterRows = 0;
    if (rows.length === 0) {
      status = 'noBom';
    } else {
      for (const r of rows) {
        if (typeof r.category === 'string' && isOuterFabricCategory(r.category)) {
          outerRowCount++;
          if (typeof r.composition !== 'string' || r.composition.trim() === '') blankOuterRows++;
        }
      }
      status = outerRowCount === 0 ? 'noRow' : blankOuterRows > 0 ? 'blank' : null;
    }
    if (status == null) continue; // 겉감 혼용률이 모두 채워진 스타일은 목록에서 제외
    const categories = [...new Set(rows.map((r) => (typeof r.category === 'string' ? oneLine(r.category) : '')).filter((c) => c !== ''))]
      .sort()
      .slice(0, MAX_CATEGORIES_PER_STYLE);
    all.push({ styleNo: s.styleNo, styleName: s.styleName ?? null, status, outerRowCount, blankOuterRows, totalRows: rows.length, categories });
  }

  const q = (options.q ?? '').trim().toLowerCase();
  const searched = q === '' ? all : all.filter((a) => a.styleNo.toLowerCase().includes(q) || (a.styleName ?? '').toLowerCase().includes(q));
  const counts: OuterFabricAuditCounts = {
    noBom: searched.filter((a) => a.status === 'noBom').length,
    noRow: searched.filter((a) => a.status === 'noRow').length,
    blank: searched.filter((a) => a.status === 'blank').length,
    total: searched.length,
  };

  const filter = options.status ?? 'all';
  const filtered = filter === 'all' ? searched : searched.filter((a) => a.status === filter);
  filtered.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.styleNo < b.styleNo ? -1 : a.styleNo > b.styleNo ? 1 : 0));

  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? AUDIT_DEFAULT_PAGE_SIZE) || AUDIT_DEFAULT_PAGE_SIZE, 1), AUDIT_MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(options.page ?? 1) || 1, 1);
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    counts,
    styleCount: styles.length,
  };
}
