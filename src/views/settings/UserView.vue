<template>
  <div>
    <div class="page-header">
      <div><h1>Manajemen User</h1><span class="breadcrumb-custom">Settings / Users</span></div>
      <button class="btn btn-primary" v-permission="'settings:create'" @click="openCreateModal" id="btn-add-user">
        <i class="bi bi-plus-lg me-1"></i>Tambah User
      </button>
    </div>

    <!-- Filters -->
    <div class="card mb-3">
      <div class="card-body py-2">
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small fw-semibold mb-1">Cari User</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input class="form-control" v-model="searchQuery" placeholder="Nama / email..." />
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold mb-1">Role</label>
            <select class="form-select form-select-sm" v-model="filterRole">
              <option value="">Semua Role</option>
              <option v-for="r in allRoles" :key="r.uuid" :value="r.name">{{ r.name }}</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold mb-1">Cabang</label>
            <select class="form-select form-select-sm" v-model="filterBranch">
              <option value="">Semua Cabang</option>
              <option v-for="b in allBranches" :key="b.uuid" :value="b.name">{{ b.name }}</option>
            </select>
          </div>
          <div class="col-md-2 text-end">
            <span class="badge bg-secondary">{{ filteredUsers.length }} user</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body p-0">
        <div class="table-wrapper">
          <table class="table table-hover mb-0" id="user-table">
            <thead><tr><th>Nama</th><th>Email</th><th>Roles</th><th>Cabang</th><th>Karyawan</th><th>Status</th><th v-permission="'settings:edit'">Aksi</th></tr></thead>
            <tbody>
              <tr v-for="u in filteredUsers" :key="u.uuid || u.id">
                <td class="fw-semibold">{{ u.name }}</td>
                <td class="text-muted small">{{ u.email }}</td>
                <td><span class="badge bg-primary me-1" v-for="r in (u.roles || [])" :key="r.name">{{ r.name }}</span></td>
                <td>
                  <span class="badge bg-info me-1" v-for="b in (u.branches || [])" :key="b.uuid">{{ b.name }}</span>
                  <span v-if="!(u.branches || []).length" class="text-muted small">Belum assign</span>
                </td>
                <td>
                  <span v-if="u.employee_uuid" class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" :title="u.employee_jabatan || ''">
                    <i class="bi bi-person-badge me-1"></i>{{ u.employee_nik }}
                  </span>
                  <span v-else class="text-muted small">-</span>
                </td>
                <td><span class="badge" :class="u.is_active !== false ? 'bg-success' : 'bg-secondary'">{{ u.is_active !== false ? 'Aktif' : 'Nonaktif' }}</span></td>
                <td v-permission="'settings:edit'">
                  <button class="btn btn-sm btn-outline-primary me-1" @click="editUser(u)" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" v-permission="'settings:delete'" @click="deleteUser(u)" title="Hapus"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Add/Edit -->
    <Teleport to="body">
      <div v-if="showModal" class="modal fade show d-block" tabindex="-1" style="z-index:1060;">
        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content border-0 shadow-lg overflow-hidden">

            <!-- ===== HEADER ===== -->
            <div class="modal-header border-0 text-white pt-4 pb-3 px-4"
                 :style="editingUuid ? 'background:linear-gradient(135deg,#1e3a5f,#2563eb)' : 'background:linear-gradient(135deg,#14532d,#16a34a)'">
              <div class="d-flex align-items-center gap-3 flex-grow-1">
                <!-- Avatar inisial -->
                <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
                     style="width:48px;height:48px;background:rgba(255,255,255,0.18);font-size:18px;">
                  {{ (form.name || '?').charAt(0).toUpperCase() }}
                </div>
                <div>
                  <h5 class="modal-title mb-0 fw-bold">
                    {{ editingUuid ? 'Edit User' : 'Tambah User Baru' }}
                  </h5>
                  <div class="small opacity-75 mt-1" v-if="editingUuid">{{ form.email }}</div>
                  <div class="small opacity-75 mt-1" v-else>Buat akun login baru untuk anggota tim</div>
                </div>
              </div>
              <button type="button" class="btn-close btn-close-white ms-3" @click="closeModal"></button>
            </div>

            <!-- Banner: linked ke karyawan -->
            <div v-if="editingUuid && form.linkedEmployeeNik"
                 class="d-flex align-items-center gap-2 px-4 py-2"
                 style="background:#fff7ed;border-bottom:1px solid #fed7aa;">
              <i class="bi bi-person-badge-fill text-warning"></i>
              <span class="small">
                Akun ini terhubung ke karyawan <strong>{{ form.linkedEmployeeName || form.linkedEmployeeNik }}</strong>
                (NIK: {{ form.linkedEmployeeNik }}).
                Nama dikelola dari
                <strong>HR / Master Karyawan</strong>.
              </span>
            </div>

            <!-- ===== BODY ===== -->
            <div class="modal-body px-4 py-3">

              <!-- --- Nama Lengkap --- -->
              <div class="mb-3">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">Nama Lengkap</label>
                <!-- Edit mode: readonly, dikelola HR -->
                <div v-if="editingUuid" class="d-flex align-items-center gap-2">
                  <input type="text" class="form-control bg-light"
                         :value="form.name" readonly
                         id="input-user-name" />
                  <span v-if="form.linkedEmployeeNik"
                        class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle text-nowrap">
                    <i class="bi bi-lock-fill me-1"></i>Dikelola HR
                  </span>
                </div>
                <!-- Create mode: editable -->
                <input v-else
                  type="text" class="form-control" v-model="form.name"
                  placeholder="Contoh: Budi Santoso"
                  id="input-user-name-new"
                  :class="{ 'is-invalid': touched.name && !form.name.trim() }"
                  @blur="touched.name = true"
                />
                <div class="invalid-feedback" v-if="!editingUuid && touched.name && !form.name.trim()">Nama lengkap wajib diisi.</div>
                <div class="form-text d-flex align-items-center gap-1 mt-1" v-if="!editingUuid">
                  <i class="bi bi-info-circle text-primary"></i>
                  <span>Tampil di audit trail setiap transaksi.</span>
                </div>
              </div>

              <!-- --- Email --- -->
              <div class="mb-3">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">Email Login</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-envelope"></i></span>
                  <input
                    type="email" class="form-control" v-model="form.email"
                    placeholder="email@perusahaan.com"
                    id="input-user-email"
                    :disabled="!!editingUuid"
                    :class="{ 'is-invalid': touched.email && !form.email.trim() }"
                    @blur="touched.email = true"
                  />
                </div>
                <div class="invalid-feedback d-block" v-if="touched.email && !form.email.trim()">Email wajib diisi.</div>
                <div class="form-text text-muted" v-if="!editingUuid">
                  <i class="bi bi-lock me-1"></i>Tidak bisa diubah setelah disimpan.
                </div>
              </div>

              <!-- --- Password --- -->
              <div class="mb-3">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">
                  Password
                  <span v-if="!editingUuid" class="text-danger">*</span>
                  <span v-else class="text-muted fw-normal text-lowercase" style="font-size:11px;"> -- kosongkan jika tidak diubah</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-key"></i></span>
                  <input type="password" class="form-control" v-model="form.password"
                         placeholder="Min. 6 karakter"
                         :class="{ 'is-invalid': form.password && form.password.length < 6 }">
                </div>
                <div class="invalid-feedback d-block" v-if="form.password && form.password.length < 6">Password minimal 6 karakter.</div>
              </div>

              <!-- --- Konfirmasi Password (conditional) --- -->
              <div class="mb-3" v-if="form.password">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">Konfirmasi Password <span class="text-danger">*</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-key-fill"></i></span>
                  <input type="password" class="form-control" v-model="form.confirmPassword"
                         placeholder="Ulangi password"
                         :class="{ 'is-invalid': form.confirmPassword && form.password !== form.confirmPassword }">
                </div>
                <div class="invalid-feedback d-block" v-if="form.confirmPassword && form.password !== form.confirmPassword">Password tidak cocok.</div>
              </div>

              <hr class="my-3" />

              <!-- --- Role (pill chip selector) --- -->
              <div class="mb-3">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">Role <span class="text-danger">*</span></label>
                <div class="d-flex flex-wrap gap-2">
                  <label
                    v-for="role in allRoles" :key="role.uuid"
                    class="role-chip"
                    :class="{ active: form.role_id === role.uuid }"
                  >
                    <input type="radio" :value="role.uuid" v-model="form.role_id" name="userRole" class="d-none" />
                    <i class="bi bi-shield-check me-1"></i>{{ role.name }}
                  </label>
                </div>
                <div class="form-text text-muted mt-1" v-if="!form.role_id">Pilih 1 role untuk user ini.</div>
              </div>

              <!-- --- Cabang (checkbox cards) --- -->
              <div class="mb-1">
                <label class="form-label fw-semibold small text-uppercase text-muted ls-1">Cabang <span class="text-danger">*</span></label>
                <div class="d-flex flex-wrap gap-2">
                  <label
                    v-for="branch in allBranches" :key="branch.uuid"
                    class="branch-chip"
                    :class="{ active: form.branch_ids.includes(branch.uuid) }"
                  >
                    <input type="checkbox" :value="branch.uuid" v-model="form.branch_ids" class="d-none" />
                    <i class="bi me-1" :class="form.branch_ids.includes(branch.uuid) ? 'bi-building-check' : 'bi-building'"></i>
                    {{ branch.name }}
                  </label>
                </div>
                <div class="form-text text-muted mt-1" v-if="!form.branch_ids.length">Pilih minimal 1 cabang.</div>
              </div>

            </div>

            <!-- ===== FOOTER ===== -->
            <div class="modal-footer border-0 px-4 pb-4 pt-0 gap-2">
              <!-- Blocked reason hint -->
              <span v-if="!canSave && saveBlockedReason" class="text-danger small me-auto">
                <i class="bi bi-exclamation-circle me-1"></i>{{ saveBlockedReason }}
              </span>
              <button class="btn btn-light border" @click="closeModal">Batal</button>
              <button class="btn fw-semibold px-4" @click="saveUser" :disabled="!canSave"
                      :class="editingUuid ? 'btn-primary' : 'btn-success'">
                <i class="bi bi-check-lg me-1"></i>{{ editingUuid ? 'Simpan Perubahan' : 'Tambah User' }}
              </button>
            </div>

          </div>
        </div>
      </div>
      <div v-if="showModal" class="modal-backdrop fade show" style="z-index:1055;" @click="closeModal"></div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import * as settingsApi from '@/services/settings/api'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'

