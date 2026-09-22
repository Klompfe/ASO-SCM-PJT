import { getMaterialRequirements, getStyleRequirements } from '../api/workOrders.service';
import { toStyleView, toWorkOrderView, type RequirementView } from './bomRequirementReport';

// PR-129: BOM 소요명세서의 두 조회 경로(스타일 기준 = 기본 / 작업지시 기준 = 보조)를 같은 RequirementView로 돌려준다.
// quantity를 undefined로 주면 API가 quantity 파라미터를 보내지 않아 서버가 스타일의 총 생산수량을 쓴다.
export async function fetchStyleRequirementView(styleNo: string, quantity?: number): Promise<RequirementView> {
  return toStyleView(await getStyleRequirements(styleNo, quantity));
}

export async function fetchWorkOrderRequirementView(workOrderId: number): Promise<RequirementView> {
  return toWorkOrderView(await getMaterialRequirements(workOrderId));
}
