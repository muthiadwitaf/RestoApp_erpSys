<template>
  <div>
    <div class="page-header">
      <div><h1>Manajemen Cabang</h1><span class="breadcrumb-custom">Settings / Cabang</span></div>
      <button class="btn btn-primary" v-permission="'branch:create'" data-bs-toggle="modal" data-bs-target="#branchModal" @click="resetForm" id="btn-add-branch"><i class="bi bi-plus-lg me-1"></i>Tambah Cabang</button>
    </div>
    <div class="row g-3">
      <div class="col-md-6 col-lg-4" v-for="b in allBranches" :key="b.uuid || b.id">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <h6 class="fw-bold"><i class="bi bi-building me-2 text-primary"></i>{{ b.name }}</h6>
              <span class="badge" :class="b.is_active !== false ? 'bg-success' : 'bg-secondary'">{{ b.is_active !== false ? 'Aktif' : 'Nonaktif' }}</span>
            </div>
            <div class="small text-muted mt-2"><i class="bi bi-hash me-1"></i>Kode: <strong>{{ b.code }}</strong></div>
            <div class="small text-muted"><i class="bi bi-geo-alt me-1"></i>{{ b.address }}</div>
            <div class="small text-muted"><i class="bi bi-telephone me-1"></i>{{ b.phone }}</div>
          </div>
          <div class="card-footer bg-transparent" v-permission="'branch:edit'">
            <button class="btn btn-sm btn-outline-primary me-1" @click="editBranch(b)" data-bs-toggle="modal" data-bs-target="#branchModal"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" v-permission="'branch:delete'" @click="deleteBranch(b)"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="branchModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">{{ editUuid ? 'Edit' : 'Tambah' }} Cabang</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="row"><div class="col-4 mb-3">
          <label class="form-label small fw-semibold">Kode <span class="text-danger">*</span></label>
          <div class="input-group">
            <input class="form-control" v-model="form.code" id="input-branch-code" :disabled="loadingCode" />
            <span class="input-group-text" v-if="loadingCode"><span class="spinner-border spinner-border-sm"></span></span>
          </div>
          <div class="form-text text-muted" v-if="!editUuid"><i class="bi bi-magic me-1"></i>Kode dibuat otomatis, bisa diubah.</div>
        </div>
        <div class="col-8 mb-3"><label class="form-label small fw-semibold">Nama <span class="text-danger">*</span></label><input class="form-control" v-model="form.name" id="input-branch-name" /></div></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Alamat</label><input class="form-control" v-model="form.address" /></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Telepon</label><input class="form-control" v-model="form.phone" /></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" @click="saveBranch" data-bs-dismiss="modal" id="btn-save-branch">Simpan</button></div>
    </div></div></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as settingsApi from '@/services/settings/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'

const { success: showSuccess, error: showError, warning: showWarning } = useToast()
const { confirm } = useConfirm()
const allBranches = ref([])
const editUuid = ref(null)
const loadingCode = ref(false)
const form = ref({ code: '', name: '', address: '', phone: '' })

onMounted(async () => {
  try { const { data } = await settingsApi.getBranches(); allBranches.value = data }
  catch (e) { showError('Gagal memuat cabang') }
})

async function resetForm() {
  editUuid.value = null
  form.value = { code: '', name: '', address: '', phone: '' }
  // Auto-generate kode cabang dari server
  loadingCode.value = true
  try {
    const { data } = await settingsApi.getBranchNextCode()
    form.value.code = data.code
  } catch (e) { /* biarkan kosong jika gagal */ }
  finally { loadingCode.value = false }
}

function editBranch(b) { editUuid.value = b.uuid; form.value = { code: b.code, name: b.name, address: b.address, phone: b.phone } }

async function saveBranch() {
  try {
    if (editUuid.value) {
      await settingsApi.updateBranch(editUuid.value, form.value)
      showSuccess('Cabang berhasil diubah')
    } else {
      await settingsApi.createBranch(form.value)
      showSuccess('Cabang berhasil ditambahkan')
    }
    const { data } = await settingsApi.getBranches(); allBranches.value = data
  } catch (e) { showError(e.response?.data?.error || 'Gagal menyimpan') }
  editUuid.value = null
  form.value = { code: '', name: '', address: '', phone: '' }
}

async function deleteBranch(b) {
  const ok = await confirm({ title: 'Hapus Cabang', message: `Hapus cabang "${b.name}"?`, confirmText: 'Hapus', variant: 'danger' })
  if (!ok) return
  showWarning('Fitur hapus cabang belum tersedia di API')
}
</script>
