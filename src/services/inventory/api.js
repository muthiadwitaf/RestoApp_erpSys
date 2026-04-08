import api from '../api'

// Items
export const getItems = (params) => api.get('/inventory/items', { params })
export const getItem = (uuid) => api.get(`/inventory/items/${uuid}`)
export const createItem = (data) => api.post('/inventory/items', data)
export const updateItem = (uuid, data) => api.put(`/inventory/items/${uuid}`, data)
export const deleteItem = (uuid) => api.delete(`/inventory/items/${uuid}`)
export const uploadItemImage = (formData) => api.post('/inventory/items/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
})

// Categories
export const getCategories = () => api.get('/inventory/categories')
export const createCategory = (data) => api.post('/inventory/categories', data)
export const updateCategory = (uuid, data) => api.put(`/inventory/categories/${uuid}`, data)
export const deleteCategory = (uuid) => api.delete(`/inventory/categories/${uuid}`)

// Units
export const getUnits = () => api.get('/inventory/units')
export const createUnit = (data) => api.post('/inventory/units', data)
export const updateUnit = (uuid, data) => api.put(`/inventory/units/${uuid}`, data)

// Warehouses
export const getWarehouses = () => api.get('/inventory/warehouses')
export const createWarehouse = (data) => api.post('/inventory/warehouses', data)
export const updateWarehouse = (uuid, data) => api.put(`/inventory/warehouses/${uuid}`, data)
export const deactivateWarehouse = (uuid) => api.put(`/inventory/warehouses/${uuid}/deactivate`)
export const activateWarehouse = (uuid) => api.put(`/inventory/warehouses/${uuid}/activate`)
export const getWarehouseZones = (uuid) => api.get(`/inventory/warehouses/${uuid}/zones`)
export const createZone = (uuid, data) => api.post(`/inventory/warehouses/${uuid}/zones`, data)
export const getZones = () => api.get('/inventory/zones')

// Stock
export const getStock = (params) => api.get('/inventory/stock', { params })
export const getStockMovements = (params) => api.get('/inventory/stock/movements', { params })
export const getStockReport = (params) => api.get('/inventory/stock/report', { params })
export const getStockReportMonthly = (params) => api.get('/inventory/stock/report/monthly', { params })
export const getStockReportDaily   = (params) => api.get('/inventory/stock/report/daily',   { params })
export const getStockReportYearly  = (params) => api.get('/inventory/stock/report/yearly',  { params })




// Batches
export const getBatches = (params) => api.get('/inventory/batches', { params })
export const getExpiringBatches = (params) => api.get('/inventory/batches/expiring', { params })
export const getBatchesForIssue = (params) => api.get('/inventory/batches/for-issue', { params })
export const depleteBatch = (uuid, data) => api.put(`/inventory/batches/${uuid}/deplete`, data || {})
export const disposeBatch = (uuid, data) => api.put(`/inventory/batches/${uuid}/dispose`, data || {})
export const disposeBatchBulk = (data) => api.post('/inventory/batches/dispose-bulk', data)
export const updateBatchQty = (uuid, data) => api.put(`/inventory/batches/${uuid}`, data)

export const getReceives = (params) => api.get('/inventory/receives', { params })
export const getReceive = (uuid) => api.get(`/inventory/receives/${uuid}`)
export const createReceive = (data) => api.post('/inventory/receives', data)
export const getGRDocuments = (grUuid) => api.get(`/inventory/receives/${grUuid}/documents`)
export const uploadGRDocuments = (grUuid, formData) => api.post(
    `/inventory/receives/${grUuid}/documents`, formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
)
export const deleteGRDocument = (grUuid, docUuid) =>
    api.delete(`/inventory/receives/${grUuid}/documents/${docUuid}`)


// Issues
export const getIssues = (params) => api.get('/inventory/issues', { params })
export const getIssue = (uuid) => api.get(`/inventory/issues/${uuid}`)
export const createIssue = (data) => api.post('/inventory/issues', data)
export const approveIssue = (uuid) => api.put(`/inventory/issues/${uuid}/approve`)
export const rejectIssue = (uuid) => api.put(`/inventory/issues/${uuid}/reject`)
export const markIssueReady = (uuid) => api.put(`/inventory/issues/${uuid}/ready`)