const { success: showSuccess, error: showError } = useToast()
const { confirm } = useConfirm()
const loading = ref(false)
const allUsers = ref([])
const allRoles = ref([])
const allBranches = ref([])
const searchQuery = ref('')
const filterRole = ref('')
const filterBranch = ref('')

const filteredUsers = computed(() => {
  let list = allUsers.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
  }
  if (filterRole.value) {
    list = list.filter(u => (u.roles || []).some(r => r.name === filterRole.value))
  }
  if (filterBranch.value) {
    list = list.filter(u => (u.branches || []).some(b => b.name === filterBranch.value))
  }
  return list
})

onMounted(async () => {
  loading.value = true
  try {
    const [usersRes, rolesRes, branchesRes] = await Promise.all([
      settingsApi.getUsers(), settingsApi.getRoles(), settingsApi.getBranches()
    ])
    allUsers.value = usersRes.data
    allRoles.value = rolesRes.data
    allBranches.value = branchesRes.data
  } catch (e) { showError('Gagal memuat data') }
  loading.value = false
})

const showModal = ref(false)
const editingUuid = ref(null)
const form = reactive({ name: '', email: '', password: '', confirmPassword: '', role_id: null, branch_ids: [], linkedEmployeeNik: null, linkedEmployeeName: null })
const touched = reactive({ name: false, email: false })

