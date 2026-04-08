<template>
  <div>
    <div class="page-header">
      <div><h1>Manajemen Role</h1><span class="breadcrumb-custom">Settings / Roles</span></div>
      <button class="btn btn-primary" v-permission="'settings:create'" data-bs-toggle="modal" data-bs-target="#roleModal" @click="resetForm" id="btn-add-role"><i class="bi bi-plus-lg me-1"></i>Tambah Role</button>
    </div>
    <div class="row g-3">
      <div class="col-md-6 col-lg-4" v-for="r in allRoles" :key="r.uuid">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="fw-bold"><i class="bi bi-shield-lock me-2 text-primary"></i>{{ r.name }}</h6>
            <p class="small text-muted mb-2">{{ r.description }}</p>
            <div class="mb-2"><span class="badge bg-light text-dark me-1 mb-1" v-for="p in (r.permissions || [])" :key="p">{{ p }}</span></div>
          </div>
          <div class="card-footer bg-transparent" v-permission="'settings:edit'">
            <button class="btn btn-sm btn-outline-primary me-1" @click="editRole(r)" data-bs-toggle="modal" data-bs-target="#roleModal"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" v-permission="'settings:delete'" @click="deleteRole(r)" v-if="r.name !== 'Admin'"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="roleModal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">{{ editId ? 'Edit' : 'Tambah' }} Role</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="mb-3"><label class="form-label small fw-semibold">Nama Role</label><input class="form-control" v-model="form.name" id="input-role-name" /></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Deskripsi</label><input class="form-control" v-model="form.description" /></div>
        <h6>Permissions</h6>
        <div class="row">
          <div class="col-md-4" v-for="mod in permModules" :key="mod">
            <h6 class="small fw-bold text-uppercase text-muted mt-2">{{ mod }}</h6>
            <div class="form-check" v-for="p in permsByModule(mod)" :key="p">
              <input class="form-check-input" type="checkbox" :value="p" :id="'perm-'+p" v-model="form.permissions" />
              <label class="form-check-label small" :for="'perm-'+p">{{ p }}</label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" @click="saveRole" :disabled="saving" id="btn-save-role"><span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>Simpan</button></div>
    </div></div></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Modal } from 'bootstrap'
import * as settingsApi from '@/services/settings/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
const { success: showSuccess, error: showError } = useToast()
const { confirm } = useConfirm()
const allRoles = ref([])
const allPermissions = ref([])
const editId = ref(null)
const saving = ref(false)
const form = ref({ name: '', description: '', permissions: [] })

onMounted(async () => {
  try {
    const [rolesRes, permsRes] = await Promise.all([settingsApi.getRoles(), settingsApi.getPermissions()])
    allRoles.value = rolesRes.data
    allPermissions.value = permsRes.data.map(p => p.name)
  } catch (e) { showError('Gagal memuat data') }
})

const permModules = computed(() => [...new Set(allPermissions.value.map(p => p.split(':')[0]))])
function permsByModule(mod) { return allPermissions.value.filter(p => p.startsWith(mod + ':')) }
function resetForm() { editId.value = null; form.value = { name: '', description: '', permissions: [] } }
function editRole(r) {
  editId.value = r.uuid
  form.value = { name: r.name, description: r.description, permissions: [...(r.permissions || [])] }
}

async function saveRole() {
  if (!form.value.name.trim()) return showError('Nama role wajib diisi')
  saving.value = true
  try {
    if (editId.value) {
      await settingsApi.updateRolePermissions(editId.value, form.value.permissions)
      showSuccess('Role berhasil diubah')
    } else {
      await settingsApi.createRole({
        name: form.value.name.trim(),
        description: form.value.description.trim(),
        permissions: form.value.permissions,
      })
      showSuccess('Role berhasil dibuat')
    }
    const { data } = await settingsApi.getRoles()
    allRoles.value = data
    // Tutup modal setelah sukses
    await nextTick()
    const modalEl = document.getElementById('roleModal')
    if (modalEl) Modal.getInstance(modalEl)?.hide()
    resetForm()
  } catch (e) {
    const msg = e?.response?.data?.error || 'Gagal menyimpan role'
    showError(msg)
  } finally {
    saving.value = false
  }
}

async function deleteRole(r) {
  const ok = await confirm({ title: 'Hapus Role', message: `Hapus role "${r.name}"?`, confirmText: 'Hapus', variant: 'danger' })
  if (!ok) return
  allRoles.value = allRoles.value.filter(x => x.uuid !== r.uuid)
}
</script>
