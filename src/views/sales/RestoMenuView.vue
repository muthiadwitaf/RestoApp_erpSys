<template>
  <div class="resto-menu-view" id="resto-menu-view">
    <!-- Header -->
    <div class="rm-header">
      <div class="rm-header-left">
        <h4 class="rm-title"><i class="bi bi-journal-richtext"></i> Daftar Menu Resto</h4>
        <span class="badge bg-primary">{{ menuItems.length }} menu</span>
      </div>
      <div class="rm-header-right">
        <button class="btn btn-sm btn-primary" @click="openAddItem" id="btn-add-menu">
          <i class="bi bi-plus-lg"></i> Tambah Menu
        </button>
        <button class="btn btn-sm btn-secondary ms-2" @click="refreshMenu" id="btn-refresh-menu">
          <i class="bi bi-arrow-clockwise"></i> Refresh
        </button>
      </div>
    </div>

    <div class="rm-body">
      <!-- Sidebar: Categories -->
      <aside class="rm-sidebar">
        <div class="rm-sidebar-header">
          <span class="rm-sidebar-title">Kategori</span>
          <button class="btn btn-sm btn-outline-primary" @click="showAddCategory = true" title="Tambah Kategori">
            <i class="bi bi-plus"></i>
          </button>
        </div>
        <ul class="rm-cat-list">
          <li :class="{ active: !selectedCategory }" @click="selectedCategory = null">
            <i class="bi bi-grid-fill"></i> Semua
            <span class="badge bg-secondary ms-auto">{{ menuItems.length }}</span>
          </li>
          <li v-for="cat in categories" :key="cat" :class="{ active: selectedCategory === cat }" @click="selectedCategory = cat">
            <i class="bi bi-tag-fill"></i> {{ cat }}
            <span class="badge bg-secondary ms-auto">{{ itemsByCategory(cat).length }}</span>
          </li>
        </ul>
      </aside>

      <!-- Main: Menu Grid/List -->
      <div class="rm-main">
        <!-- Search + View Toggle -->
        <div class="rm-toolbar">
          <div class="rm-search">
            <i class="bi bi-search"></i>
            <input v-model="searchQuery" class="form-control form-control-sm" placeholder="Cari menu..." />
          </div>
          <div class="rm-view-toggle">
            <button :class="viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'" class="btn btn-sm" @click="viewMode = 'grid'">
              <i class="bi bi-grid-3x3-gap-fill"></i>
            </button>
            <button :class="viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'" class="btn btn-sm" @click="viewMode = 'list'">
              <i class="bi bi-list-ul"></i>
            </button>
          </div>
        </div>

        <!-- Grid View -->
        <div v-if="viewMode === 'grid'" class="rm-grid">
          <div v-for="item in filteredItems" :key="item.uuid" class="rm-card" :class="{ unavailable: !item.is_available, 'clickable-card': true }" @click="openEditItem(item)">
            <div class="rm-card-img">
              <img v-if="item.image_url" :src="item.image_url" class="rm-card-photo" alt="" />
              <i v-else class="bi bi-cup-hot-fill"></i>
              <span v-if="!item.is_available" class="rm-badge-unavail">Habis</span>
            </div>
            <div class="rm-card-body">
              <span class="rm-card-cat">{{ item.category }}</span>
              <span class="rm-card-name">{{ item.name }}</span>
              <span class="rm-card-desc" v-if="item.description">{{ item.description }}</span>
              <span class="rm-card-price">Rp {{ formatMoney(item.price) }}</span>
            </div>
            <div class="rm-card-actions">
              <button class="btn btn-sm btn-outline-primary" @click.stop="openEditItem(item)" title="Edit">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm" :class="item.is_available ? 'btn-outline-warning' : 'btn-outline-success'"
                      @click.stop="toggleAvail(item)" :title="item.is_available ? 'Tandai Habis' : 'Tersedia Lagi'">
                <i class="bi" :class="item.is_available ? 'bi-pause-circle' : 'bi-play-circle'"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" @click.stop="deleteItem(item)" title="Hapus">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </div>
          <div v-if="filteredItems.length === 0 && !loading" class="rm-empty">
            <i class="bi bi-journal-x" style="font-size:3rem;opacity:0.2"></i>
            <p>Belum ada menu. Klik <strong>"Tambah Menu"</strong> untuk mulai.</p>
          </div>
        </div>

        <!-- List View -->
        <div v-if="viewMode === 'list'" class="rm-list">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th style="width:40%">Nama Menu</th>
                <th>Kategori</th>
                <th class="text-end">Harga</th>
                <th class="text-center">Status</th>
                <th class="text-end" style="width:120px">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredItems" :key="item.uuid" :class="{ 'table-secondary': !item.is_available }">
                <td>
                  <div class="fw-bold">{{ item.name }}</div>
                  <small v-if="item.description" class="text-muted">{{ item.description }}</small>
                </td>
                <td><span class="badge bg-light text-dark">{{ item.category }}</span></td>
                <td class="text-end fw-bold text-success">Rp {{ formatMoney(item.price) }}</td>
                <td class="text-center">
                  <span class="badge" :class="item.is_available ? 'bg-success' : 'bg-danger'">
                    {{ item.is_available ? 'Tersedia' : 'Habis' }}
                  </span>
                </td>
                <td class="text-end">
                  <button class="btn btn-sm btn-link text-primary p-0 me-2" @click="openEditItem(item)"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-link p-0 me-2" :class="item.is_available ? 'text-warning' : 'text-success'" @click="toggleAvail(item)">
                    <i class="bi" :class="item.is_available ? 'bi-pause-circle' : 'bi-play-circle'"></i>
                  </button>
                  <button class="btn btn-sm btn-link text-danger p-0" @click="deleteItem(item)"><i class="bi bi-trash3"></i></button>
                </td>
              </tr>
              <tr v-if="filteredItems.length === 0 && !loading">
                <td colspan="5" class="text-center text-muted py-4">Belum ada menu</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═══ Add/Edit Item Modal ═══ -->
    <div v-if="showItemModal" class="rm-modal-overlay" @click.self="showItemModal = false">
      <div class="rm-modal">
        <div class="rm-modal-header">
          <h5><i class="bi" :class="itemForm.uuid ? 'bi-pencil-square' : 'bi-plus-circle'"></i> {{ itemForm.uuid ? 'Edit Menu' : 'Tambah Menu' }}</h5>
          <button class="btn-close" @click="showItemModal = false"></button>
        </div>
        <div class="rm-modal-body">
          <div class="mb-3">
            <label class="form-label fw-bold">Nama Menu <span class="text-danger">*</span></label>
            <input v-model="itemForm.name" class="form-control" placeholder="cth: Nasi Goreng Spesial" id="input-menu-name" />
          </div>
          <div class="row mb-3">
            <div class="col-12">
              <label class="form-label fw-bold">Gambar Menu</label>
              <div class="d-flex align-items-center gap-3">
                <div class="img-preview-box" v-if="itemForm.image_url" :style="{ backgroundImage: 'url(' + itemForm.image_url + ')' }"></div>
                <div class="img-preview-box empty" v-else><i class="bi bi-image text-muted"></i></div>
                <div class="flex-grow-1">
                  <input type="file" class="form-control form-control-sm" accept="image/jpeg, image/png, image/webp" @change="onImageSelected" />
                  <small class="text-muted">Otomatis diproses (Max 1MB).</small>
                </div>
              </div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Deskripsi</label>
            <textarea v-model="itemForm.description" class="form-control" rows="2" placeholder="Deskripsi singkat menu..."></textarea>
          </div>
          <div class="row mb-3">
            <div class="col-6">
              <label class="form-label fw-bold">Harga <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text">Rp</span>
                <input v-model.number="itemForm.price" type="number" class="form-control" min="0" id="input-menu-price" />
              </div>
            </div>
            <div class="col-6">
              <label class="form-label fw-bold">Kategori</label>
              <div class="input-group">
                <input v-model="itemForm.category" class="form-control" list="cat-suggestions" placeholder="cth: Makanan" />
                <datalist id="cat-suggestions">
                  <option v-for="c in categories" :key="c" :value="c"></option>
                </datalist>
              </div>
            </div>
          </div>
          <div class="row mb-3">
            <div class="col-6">
              <label class="form-label fw-bold">Urutan</label>
              <input v-model.number="itemForm.sort_order" type="number" class="form-control" min="0" />
            </div>
            <div class="col-6 d-flex align-items-end">
              <div class="form-check form-switch fs-5">
                <input class="form-check-input" type="checkbox" role="switch" v-model="itemForm.is_available" id="toggle-avail" />
                <label class="form-check-label small" for="toggle-avail">
                  {{ itemForm.is_available ? 'Tersedia' : 'Tidak Tersedia' }}
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="rm-modal-footer">
          <button class="btn btn-secondary btn-sm" @click="showItemModal = false">Batal</button>
          <button class="btn btn-primary btn-sm" @click="saveItem" :disabled="!itemForm.name || saving" id="btn-save-menu-item">
            <i class="bi bi-check-lg"></i> {{ saving ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Add Category Modal ═══ -->
    <div v-if="showAddCategory" class="rm-modal-overlay" @click.self="showAddCategory = false">
      <div class="rm-modal" style="width:360px">
        <div class="rm-modal-header"><h5>Tambah Kategori</h5><button class="btn-close" @click="showAddCategory = false"></button></div>
        <div class="rm-modal-body">
          <p class="text-muted small">Kategori baru akan muncul saat ada menu yang menggunakannya. Ketik nama kategori lalu buat menu dengan kategori tersebut.</p>
          <input v-model="newCategoryName" class="form-control" placeholder="cth: Minuman, Dessert, Seafood" />
        </div>
        <div class="rm-modal-footer">
          <button class="btn btn-secondary btn-sm" @click="showAddCategory = false">Tutup</button>
          <button class="btn btn-primary btn-sm" @click="createWithCategory" :disabled="!newCategoryName">
            <i class="bi bi-plus-lg"></i> Buat Menu di Kategori Ini
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="rm-loading"><div class="spinner-border text-primary"></div></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { getRestoMenu, createRestoMenuItem, updateRestoMenuItem, deleteRestoMenuItem } from '@/services/sales/restoApi'

const loading = ref(false)
const saving = ref(false)
const menuItems = ref([])
const selectedCategory = ref(null)
const searchQuery = ref('')
const viewMode = ref('grid')

// Item form
const showItemModal = ref(false)
const itemForm = ref({ uuid: null, name: '', description: '', price: 0, category: 'Umum', sort_order: 0, is_available: true, image_url: null })

// Category
const showAddCategory = ref(false)
const newCategoryName = ref('')

const categories = computed(() => {
  const cats = new Set(menuItems.value.map(i => i.category).filter(Boolean))
  return [...cats].sort()
})

const filteredItems = computed(() => {
  let list = menuItems.value
  if (selectedCategory.value) list = list.filter(i => i.category === selectedCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
  }
  return list
})

function itemsByCategory(cat) { return menuItems.value.filter(i => i.category === cat) }

async function loadMenu() {
  loading.value = true
  try {
    const res = await getRestoMenu()
    menuItems.value = res.data
  } catch (e) { console.error('Load menu error:', e) }
  finally { loading.value = false }
}

function refreshMenu() {
  // Explicit manual refresh, re-fetch menu data
  loadMenu()
}

onActivated(() => {
  // When the view is re-activated (e.g., after navigation), ensure data is fresh
  loadMenu()
})

function openAddItem() {
  itemForm.value = { uuid: null, name: '', description: '', price: 0, category: selectedCategory.value || 'Umum', sort_order: 0, is_available: true, image_url: null }
  showItemModal.value = true
}

function openEditItem(item) {
  itemForm.value = { ...item, image_url: item.image_url || null }
  showItemModal.value = true
}

function onImageSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 1024 * 1024) {
    alert("Ukuran file terlalu besar! Silakan gunakan gambar maksimal 1MB.")
    e.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = (evt) => {
    itemForm.value.image_url = evt.target.result
  }
  reader.readAsDataURL(file)
}

async function saveItem() {
  saving.value = true
  try {
    if (itemForm.value.uuid) {
      await updateRestoMenuItem(itemForm.value.uuid, itemForm.value)
    } else {
      await createRestoMenuItem(itemForm.value)
    }
    showItemModal.value = false
    await loadMenu()
  } catch (e) { alert(e.response?.data?.error || 'Gagal menyimpan') }
  finally { saving.value = false }
}

async function deleteItem(item) {
  if (!confirm(`Hapus menu "${item.name}"?`)) return
  try {
    await deleteRestoMenuItem(item.uuid)
    await loadMenu()
  } catch (e) { alert(e.response?.data?.error || 'Gagal menghapus') }
}

async function toggleAvail(item) {
  try {
    await updateRestoMenuItem(item.uuid, { is_available: !item.is_available })
    await loadMenu()
  } catch (e) { alert(e.response?.data?.error || 'Gagal update status') }
}

function createWithCategory() {
  showAddCategory.value = false
  itemForm.value = { uuid: null, name: '', description: '', price: 0, category: newCategoryName.value, sort_order: 0, is_available: true, image_url: null }
  newCategoryName.value = ''
  showItemModal.value = true
}

function formatMoney(val) { return new Intl.NumberFormat('id-ID').format(parseFloat(val) || 0) }

onMounted(loadMenu)
</script>

<style scoped>
.resto-menu-view {
  display: flex; flex-direction: column; height: calc(100vh - 60px);
  position: relative; overflow: hidden; font-family: 'Inter', 'Segoe UI', sans-serif;
}

.rm-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: var(--bs-body-bg, #fff);
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rm-header-left { display: flex; align-items: center; gap: 12px; }
.rm-header-right { display: flex; gap: 8px; }
.rm-title { margin: 0; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.rm-title i { color: var(--bs-primary); }

.rm-body { display: flex; flex: 1; overflow: hidden; }

/* Sidebar */
.rm-sidebar {
  width: 220px; min-width: 220px; background: var(--bs-body-bg, #fff);
  border-right: 1px solid var(--bs-border-color, #dee2e6); display: flex; flex-direction: column;
}
.rm-sidebar-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rm-sidebar-title { font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--bs-secondary-color); }
.rm-cat-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; }
.rm-cat-list li {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer;
  font-size: 0.88rem; transition: all 0.15s; border-left: 3px solid transparent;
}
.rm-cat-list li:hover { background: var(--bs-tertiary-bg, #f8f9fa); }
.rm-cat-list li.active { background: rgba(var(--bs-primary-rgb), 0.08); border-left-color: var(--bs-primary); font-weight: 600; }
.rm-cat-list li i { opacity: 0.6; }

/* Main */
.rm-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bs-tertiary-bg, #f8f9fa); }

.rm-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: var(--bs-body-bg, #fff); border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rm-search { position: relative; width: 280px; }
.rm-search i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--bs-secondary-color); font-size: 0.85rem; }
.rm-search input { padding-left: 32px; }
.rm-view-toggle { display: flex; gap: 4px; }

/* Grid */
.rm-grid {
  flex: 1; overflow-y: auto; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: max-content;
  gap: 12px; padding: 16px; align-content: start;
}
.rm-card {
  background: var(--bs-body-bg, #fff); border-radius: 12px;
  border: 1px solid var(--bs-border-color, #dee2e6); overflow: hidden; transition: all 0.15s;
  display: block; height: auto;
}
.clickable-card { cursor: pointer; }
.rm-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-2px); }
.rm-card.unavailable { opacity: 0.6; }
.rm-card-img {
  height: 140px; background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: var(--bs-primary);
  position: relative; overflow: hidden;
}
.rm-card-photo {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.rm-badge-unavail {
  position: absolute; top: 6px; right: 6px; background: #ef4444; color: #fff;
  font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;
}
.rm-card-body { padding: 12px; display: block; }
.rm-card-cat { font-size: 0.68rem; color: var(--bs-secondary-color); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px; }
.rm-card-name { font-weight: 700; font-size: 0.88rem; display: block; margin-bottom: 4px; line-height: 1.3; }
.rm-card-desc { font-size: 0.72rem; color: var(--bs-secondary-color); display: block; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.rm-card-price { font-weight: 800; color: var(--bs-success, #198754); font-size: 0.95rem; display: block; margin-top: 4px;}
.rm-card-actions {
  display: flex; gap: 4px; padding: 8px 12px; border-top: 1px solid var(--bs-border-color, #dee2e6);
  justify-content: flex-end; background: var(--bs-body-bg, #fff);
}

/* List */
.rm-list { flex: 1; overflow-y: auto; background: var(--bs-body-bg, #fff); }

.rm-empty {
  grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px; color: var(--bs-secondary-color); gap: 12px;
}

/* Modal */
.rm-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  z-index: 9999; display: flex; align-items: center; justify-content: center;
}
.rm-modal {
  background: var(--bs-body-bg, #fff); border-radius: 14px; width: 480px; max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
}
.rm-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}
.rm-modal-header h5 { margin: 0; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.rm-modal-body { padding: 20px; max-height: 65vh; overflow-y: auto; }
.rm-modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--bs-border-color, #dee2e6);
}

.rm-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.7); z-index: 999;
}

.img-preview-box {
  width: 60px; height: 60px; flex-shrink: 0;
  border-radius: 8px; border: 1px solid var(--bs-border-color);
  background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center;
  background-color: var(--bs-tertiary-bg);
}
.img-preview-box.empty {
  font-size: 1.5rem;
}
</style>
