import { Injectable } from '@nestjs/common';

@Injectable()
export class StyleValidatorService {
  validate(fileName: string, docStyleNo: string | null | undefined): { matchStatus: 'MATCH' | 'MISMATCH' | 'INVALID_HEADER'; message?: string; docStyle?: string } {
    if (!docStyleNo || docStyleNo.trim() === '' || docStyleNo.toUpperCase() === 'N/A') {
        return { matchStatus: 'INVALID_HEADER', message: 'Style No를 찾을 수 없습니다.' };
    }

    const clean = (str: string) => str.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const fileStyle = clean(fileName.replace(/\.[^/.]+$/, '')); 
    const docStyle = clean(docStyleNo);

    if (fileStyle !== docStyle) {
      return { matchStatus: 'MISMATCH', docStyle };
    }
    return { matchStatus: 'MATCH', docStyle };
  }
}