const canSave = computed(() => {
  if (!form.name.trim() || !form.email.trim()) return false
  if (!editingUuid.value && !form.password.trim()) return false
  if (form.password && form.password.length < 6) return false
  if (form.password && form.password !== form.confirmPassword) return false
  if (!form.role_id) return false
  if (!form.branch_ids.length) return false
  return true
})

const saveBlockedReason = computed(() => {
  if (!form.name.trim()) return 'Nama Lengkap wajib diisi'
  if (!form.email.trim()) return 'Email wajib diisi'
  if (!editingUuid.value && !form.password.trim()) return 'Password wajib diisi untuk user baru'
  if (form.password && form.password.length < 6) return 'Password minimal 6 karakter'
  if (form.password && form.password !== form.confirmPassword) return 'Konfirmasi password tidak cocok'
  if (!form.role_id) return 'Role belum dipilih'
  if (!form.branch_ids.length) return 'Cabang belum dipilih'
  return ''
})

function resetForm() {
  form.name = ''; form.email = ''; form.password = ''; form.confirmPassword = ''; form.role_id = null; form.branch_ids = []; form.linkedEmployeeNik = null; form.linkedEmployeeName = null
  touched.name = false; touched.email = false
}
function openCreateModal() { editingUuid.value = null; resetForm(); showModal.value = true }
function editUser(u) {
  editingUuid.value = u.uuid
  form.name = u.name; form.email = u.email
  form.password = ''; form.confirmPassword = ''
  form.linkedEmployeeNik = u.employee_uuid ? (u.employee_nik || u.employee_uuid) : null
  form.linkedEmployeeName = u.employee_uuid ? (u.employee_name || null) : null
  const firstRole = (u.roles || [])[0]
  form.role_id = firstRole ? (allRoles.value.find(r => r.name === firstRole.name)?.uuid || null) : null
  form.branch_ids = (u.branches || []).map(b => allBranches.value.find(x => x.name === b.name)?.uuid).filter(Boolean)
  showModal.value = true
}
function closeModal() { showModal.value = false; editingUuid.value = null }

