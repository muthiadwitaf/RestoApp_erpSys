import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import * as settingsApi from '@/services/settings/api'

export const useBranchStore = defineStore('branch', () => {
    const allBranches = ref([])
    const _stored = localStorage.getItem('erp_branch')
    const currentBranchId = ref((_stored && _stored !== 'undefined' && _stored !== 'null') ? JSON.parse(_stored) : null)

    const currentBranch = computed(() => allBranches.value.find(b => b.uuid === currentBranchId.value) || null)

    // userBranches: pakai allBranches yang sudah dinormalisasi
    // (bukan raw auth.user.branches yang punya .id = UUID bukan .uuid)
    const userBranches = computed(() => allBranches.value)

    // Load branches dari login response — normalisasi property name
    // Backend SELECT alias: b.uuid as id, b.id as int_id
    // Normalisasi ke: { uuid: UUID, id: int, code, name }
    function loadFromUser() {
        const auth = useAuthStore()
        if (auth.user && auth.user.branches && auth.user.branches.length > 0) {
            allBranches.value = auth.user.branches.map(b => ({
                ...b,
                uuid: b.uuid || b.id,    // backend returns UUID in .id field (aliased)
                id: b.int_id || b.id,  // integer id
            }))
        }
    }

    async function fetchBranches() {
        try {
            const { data } = await settingsApi.getBranches()
            allBranches.value = data
        } catch (e) { /* ignore */ }
    }

    function selectBranch(branchId) {
        currentBranchId.value = branchId
        localStorage.setItem('erp_branch', JSON.stringify(branchId))
    }

    function clearBranch() {
        currentBranchId.value = null
        localStorage.removeItem('erp_branch')
    }

    async function addBranch(branch) {
        const { data } = await settingsApi.createBranch(branch)
        allBranches.value.push(data)
        return data
    }

    async function updateBranch(uuid, branchData) {
        const { data } = await settingsApi.updateBranch(uuid, branchData)
        const idx = allBranches.value.findIndex(b => b.uuid === uuid)
        if (idx >= 0) allBranches.value[idx] = data
        return data
    }

    // Init from stored user
    loadFromUser()

    return { allBranches, currentBranchId, currentBranch, userBranches, selectBranch, clearBranch, addBranch, updateBranch, fetchBranches, loadFromUser }
})
