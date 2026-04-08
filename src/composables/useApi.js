// src/composables/useApi.js
import { ref } from 'vue'
import apiClient from '@/api/apiClient'
import { useLoading } from '@/composables/useLoading'
import { useToast } from '@/composables/useToast'
import debounce from 'lodash.debounce'

export function useApi () {
  const { startLoading, stopLoading } = useLoading()
  const { toastSuccess, toastError } = useToast()
  const data = ref(null)
  const error = ref(null)

  const request = async (method, url, payload = null, config = {}) => {
    startLoading()
    try {
      const response = await apiClient.request({ method, url, data: payload, ...config })
      data.value = response.data
      toastSuccess(response?.data?.message || 'Success')
      return response.data
    } catch (err) {
      error.value = err
      toastError(err?.response?.data?.error || err.message || 'API error')
      throw err
    } finally {
      stopLoading()
    }
  }

  const debouncedGet = debounce((url, params, cb) => {
    request('get', url, null, { params })
      .then(cb)
      .catch(() => {})
  }, 300)

  return { data, error, request, debouncedGet }
}
