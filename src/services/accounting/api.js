import api from '../api'

// Chart of Accounts
export const getCoa = (params) => api.get('/accounting/coa', { params })
export const createCoa = (data) => api.post('/accounting/coa', data)
export const updateCoa = (uuid, data) => api.put(`/accounting/coa/${uuid}`, data)
export const deleteCoa = (uuid) => api.delete(`/accounting/coa/${uuid}`)

// Journal Entries
export const getJournals = (params) => api.get('/accounting/journals', { params })
export const getJournal = (uuid) => api.get(`/accounting/journals/${uuid}`)
export const createJournal = (data) => api.post('/accounting/journals', data)
export const postJournal = (uuid) => api.put(`/accounting/journals/${uuid}/post`)
export const deleteJournal = (uuid) => api.delete(`/accounting/journals/${uuid}`)

// Reports
export const getProfitLoss = (params) => api.get('/accounting/reports/profit-loss', { params })
export const getBalanceSheet = (params) => api.get('/accounting/reports/balance-sheet', { params })
export const getGeneralLedger = (params) => api.get('/accounting/reports/general-ledger', { params })
export const getSummary = () => api.get('/accounting/reports/summary')
export const getAPSummary = (params) => api.get('/accounting/reports/ap-summary', { params })
export const getAPDetail = (params) => api.get('/accounting/reports/ap-detail', { params })
// Biaya Operasional (Expenses)
export const getExpenses = (params) => api.get('/accounting/expenses', { params })
export const getExpense = (uuid) => api.get(`/accounting/expenses/${uuid}`)
export const createExpense = (data) => api.post('/accounting/expenses', data)
export const updateExpense = (uuid, data) => api.put(`/accounting/expenses/${uuid}`, data)
export const postExpense = (uuid) => api.put(`/accounting/expenses/${uuid}/post`)
export const deleteExpense = (uuid) => api.delete(`/accounting/expenses/${uuid}`)
export const getExpenseCategories = () => api.get('/accounting/expenses/categories')

// Closing Periods
export const getClosingPeriods = (params) => api.get('/accounting/closing', { params })
export const getClosingStats = (params) => api.get('/accounting/closing/stats', { params })
export const getClosingDashboard = (params) => api.get('/accounting/closing/dashboard', { params })
export const createClosingPeriod = (data) => api.post('/accounting/closing', data)
export const generateClosingYear = (data) => api.post('/accounting/closing/generate-year', data)
export const closeClosingPeriod = (uuid) => api.put(`/accounting/closing/${uuid}/close`)
export const reopenClosingPeriod = (uuid) => api.put(`/accounting/closing/${uuid}/reopen`)

// Reimbursements
export const getReimbursements = (params) => api.get('/accounting/reimbursements', { params })
export const getReimbursement = (uuid) => api.get(`/accounting/reimbursements/${uuid}`)
export const createReimbursement = (data) => api.post('/accounting/reimbursements', data)
export const updateReimbursement = (uuid, data) => api.put(`/accounting/reimbursements/${uuid}`, data)
export const postReimbursement = (uuid) => api.put(`/accounting/reimbursements/${uuid}/post`)
export const deleteReimbursement = (uuid) => api.delete(`/accounting/reimbursements/${uuid}`)
export const getReimbursementCategories = () => api.get('/accounting/reimbursements/categories')
export const addReimbursementItem = (uuid, data) => api.post(`/accounting/reimbursements/${uuid}/items`, data)
export const updateReimbursementItem = (uuid, itemUuid, data) => api.put(`/accounting/reimbursements/${uuid}/items/${itemUuid}`, data)
export const deleteReimbursementItem = (uuid, itemUuid) => api.delete(`/accounting/reimbursements/${uuid}/items/${itemUuid}`)
export const uploadReimbursementAttachment = (uuid, itemUuid, formData) =>
    api.post(`/accounting/reimbursements/${uuid}/items/${itemUuid}/attachment`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Assets -- Kategori
export const getAssetCategories = (params) => api.get('/accounting/assets/categories', { params })
export const createAssetCategory = (data) => api.post('/accounting/assets/categories', data)
export const updateAssetCategory = (uuid, data) => api.put(`/accounting/assets/categories/${uuid}`, data)
export const deleteAssetCategory = (uuid) => api.delete(`/accounting/assets/categories/${uuid}`)

// Assets
export const getAssets = (params) => api.get('/accounting/assets', { params })
export const getAsset = (uuid) => api.get(`/accounting/assets/${uuid}`)
export const createAsset = (data) => api.post('/accounting/assets', data)
export const updateAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}`, data)
export const postAsset = (uuid) => api.put(`/accounting/assets/${uuid}/post`)
export const depreciateAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}/depreciate`, data)
export const maintainAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}/maintain`, data)
export const transferAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}/transfer`, data)
export const disposeAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}/dispose`, data)
export const revalueAsset = (uuid, data) => api.put(`/accounting/assets/${uuid}/revalue`, data)
export const getAssetSchedule = (uuid) => api.get(`/accounting/assets/${uuid}/schedule`)
export const getAssetReport   = (params) => api.get('/accounting/assets/report', { params })
export const exportCitXml     = (params) => api.get('/accounting/assets/report/cit-xml', { params, responseType: 'blob' })
export const deleteAsset = (uuid) => api.delete(`/accounting/assets/${uuid}`)

// Asset Photos
export const getAssetPhotos   = (uuid) => api.get(`/accounting/assets/${uuid}/photos`)
export const uploadAssetPhoto = (uuid, fd) => api.post(`/accounting/assets/${uuid}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
export const setAssetPrimary  = (uuid, photoUuid) => api.put(`/accounting/assets/${uuid}/photos/${photoUuid}/primary`)
export const deleteAssetPhoto = (uuid, photoUuid) => api.delete(`/accounting/assets/${uuid}/photos/${photoUuid}`)

// Asset Documents
export const getAssetDocuments = (uuid) => api.get(`/accounting/assets/${uuid}/documents`)
export const uploadAssetDoc    = (uuid, fd) => api.post(`/accounting/assets/${uuid}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteAssetDoc    = (uuid, docUuid) => api.delete(`/accounting/assets/${uuid}/documents/${docUuid}`)

// Asset Location
export const getAssetLocation    = (uuid) => api.get(`/accounting/assets/${uuid}/location`)
export const updateAssetLocation = (uuid, data) => api.put(`/accounting/assets/${uuid}/location`, data)
