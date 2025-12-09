import apiClient from './client'

/**
 * System Management API
 * Server management and monitoring functions
 */

export interface PortCheckResponse {
  port: number
  available: boolean
}

export interface SystemInfoResponse {
  platform: string
  python_version: string
  fastapi_version: string
  uptime: number
  memory_usage: {
    total: number
    available: number
    percent: number
  }
  cpu_percent: number
}

/**
 * Find an available port
 * Useful for development when default ports are occupied
 */
export async function findAvailablePort(): Promise<PortCheckResponse> {
  const response = await apiClient.get<PortCheckResponse>('/api/system/find-port')
  return response.data
}

/**
 * Check if a specific port is available
 */
export async function checkPort(port: number): Promise<PortCheckResponse> {
  const response = await apiClient.get<PortCheckResponse>(`/api/system/check-port/${port}`)
  return response.data
}

/**
 * Restart the backend server (development only)
 * WARNING: This will terminate the current server process
 */
export async function restartServer(): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>('/api/system/restart')
  return response.data
}

/**
 * Get system information
 * Shows server resource usage and version info
 */
export async function getSystemInfo(): Promise<SystemInfoResponse> {
  const response = await apiClient.get<SystemInfoResponse>('/api/system/system-info')
  return response.data
}
