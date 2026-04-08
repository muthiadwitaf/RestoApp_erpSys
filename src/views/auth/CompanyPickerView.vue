<template>
  <div class="company-picker-wrapper">
    <div class="picker-card">
      <!-- Header -->
      <div class="picker-header">
        <div class="picker-brand">
          <div class="brand-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="2" y="14" width="14" height="24" rx="2" fill="#4f46e5"/>
              <rect x="6" y="18" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="6" y="24" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="6" y="30" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="11" y="18" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="11" y="24" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="11" y="30" width="3" height="3" rx="0.5" fill="white"/>
              <rect x="20" y="6" width="18" height="32" rx="2" fill="#7c3aed"/>
              <rect x="24" y="10" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="24" y="16" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="24" y="22" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="24" y="28" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="30" y="10" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="30" y="16" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="30" y="22" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="30" y="28" width="4" height="3" rx="0.5" fill="white"/>
              <rect x="26" y="32" width="6" height="6" rx="1" fill="#c4b5fd"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-erp">ERP</span>
            <span class="brand-system">System</span>
          </div>
        </div>
        <div class="picker-title">Pilih Perusahaan</div>
      </div>

      <!-- Tabs -->
      <div class="picker-tabs">
        <button class="picker-tab" :class="{ active: activeTab === 'companies' }" @click="activeTab = 'companies'">
          <svg class="tab-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H1a1 1 0 01-1-1V2zm2 1v3h3V3H2zm7-1a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V2zm2 1v3h3V3h-3zM0 9a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H1a1 1 0 01-1-1V9zm2 1v3h3v-3H2zm7-1a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V9zm2 1v3h3v-3h-3z"/>
          </svg>
          Pilih Perusahaan
        </button>
        <button v-if="isSuperAdmin" class="picker-tab tab-platform" :class="{ active: activeTab === 'platform' }" @click="activeTab = 'platform'">
          <svg class="tab-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0l6.61 3h.89a.5.5 0 01.5.5v2a.5.5 0 01-.5.5H.5a.5.5 0 01-.5-.5v-2A.5.5 0 01.5 3h.89L8 0zM8 1.28L3.06 3.5h9.88L8 1.28zM0 8.5v-.91l.5-.2h15l.5.2v.91l-.5.2H.5l-.5-.2z"/>
            <path d="M2 7v8h1V7H2zm4 0v8h1V7H6zm4 0v8h1V7h-1zm4 0v8h1V7h-1z"/>
          </svg>
          Platform Admin
          <span v-if="isSuperAdmin" class="tab-badge-admin">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="#7c3aed"><path d="M5.338 1.59a61 61 0 00-2.837.856.48.48 0 00-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.7 10.7 0 002.287 2.233c.346.244.652.42.893.533q.18.085.293.118a1 1 0 00.328 0q.114-.034.293-.118a4 4 0 00.893-.533 10.7 10.7 0 002.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 00-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 011.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 01-2.517 2.453 7 7 0 01-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 01-1.048-.625 11.8 11.8 0 01-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 012.185 1.43 63 63 0 015.072.56z"/></svg>
          </span>
        </button>
      </div>

      <!-- Tab: Pilih Perusahaan -->
      <div v-if="activeTab === 'companies'" class="tab-content">
        <!-- Search -->
        <div class="picker-search">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#94a3b8" stroke-width="2">
            <circle cx="8" cy="8" r="6"/>
            <line x1="12.5" y1="12.5" x2="16" y2="16"/>
          </svg>
          <input type="text" v-model="searchQuery" placeholder="Cari perusahaan..." class="picker-search-input">
          <button v-if="searchQuery" class="picker-search-clear" @click="searchQuery = ''">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <!-- Company Grid -->
        <div class="company-grid" :class="{ scrollable: companies.length > 6 }">
          <button
            v-for="company in filteredCompanies"
            :key="company.uuid"
            class="company-card"
            :class="{ selected: selectedUuid === company.uuid }"
            @click="select(company.uuid)"
            :disabled="loading"
          >
            <!-- Loading overlay -->
            <div v-if="loading && selectedUuid === company.uuid" class="card-loading-overlay">
              <div class="card-spinner"></div>
            </div>
            <!-- Card Top: icon + name -->
            <div class="card-top">
              <div class="card-icon">
                <i class="bi bi-buildings-fill"></i>
              </div>
              <div class="card-info">
                <div class="card-company-name">{{ company.name }}</div>
                <!-- Short Name (sub text) -->
                <div class="card-company-short">{{ company.short_name || company.code }}</div>
              </div>
            </div>
            <!-- Badges -->
            <div class="card-badges">
              <span class="card-badge">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="#6366f1"><path d="M6 2a.5.5 0 01.47.33L10 12.036l1.53-4.597A.5.5 0 0112 7h3.5a.5.5 0 010 1h-3.15l-1.88 5.64a.5.5 0 01-.94 0L6 3.964 4.47 8.56A.5.5 0 014 9H.5a.5.5 0 010-1h3.15l1.88-5.64A.5.5 0 016 2z"/></svg>
                {{ company.branch_count || 0 }} Cabang
              </span>
              <span class="card-badge">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="#6366f1"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 017 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 01-.014.002H7.022zM11 7a2 2 0 100-4 2 2 0 000 4zm3-2a3 3 0 11-6 0 3 3 0 016 0zM6.936 9.28a5.88 5.88 0 00-1.23-.247A7.35 7.35 0 005 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 015 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816zM4.92 10A5.493 5.493 0 004 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 116 0 3 3 0 01-6 0zm3-2a2 2 0 100 4 2 2 0 000-4z"/></svg>
                {{ company.user_count || 0 }} User
              </span>
            </div>
          </button>
        </div>

        <div v-if="filteredCompanies.length === 0 && searchQuery" class="picker-empty">
          <i class="bi bi-search"></i>
          <span>Tidak ditemukan "{{ searchQuery }}"</span>
        </div>

        <div class="picker-count" v-if="companies.length > 3">
          {{ filteredCompanies.length }} dari {{ companies.length }} perusahaan
        </div>
      </div>

      <!-- Tab: Platform Admin -->
      <div v-if="activeTab === 'platform'" class="tab-content">
        <p class="picker-subtitle">Kelola seluruh platform multi-company dari sini.</p>
        <div class="platform-actions">
          <button class="platform-action-card" @click="goToCompanyManagement" :disabled="loading">
            <div class="pa-icon companies-icon">
              <i class="bi bi-buildings"></i>
            </div>
            <div class="pa-body">
              <div class="pa-title">Kelola Company</div>
              <div class="pa-desc">CRUD company, cabang, aktif/nonaktif</div>
            </div>
            <div class="pa-arrow">
              <i v-if="loading && platformTarget === 'companies'" class="bi bi-arrow-repeat spin"></i>
              <i v-else class="bi bi-arrow-right"></i>
            </div>
          </button>
          <button class="platform-action-card" @click="goToCrossReport" :disabled="loading">
            <div class="pa-icon reports-icon">
              <i class="bi bi-graph-up-arrow"></i>
            </div>
            <div class="pa-body">
              <div class="pa-title">Laporan Lintas Company</div>
              <div class="pa-desc">Revenue comparison, chart, ringkasan cross-company</div>
            </div>
            <div class="pa-arrow">
              <i v-if="loading && platformTarget === 'report'" class="bi bi-arrow-repeat spin"></i>
              <i v-else class="bi bi-arrow-right"></i>
            </div>
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="picker-error">
        <i class="bi bi-exclamation-triangle me-2"></i>{{ error }}
      </div>

      <!-- Footer -->
      <div class="picker-footer">
        <button class="picker-footer-btn" @click="logout">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#6366f1" style="margin-right:6px;">
            <path fill-rule="evenodd" d="M10 12.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 2h-8A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2z"/>
            <path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/>
          </svg>
          Kembali ke Login
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCompanyStore } from '@/stores/company'
import { useBranchStore } from '@/stores/branch'
import axios from 'axios'