async function saveUser() {
  if (!canSave.value) return
  const isLinked = editingUuid.value && !!form.linkedEmployeeNik
  const body = {
    roleIds: form.role_id ? [form.role_id] : [],
    branchIds: [...form.branch_ids]
  }
  // Hanya sertakan name & email jika bukan edit user yang linked ke karyawan
  if (!isLinked) {
    body.name = form.name.trim()
    body.email = form.email.trim()
  }
  if (form.password.trim()) body.password = form.password.trim()
  try {
    if (editingUuid.value) { await settingsApi.updateUser(editingUuid.value, body); showSuccess('User berhasil diubah') }
    else { await settingsApi.createUser(body); showSuccess('User berhasil ditambahkan') }
    const { data } = await settingsApi.getUsers(); allUsers.value = data; closeModal()
  } catch (e) { showError(e.response?.data?.error || 'Gagal menyimpan') }
}

async function deleteUser(u) {
  const ok = await confirm({ title: 'Hapus User', message: `Hapus user "${u.name}" (${u.email})?`, confirmText: 'Hapus', variant: 'danger' })
  if (!ok) return
  try { await settingsApi.deleteUser(u.uuid); allUsers.value = allUsers.value.filter(x => x.uuid !== u.uuid); showSuccess('User dihapus') }
  catch (e) { showError('Gagal menghapus') }
}
</script>

<style scoped>
.role-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1.5px solid #dee2e6;
  background: #f8f9fa;
  color: #495057;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.role-chip:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}
.role-chip.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.branch-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1.5px solid #dee2e6;
  background: #f8f9fa;
  color: #495057;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.branch-chip:hover {
  border-color: #0891b2;
  color: #0891b2;
  background: #ecfeff;
}
.branch-chip.active {
  background: #ecfeff;
  border-color: #0891b2;
  color: #0e7490;
  font-weight: 600;
}

.ls-1 { letter-spacing: 0.04em; }
</style>
