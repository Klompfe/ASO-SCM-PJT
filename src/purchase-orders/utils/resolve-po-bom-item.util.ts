import { Repository } from 'typeorm';
import { Bom } from '../../boms/entities/bom.entity';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { pickActiveBom } from '../../boms/utils/active-bom.util';
import { buildItemStyleUsage } from './po-style-attribution.util';

// PR-196: export-shipments.service.ts generate()와 packing-receipts.service.ts
// resolveBomItemOrFail()이 똑같이 "발주(PO)의 자재가 어느 스타일 BOM 행인지" 찾다가,
// 둘 다 material.id = po.itemId인 BomItem 중 "가장 나중에 만든" 것(id DESC)을 고르는
// 버그가 있었다 — 같은 자재가 여러 스타일 BOM에 있으면 엉뚱한 스타일이 찍힌다. 이제
// po.styleNo(연결 발주)를 우선 쓰고, 미연결 발주는 그 자재를 쓰는 스타일이 1개일 때만
// 허용한다(2개 이상이면 모호 — 추측 금지, 사람이 "미연결 발주 정리"에서 연결해야 함).
export type BomItemResolution =
  | { kind: 'FOUND'; bomItem: BomItem; bom: Bom }
  // 어떤 활성 BOM에도 이 자재가 전혀 안 쓰임(스타일 연결 여부와 무관).
  | { kind: 'NO_BOM' }
  // 연결 발주인데, 그 스타일의 BOM에는 이 자재가 없음.
  | { kind: 'STYLE_MISMATCH'; styleNo: string }
  // 미연결 발주인데 이 자재를 2개 이상의 스타일이 써서 어느 스타일 몫인지 정할 수 없음.
  | { kind: 'AMBIGUOUS_UNLINKED' };

async function findItemInStyleBoms(
  bomRepository: Repository<Bom>,
  styleNo: string,
  itemId: number,
): Promise<{ bom: Bom; bomItem: BomItem } | null> {
  const boms = await bomRepository.find({
    where: { style: { styleNo } },
    relations: ['items', 'items.material', 'style', 'style.overview'],
  });
  if (boms.length === 0) return null;

  // 활성 BOM 우선, 없으면(또는 활성 BOM에 이 자재가 없으면) id DESC 순서로 찾는다.
  const active = pickActiveBom(boms);
  const ordered = active ? [active, ...boms.filter((b) => b.id !== active.id).sort((a, b) => b.id - a.id)] : [...boms].sort((a, b) => b.id - a.id);
  for (const bom of ordered) {
    const bomItem = bom.items?.find((i) => i.material?.id === itemId);
    if (bomItem) return { bom, bomItem };
  }
  return null;
}

export async function resolveBomItemForPurchaseOrder(
  bomRepository: Repository<Bom>,
  po: { itemId: number; styleNo?: string | null },
): Promise<BomItemResolution> {
  if (po.styleNo) {
    const found = await findItemInStyleBoms(bomRepository, po.styleNo, po.itemId);
    if (!found) return { kind: 'STYLE_MISMATCH', styleNo: po.styleNo };
    return { kind: 'FOUND', bomItem: found.bomItem, bom: found.bom };
  }

  // 미연결 발주 — 이 자재를 쓰는 스타일이 몇 개인지 전체 BOM을 봐야 한다(po-style-attribution.util과 동일 규칙).
  const allBoms = await bomRepository.find({ relations: ['items', 'items.material', 'style'] });
  const usage = buildItemStyleUsage(allBoms);
  const candidateStyleNos = [...(usage.get(po.itemId) ?? new Set<string>())];
  if (candidateStyleNos.length === 0) return { kind: 'NO_BOM' };
  if (candidateStyleNos.length > 1) return { kind: 'AMBIGUOUS_UNLINKED' };

  const found = await findItemInStyleBoms(bomRepository, candidateStyleNos[0], po.itemId);
  if (!found) return { kind: 'NO_BOM' };
  return { kind: 'FOUND', bomItem: found.bomItem, bom: found.bom };
}

// 두 서비스(export-shipments/packing-receipts)가 공유하는 문구 — 스타일이 모호해
// 안내만 하고 막는 경우(요구사항: "메시지 문구는 위와 같게").
export const AMBIGUOUS_UNLINKED_MESSAGE =
  "이 발주는 스타일에 연결되어 있지 않고 여러 스타일에서 쓰는 자재라 스타일을 정할 수 없습니다. 발주관리 > '미연결 발주 정리'에서 스타일을 연결해 주세요.";

export const styleMismatchMessage = (styleNo: string): string =>
  `발주에 연결된 스타일(${styleNo})의 BOM에 이 자재가 없습니다.`;