const router = useRouter()
const authStore = useAuthStore()
const companyStore = useCompanyStore()
const branchStore = useBranchStore()

const companies = ref(authStore.pendingCompanies || [])
const tempToken = ref(authStore.tempToken || null)
const selectedUuid = ref(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref('companies')
const searchQuery = ref('')
const platformTarget = ref(null)
const isSuperAdmin = computed(() => authStore.pendingSuperAdmin || authStore.user?.is_super_admin || false)

const filteredCompanies = computed(() => {
  if (!searchQuery.value) return companies.value
  const q = searchQuery.value.toLowerCase()
  return companies.value.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.short_name && c.short_name.toLowerCase().includes(q)) ||
    c.code.toLowerCase().includes(q)
  )
})

async function goToPlatformPage(targetRoute, target) {
  if (loading.value) return
  loading.value = true
  platformTarget.value = target
  error.value = ''
  try {
    const firstCompany = companies.value[0]
    if (!firstCompany) throw new Error('Tidak ada company tersedia')
    const res = await axios.post('/api/settings/auth/select-company', {
      temp_token: tempToken.value,
      company_uuid: firstCompany.uuid,
    })
    localStorage.setItem('erp_access_token', res.data.accessToken)
    localStorage.setItem('erp_refresh_token', res.data.refreshToken)
    const userData = res.data.user
    authStore.setUser(userData, res.data.accessToken)
    companyStore.initFromAuth(firstCompany.uuid, userData.company_name, companies.value)
    branchStore.loadFromUser()
    if (branchStore.userBranches.length > 0) branchStore.selectBranch(branchStore.userBranches[0].uuid)
    // Don't clear pending — keep companies for "Kembali" navigation
    window.location.href = targetRoute
  } catch (e) {
    console.error('[Platform] auth error:', e.response?.data || e.message)
    error.value = 'Gagal mengautentikasi. Coba lagi.'
    loading.value = false
    platformTarget.value = null
  }
}
function goToCompanyManagement() { goToPlatformPage('/platform/companies', 'companies') }
function goToCrossReport() { goToPlatformPage('/platform/cross-report', 'report') }

