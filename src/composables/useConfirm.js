import { ref } from 'vue'

const visible = ref(false)
const title = ref('')
const message = ref('')
const confirmText = ref('Ya')
const cancelText = ref('Batal')
const variant = ref('primary')
const size = ref('sm')
let resolvePromise = null

export function useConfirm() {
    function confirm(opts) {
        title.value = opts.title || 'Konfirmasi'
        message.value = opts.message || 'Apakah Anda yakin?'
        confirmText.value = opts.confirmText || 'Ya'
        cancelText.value = opts.cancelText || 'Batal'
        variant.value = opts.variant || 'primary'
        size.value = opts.size || 'sm'
        visible.value = true
        return new Promise(resolve => { resolvePromise = resolve })
    }

    function onConfirm() { visible.value = false; resolvePromise?.(true) }
    function onCancel() { visible.value = false; resolvePromise?.(false) }

    return { visible, title, message, confirmText, cancelText, variant, size, confirm, onConfirm, onCancel }
}
