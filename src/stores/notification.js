import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useNotificationStore = defineStore('notifications', () => {
    const notifications = ref([])

    function setNotifications(data) {
        notifications.value = data
    }

    function getByBranch(branchId) {
        if (!branchId) return notifications.value
        return notifications.value.filter(n => !n.branch_id || n.branch_id === branchId)
    }

    function unreadCount(branchId) {
        return getByBranch(branchId).filter(n => !n.read).length
    }

    function markRead(id) {
        const n = notifications.value.find(n => n.id === id)
        if (n) n.read = true
    }

    function markAsRead(id) {
        markRead(id)
    }

    function markAllAsRead() {
        notifications.value.forEach(n => { n.read = true })
    }

    function addNotification(notification) {
        notifications.value.unshift(notification)
    }

    return { notifications, setNotifications, getByBranch, unreadCount, markRead, markAsRead, markAllAsRead, addNotification }
})