async function select(uuid) {
  if (loading.value) return
  selectedUuid.value = uuid
  loading.value = true
  error.value = ''
  try {
    const res = await axios.post('/api/settings/auth/select-company', {
      temp_token: tempToken.value,
      company_uuid: uuid,
    })
    localStorage.setItem('erp_access_token', res.data.accessToken)
    localStorage.setItem('erp_refresh_token', res.data.refreshToken)
    const userData = res.data.user
    authStore.setUser(userData, res.data.accessToken)
    companyStore.initFromAuth(uuid, userData.company_name, companies.value)
    branchStore.loadFromUser()
    if (branchStore.userBranches.length > 0) {
      branchStore.selectBranch(branchStore.userBranches[0].uuid)
    }
    authStore.clearPending()
    router.push(getDefaultRoute(authStore))
  } catch (e) {
    console.error('[CompanyPicker] select error:', e.response?.data || e.message)
    error.value = e.response?.data?.error || 'Gagal masuk ke perusahaan ini.'
    loading.value = false
    selectedUuid.value = null
  }
}

function getDefaultRoute(auth) {
  if (auth.hasPermission('pos:view') && !auth.hasPermission('sales:view') && !auth.hasPermission('settings:edit')) return '/sales/pos'
  if (auth.hasPermission('dashboard:view')) return '/'
  if (auth.hasPermission('pos:view')) return '/sales/pos'
  if (auth.hasPermission('sales:view')) return '/sales/orders'
  if (auth.hasPermission('purchasing:view')) return '/purchasing/orders'
  if (auth.hasPermission('inventory:manage')) return '/inventory/items'
  if (auth.hasPermission('accounting:view')) return '/accounting/coa'
  return '/'
}

async function logout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

.company-picker-wrapper {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, #1a1048 0%, #2d1b69 30%, #312e81 55%, #1e3a8a 100%);
  padding: 2rem;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
.picker-card {
  background: white; border-radius: 24px;
  padding: 2.25rem 2.25rem 1.5rem; width: 100%; max-width: 780px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1);
  overflow-x: hidden;
}

/* ========== HEADER ========== */
.picker-header {
  display: flex; align-items: center; gap: 1.25rem;
  margin-bottom: 1.5rem; padding-bottom: 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}
