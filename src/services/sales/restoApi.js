import api from '../api'

// ── Rooms ──
export const getRestoRooms       = ()            => api.get('/resto/rooms')
export const createRestoRoom     = (data)        => api.post('/resto/rooms', data)
export const updateRestoRoom     = (uuid, data)  => api.put(`/resto/rooms/${uuid}`, data)
export const deleteRestoRoom     = (uuid)        => api.delete(`/resto/rooms/${uuid}`)

// ── Tables ──
export const getRestoTables      = (params)      => api.get('/resto/tables', { params })
export const createRestoTable    = (data)        => api.post('/resto/tables', data)
export const updateRestoTable    = (uuid, data)  => api.put(`/resto/tables/${uuid}`, data)
export const deleteRestoTable    = (uuid)        => api.delete(`/resto/tables/${uuid}`)
export const saveRestoLayout     = (tables)      => api.post('/resto/tables/bulk', { tables })

// ── Orders ──
export const getRestoOrders      = (params)      => api.get('/resto/orders', { params })
export const getRestoOrder       = (uuid)        => api.get(`/resto/orders/${uuid}`)
export const createRestoOrder    = (data)        => api.post('/resto/orders', data)
export const updateRestoOrderItems = (uuid, data) => api.put(`/resto/orders/${uuid}/items`, data)
export const updateRestoOrderStatus = (uuid, status) => api.put(`/resto/orders/${uuid}/status`, { status })
export const updateRestoOrderWaiter = (uuid, waiterId) => api.put(`/resto/orders/${uuid}/waiter`, { waiter_id: waiterId })
export const checkoutRestoOrder  = (uuid, data)  => api.put(`/resto/orders/${uuid}/checkout`, data)
export const addRestoOrderPayment = (uuid, data) => api.post(`/resto/orders/${uuid}/payments`, data)
export const cancelRestoOrder    = (uuid)        => api.delete(`/resto/orders/${uuid}`)
export const moveRestoOrderTable = (uuid, newTableId) => api.put(`/resto/orders/${uuid}/move-table`, { new_table_id: newTableId })
export const getRestoWaiters     = ()            => api.get('/resto/orders/lists/waiters')
export const getWaitersReport    = (params)      => api.get('/resto/orders/lists/waiters-report', { params })

// ── Waiter Management (CRUD) ──
export const getWaitersList      = (params)      => api.get('/resto/orders/waiters', { params })
export const createWaiter        = (data)        => api.post('/resto/orders/waiters', data)
export const updateWaiter        = (uuid, data)  => api.put(`/resto/orders/waiters/${uuid}`, data)
export const deleteWaiter        = (uuid)        => api.delete(`/resto/orders/waiters/${uuid}`)

// ── Waiter Attendance ──
export const clockInWaiter             = (data)  => api.post('/resto/orders/waiters/clock-in', data)
export const clockOutWaiter            = (data)  => api.post('/resto/orders/waiters/clock-out', data)
export const getWaitersAttendanceToday = ()      => api.get('/resto/orders/waiters/attendance/today')


// ── Menu Catalog ──
export const getRestoMenu        = (params)      => api.get('/resto/menu', { params })
export const getRestoMenuCategories = ()          => api.get('/resto/menu/categories')
export const createRestoMenuItem = (data)        => api.post('/resto/menu', data)
export const updateRestoMenuItem = (uuid, data)  => api.put(`/resto/menu/${uuid}`, data)
export const deleteRestoMenuItem = (uuid)        => api.delete(`/resto/menu/${uuid}`)

// ── Kitchen ──
export const getKitchenOrders    = ()            => api.get('/resto/kitchen')
export const updateKitchenItemStatus = (itemUuid, status) => api.put(`/resto/kitchen/${itemUuid}/status`, { status })

// ── Reports ──
export const getRestoDailyReport = (params)      => api.get('/resto/reports/daily', { params })
