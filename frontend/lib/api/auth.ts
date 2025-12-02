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
