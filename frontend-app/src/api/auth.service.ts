import apiClient from './client';

export const login = async (credentials: { email: string; password: string }): Promise<{ access_token: string }> => {
  const response = await apiClient.post('/auth/login', credentials);
  return response;
};
