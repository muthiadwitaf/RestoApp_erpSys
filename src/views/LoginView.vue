<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-header">
        <i class="bi bi-display fs-1 mb-2 d-block" style="color:#fff"></i>
        <h2>Smart POS</h2>
        <p>Solusi Kasir Pintar Bisnis Anda</p>
      </div>
      <div class="login-body">
        <div v-if="isTimeout" class="alert alert-warning py-2 small">
          <i class="bi bi-clock me-1"></i>Sesi Anda telah berakhir karena tidak aktif. Silakan login kembali.
        </div>
        <div v-if="errorMsg" class="alert alert-danger py-2 small" id="login-error">
          <i class="bi bi-exclamation-triangle me-1"></i>{{ errorMsg }}
        </div>
        <form @submit.prevent="handleLogin" id="login-form">
          <div class="mb-3">
            <label class="form-label small fw-semibold">Email</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-envelope"></i></span>
              <input type="email" class="form-control" v-model="email" placeholder="Masukkan email" required id="input-email" />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label small fw-semibold">Password</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input type="password" class="form-control" v-model="password" placeholder="Masukkan password" required id="input-password" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary w-100 py-2 fw-bold" id="btn-login" style="border-radius: 8px;">
            <i class="bi bi-box-arrow-in-right me-1"></i>Masuk ke Kasir
          </button>
        </form>
        <div class="mt-3 small text-muted">
          <p class="mb-2 text-center fw-semibold">MTX Super Admins <span class="text-muted fw-normal">(password: <code>password123</code>)</span>:</p>
          <div class="d-flex flex-wrap gap-1 justify-content-center mb-2">
            <span v-for="sa in mtxSuperAdmins" :key="sa.name"
              @click="fillDemo(sa.email)" class="btn btn-outline-primary btn-sm px-2 py-1 m-1 fw-bold"
              style="cursor:pointer; font-size:0.75rem; border-radius: 12px;">
              {{ sa.name }}
            </span>
          </div>
          <div class="text-center" style="font-size:0.72rem">💡 Klik nama untuk auto-isi email & password</div>
          <div class="text-center mt-2">
            <button type="button" class="btn btn-outline-secondary btn-sm px-3" @click="showDemoModal = true" id="btn-demo-users">
              <i class="bi bi-people me-1"></i>Lihat Demo Users
            </button>
          </div>
        </div>

        <!-- Demo Users Modal -->
        <teleport to="body">
          <div v-if="showDemoModal" class="demo-modal-overlay" @click.self="showDemoModal = false">
            <div class="demo-modal-content">
              <div class="demo-modal-header">
                <h6 class="mb-0 fw-bold"><i class="bi bi-people-fill me-2"></i>Demo Users</h6>
                <button type="button" class="btn-close btn-close-white" @click="showDemoModal = false"></button>
              </div>
              <div class="demo-modal-body">
                <p class="text-muted small mb-3 text-center">Klik user untuk auto-isi form login <span class="badge bg-secondary">password: password123</span></p>
                <div v-for="group in demoUserGroups" :key="group.company" class="mb-3">
                  <div class="demo-group-header">{{ group.company }}</div>
                  <div class="list-group list-group-flush">
                    <a v-for="u in group.users" :key="u.email" href="#"
                      class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3"
                      @click.prevent="fillDemoAndClose(u.email)">
                      <div>
                        <span class="fw-semibold">{{ u.name }}</span>
                        <span class="text-muted ms-1 small">-- {{ u.role }}</span>
                      </div>
                      <code class="small text-primary">{{ u.email }}</code>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </teleport>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCompanyStore } from '@/stores/company'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const authStore = useAuthStore()
const branchStore = useBranchStore()
const companyStore = useCompanyStore()
const themeStore = useThemeStore()

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)
const showDemoModal = ref(false)
const isTimeout = ref(new URLSearchParams(window.location.search).get('timeout') === '1')

// Safety net: if we arrived here due to session timeout, force-clear any stale auth state.
// This prevents the router guard from finding leftover erp_user in localStorage and
// redirecting us back to a protected route (which would 401 again → infinite loop).
if (isTimeout.value) {
  authStore.user = null
  localStorage.removeItem('erp_access_token')
  localStorage.removeItem('erp_refresh_token')
  localStorage.removeItem('erp_user')
  localStorage.removeItem('erp_branch')
  localStorage.removeItem('erp-company')
}

const mtxSuperAdmins = [
  { name: 'Yusuf',   email: 'yusuf@mtx.web.id' },
  { name: 'Untung',  email: 'untung@mtx.web.id' },
  { name: 'Zakaria', email: 'zakaria@mtx.web.id' },
  { name: 'Gorby',   email: 'gorby@mtx.web.id' },
  { name: 'Adilson', email: 'adil@mtx.web.id' },
  { name: 'Faris',   email: 'faris@mtx.web.id' },
  { name: 'Husein',  email: 'husein@mtx.web.id' },
  { name: 'Muthiah', email: 'muthiah@mtx.web.id' },
  { name: 'Pita',    email: 'pita@mtx.web.id' },
  { name: 'Wafi',    email: 'wafi@mtx.web.id' },
  { name: 'Hamzah',  email: 'hamzah@mtx.web.id' },
  { name: 'Hanif',   email: 'hanif@mtx.web.id' },
  { name: 'Imron',   email: 'imron@mtx.web.id' },
  { name: 'Anis',    email: 'anis@mtx.web.id' },
]

