import api from '../api'

// Companies (Platform Admin)
export const getCompanies = () => api.get('/company')
export const getCompany = (uuid) => api.get(`/company/${uuid}`)
export const getCompanyNextCode = (name) => api.get('/company/next-code', { params: { name } })
export const createCompany = (data) => api.post('/company', data)
export const updateCompany = (uuid, data) => api.put(`/company/${uuid}`, data)
export const deleteCompany = (uuid) => api.delete(`/company/${uuid}`)
export const getCompanyUsers = (uuid) => api.get(`/company/${uuid}/users`)
export const updateCompanyUsers = (uuid, userIds) => api.put(`/company/${uuid}/users`, { user_ids: userIds })
export const getCompanyStats = (period) => api.get('/company/stats', { params: { period } })
export const getPlatformAudit = (params) => api.get('/company/audit', { params })

// Super Admins (Platform Admin)
export const getSuperAdmins = () => api.get('/company/super-admins/list')
export const createSuperAdmin = (data) => api.post('/company/super-admins/create', data)
export const updateSuperAdmin = (uuid, data) => api.put(`/company/super-admins/${uuid}`, data)
export const deleteSuperAdmin = (uuid) => api.delete(`/company/super-admins/${uuid}`)
