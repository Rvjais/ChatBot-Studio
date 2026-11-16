import type { AuthResponse, User } from '../types/api';
import { api } from './http';

export const authApi = {
  register: (input: { name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/register', input).then((r) => r.data),
  login: (input: { email: string; password: string }) => api.post<AuthResponse>('/auth/login', input).then((r) => r.data),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data.user),
  updateProfile: (name: string) => api.put<{ user: User }>('/auth/me', { name }).then((r) => r.data.user),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ token: string; message: string }>('/auth/password', { currentPassword, newPassword }).then((r) => r.data),
  logout: () => api.post<{ message: string }>('/auth/logout').then((r) => r.data),
};
