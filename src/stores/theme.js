import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as settingsApi from '@/services/settings/api'

export const useThemeStore = defineStore('theme', () => {
    const isDark = ref(localStorage.getItem('erp_theme') === 'dark')

    function toggle() {
        isDark.value = !isDark.value
        // Save to BE (fire-and-forget)
        settingsApi.updatePreferences({ theme: isDark.value ? 'dark' : 'light' }).catch(() => { })
    }

    function setFromUser(themePreference) {
        if (themePreference) {
            isDark.value = themePreference === 'dark'
        }
    }

    watch(isDark, (val) => {
        localStorage.setItem('erp_theme', val ? 'dark' : 'light')
        document.documentElement.setAttribute('data-bs-theme', val ? 'dark' : 'light')
    }, { immediate: true })

    return { isDark, toggle, setFromUser }
})
