// src/stores/order.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as restoApi from '@/services/sales/restoApi'

export const useOrderStore = defineStore('order', () => {
    const activeOrders = ref([])
    const isLoading = ref(false)
    const lastSync = ref(null)
    let pollingInterval = null

    async function fetchActiveOrders() {
        try {
            isLoading.value = true
            // Use the comprehensive kitchen endpoint which includes aggregated items
            const res = await restoApi.getKitchenOrders()
            activeOrders.value = res.data || []
            lastSync.value = new Date()
        } catch (e) {
            console.error('Fetch orders error:', e)
        } finally {
            isLoading.value = false
        }
    }

    async function updateItemStatus(itemUuid, status) {
        try {
            await restoApi.updateKitchenItemStatus(itemUuid, status)
            // Optimistic local update for immediate UI feedback
            activeOrders.value.forEach(order => {
                const item = order.items?.find(i => i.uuid === itemUuid)
                if (item) item.status = status
            })
            // Refresh data shortly after to keep consistency, without blocking UI
            setTimeout(fetchActiveOrders, 2000)
        } catch (e) {
            console.error('Update item status error:', e)
            throw e
        }
    }

    async function updateOrderStatus(orderUuid, status) {
        try {
            await restoApi.updateRestoOrderStatus(orderUuid, status)
            await fetchActiveOrders()
        } catch (e) {
            console.error('Update order status error:', e)
            throw e
        }
    }

    function startPolling(intervalMs = 5000) {
        if (pollingInterval) return
        fetchActiveOrders()
        pollingInterval = setInterval(fetchActiveOrders, intervalMs)
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval)
            pollingInterval = null
        }
    }

    return {
        activeOrders,
        isLoading,
        lastSync,
        fetchActiveOrders,
        updateItemStatus,
        updateOrderStatus,
        startPolling,
        stopPolling
    }
})
