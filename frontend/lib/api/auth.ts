import apiClient from './client'
import { UserResponse } from '../types/api'

export interface RegisterRequest {
  email: string
  name: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: UserResponse
}

/**
 * Register a new user
 */
export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/auth/register', data)
  return response.data
}

/**
 * Login with email and password
 */
export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/auth/login', data)
  return response.data
}

/**
 * 비밀번호 재설정 링크 요청.
 *
 * 가입 여부와 무관하게 서버가 같은 답을 준다 — 이 주소로 회원 명부를 훑을 수
 * 없게 하기 위해서다. 화면도 그 전제를 깨뜨리지 말 것("없는 계정입니다" 금지).
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post('/api/auth/password/forgot', { email })
  return response.data
}

/** 토큰으로 비밀번호를 바꾸고 그대로 로그인까지 한다. */
export async function resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/auth/password/reset', {
    token,
    new_password: newPassword,
  })
  return response.data
}

/**
 * Get current user information
 */
export async function getCurrentUser(): Promise<UserResponse> {
  const response = await apiClient.get<UserResponse>('/api/auth/me')
  return response.data
}

/**
 * Update current user
 */
export async function updateUser(data: {
  name?: string
  password?: string
}): Promise<UserResponse> {
  const response = await apiClient.put<UserResponse>('/api/auth/me', data)
  return response.data
}

/**
 * Delete current user account
 */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/api/auth/me')
}
