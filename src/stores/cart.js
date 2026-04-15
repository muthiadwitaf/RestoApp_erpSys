import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'resto_cart'

function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const useCartStore = defineStore('cart', () => {
  // Use a reactive array for direct Vue reactivity
  const itemsArray = ref([])
  
  // Debounce timeout handler
  let saveTimeout = null;

  // The debounced save function preventing mass localStorage writes on spam.
  const saveLocalState = (immediate = false) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    
    // Refresh meta updated_at on all generic DRAFT items for conflict-resolution.
    itemsArray.value.forEach(i => {
        if(i._meta && i.status === 'pending') i._meta.updated_at = Date.now();
    });

    const executeSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsArray.value));
    };

    if (immediate) {
        executeSave();
    } else {
        saveTimeout = setTimeout(executeSave, 300); // 300ms debounce buffer
    }
  }

  // Multi-Tab Listener & Loader
  const syncCartData = (e) => {
    // Only intercept events relating strictly to the cart
    if (e && e.key !== STORAGE_KEY) return;
    
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
        itemsArray.value = [];
        return;
    }
    try {
      const incomingArray = JSON.parse(raw)
      
      // Time-Vector Conflict Resolution
      // If we made changes in this tab that haven't saved (or fired the observer later)
      // We check if incoming bulk is older than our local bulk roughly based on top-level item aggregation limits.
      const localMaxStamp = Math.max(...itemsArray.value.map(i => i._meta?.updated_at || 0), 0);
      const incMaxStamp = Math.max(...incomingArray.map(i => i._meta?.updated_at || 0), 0);

      // Protect our tab state if our array actually has newer modification variants.
      // E.g., Tab A changes quantity, Tab B reads simultaneously. Storage event fires.
      if (localMaxStamp > incMaxStamp && itemsArray.value.length >= incomingArray.length) {
          return; // Ignore stale sync entirely safely.
      }
      
      itemsArray.value = incomingArray
    } catch (_) { /* ignore */ }
  }

  // Initial Boot
  syncCartData(null)
  
  // Register Passive Sibling Sync
  if (typeof window !== 'undefined') {
      window.addEventListener('storage', syncCartData)
  }

  // ── Public Mutators ─────────────────────────────────────────────

  /**
   * Safe Cart Adapter Normalization.
   * Prevents overriding backend raw structures while granting frontend uuid uniqueness cleanly.
   */
  const addItem = (product, qty = 1) => {
    if (qty <= 0) return
    const internalRawId = product.uuid || product.item_id || product.id

    const existingIndex = itemsArray.value.findIndex(i => (i._meta?.raw_id === internalRawId && i.status !== 'cancelled'))
    
    if (existingIndex !== -1) {
      const existing = itemsArray.value[existingIndex]
      existing.qty = (parseFloat(existing.qty) || 0) + qty
      existing._meta.updated_at = Date.now()
    } else {
      // Prevent Base64 Image URLs from blowing up localStorage Quota
      const { uuid: _removedUuid, image_url: _removedImg, ...safeProduct } = product
      itemsArray.value.push({
        ...safeProduct, // Preserve entire raw schema mapped over
        item_id: internalRawId, // Expose explicitly for legacy bindings naturally
        qty: qty,
        price: parseFloat(product.price) || 0,
        notes: '',
        status: 'pending', // Exclusively DRAFT
        _meta: {       // Hide the complexity inside a secure meta layer.
            uuid: generateUUID(),
            raw_id: internalRawId,
            updated_at: Date.now()
        }
      })
    }
    saveLocalState()
  }

  const removeItem = (internalUUID_or_RawID) => {
    // Forcefully wipe ALL matching duplicate ghosts 
    // instead of finding just one, to ensure UI correctly completely clears stacked bugs.
    itemsArray.value = itemsArray.value.filter(i => 
        i._meta?.uuid !== internalUUID_or_RawID && 
        i._meta?.raw_id !== internalUUID_or_RawID &&
        i.item_id !== internalUUID_or_RawID &&
        i.uuid !== internalUUID_or_RawID
    )
    saveLocalState()
  }

  const updateQty = (internalUUID_or_RawID, qty) => {
    if (qty <= 0) {
        removeItem(internalUUID_or_RawID)
        return
    }
    
    const existing = itemsArray.value.find(i => 
        i._meta?.uuid === internalUUID_or_RawID || 
        i._meta?.raw_id === internalUUID_or_RawID ||
        i.item_id === internalUUID_or_RawID
    )
    if (!existing) return
    
    existing.qty = qty
    if (!existing._meta) existing._meta = { uuid: existing.uuid || '', raw_id: existing.item_id || '', updated_at: Date.now() }
    else existing._meta.updated_at = Date.now()
    saveLocalState()
  }

  const updateNotes = (internalUUID_or_RawID, note) => {
    const existing = itemsArray.value.find(i => 
        i._meta?.uuid === internalUUID_or_RawID || 
        i._meta?.raw_id === internalUUID_or_RawID ||
        i.item_id === internalUUID_or_RawID ||
        i.uuid === internalUUID_or_RawID
    )
    if (!existing) return
    existing.notes = note
    existing._changed = true
    if (existing._meta) existing._meta.updated_at = Date.now()
    saveLocalState()
  }

  const clear = () => {
    itemsArray.value = []
    saveLocalState(true)
  }

  const replaceAll = (newArray) => {
    // Force strip array of massive embedded strings to save localStorage
    itemsArray.value = newArray.map(item => {
      const { image_url, ...safeItem } = item
      return safeItem
    })
    saveLocalState(true)
  }

  // ── Computed Accessors (Cart Exclusive) ───────────────────────────────────────────────

  // These represent EXCLUSIVELY DRAFTS. Orders from server will not be merged back inside here anymore!
  const items = computed(() => itemsArray.value)

  const activeItems = computed(() =>
    itemsArray.value.filter(i => i.status !== 'cancelled')
  )

  const subtotal = computed(() =>
    activeItems.value.reduce(
      (sum, i) => sum + (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0),
      0
    )
  )

  return {
    itemsArray,
    addItem,
    removeItem,
    updateQty,
    updateNotes,
    clear,
    replaceAll,
    items,
    activeItems,
    subtotal,
  }
})
