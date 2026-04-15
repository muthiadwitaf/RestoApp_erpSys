// src/api/apiClient.js
import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  timeout: 15000,
})

// Request interceptor – inject token
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor – auto logout on 401
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Dynamically import Pinia store to ensure clean logout and prevent circular deps
      import('@/stores/auth').then(m => m.useAuthStore().logout())
    }
    return Promise.reject(error)
  }
)

export default apiClient
