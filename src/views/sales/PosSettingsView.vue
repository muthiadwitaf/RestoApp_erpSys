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
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'waiter' }"
                @click="activeTab = 'waiter'; loadWaiters()" id="tab-waiter">
          <i class="bi bi-people me-1"></i>Kelola Waiters
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
                  <div class="fw-semibold">Bisnis & Pajak</div>
                  <div class="text-muted small mt-1">
                    Atur besaran Pajak dan Biaya Layanan default yang akan diterapkan pada setiap transaksi.
                  </div>
                </div>
                <div class="col-md-7">
                  <div class="row g-2">
                    <div class="col-6">
                      <label class="form-label small text-muted mb-1">Pajak Resto (PB1/PPN) %</label>
                      <div class="input-group">
                        <input type="number" step="0.5" class="form-control" v-model="kasirForm.pos_tax_pct" />
                        <span class="input-group-text">%</span>
                      </div>
                    </div>
                    <div class="col-6">
                      <label class="form-label small text-muted mb-1">Biaya Layanan (Service) %</label>
                      <div class="input-group">
                        <input type="number" step="0.5" class="form-control" v-model="kasirForm.pos_service_pct" />
                        <span class="input-group-text">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <hr class="my-4">
              <div class="row align-items-start g-3">
                <div class="col-md-5">
                  <div class="fw-semibold">Insentif & Komisi Karyawan</div>
                  <div class="text-muted small mt-1">
                    Atur besaran Komisi bawaan (dalam persen) yang diberikan kepada pelayan/waiter dari pesanan restoran.
                  </div>
                </div>
                <div class="col-md-7">
                  <div class="row g-2">
                    <div class="col-6">
                      <label class="form-label small text-muted mb-1">Persentase Komisi Waiter %</label>
                      <div class="input-group">
                        <input type="number" step="0.5" class="form-control" v-model="kasirForm.pos_waiter_commission_pct" />
                        <span class="input-group-text">%</span>
                      </div>
                    </div>
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

    <!-- ============================================================ -->
    <!-- TAB 3: Kelola Waiter                                         -->
    <!-- ============================================================ -->
    <div v-show="activeTab === 'waiter'" style="max-width:920px">
      <div class="row g-3">

        <!-- Tambah Waiter -->
        <div class="col-12">
          <div class="card border-primary">
            <div class="card-header py-2 bg-primary text-white">
              <h6 class="mb-0 fw-bold"><i class="bi bi-person-plus me-2"></i>Tambah Waiter Baru</h6>
            </div>
            <div class="card-body">
              <div class="row g-2 align-items-end">
                <div class="col-md-3">
                  <label class="form-label small fw-bold mb-1">Nama Waiter <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" v-model="waiterForm.name" placeholder="Contoh: Ahmad" id="input-waiter-name" />
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold mb-1">No. Telepon</label>
                  <input type="text" class="form-control" v-model="waiterForm.phone" placeholder="08xxxxxxxxx" id="input-waiter-phone" />
                </div>
                <div class="col-md-2">
                  <label class="form-label small fw-bold mb-1">PIN Absen</label>
                  <input type="password" maxlength="6" class="form-control" v-model="waiterForm.pin" placeholder="Max 6 digit" id="input-waiter-pin" />
                </div>
                <div class="col-md-2">
                  <label class="form-label small fw-bold mb-1">Komisi Override</label>
                  <div class="input-group">
                    <input type="number" step="0.5" class="form-control" v-model="waiterForm.commission_pct" placeholder="(Global)" id="input-waiter-commission" />
                    <span class="input-group-text">%</span>
                  </div>
                </div>
                <div class="col-md-2">
                  <button class="btn btn-primary w-100" @click="doAddWaiter" :disabled="waiterSaving" id="btn-add-waiter">
                    <i class="bi bi-plus-circle me-1"></i>{{ waiterSaving ? 'Meny...' : 'Tambah' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Daftar Waiter -->
        <div class="col-12">
          <div class="card">
            <div class="card-header py-2 d-flex justify-content-between align-items-center">
              <h6 class="mb-0 fw-bold"><i class="bi bi-people-fill me-2"></i>Daftar Waiter</h6>
              <span class="badge bg-primary">{{ waiterList.length }} waiter</span>
            </div>
            <div class="card-body p-0">
              <div v-if="waiterLoading" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary"></div>
                <span class="ms-2 text-muted">Memuat daftar waiter...</span>
              </div>
              <div v-else-if="waiterList.length === 0" class="text-center py-5 text-muted">
                <i class="bi bi-person-badge display-4 d-block mb-3" style="opacity:0.25"></i>
                <h6>Belum ada waiter terdaftar</h6>
                <p class="small">Tambahkan waiter di form di atas untuk mulai menggunakannya di layar kasir.</p>
              </div>
              <div v-else class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead class="table-light">
                      <th class="ps-3" style="width:5%">#</th>
                      <th>Nama</th>
                      <th>Telepon</th>
                      <th class="text-center">PIN</th>
                      <th class="text-center">Komisi (%)</th>
                      <th class="text-center">Status</th>
                      <th class="text-center" style="width:150px">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(w, idx) in waiterList" :key="w.uuid" :class="{'opacity-50': !w.is_active}">
                      <td class="ps-3 text-muted">{{ idx + 1 }}</td>
                      <td>
                        <template v-if="editingWaiter === w.uuid">
                          <input type="text" class="form-control form-control-sm" v-model="editWaiterForm.name" />
                        </template>
                        <template v-else>
                          <div class="d-flex align-items-center gap-2">
                            <div class="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center" style="width:30px;height:30px">
                              <i class="bi bi-person-fill"></i>
                            </div>
                            <span class="fw-semibold">{{ w.name }}</span>
                          </div>
                        </template>
                      </td>
                      <td>
                        <template v-if="editingWaiter === w.uuid">
                          <input type="text" class="form-control form-control-sm" v-model="editWaiterForm.phone" placeholder="08xx" />
                        </template>
                        <template v-else>
                          <span class="text-muted">{{ w.phone || '-' }}</span>
                        </template>
                      </td>
                      <td class="text-center">
                        <template v-if="editingWaiter === w.uuid">
                          <input type="password" maxlength="6" class="form-control form-control-sm" style="max-width:80px;margin:0 auto" v-model="editWaiterForm.pin" placeholder="Baru" />
                        </template>
                        <template v-else>
                          <span v-if="w.has_pin" class="badge bg-success bg-opacity-10 text-success border border-success"><i class="bi bi-shield-lock me-1"></i>Ada</span>
                          <span v-else class="badge bg-light text-muted border border-secondary"><i class="bi bi-unlock me-1"></i>Tidak</span>
                        </template>
                      </td>
                      <td class="text-center">
                        <template v-if="editingWaiter === w.uuid">
                          <input type="number" step="0.5" class="form-control form-control-sm" style="max-width:80px;margin:0 auto" v-model="editWaiterForm.commission_pct" placeholder="-" />
                        </template>
                        <template v-else>
                          <span v-if="w.commission_pct != null" class="badge bg-success">{{ w.commission_pct }}%</span>
                          <span v-else class="badge bg-secondary">Global ({{ kasirForm.pos_waiter_commission_pct }}%)</span>
                        </template>
                      </td>
                      <td class="text-center">
                        <div class="form-check form-switch d-inline-block">
                          <input class="form-check-input" type="checkbox" role="switch"
                                 :checked="w.is_active" @change="doToggleWaiter(w)" />
                        </div>
                      </td>
                      <td class="text-center">
                        <template v-if="editingWaiter === w.uuid">
                          <button class="btn btn-sm btn-success me-1" @click="doSaveEditWaiter(w)" :disabled="waiterSaving">
                            <i class="bi bi-check-lg"></i>
                          </button>
                          <button class="btn btn-sm btn-outline-secondary" @click="editingWaiter = null">
                            <i class="bi bi-x-lg"></i>
                          </button>
                        </template>
                        <template v-else>
                          <button class="btn btn-sm btn-outline-primary me-1" @click="startEditWaiter(w)" title="Edit">
                            <i class="bi bi-pencil"></i>
                          </button>
                          <button class="btn btn-sm btn-outline-danger" @click="doDeleteWaiter(w)" title="Hapus">
                            <i class="bi bi-trash"></i>
                          </button>
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
import { getWaitersList, createWaiter, updateWaiter, deleteWaiter } from '@/services/sales/restoApi'

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
  pos_auto_close_time:      '',
  pos_tax_pct:              10,
  pos_service_pct:          0,
  pos_waiter_commission_pct: 0
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
      pos_require_opening_cash:  kasirForm.value.pos_require_opening_cash,
      pos_hide_stock:            kasirForm.value.pos_hide_stock,
      pos_payment_methods:       selectedMethods.value.join(',') || 'cash,qris,transfer',
      pos_auto_close_time:       kasirForm.value.pos_auto_close_time || '',
      pos_tax_pct:               kasirForm.value.pos_tax_pct,
      pos_service_pct:           kasirForm.value.pos_service_pct,
      pos_waiter_commission_pct: kasirForm.value.pos_waiter_commission_pct
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
    kasirForm.value.pos_tax_pct              = data.pos_tax_pct !== undefined ? parseFloat(data.pos_tax_pct) : 10
    kasirForm.value.pos_service_pct          = data.pos_service_pct !== undefined ? parseFloat(data.pos_service_pct) : 0
    kasirForm.value.pos_waiter_commission_pct = data.pos_waiter_commission_pct !== undefined ? parseFloat(data.pos_waiter_commission_pct) : 0
    // Payment methods: parse comma-separated string
    if (data.pos_payment_methods) {
      selectedMethods.value = data.pos_payment_methods.split(',').map(s => s.trim()).filter(Boolean)
    }
  } catch (e) {
    // settings may not be configured yet -- not fatal
  }
})

