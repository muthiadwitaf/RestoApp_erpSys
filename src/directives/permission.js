import { useAuthStore } from '@/stores/auth'

export const permissionDirective = {
    mounted(el, binding) {
        const auth = useAuthStore()
        const permission = binding.value
        if (!permission) return
        const perms = Array.isArray(permission) ? permission : [permission]
        if (!auth.hasAnyPermission(perms)) {
            el.style.display = 'none'
        }
    },
    updated(el, binding) {
        const auth = useAuthStore()
        const permission = binding.value
        if (!permission) return
        const perms = Array.isArray(permission) ? permission : [permission]
        el.style.display = auth.hasAnyPermission(perms) ? '' : 'none'
    }
}
