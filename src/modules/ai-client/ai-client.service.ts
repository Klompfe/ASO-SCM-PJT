import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface POItemParsed {
  raw_item_name: string;
  raw_spec?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

export interface ParsedPOResponse {
  po_number?: string;
  vendor_name?: string;
  order_date?: string;
  currency: string;
  total_amount: number;
  items: POItemParsed[];
}

export interface MatchedMaterialCandidate {
  material_id: string;
  material_code: string;
  material_name: string;
  specification?: string;
  unit: string;
  trigram_score: number;
  vector_score: number;
  combined_score: number;
}

export interface HybridSearchResponse {
  query_text: string;
  results: MatchedMaterialCandidate[];
}

@Injectable()
export class AiClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('AI_ENGINE_URL') || 'http://localhost:8000';
  }

  async parseUnstructuredPO(rawText: string): Promise<ParsedPOResponse> {
    const endpoint = `${this.baseUrl}/api/v1/parse-po`;
    try {
      const response = await firstValueFrom(
        this.httpService.post<ParsedPOResponse>(endpoint, { raw_text: rawText }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new BadGatewayException(
          `AI Engine service returned status ${error.response.status}: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to reach AI Engine service at ${endpoint}: ${error.message}`,
      );
    }
  }

  async searchMaterials(
    queryText: string,
    topK = 5,
    alpha = 0.5,
    queryVector?: number[],
  ): Promise<HybridSearchResponse> {
    const endpoint = `${this.baseUrl}/api/v1/hybrid-search`;
    try {
      const response = await firstValueFrom(
        this.httpService.post<HybridSearchResponse>(endpoint, {
          query_text: queryText,
          query_vector: queryVector,
          top_k: topK,
          alpha: alpha,
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new BadGatewayException(
          `AI Engine search service error [${error.response.status}]: ${JSON.stringify(
            error.response.data,
          )}`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to execute material hybrid search: ${error.message}`,
      );
    }
  }
}