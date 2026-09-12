import apiClient from './client';

// 백엔드 LoginDto는 email/username 둘 다 선택적으로 받아 로그인 아이디로 사용한다(PR-018).
export const login = async (credentials: { email?: string; username?: string; password: string }): Promise<{ accessToken: string; user: any }> => {
  return await apiClient.post('/auth/login', credentials);
};

export const register = async (userData: { email: string; password: string; name: string }): Promise<any> => {
  return await apiClient.post('/auth/register', userData);
};

export type UserRole = 'ADMIN' | 'USER' | 'MANAGER';

export interface CurrentUser {
  userId: number;
  username: string;
  email?: string;
  role: UserRole;
}

// role은 MANAGER/ADMIN 전용 버튼(계약 승인 등)을 조건부로 보여줄 때 쓴다 — 로그인
// 응답에도 있지만, 새로고침 후에는 토큰만 남아있으므로 이 엔드포인트로 다시 가져온다.
export const getCurrentUser = async (): Promise<CurrentUser> => {
  return await apiClient.get('/auth/me');
};
