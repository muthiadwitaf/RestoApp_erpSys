import { ref } from 'vue'

const toasts = ref([])
let toastId = 0

export function useToast() {
    function show(message, type = 'success', duration = 3000) {
        const id = ++toastId
        toasts.value.push({ id, message, type })
        setTimeout(() => {
            toasts.value = toasts.value.filter(t => t.id !== id)
        }, duration)
    }

    function success(message) { show(message, 'success') }
    function error(message) { show(message, 'danger', 5000) }
    function warning(message) { show(message, 'warning', 4000) }
    function info(message) { show(message, 'info') }

    return { toasts, success, error, warning, info }
}
