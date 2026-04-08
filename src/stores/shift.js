import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as salesApi from '@/services/sales/api'

export const useShiftStore = defineStore('shift', () => {
  const currentShift = ref(null)
  const isLoading = ref(false)
  
  // Controls the visibility of the Modals inside RestoPosView
  const showOpenModal = ref(false)
  const showCloseModal = ref(false)

  const isOpen = computed(() => !!currentShift.value)

  async function fetchCurrentShift() {
    isLoading.value = true
    try {
      const raw = localStorage.getItem('resto_shift_data')
      if (raw) {
        currentShift.value = JSON.parse(raw)
      } else {
        currentShift.value = null
        showOpenModal.value = true
      }
    } catch (err) {
      console.error('Failed to parse local session:', err)
      currentShift.value = null
      showOpenModal.value = true
    } finally {
      isLoading.value = false
    }
  }

  // Clear session locally without hitting API (API call handled by view typically)
  function clearSession() {
    currentShift.value = null
    showOpenModal.value = false
    showCloseModal.value = false
  }

  return {
    currentShift,
    isLoading,
    isOpen,
    showOpenModal,
    showCloseModal,
    fetchCurrentShift,
    clearSession
  }
})
