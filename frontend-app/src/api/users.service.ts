import apiClient from './client';
import type { UserRole } from './auth.service';

export interface UserAccount {
  id: number;
  username: string;
  email: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface UpdateUserAccount {
  role?: UserRole;
  isActive?: boolean;
}

export const getUsers = (): Promise<any> => apiClient.get('/users');
export const updateUser = (id: number, data: UpdateUserAccount): Promise<any> =>
  apiClient.patch(`/users/${id}`, data);
export const deleteUser = (id: number): Promise<any> => apiClient.delete(`/users/${id}`);
