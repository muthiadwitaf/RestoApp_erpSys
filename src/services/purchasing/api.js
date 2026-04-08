import api from '../api'

// Suppliers
export const getSuppliers = () => api.get('/purchasing/suppliers')
export const getSupplier = (uuid) => api.get(`/purchasing/suppliers/${uuid}`)
export const createSupplier = (data) => api.post('/purchasing/suppliers', data)
export const updateSupplier = (uuid, data) => api.put(`/purchasing/suppliers/${uuid}`, data)
export const deleteSupplier = (uuid) => api.delete(`/purchasing/suppliers/${uuid}`)
export const getSupplierPrices = () => api.get('/purchasing/suppliers/prices')
export const getSupplierPriceList = (supplierUuid) => api.get(`/purchasing/suppliers/${supplierUuid}/prices`)
export const createSupplierPrice = (supplierUuid, data) => api.post(`/purchasing/suppliers/${supplierUuid}/prices`, data)
export const updateSupplierPrice = (supplierUuid, priceUuid, data) => api.put(`/purchasing/suppliers/${supplierUuid}/prices/${priceUuid}`, data)
export const deleteSupplierPrice = (supplierUuid, priceUuid) => api.delete(`/purchasing/suppliers/${supplierUuid}/prices/${priceUuid}`)

// Purchase Orders
export const getPurchaseOrders = (params) => api.get('/purchasing/orders', { params })
export const getPurchaseOrder = (uuid) => api.get(`/purchasing/orders/${uuid}`)
export const createPO = (data) => api.post('/purchasing/orders', data)
export const updatePO = (uuid, data) => api.put(`/purchasing/orders/${uuid}`, data)
export const submitPO = (uuid) => api.put(`/purchasing/orders/${uuid}/submit`)
export const approvePO = (uuid) => api.put(`/purchasing/orders/${uuid}/approve`)
export const rejectPO = (uuid) => api.put(`/purchasing/orders/${uuid}/reject`)
export const closePO = (uuid) => api.put(`/purchasing/orders/${uuid}/close-po`)

// Bills
export const getBills = (params) => api.get('/purchasing/bills', { params })
export const getBillsByPO = (poUuid) => api.get('/purchasing/bills', { params: { po_id: poUuid } })
export const createBill = (data) => api.post('/purchasing/bills', data)
export const payBill = (uuid, data = {}) => api.put(`/purchasing/bills/${uuid}/pay`, data)
export const getBillPayments = (uuid) => api.get(`/purchasing/bills/${uuid}/payments`)

// Tax Configs (from accounting module)
export const getActiveTax = () => api.get('/accounting/taxes/active')
export const getTaxConfigs = () => api.get('/accounting/taxes')

// Goods Receives
export const createGoodsReceive = (data) => api.post('/inventory/receives', data)
export const getGoodsReceivesByPO = (poUuid) => api.get('/inventory/receives', { params: { po_id: poUuid } })

// Returns
export const getPurchaseReturns = () => api.get('/purchasing/returns')
export const getPurchaseReturn = (uuid) => api.get(`/purchasing/returns/${uuid}`)
export const createPurchaseReturn = (data) => api.post('/purchasing/returns', data)
export const updatePurchaseReturn = (uuid, data) => api.put(`/purchasing/returns/${uuid}`, data)
export const approvePurchaseReturn = (uuid) => api.put(`/purchasing/returns/${uuid}/approve`)
export const rejectPurchaseReturn = (uuid, data) => api.put(`/purchasing/returns/${uuid}/reject`, data)
export const shipPurchaseReturn = (uuid) => api.put(`/purchasing/returns/${uuid}/ship`)
export const resolvePurchaseReturn = (uuid, data) => api.put(`/purchasing/returns/${uuid}/resolve`, data)

// Reports
export const getPurchasingRekap = (params) => api.get('/purchasing/reports/rekap', { params })
export const getPurchasingPOList = (params) => api.get('/purchasing/reports/po-list', { params })
export const getPurchasingReportSuppliers = () => api.get('/purchasing/reports/suppliers')