// Deliveries
export const getDeliveries = (params) => api.get('/inventory/deliveries', { params })
export const getDelivery = (uuid) => api.get(`/inventory/deliveries/${uuid}`)
export const getReadyGIList = (params) => api.get('/inventory/deliveries/ready-gi/list', { params })
export const getDriverList = (params) => api.get('/inventory/deliveries/drivers/list', { params })
export const createDelivery = (data) => api.post('/inventory/deliveries', data)
export const dispatchDelivery = (uuid) => api.put(`/inventory/deliveries/${uuid}/dispatch`)
export const completeDelivery = (uuid) => api.put(`/inventory/deliveries/${uuid}/complete`)
export const deleteDelivery = (uuid) => api.delete(`/inventory/deliveries/${uuid}`)
export const removeGIFromDelivery = (doUuid, giUuid) => api.delete(`/inventory/deliveries/${doUuid}/gi/${giUuid}`)
export const addGIToDelivery = (doUuid, data) => api.post(`/inventory/deliveries/${doUuid}/gi`, data)
export const completeGIInDelivery = (doUuid, giUuid) => api.put(`/inventory/deliveries/${doUuid}/gi/${giUuid}/complete`)
// DO Positions
export const getDOPositions = (doUuid) => api.get(`/inventory/deliveries/${doUuid}/positions`)
export const addDOPosition = (doUuid, data) => api.post(`/inventory/deliveries/${doUuid}/positions`, data)
export const getGIPosHistory = (giUuid) => api.get(`/inventory/deliveries/gi-pos/${giUuid}/history`)


// Transfers
export const getTransfers = () => api.get('/inventory/transfers')
export const getTransfer = (uuid) => api.get(`/inventory/transfers/${uuid}`)
export const createTransfer = (data) => api.post('/inventory/transfers', data)
export const submitTransfer = (uuid) => api.put(`/inventory/transfers/${uuid}/submit`)
export const approveTransfer = (uuid) => api.put(`/inventory/transfers/${uuid}/approve`)
export const shipTransfer = (uuid) => api.put(`/inventory/transfers/${uuid}/ship`)
export const receiveTransfer = (uuid) => api.put(`/inventory/transfers/${uuid}/receive`)

// Opnames
export const getOpnames = () => api.get('/inventory/opnames')
export const getOpname = (uuid) => api.get(`/inventory/opnames/${uuid}`)
export const createOpname = (data) => api.post('/inventory/opnames', data)
export const submitOpname = (uuid) => api.put(`/inventory/opnames/${uuid}/submit`)
export const approveOpname = (uuid) => api.put(`/inventory/opnames/${uuid}/approve`)
export const rejectOpname = (uuid) => api.put(`/inventory/opnames/${uuid}/reject`)

// Bins (Warehouse Locations)
export const getBins = (params) => api.get('/inventory/bins', { params })
export const getBin = (uuid) => api.get(`/inventory/bins/${uuid}`)
export const getRacks = (params) => api.get('/inventory/bins/racks', { params })
export const updateRackPosition = (uuid, data) => api.put(`/inventory/bins/racks/${uuid}`, data)
export const createBin = (data) => api.post('/inventory/bins', data)
export const createBinsBulk = (data) => api.post('/inventory/bins/bulk', data)
export const updateBin = (uuid, data) => api.put(`/inventory/bins/${uuid}`, data)
export const deleteBin = (uuid) => api.delete(`/inventory/bins/${uuid}`)
export const deleteRack = (warehouseUuid, rack) => api.delete(`/inventory/bins/rack/${warehouseUuid}/${rack}`)
export const addItemToBin = (uuid, data) => api.post(`/inventory/bins/${uuid}/items`, data)
export const updateBinItem = (uuid, itemUuid, data) => api.put(`/inventory/bins/${uuid}/items/${itemUuid}`, data)
export const removeBinItem = (uuid, itemUuid) => api.delete(`/inventory/bins/${uuid}/items/${itemUuid}`)

// Inventory Reports
export const getInventoryReportStock       = (params) => api.get('/inventory/reports/stock', { params })
export const getInventoryReportValuation   = (params) => api.get('/inventory/reports/valuation', { params })
export const getInventoryReportAging       = (params) => api.get('/inventory/reports/aging', { params })
export const getInventoryReportReorder     = (params) => api.get('/inventory/reports/reorder', { params })
export const getInventoryReportMovement    = (params) => api.get('/inventory/reports/movement-analysis', { params })
export const getInventoryReportOpname      = (params) => api.get('/inventory/reports/opname-summary', { params })
export const getInventoryReportTransfers   = (params) => api.get('/inventory/reports/transfers', { params })
