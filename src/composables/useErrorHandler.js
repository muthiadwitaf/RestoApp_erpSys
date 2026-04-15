import { useToast } from '@/composables/useToast'

export function useErrorHandler() {
  const toast = useToast()

  const logError = (error, type, metadata = null) => {
    // Enterprise logging layer placeholder. Can be swapped with Sentry capturing.
    console.error(`[POS_${type}]`, metadata ? metadata : '', error)
  }

  const handleApiError = (error, customFallbackMessage = 'Terjadi kesalahan sistem') => {
    // 1. Network / Offline Errors
    if (!error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error')) {
      logError(error, 'NETWORK_ERROR')
      toast.error('Gagal terhubung ke jaringan. Periksa koneksi internet Anda.')
      return
    }

    // 2. Cancellation Errors (Intentional aborts from Logout)
    if (error.name === 'CanceledError' || error.message.includes('Session Terminated')) {
      // Intentionally suppressed (ghosting prevention)
      return
    }

    // 3. Server Timeout Errors (504 Gateway)
    if (error.code === 'ECONNABORTED' || (error.response && error.response.status === 504)) {
      logError(error, 'TIMEOUT_ERROR')
      toast.error('Koneksi server terputus karena batas waktu. Silakan coba lagi.')
      return
    }

    // 4. API Response Exist
    if (error.response) {
      const status = error.response.status
      const errorPayload = error.response.data?.error || error.response.data?.message

      if (status === 422) {
        logError(error, 'VALIDATION_ERROR', error.response.data)
        // Extract validation fields if present.
        const validationObj = error.response.data?.errors
        if (validationObj && typeof validationObj === 'object') {
           const firstHaltStr = Object.values(validationObj).flat()[0]
           toast.error(firstHaltStr || 'Validasi formulir tidak valid.')
        } else {
           toast.error(errorPayload || 'Gagal tersimpan karena format tak sesuai (Validasi).')
        }
        return
      }

      if (status >= 500) {
        logError(error, 'SERVER_ERROR', status)
        toast.error('Gangguan kritis pada server. Tim teknis telah diberitahu.')
        return
      }

      // Default safe Axios payload mapping (400, 403, 404, etc)
      logError(error, 'API_ERROR', status)
      toast.error(errorPayload || customFallbackMessage)
      return
    }

    // Fallback unhandled blob
    logError(error, 'UNKNOWN_ERROR')
    toast.error(customFallbackMessage)
  }

  return { handleApiError, logError }
}
