/**
 * composables/useImageUrl.js
 * Helper untuk URL gambar yang dilindungi auth (/uploadedImage/...).
 * Server.js menerima token via ?token= query param.
 */
export function useImageUrl() {
    function authUrl(url) {
        if (!url) return null
        const token = localStorage.getItem('erp_access_token') || ''
        if (!token) return url
        const sep = url.includes('?') ? '&' : '?'
        return url + sep + 'token=' + encodeURIComponent(token)
    }
    return { authUrl }
}