// -- Tab 3: Kelola Waiter ---------------------------------------------------
const waiterList = ref([])
const waiterLoading = ref(false)
const waiterSaving = ref(false)
const waiterForm = ref({ name: '', phone: '', commission_pct: '', pin: '' })
const editingWaiter = ref(null)
const editWaiterForm = ref({ name: '', phone: '', commission_pct: '', pin: '' })

async function loadWaiters() {
  waiterLoading.value = true
  try {
    const { data } = await getWaitersList()
    waiterList.value = data || []
  } catch (e) {
    toast.error('Gagal memuat daftar waiter.')
  } finally {
    waiterLoading.value = false
  }
}

async function doAddWaiter() {
  if (!waiterForm.value.name.trim()) {
    toast.warning('Nama waiter wajib diisi.')
    return
  }
  waiterSaving.value = true
  try {
    const payload = {
      name: waiterForm.value.name.trim(),
      phone: waiterForm.value.phone || null,
      commission_pct: waiterForm.value.commission_pct !== '' ? parseFloat(waiterForm.value.commission_pct) : null,
      pin: waiterForm.value.pin || null
    }
    await createWaiter(payload)
    toast.success('Waiter berhasil ditambahkan!')
    waiterForm.value = { name: '', phone: '', commission_pct: '', pin: '' }
    await loadWaiters()
  } catch (e) {
    toast.error('Gagal menambah waiter: ' + (e.response?.data?.error || e.message))
  } finally {
    waiterSaving.value = false
  }
}

