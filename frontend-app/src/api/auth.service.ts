import apiClient from './client';

// 백엔드 LoginDto는 email/username 둘 다 선택적으로 받아 로그인 아이디로 사용한다(PR-018).
export const login = async (credentials: { email?: string; username?: string; password: string }): Promise<{ accessToken: string; user: any }> => {
  return await apiClient.post('/auth/login', credentials);
};

export const register = async (userData: { email: string; password: string; name: string }): Promise<any> => {
  return await apiClient.post('/auth/register', userData);
};
