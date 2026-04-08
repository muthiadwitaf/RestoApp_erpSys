import api from '../api'

// Auth
export const login = (email, password) => api.post('/settings/auth/login', { email, password })
export const logout = (refreshToken) => api.post('/settings/auth/logout', { refreshToken })
export const refreshToken = (token) => api.post('/settings/auth/refresh', { refreshToken: token })

// Users
export const getUsers = () => api.get('/settings/users')
export const getUser = (uuid) => api.get(`/settings/users/${uuid}`)
export const createUser = (data) => api.post('/settings/users', data)
export const updateUser = (uuid, data) => api.put(`/settings/users/${uuid}`, data)
export const deleteUser = (uuid) => api.delete(`/settings/users/${uuid}`)
export const updatePreferences = (data) => api.put('/settings/users/me/preferences', data)

// Roles
export const getRoles = () => api.get('/settings/roles')
export const getRole = (uuid) => api.get(`/settings/roles/${uuid}`)
export const getPermissions = () => api.get('/settings/roles/all/permissions')
export const createRole = (data) => api.post('/settings/roles', data)
export const updateRolePermissions = (uuid, permissionIds) => api.put(`/settings/roles/${uuid}/permissions`, { permissionIds })

// Branches
export const getBranches = () => api.get('/settings/branches')
export const getBranchNextCode = () => api.get('/settings/branches/next-code')
export const getBranch = (uuid) => api.get(`/settings/branches/${uuid}`)
export const createBranch = (data) => api.post('/settings/branches', data)
export const updateBranch = (uuid, data) => api.put(`/settings/branches/${uuid}`, data)

// Audit
export const getAuditTrail = (params) => api.get('/settings/audit', { params })

// Upload
export const uploadImage = (file) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post('/settings/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const deleteImage = (imageUrl) => api.delete('/settings/upload', { data: { imageUrl } })

// Margin Default
export const getMarginDefault = () => api.get('/settings/margin')
export const updateMarginDefault = (margin_pct) => api.put('/settings/margin', { margin_pct })

// Company Profile
export const getCompanySettings = () => api.get('/settings/company')
export const updateCompanySettings = (data) => api.put('/settings/company', data)

