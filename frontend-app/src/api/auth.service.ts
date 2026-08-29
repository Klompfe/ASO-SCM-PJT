import apiClient from './client';

export const login = async (credentials: { email: string; password: string }): Promise<{ accessToken: string; user: any }> => {
  return await apiClient.post('/auth/login', credentials);
};

export const register = async (userData: { email: string; password: string; name: string }): Promise<any> => {
  return await apiClient.post('/auth/register', userData);
};
