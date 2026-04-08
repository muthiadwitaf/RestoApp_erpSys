<template>
  <div>
    <div class="page-header">
      <div>
        <h1><i class="bi bi-building-gear me-2"></i>Profil Perusahaan</h1>
        <span class="breadcrumb-custom">Pengaturan / Profil Perusahaan</span>
      </div>
    </div>

    <!-- Card Data Perusahaan -->
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="bi bi-building me-2"></i>Data Perusahaan</span>
        <button v-if="!isEditing" class="btn btn-sm btn-outline-primary" @click="startEdit">
          <i class="bi bi-pencil me-1"></i>Edit
        </button>
      </div>
      <div class="card-body">

        <!-- ── VIEW MODE ── -->
        <template v-if="!isEditing">
          <div class="row g-3">
            <div class="col-md-8">
              <div class="cp-label">Nama Perusahaan</div>
              <div class="cp-value">{{ settings.company_name || '-' }}</div>
            </div>
            <div class="col-md-4">
              <div class="cp-label">Telepon</div>
              <div class="cp-value">{{ settings.phone || '-' }}</div>
            </div>
            <div class="col-md-6">
              <div class="cp-label">Alamat</div>
              <div class="cp-value">{{ settings.address || '-' }}</div>
            </div>
            <div class="col-md-3">
              <div class="cp-label">NPWP</div>
              <div class="cp-value font-monospace">{{ settings.npwp || '-' }}</div>
            </div>
            <div class="col-md-3">
              <div class="cp-label">Status PKP</div>
              <div class="cp-value">
                <span class="badge" :class="settings.is_pkp ? 'bg-success' : 'bg-secondary'">
                  {{ settings.is_pkp ? 'PKP Aktif' : 'Non-PKP' }}
                </span>
              </div>
            </div>
          </div>
          <div class="mt-3">
            <router-link to="/accounting/config" class="btn btn-outline-primary btn-sm">
              <i class="bi bi-gear-wide-connected me-1"></i>Konfigurasi Keuangan
            </router-link>
          </div>
        </template>

        <!-- ── EDIT MODE ── -->
        <template v-else>
          <div class="row">
            <div class="col-md-8 mb-3">
              <label class="form-label fw-semibold">Nama Perusahaan <span class="text-danger">*</span></label>
              <input class="form-control" v-model="form.company_name" placeholder="CV / PT / UD nama perusahaan" />
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label fw-semibold">Telepon</label>
              <input class="form-control" v-model="form.phone" placeholder="021-xxxxxxxx" />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">Alamat</label>
            <input class="form-control" v-model="form.address" placeholder="Alamat lengkap perusahaan" />
          </div>

          <div class="alert alert-info py-2 small">
            <i class="bi bi-info-circle me-1"></i>
            Untuk mengatur PKP, NPWP, e-Faktur, tarif PPN, dan tahun fiskal, gunakan menu
            <router-link to="/accounting/config">Keuangan > Konfigurasi Keuangan</router-link>.
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="bi bi-save me-1"></i>Simpan
            </button>
            <button class="btn btn-outline-secondary" @click="cancelEdit">
              <i class="bi bi-x me-1"></i>Batal
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useBranchStore } from '@/stores/branch'
import { useToast } from '@/composables/useToast'
import api from '@/services/api'

const branchStore = useBranchStore()
const toast = useToast()
const saving = ref(false)
const settings = ref({})
const isEditing = ref(false)

const form = reactive({
  company_name: '',
  phone: '',
  address: ''
})

function populateForm(s) {
  Object.assign(form, {
    company_name: s.company_name || '',
    phone: s.phone || '',
    address: s.address || ''
  })
}

function startEdit() { populateForm(settings.value); isEditing.value = true }
function cancelEdit() { isEditing.value = false; populateForm(settings.value) }

onMounted(async () => {
  try {
    const settRes = await api.get('/settings/company')
    settings.value = settRes.data || {}
    populateForm(settings.value)
  } catch (e) { console.error('Load settings error:', e) }
})

async function saveSettings() {
  if (!form.company_name.trim()) { toast.error('Nama perusahaan wajib diisi'); return }
  saving.value = true
  try {
    const res = await api.put('/settings/company', {
      ...form,
      // Preserve existing finance config fields
      npwp: settings.value.npwp,
      is_pkp: settings.value.is_pkp,
      pkp_since: settings.value.pkp_since,
      efaktur_series_prefix: settings.value.efaktur_series_prefix,
      fiscal_year_start_month: settings.value.fiscal_year_start_month,
      closing_deadline_day: settings.value.closing_deadline_day,
      branch_id: branchStore.currentBranchId
    })
    settings.value = { ...settings.value, ...res.data.data }
    toast.success('Profil perusahaan berhasil disimpan')
    isEditing.value = false
  } catch (e) {
    toast.error('Gagal menyimpan: ' + (e.response?.data?.error || e.message))
  }
  saving.value = false
}
</script>

<style scoped>
.cp-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin-bottom: 0.2rem;
}
.cp-value {
  font-size: 0.9rem;
  font-weight: 500;
  color: #111827;
}
</style>
