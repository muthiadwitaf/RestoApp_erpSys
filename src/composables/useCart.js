// src/composables/useCart.js
// Map-based cart composable for Resto POS
// Items are stored flat (item_id, item_name, price, qty, status, notes, _changed, uuid)
// to maintain compatibility with the existing template and backend API.
import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'resto_cart'

export function useCart () {
  // internal Map: key = item_id (product uuid), value = flat cart entry
  const _cartMap = ref(new Map())

  // Load persisted cart from sessionStorage
  const load = () => {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        const map = new Map()
        arr.forEach(entry => map.set(entry.item_id, entry))
        _cartMap.value = map
      } catch (_) { /* ignore parse errors */ }
    }
  }
  load()

  // Persist on every change
  watch(_cartMap, map => {
    const arr = Array.from(map.values())
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  }, { deep: true })

  // ── Public API ─────────────────────────────────────────────

  /**
   * Add a product to the cart or increment its qty.
   * @param {Object} product - menu product object (must have .uuid, .name, .price)
   * @param {number} qty     - quantity to add (default 1)
   */
  const addItem = (product, qty = 1) => {
    if (qty <= 0) return
    const key = product.uuid || product.id
    const existing = _cartMap.value.get(key)
    if (existing) {
      existing.qty = (parseFloat(existing.qty) || 0) + qty
      existing._changed = true
      // Restore cancelled items
      if (existing.status === 'cancelled') {
        existing.status = 'pending'
      }
    } else {
      _cartMap.value.set(key, {
        item_id: key,
        item_name: product.name,
        name: product.name,
        qty,
        price: parseFloat(product.price) || 0,
        notes: '',
        status: 'pending',
        _changed: false,
      })
    }
  }

  /**
   * Soft-remove (cancel) a server-synced item, or hard-delete a local-only item.
   * @param {string} itemId - the item_id (product uuid)
   */
  const removeItem = (itemId) => {
    const entry = _cartMap.value.get(itemId)
    if (!entry) return
    if (entry.uuid) {
      // Server-synced item → soft cancel
      entry.qty = 0
      entry.status = 'cancelled'
      entry._changed = true
    } else {
      // Local-only item → hard delete
      _cartMap.value.delete(itemId)
    }
  }

  /**
   * Set the qty for an existing cart item.
   */
  const updateQty = (itemId, qty) => {
    if (qty <= 0) return
    const entry = _cartMap.value.get(itemId)
    if (!entry) return
    entry.qty = qty
    entry._changed = true
    if (entry.status === 'cancelled') entry.status = 'pending'
  }

  /**
   * Replace the entire cart with an array of flat item objects (e.g. from server).
   * Useful after sendToKitchen to sync with server state.
   */
  const replaceAll = (flatItems) => {
    const map = new Map()
    flatItems.forEach(i => {
      // For server items (have uuid), use the order-item uuid as key to avoid collisions
      // For local-only items, use item_id
      const key = i.uuid || i.item_id
      map.set(key, { ...i, _changed: i._changed || false })
    })
    _cartMap.value = map
  }

  /**
   * Clear the entire cart.
   */
  const clear = () => {
    _cartMap.value.clear()
    sessionStorage.removeItem(STORAGE_KEY)
  }

  // ── Computed ───────────────────────────────────────────────
  // Returns a flat array that the template can consume directly
  const items = computed(() => Array.from(_cartMap.value.values()))

  // Only non-cancelled items
  const activeItems = computed(() =>
    items.value.filter(i => i.status !== 'cancelled')
  )

  const subtotal = computed(() =>
    activeItems.value.reduce(
      (sum, i) => sum + (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0),
      0,
    )
  )

  const taxRate = 0.10
  const tax = computed(() => subtotal.value * taxRate)
  const total = computed(() => subtotal.value + tax.value)

  return {
    addItem,
    removeItem,
    updateQty,
    replaceAll,
    clear,
    items,
    activeItems,
    subtotal,
    tax,
    total,
  }
}
