/**
 * API Client - Central export for all API modules
 */

// Re-export all API functions
export * from './auth'
export * from './blog'
export * from './comprehensive'
export * from './system'

// Re-export client for custom requests
export { default as apiClient } from './client'

// Re-export getApiUrl as getApiBaseUrl for convenience
export { getApiUrl as getApiBaseUrl } from './apiConfig'
