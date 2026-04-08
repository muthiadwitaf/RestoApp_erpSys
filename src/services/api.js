import axios from 'axios'

const api = axios.create({
    baseURL: '/api',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' }
})

// Request interceptor — attach JWT token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('erp_access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Response interceptor — auto-refresh on 401
let isRefreshing = false
let failedQueue = []

function processQueue(error, token = null) {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error)
        else prom.resolve(token)
    })
    failedQueue = []
}

api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`
                    return api(originalRequest)
                })
            }

            originalRequest._retry = true
            isRefreshing = true

            try {
                const refreshToken = localStorage.getItem('erp_refresh_token')
                if (!refreshToken) throw new Error('No refresh token')

                const { data } = await axios.post('/api/settings/auth/refresh', { refreshToken })
                localStorage.setItem('erp_access_token', data.accessToken)
                api.defaults.headers.Authorization = `Bearer ${data.accessToken}`
                processQueue(null, data.accessToken)
                originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
                return api(originalRequest)
            } catch (refreshError) {
                processQueue(refreshError, null)
                localStorage.removeItem('erp_access_token')
                localStorage.removeItem('erp_refresh_token')
                localStorage.removeItem('erp_user')
                window.location.href = '/login?timeout=1'
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }
        return Promise.reject(error)
    }
)

export default api
