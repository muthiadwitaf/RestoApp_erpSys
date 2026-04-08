<template>
  <!-- PosSettingsView.vue - Setting POS: Tab 1 QRIS/Rekening, Tab 2 Pengaturan Kasir
       Uses only plain ASCII characters. -->
  <div>
    <div class="page-header mb-3">
      <div>
        <h1>Pengaturan Resto</h1>
        <span class="breadcrumb-custom">Restoran / Pengaturan</span>
      </div>
    </div>

    <!-- Tab Nav -->
    <ul class="nav nav-tabs mb-4" id="pos-settings-tabs">
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'payment' }"
                @click="activeTab = 'payment'" id="tab-payment">
          <i class="bi bi-credit-card me-1"></i>QRIS &amp; Rekening
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'kasir' }"
                @click="activeTab = 'kasir'" id="tab-kasir">
          <i class="bi bi-gear me-1"></i>Sistem &amp; Profil
        </button>
      </li>
    </ul>

    <!-- ============================================================ -->
    <!-- TAB 1: QRIS & Rekening                                       -->
    <!-- ============================================================ -->
    <div v-show="activeTab === 'payment'" style="max-width:860px">
      <div class="row g-3">
        <!-- Bank Transfer Info -->
        <div class="col-12">
          <div class="card">
            <div class="card-header py-2">
              <h6 class="mb-0 fw-bold"><i class="bi bi-bank me-2"></i>Informasi Rekening Bank (Transfer) &amp; EDC (Debit)</h6>
            </div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Nama Bank (Transfer)</label>
                  <input class="form-control" v-model="form.pos_bank_name" placeholder="Contoh: BCA" id="pos-bank-name" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Nama Pemilik Rekening</label>
                  <input class="form-control" v-model="form.pos_bank_holder" placeholder="Contoh: PT. Sumber Makmur" id="pos-bank-holder" />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Nomor Rekening</label>
                  <input class="form-control font-monospace" v-model="form.pos_bank_number" placeholder="Contoh: 1234567890" id="pos-bank-number" />
                </div>
                <div class="col-md-12 mt-4 border-top pt-3">
                  <label class="form-label fw-semibold"><i class="bi bi-credit-card me-2"></i>Informasi Mesin EDC (Debit)</label>
                  <input class="form-control" v-model="form.pos_debit_bank" placeholder="Contoh: Mesin EDC Mandiri / Debit BCA" id="pos-debit-bank" />
                  <div class="form-text">Info EDC ini akan tercetak di struk sebagai instruksi pembayaran Debit.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- QRIS Image Upload -->
        <div class="col-12">
          <div class="card">
            <div class="card-header py-2">
              <h6 class="mb-0 fw-bold"><i class="bi bi-qr-code me-2"></i>Gambar QRIS</h6>
            </div>
            <div class="card-body">
              <p class="text-muted small mb-3">
                Upload gambar QRIS untuk ditampilkan di halaman pembayaran POS.
                <!-- File akan disimpan ke <code>uploadedImage/{company_uuid}/POS/qris.webp</code> -->
              </p>
              <div class="row g-3 align-items-start">
                <div class="col-md-4">
                  <div class="border rounded p-2 text-center" style="min-height:160px;display:flex;align-items:center;justify-content:center;background:#f8f9fa">
                    <div v-if="currentQrisUrl">
                      <img :src="authImageUrl(currentQrisUrl)" alt="QRIS" style="max-width:140px;max-height:140px;object-fit:contain" id="qris-preview-current" />
                      <div class="small text-success mt-2"><i class="bi bi-check-circle me-1"></i>QRIS aktif</div>
                    </div>
                    <div v-else class="text-muted">
                      <i class="bi bi-qr-code display-4 d-block mb-2"></i>
                      <span class="small">Belum ada QRIS</span>
                    </div>
                  </div>
                </div>
                <div class="col-md-8">
                  <label class="form-label fw-semibold">Upload Gambar QRIS Baru</label>
                  <input type="file" class="form-control mb-2" accept="image/jpeg,image/png,image/webp"
                         @change="onQrisFileChange" id="qris-file-input" />
                  <div v-if="qrisPreviewUrl" class="mb-3">
                    <div class="small text-muted mb-1">Preview:</div>
                    <img :src="qrisPreviewUrl" alt="Preview" style="max-width:140px;max-height:140px;object-fit:contain;border:1px solid #dee2e6;border-radius:6px" id="qris-preview-new" />
                  </div>
                  <button class="btn btn-outline-primary btn-sm" :disabled="!qrisFile || uploading"
                          @click="doUploadQris" id="btn-upload-qris">
                    <i class="bi bi-upload me-1"></i>
                    {{ uploading ? 'Mengupload...' : 'Upload QRIS' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save button -->
        <div class="col-12">
          <button class="btn btn-primary px-4" :disabled="saving || cannotEdit" @click="doSave" id="btn-save-pos-settings">
            <i class="bi bi-floppy me-1"></i>{{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
          </button>
          <span v-if="cannotEdit" class="ms-3 text-warning small">
            <i class="bi bi-lock me-1"></i>Hanya admin/manager yang dapat mengubah setting POS.
          </span>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- TAB 2: Pengaturan Kasir                                      -->
    <!-- ============================================================ -->
    <div v-show="activeTab === 'kasir'" style="max-width:860px">
      <div class="row g-3">

        <!-- Profil Restoran (Local) -->
        <div class="col-12">
          <div class="card border-primary">
            <div class="card-body">
              <div class="row align-items-center g-3">
                <div class="col-md-5">
                  <div class="fw-semibold text-primary">Profil Restoran</div>
                  <div class="text-muted small mt-1">
                    Nama dan alamat restoran yang akan ditampilkan pada layar dan struk pesanan (disimpan secara lokal).
                  </div>
                </div>
                <div class="col-md-7">
                  <div class="mb-2">
                    <label class="form-label small mb-1 fw-bold">Nama Restoran</label>
                    <input type="text" class="form-control" v-model="localRestoName" placeholder="Contoh: Mirai Dining Fusion" @blur="saveLocalRestoName" />
                  </div>
                  <div>
                    <label class="form-label small mb-1 fw-bold">Alamat Restoran</label>
                    <textarea class="form-control" v-model="localRestoAddress" rows="2" placeholder="Contoh: Jl. Sudirman No 123, Jakarta" @blur="saveLocalRestoAddress"></textarea>
                  </div>
                  <div class="form-text text-success" v-if="savedLocalName">Tersimpan di perangkat ini.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Buka Kasir -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <div class="row align-items-center g-3">
                <div class="col-md-5">
                  <div class="fw-semibold">Buka Kasir</div>
                  <div class="text-muted small mt-1">
                    Atur apakah kasir wajib mengisi nominal kas awal saat membuka sesi.
                  </div>
                </div>
                <div class="col-md-7">
                  <div class="form-check form-switch fs-5 mb-0">
                    <input class="form-check-input" type="checkbox" role="switch"
                           v-model="kasirForm.pos_require_opening_cash" id="toggle-opening-cash" />
                    <label class="form-check-label small" for="toggle-opening-cash">
                      {{ kasirForm.pos_require_opening_cash
                          ? 'Wajib isi nominal kas awal'
                          : 'Input kas awal tidak diperlukan (langsung buka)' }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tutup Kasir Otomatis -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <div class="row align-items-start g-3">
                <div class="col-md-5">
                  <div class="fw-semibold">Tutup Kasir Otomatis</div>
                  <div class="text-muted small mt-1">
                    Atur jam tutup kasir otomatis. Kosongkan jika tidak diperlukan.
                  </div>
                </div>
                <div class="col-md-7">
                  <label class="form-label small text-muted mb-1">Jam Tutup Otomatis</label>
                  <div class="d-flex align-items-center gap-3">
                    <div class="input-group" style="max-width:180px">
                      <span class="input-group-text"><i class="bi bi-clock"></i></span>
                      <input type="time" class="form-control"
                             v-model="kasirForm.pos_auto_close_time" id="input-auto-close-time" />
                    </div>
                    <button class="btn btn-sm btn-outline-secondary"
                            @click="kasirForm.pos_auto_close_time = ''"
                            title="Nonaktifkan tutup otomatis">
                      <i class="bi bi-x-circle me-1"></i>Nonaktifkan
                    </button>
                  </div>
                  <div class="form-text">
                    {{ kasirForm.pos_auto_close_time
                        ? 'Kasir akan otomatis ditutup pada pukul ' + kasirForm.pos_auto_close_time
                        : 'Tutup kasir otomatis tidak aktif.' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        <!-- Metode Pembayaran POS -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <div class="row align-items-start g-3">
                <div class="col-md-5">
                  <div class="fw-semibold">Metode Pembayaran POS</div>
                  <div class="text-muted small mt-1">
                    Pilih metode pembayaran yang ditampilkan di halaman pembayaran POS.
                  </div>
                </div>
                <div class="col-md-7">
                  <div class="d-flex flex-wrap gap-3">
                    <div v-for="m in paymentMethodOptions" :key="m.value"
                         class="border rounded-3 px-3 py-2 d-flex align-items-center gap-2"
                         :class="{ 'border-primary bg-primary bg-opacity-10': selectedMethods.includes(m.value) }"
                         style="cursor:pointer;min-width:130px"
                         @click="toggleMethod(m.value)" :id="'method-' + m.value">
                      <input type="checkbox" :checked="selectedMethods.includes(m.value)"
                             class="form-check-input m-0" @click.stop="toggleMethod(m.value)" />
                      <i :class="m.icon + ' fs-5'" :style="{ color: m.color }"></i>
                      <span class="small fw-semibold">{{ m.label }}</span>
                    </div>
                  </div>
                  <div class="form-text mt-2">
                    Metode aktif: {{ selectedMethods.length > 0 ? selectedMethods.join(', ') : 'Tidak ada' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Pengaturan Kasir -->
        <div class="col-12">
          <button class="btn btn-primary px-4" :disabled="savingKasir || cannotEdit"
                  @click="doSaveKasir" id="btn-save-kasir-settings">
            <i class="bi bi-floppy me-1"></i>{{ savingKasir ? 'Menyimpan...' : 'Simpan Pengaturan Kasir' }}
          </button>
          <span v-if="cannotEdit" class="ms-3 text-warning small">
            <i class="bi bi-lock me-1"></i>Hanya admin/manager yang dapat mengubah setting POS.
          </span>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
// Uses only plain ASCII characters.
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import * as salesApi from '@/services/sales/api'

const authStore = useAuthStore()
const toast     = useToast()

// Active tab
const activeTab = ref('payment')

// -- Profil Restoran (Local Only) -------------------------------------------
const localRestoName = ref(localStorage.getItem('resto_local_name') || 'Smart POS')
const localRestoAddress = ref(localStorage.getItem('resto_local_address') || '')
const savedLocalName = ref(false)

function saveLocalRestoName() {
  localStorage.setItem('resto_local_name', localRestoName.value)
  savedLocalName.value = true
  setTimeout(() => savedLocalName.value = false, 2000)
  window.dispatchEvent(new Event('restoConfigUpdated'))
}

function saveLocalRestoAddress() {
  localStorage.setItem('resto_local_address', localRestoAddress.value)
  savedLocalName.value = true
  setTimeout(() => savedLocalName.value = false, 2000)
}

// -- Tab 1: QRIS & Rekening -------------------------------------------------
const form = ref({ pos_bank_name: '', pos_bank_holder: '', pos_bank_number: '', pos_debit_bank: '' })
const currentQrisUrl = ref('')
const qrisFile       = ref(null)
const qrisPreviewUrl = ref('')
const saving         = ref(false)
const uploading      = ref(false)

// -- Tab 2: Pengaturan Kasir ------------------------------------------------
const kasirForm = ref({
  pos_require_opening_cash: true,
  pos_hide_stock:           false,
  pos_auto_close_time:      ''
})
const selectedMethods = ref(['cash', 'qris', 'transfer'])
const savingKasir     = ref(false)

const paymentMethodOptions = [
  { value: 'cash',     label: 'Tunai',         icon: 'bi bi-cash-stack',   color: '#28a745' },
  { value: 'qris',     label: 'QRIS',           icon: 'bi bi-qr-code',      color: '#17a2b8' },
  { value: 'transfer', label: 'Transfer Bank',  icon: 'bi bi-bank',         color: '#007bff' },
  { value: 'debit',    label: 'Debit',          icon: 'bi bi-credit-card',  color: '#00B4AB' }
]

function toggleMethod(val) {
  const idx = selectedMethods.value.indexOf(val)
  if (idx === -1) selectedMethods.value.push(val)
  else            selectedMethods.value.splice(idx, 1)
}

// Allow pos:settings OR settings:edit (company admin) to modify POS settings
const cannotEdit = computed(() =>
  !authStore.hasPermission('pos:view') && !authStore.hasPermission('pos:settings') && !authStore.hasPermission('settings:edit')
)

function authImageUrl(url) {
  if (!url) return ''
  const token = localStorage.getItem('erp_access_token')
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

function onQrisFileChange(e) {
  const f = e.target.files[0]
  if (!f) { qrisFile.value = null; qrisPreviewUrl.value = ''; return }
  qrisFile.value = f
  const reader = new FileReader()
  reader.onload = (ev) => { qrisPreviewUrl.value = ev.target.result }
  reader.readAsDataURL(f)
}

async function doSave() {
  if (cannotEdit.value) { toast.warning('Anda tidak memiliki akses untuk mengubah setting POS.'); return }
  saving.value = true
  try {
    await salesApi.savePosSettings({
      pos_bank_name:   form.value.pos_bank_name   || '',
      pos_bank_holder: form.value.pos_bank_holder || '',
      pos_bank_number: form.value.pos_bank_number || '',
      pos_debit_bank:  form.value.pos_debit_bank  || ''
    })
    toast.success('Konfigurasi POS berhasil disimpan!')
  } catch (e) {
    toast.error('Gagal menyimpan: ' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function doSaveKasir() {
  if (cannotEdit.value) { toast.warning('Anda tidak memiliki akses untuk mengubah setting POS.'); return }
  savingKasir.value = true
  try {
    await salesApi.savePosSettings({
      pos_require_opening_cash: kasirForm.value.pos_require_opening_cash,
      pos_hide_stock:           kasirForm.value.pos_hide_stock,
      pos_payment_methods:      selectedMethods.value.join(',') || 'cash,qris,transfer',
      pos_auto_close_time:      kasirForm.value.pos_auto_close_time || ''
    })
    toast.success('Pengaturan Kasir berhasil disimpan!')
  } catch (e) {
    toast.error('Gagal menyimpan: ' + (e.response?.data?.error || e.message))
  } finally {
    savingKasir.value = false
  }
}

async function doUploadQris() {
  if (!qrisFile.value) { toast.warning('Pilih file QRIS terlebih dahulu.'); return }
  if (cannotEdit.value) { toast.warning('Anda tidak memiliki akses untuk mengubah setting POS.'); return }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', qrisFile.value)
    const { data } = await salesApi.uploadQrisImage(fd)
    currentQrisUrl.value = data.url
    qrisFile.value       = null
    qrisPreviewUrl.value = ''
    toast.success('Gambar QRIS berhasil diupload!')
  } catch (e) {
    toast.error('Gagal upload: ' + (e.response?.data?.error || e.message))
  } finally {
    uploading.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await salesApi.getPosSettings()
    // Tab 1 fields
    form.value.pos_bank_name   = data.pos_bank_name   || ''
    form.value.pos_bank_holder = data.pos_bank_holder || ''
    form.value.pos_bank_number = data.pos_bank_number || ''
    form.value.pos_debit_bank  = data.pos_debit_bank  || ''
    currentQrisUrl.value       = data.pos_qris_url    || ''
    // Tab 2 fields
    kasirForm.value.pos_require_opening_cash = data.pos_require_opening_cash !== undefined
      ? Boolean(data.pos_require_opening_cash) : true
    kasirForm.value.pos_hide_stock           = Boolean(data.pos_hide_stock)
    kasirForm.value.pos_auto_close_time      = data.pos_auto_close_time || ''
    // Payment methods: parse comma-separated string
    if (data.pos_payment_methods) {
      selectedMethods.value = data.pos_payment_methods.split(',').map(s => s.trim()).filter(Boolean)
    }
  } catch (e) {
    // settings may not be configured yet -- not fatal
  }
})
</script>