.picker-brand { display: flex; align-items: center; gap: 0.6rem; }
.brand-logo { flex-shrink: 0; }
.brand-text { display: flex; flex-direction: column; line-height: 1; }
.brand-erp {
  font-size: 1.75rem; font-weight: 900; color: #1e1b4b;
  letter-spacing: -0.5px;
}
.brand-system { font-size: 0.7rem; font-weight: 700; color: #6366f1; letter-spacing: 1px; text-transform: uppercase; }
.picker-title {
  font-size: 1.4rem; font-weight: 800; color: #334155;
  margin-left: auto; letter-spacing: -0.3px;
}

/* ========== TABS ========== */
.picker-tabs {
  display: flex; gap: 0; border-bottom: 2.5px solid #e2e8f0;
  margin-bottom: 1.5rem;
}
.picker-tab {
  flex: 1; padding: 0.75rem 1rem; border: none;
  background: transparent; font-size: 0.9rem; font-weight: 700;
  color: #94a3b8; cursor: pointer; transition: all 0.25s;
  display: flex; align-items: center; justify-content: center; gap: 0.45rem;
  border-bottom: 3px solid transparent; margin-bottom: -2.5px;
  font-family: inherit;
}
.picker-tab:hover { color: #475569; }
.picker-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
.picker-tab.tab-platform.active { color: #7c3aed; border-bottom-color: #7c3aed; }
.tab-icon { flex-shrink: 0; }
.tab-badge-admin { display: inline-flex; margin-left: 0.25rem; }

/* ========== SEARCH ========== */
.picker-search {
  display: flex; align-items: center; gap: 0.65rem;
  background: #f8fafc; border: 2px solid #e2e8f0;
  border-radius: 14px; padding: 0.7rem 1.1rem;
  margin-bottom: 1.25rem; transition: all 0.3s;
}
.picker-search:focus-within { border-color: #818cf8; background: #fff; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }
.search-icon { flex-shrink: 0; }
.picker-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.95rem; color: #1e293b; font-family: inherit; font-weight: 500;
}
.picker-search-input::placeholder { color: #b0bec5; font-weight: 400; }
.picker-search-clear {
  border: none; background: #f1f5f9; color: #94a3b8; cursor: pointer;
  padding: 0.15rem 0.4rem; border-radius: 6px; font-size: 0.7rem;
  transition: all 0.2s;
}
.picker-search-clear:hover { color: #ef4444; background: #fee2e2; }

/* ========== COMPANY GRID ========== */
.company-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;
  margin-bottom: 1rem;
  max-height: 420px; overflow-y: auto; overflow-x: hidden;
  padding-right: 0.2rem;
}
.company-grid::-webkit-scrollbar { width: 5px; }
.company-grid::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 5px; }
.company-grid::-webkit-scrollbar-track { background: transparent; }
/* .scrollable class masih ada untuk backward compat, tapi sudah tidak diperlukan */
.company-grid.scrollable { max-height: 420px; overflow-y: auto; padding-right: 0.35rem; }

/* ========== COMPANY CARD (premium, matches mockup) ========== */
.company-card {
  position: relative;
  display: flex; flex-direction: column; text-align: left;
  padding: 1.15rem 1.2rem; border: 2px solid #e8e5f5;
  border-radius: 16px; background: white; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
  width: 100%;
  box-shadow: 0 2px 8px rgba(99,102,241,0.06), 0 1px 3px rgba(0,0,0,0.04);
  font-family: inherit;
}
.company-card:hover {
  border-color: #a78bfa;
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(99,102,241,0.18), 0 4px 12px rgba(0,0,0,0.06);
}
.company-card:active { transform: translateY(-1px); }
.company-card.selected {
  border-color: #6366f1; background: #f5f3ff;
  box-shadow: 0 8px 24px rgba(99,102,241,0.2);
}
.company-card:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

/* Card loading overlay */
.card-loading-overlay {
  position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center;
  background: rgba(255,255,255,0.85); border-radius: 14px; z-index: 2;
}
.card-spinner {
  width: 24px; height: 24px; border: 3px solid #e0e7ff;
  border-top-color: #6366f1; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Card top row: icon + info */
.card-top {
  display: flex; align-items: flex-start; gap: 0.85rem; margin-bottom: 0.65rem;
}
.card-icon {
  width: 44px; height: 44px; flex-shrink: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.3rem; color: #fff;
  box-shadow: 0 4px 10px rgba(99,102,241,0.25);
}
.company-card:hover .card-icon {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  box-shadow: 0 6px 16px rgba(99,102,241,0.4);
}
.card-info { flex: 1; min-width: 0; }

/* Company Name — BIG Main Text */
.card-company-name {
  font-size: 0.95rem; font-weight: 800; color: #1e1b4b;
  line-height: 1.25; margin-bottom: 0.2rem;
  letter-spacing: -0.2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Short Name — Sub Text */
.card-company-short {
  font-size: 0.82rem; font-weight: 700; color: #6366f1;
  letter-spacing: 0.5px; margin-bottom: 0.5rem;
  font-family: 'Inter', monospace;
}

/* Badges */
.card-badges { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.card-badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.72rem; color: #6366f1; font-weight: 700;
  background: #eef2ff; padding: 0.25rem 0.55rem;
  border-radius: 8px; letter-spacing: 0.1px;
}
.card-badge svg { flex-shrink: 0; }

/* ========== SUBTITLE ========== */
.picker-subtitle { color: #94a3b8; font-size: 0.88rem; margin: 0 0 1rem; font-weight: 500; }

/* ========== EMPTY & COUNT ========== */
.picker-empty {
  text-align: center; color: #94a3b8; padding: 2.5rem 1rem;
  font-size: 0.88rem; display: flex; flex-direction: column;
  align-items: center; gap: 0.5rem;
}
.picker-empty i { font-size: 1.8rem; color: #c7d2fe; }
.picker-count { text-align: right; font-size: 0.72rem; color: #94a3b8; font-weight: 500; margin-bottom: 0.5rem; }

/* ========== PLATFORM ADMIN ========== */
.platform-actions { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }
.platform-action-card {
  display: flex; align-items: center; gap: 1rem;
  padding: 1.1rem 1.25rem; border: 2px solid #e0e7ff;
  border-radius: 16px; background: linear-gradient(135deg, #fefefe 0%, #f8f5ff 100%);
  cursor: pointer; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
  text-align: left; width: 100%; font-family: inherit;
  box-shadow: 0 2px 8px rgba(99,102,241,0.06);
}
.platform-action-card:hover {
  border-color: #818cf8; transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(99,102,241,0.15);
}
.platform-action-card:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.pa-icon {
  width: 48px; height: 48px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.3rem; color: #fff; flex-shrink: 0;
}
.companies-icon { background: linear-gradient(135deg, #6366f1, #818cf8); }
.reports-icon { background: linear-gradient(135deg, #10b981, #34d399); }
.pa-body { flex: 1; }
.pa-title { font-weight: 800; color: #1e293b; font-size: 0.95rem; letter-spacing: -0.2px; }
.pa-desc { font-size: 0.78rem; color: #94a3b8; margin-top: 0.2rem; font-weight: 500; }
.pa-arrow { color: #a5b4fc; font-size: 1.1rem; flex-shrink: 0; transition: transform 0.2s; }
.platform-action-card:hover .pa-arrow { transform: translateX(3px); color: #6366f1; }

/* ========== ERROR ========== */
.picker-error {
  background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 12px;
  padding: 0.75rem 1rem; color: #dc2626; font-size: 0.85rem;
  margin-bottom: 0.75rem; font-weight: 600;
}

/* ========== FOOTER ========== */
.picker-footer {
  text-align: center; padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
}
.picker-footer-btn {
  border: none; background: none; color: #6366f1; font-weight: 700;
  font-size: 0.88rem; cursor: pointer; padding: 0.5rem 1rem;
  border-radius: 10px; transition: all 0.25s;
  display: inline-flex; align-items: center; font-family: inherit;
  text-decoration: underline; text-decoration-color: #c7d2fe;
  text-underline-offset: 3px;
}
.picker-footer-btn:hover {
  background: #eef2ff; color: #4338ca;
  text-decoration-color: #6366f1;
}

/* ========== SPINNER ========== */
.spin { animation: spin 0.8s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ========== RESPONSIVE ========== */
@media (max-width: 520px) {
  .company-grid { grid-template-columns: 1fr; }
  .picker-card { padding: 1.5rem 1.25rem 1.25rem; border-radius: 18px; }
  .picker-header { flex-direction: column; text-align: center; gap: 0.5rem; }
  .picker-title { margin-left: 0; font-size: 1.1rem; }
  .brand-erp { font-size: 1.4rem; }
  .card-company-code { font-size: 1.6rem; }
}
</style>
