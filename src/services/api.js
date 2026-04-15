import axios from 'axios'

const api = axios.create({
    baseURL: '/api',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' }
})

// Memory leak and Ghost Spinner protection.
export const activeRequests = new Map()

// Request interceptor — attach JWT token & cancellation tokens
api.interceptors.request.use(config => {
    const controller = new AbortController()
    config.signal = controller.signal
    // Map controller to config allowing external programmatic aborts (e.g. during rapid Logout).
    activeRequests.set(config, controller)

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
    response => {
        // Self-clean Map registry strictly preventing memory leaks.
        activeRequests.delete(response.config)
        return response
    },
    async error => {
        const originalRequest = error.config
        if (originalRequest) {
            activeRequests.delete(originalRequest)
        }

        if (error.response?.status === 401 && !originalRequest?._retry) {
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
                
                // Aggressively terminate all parallel pending queries to prevent subsequent cascade loops / UI ghost freezing.
                activeRequests.forEach(controller => controller.abort('Session Terminated.'))
                activeRequests.clear()

                // CRITICAL: Clear auth tokens SYNCHRONOUSLY before redirect.
                // Previously this was "fire and forget" after window.location.replace,
                // causing a race condition: the login page would reload, find stale
                // erp_user in localStorage, redirect to /resto/pos, trigger 401s,
                // and loop back to /login?timeout=1 infinitely.
                localStorage.removeItem('erp_access_token')
                localStorage.removeItem('erp_refresh_token')
                localStorage.removeItem('erp_user')
                localStorage.removeItem('erp_branch')
                localStorage.removeItem('erp-company')

                // Now redirect — localStorage is clean so login page won't redirect away
                window.location.replace('/login?timeout=1')
                
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }
        return Promise.reject(error)
    }
)

export default api
