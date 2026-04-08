import api from '../api'

// Customers
export const getCustomers = (params) => api.get('/sales/customers', { params })
export const getCustomerGroups = () => api.get('/sales/customers/groups')
export const createCustomer = (data) => api.post('/sales/customers', data)
export const updateCustomer = (uuid, data) => api.put(`/sales/customers/${uuid}`, data)
export const deleteCustomer = (uuid) => api.delete(`/sales/customers/${uuid}`)

// Sales Orders
export const getSalesOrders = (params) => api.get('/sales/orders', { params })
export const getSalesOrder = (uuid) => api.get(`/sales/orders/${uuid}`)
export const createSalesOrder = (data) => api.post('/sales/orders', data)
export const updateSO = (uuid, data) => api.put(`/sales/orders/${uuid}`, data)
export const submitSO = (uuid) => api.put(`/sales/orders/${uuid}/submit`)
export const approveSO = (uuid) => api.put(`/sales/orders/${uuid}/approve`)
export const rejectSO = (uuid) => api.put(`/sales/orders/${uuid}/reject`)

// Invoices
export const getInvoices = () => api.get('/sales/invoices')
export const getInvoice = (uuid) => api.get(`/sales/invoices/${uuid}`)
export const createInvoice = (data) => api.post('/sales/invoices', data)
export const payInvoice = (uuid, data = {}) => api.put(`/sales/invoices/${uuid}/pay`, data)
export const getInvoicePayments = (uuid) => api.get(`/sales/invoices/${uuid}/payments`)

// POS
export const getPosTransactions = (params) => api.get('/sales/pos', { params })
export const posCheckout = (data) => api.post('/sales/pos/checkout', data)

// POS Settings
export const getPosSettings    = ()        => api.get('/sales/pos-settings')
export const savePosSettings   = (data)    => api.put('/sales/pos-settings', data)
export const uploadQrisImage   = (formData) => api.post('/sales/pos-settings/qris', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getPosCategories  = ()        => api.get('/sales/pos-settings/categories')

// POS Sessions (Buka / Tutup Kasir)
export const getPosCurrentSession = (params) => api.get('/sales/pos-sessions/current', { params })
export const openPosSession       = (data)   => api.post('/sales/pos-sessions/open', data)
export const closePosSession      = (data)   => api.post('/sales/pos-sessions/close', data)
export const adjustPosSession     = (data)   => api.post('/sales/pos-sessions/adjustment', data)
export const getPosSessionList    = (params) => api.get('/sales/pos-sessions', { params })


// Returns
export const getSalesReturns = () => api.get('/sales/returns')
export const getSalesReturn = (uuid) => api.get(`/sales/returns/${uuid}`)
export const createSalesReturn = (data) => api.post('/sales/returns', data)
export const updateSalesReturn = (uuid, data) => api.put(`/sales/returns/${uuid}`, data)
export const approveSalesReturn = (uuid) => api.put(`/sales/returns/${uuid}/approve`)
export const rejectSalesReturn = (uuid, data) => api.put(`/sales/returns/${uuid}/reject`, data)
export const receiveSalesReturn = (uuid) => api.put(`/sales/returns/${uuid}/receive`)
export const refundSalesReturn = (uuid, data) => api.put(`/sales/returns/${uuid}/refund`, data)

// Bundles
export const getBundles = () => api.get('/sales/bundles')
export const createBundle = (data) => api.post('/sales/bundles', data)
export const updateBundle = (uuid, data) => api.put(`/sales/bundles/${uuid}`, data)
export const deleteBundle = (uuid) => api.delete(`/sales/bundles/${uuid}`)

// Consignments
export const getConsignments = () => api.get('/sales/consignments')
export const createConsignment = (data) => api.post('/sales/consignments', data)
export const updateConsignment = (uuid, data) => api.put(`/sales/consignments/${uuid}`, data)
export const deleteConsignment = (uuid) => api.delete(`/sales/consignments/${uuid}`)
export const recordConsignmentSale = (uuid, data) => api.put(`/sales/consignments/${uuid}/sell`, data)
export const sellConsignment = (uuid, qty_sold) => api.put(`/sales/consignments/${uuid}/sell`, { qty_sold })

// Pricelist
export const getPricelist = (params) => api.get('/sales/pricelist', { params })
export const getPricelistItem = (uuid) => api.get(`/sales/pricelist/${uuid}`)
export const updatePricelist = (uuid, data) => api.put(`/sales/pricelist/${uuid}`, data)

export const getSalesRekap             = (params) => api.get('/sales/reports/rekap', { params })
export const getSalesRekapSalespersons = ()       => api.get('/sales/reports/rekap/salespersons')
export const getSalesSOList            = (params) => api.get('/sales/reports/so-list', { params })
export const getCustomerPerf           = (params) => api.get('/sales/reports/customer-perf', { params })
export const getProductPerf            = (params) => api.get('/sales/reports/product-perf',   { params })
export const getProductPerfCategories  = ()       => api.get('/sales/reports/product-perf/categories')
export const getPosReport              = (params) => api.get('/sales/reports/pos', { params })
export const getPosCashiers            = ()       => api.get('/sales/reports/pos/cashiers')
export const getReturReport            = (params) => api.get('/sales/reports/retur', { params })