const demoUserGroups = [
  {
    company: '🛒 PT Sumber Sejahtera Pangan (SSP) - Sembako',
    users: [
      { email: 'owner@ssp.co.id',   name: 'Hendra Wijaya',  role: 'Owner' },
      { email: 'admin@ssp.co.id',   name: 'Dito',           role: 'Admin IT' },
      { email: 'dir@ssp.co.id',     name: 'Dr. Suharto',    role: 'Direktur' },
      { email: 'fin.mgr@ssp.co.id', name: 'Dewi Lestari',   role: 'Finance Manager' },
      { email: 'fin@ssp.co.id',     name: 'Indah',          role: 'Finance Staff' },
      { email: 'sls.mgr@ssp.co.id', name: 'Budi',           role: 'Sales Manager' },
      { email: 'sls.sup@ssp.co.id', name: 'Eko',            role: 'Sales Supervisor' },
      { email: 'sls@ssp.co.id',     name: 'Fitri',          role: 'Sales Staff' },
      { email: 'pur.mgr@ssp.co.id', name: 'Agus',           role: 'Purchasing Manager' },
      { email: 'pur@ssp.co.id',     name: 'Rini',           role: 'Purchasing Staff' },
      { email: 'wh.mgr@ssp.co.id',  name: 'Tono',           role: 'Warehouse Manager' },
      { email: 'wh.sup@ssp.co.id',  name: 'Sita',           role: 'Warehouse Supervisor' },
      { email: 'wh@ssp.co.id',      name: 'Joko',           role: 'Warehouse Staff' },
      { email: 'kasir@ssp.co.id',   name: 'Sri',            role: 'Kasir' },
    ]
  },
  {
    company: '⚡ PT Cahaya Elektrik Nusantara (CEN) - Listrik',
    users: [
      { email: 'owner@cen.co.id',   name: 'Gunawan',        role: 'Owner' },
      { email: 'admin@cen.co.id',   name: 'Ratna',          role: 'Admin IT' },
      { email: 'dir@cen.co.id',     name: 'Dr. Hartono',    role: 'Direktur' },
      { email: 'fin.mgr@cen.co.id', name: 'Lestari',        role: 'Finance Manager' },
      { email: 'fin@cen.co.id',     name: 'Tanti',          role: 'Finance Staff' },
      { email: 'sls.mgr@cen.co.id', name: 'Haryanto',       role: 'Sales Manager' },
      { email: 'sls.sup@cen.co.id', name: 'Wahyu',          role: 'Sales Supervisor' },
      { email: 'sls@cen.co.id',     name: 'Yanti',          role: 'Sales Staff' },
      { email: 'pur.mgr@cen.co.id', name: 'Suryanto',       role: 'Purchasing Manager' },
      { email: 'pur@cen.co.id',     name: 'Bambang',        role: 'Purchasing Staff' },
      { email: 'wh.mgr@cen.co.id',  name: 'Suparno',        role: 'Warehouse Manager' },
      { email: 'wh.sup@cen.co.id',  name: 'Dian',           role: 'Warehouse Supervisor' },
      { email: 'wh@cen.co.id',      name: 'Imam',           role: 'Warehouse Staff' },
      { email: 'kasir@cen.co.id',   name: 'Mira',           role: 'Kasir' },
    ]
  },
]

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    const result = await authStore.login(email.value, password.value)
    if (!result.success) {
      errorMsg.value = result.message
      return
    }
    // Jika user punya >1 company, redirect ke company picker
    if (result.requiresCompanySelection) {
      router.push('/company-picker')
      return
    }
    // 1 company - langsung masuk dashboard
    const u = authStore.user
    companyStore.initFromAuth(u.company_uuid, u.company_name, [{ uuid: u.company_uuid, name: u.company_name }])
    branchStore.loadFromUser()
    if (branchStore.userBranches.length > 0) {
      branchStore.selectBranch(branchStore.userBranches[0].uuid)
    }
    if (authStore.user?.theme_preference) {
      themeStore.setFromUser(authStore.user.theme_preference)
    }
    router.push(getDefaultRoute(authStore))
  } finally {
    loading.value = false
  }
}

function getDefaultRoute(auth) {
  if (auth.hasPermission('pos:view')) return '/resto/pos'
  return '/forbidden'
}

function fillDemo(user) {
  email.value = user
  password.value = 'password123'
}

function fillDemoAndClose(user) {
  fillDemo(user)
  showDemoModal.value = false
}
</script>

<style scoped>
.demo-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

.demo-modal-content {
  background: var(--bs-body-bg, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 520px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.25s ease;
}

.demo-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: #1A2D3D;
  color: #fff;
}

.demo-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  max-height: calc(80vh - 55px);
}

.demo-group-header {
  font-weight: 700;
  font-size: 0.82rem;
  color: #00B4AB;
  padding: 6px 12px;
  background: #E0F7F5;
  border-radius: 6px;
  margin-bottom: 4px;
}

.demo-modal-body .list-group-item {
  font-size: 0.85rem;
  border: none;
  border-bottom: 1px solid var(--bs-border-color-translucent, #eee);
  transition: background 0.12s;
}

.demo-modal-body .list-group-item:hover {
  background: var(--bs-primary-bg-subtle, #e7f1ff);
}

.demo-modal-body .list-group-item:last-child {
  border-bottom: none;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