function startEditWaiter(w) {
  editingWaiter.value = w.uuid
  editWaiterForm.value = {
    name: w.name,
    phone: w.phone || '',
    commission_pct: w.commission_pct != null ? w.commission_pct : '',
    pin: '' // Do not pre-fill PIN, leave blank for security unless they want to change
  }
}

async function doSaveEditWaiter(w) {
  if (!editWaiterForm.value.name.trim()) {
    toast.warning('Nama waiter wajib diisi.')
    return
  }
  waiterSaving.value = true
  try {
    const payload = {
      name: editWaiterForm.value.name.trim(),
      phone: editWaiterForm.value.phone || null,
      commission_pct: editWaiterForm.value.commission_pct !== '' ? parseFloat(editWaiterForm.value.commission_pct) : null
    }
    if (editWaiterForm.value.pin) {
      payload.pin = editWaiterForm.value.pin
    }
    
    await updateWaiter(w.uuid, payload)
    toast.success('Waiter berhasil diperbarui!')
    editingWaiter.value = null
    await loadWaiters()
  } catch (e) {
    toast.error('Gagal update waiter: ' + (e.response?.data?.error || e.message))
  } finally {
    waiterSaving.value = false
  }
}

async function doToggleWaiter(w) {
  try {
    await updateWaiter(w.uuid, { is_active: !w.is_active })
    w.is_active = !w.is_active
    toast.success(w.is_active ? `${w.name} diaktifkan` : `${w.name} dinonaktifkan`)
  } catch (e) {
    toast.error('Gagal mengubah status waiter.')
  }
}

async function doDeleteWaiter(w) {
  if (!confirm(`Hapus waiter "${w.name}"? Data komisi waiter ini di pesanan sebelumnya tidak akan terpengaruh.`)) return
  try {
    await deleteWaiter(w.uuid)
    toast.success(`Waiter ${w.name} berhasil dihapus.`)
    await loadWaiters()
  } catch (e) {
    toast.error('Gagal menghapus waiter: ' + (e.response?.data?.error || e.message))
  }
}
</script>
