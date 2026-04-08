/**
 * FE/src/services/hr/api.js
 * API calls untuk modul HR - Master Karyawan
 */
import api from '@/services/api'

// ─── List & Detail ───────────────────────────────────────────────────────────
export const getKaryawan = (params = {}) =>
    api.get('/hr/karyawan', { params })

export const getKaryawanDetail = (uuid) =>
    api.get(`/hr/karyawan/${uuid}`)

// ─── CRUD Karyawan ───────────────────────────────────────────────────────────
export const createKaryawan = (data) =>
    api.post('/hr/karyawan', data)

export const updateKaryawan = (uuid, data) =>
    api.put(`/hr/karyawan/${uuid}`, data)

export const deleteKaryawan = (uuid) =>
    api.delete(`/hr/karyawan/${uuid}`)

export const nonaktifkanKaryawan = (uuid) =>
    api.patch(`/hr/karyawan/${uuid}/nonaktifkan`)

export const aktifkanKaryawan = (uuid) =>
    api.patch(`/hr/karyawan/${uuid}/aktifkan`)

// ─── Foto Profil ─────────────────────────────────────────────────────────────
export const uploadFoto = (uuid, file) => {
    const form = new FormData()
    form.append('foto', file)
    return api.post(`/hr/karyawan/${uuid}/foto`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })
}

export const deleteFoto = (uuid) =>
    api.delete(`/hr/karyawan/${uuid}/foto`)

// ─── Identitas ───────────────────────────────────────────────────────────────
export const saveIdentities = (uuid, data) =>
    api.post(`/hr/karyawan/${uuid}/identities`, data)

// ─── Riwayat Jabatan ─────────────────────────────────────────────────────────
export const addJob = (uuid, data) =>
    api.post(`/hr/karyawan/${uuid}/jobs`, data)

export const updateJob = (uuid, jobId, data) =>
    api.put(`/hr/karyawan/${uuid}/jobs/${jobId}`, data)

// ─── Keluarga ────────────────────────────────────────────────────────────────
export const addFamily = (uuid, data) =>
    api.post(`/hr/karyawan/${uuid}/family`, data)

export const updateFamily = (uuid, famId, data) =>
    api.put(`/hr/karyawan/${uuid}/family/${famId}`, data)

export const deleteFamily = (uuid, famId) =>
    api.delete(`/hr/karyawan/${uuid}/family/${famId}`)

// ─── Dokumen ─────────────────────────────────────────────────────────────────
export const uploadDocument = (uuid, formData) =>
    api.post(`/hr/karyawan/${uuid}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export const deleteDocument = (uuid, docId) =>
    api.delete(`/hr/karyawan/${uuid}/documents/${docId}`)

// --- Integrasi HR <-> User Account -------------------------------------------
export const createUserAccount = (uuid) =>
    api.post(`/hr/karyawan/${uuid}/create-user-account`)

export const linkExistingUser = (uuid, userUuid) =>
    api.post(`/hr/karyawan/${uuid}/link-existing-user`, { user_uuid: userUuid })

export const unlinkUser = (uuid) =>
    api.post(`/hr/karyawan/${uuid}/unlink-user`)

// ─── Employee Claims (HR Self-Service) ───────────────────────────────────────
export const getEmployeeClaims = (params = {}) =>
    api.get('/hr/employee-claims', { params })

export const getEmployeeClaim = (uuid) =>
    api.get(`/hr/employee-claims/${uuid}`)

export const getEmployeeClaimCategories = () =>
    api.get('/hr/employee-claims/categories')

export const getEmployeeClaimCoaBeban = () =>
    api.get('/hr/employee-claims/coa-beban')


export const createEmployeeClaim = (data) =>
    api.post('/hr/employee-claims', data)

export const deleteEmployeeClaim = (uuid) =>
    api.delete(`/hr/employee-claims/${uuid}`)

export const addEmployeeClaimItem = (uuid, data) =>
    api.post(`/hr/employee-claims/${uuid}/items`, data)

export const uploadEmployeeClaimAttachment = (uuid, itemUuid, fd) =>
    api.post(`/hr/employee-claims/${uuid}/items/${itemUuid}/attachment`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export const deleteEmployeeClaimItem = (uuid, itemUuid) =>
    api.delete(`/hr/employee-claims/${uuid}/items/${itemUuid}`)

// ─── Cuti / Leave Management ──────────────────────────────────────────────────
export const getLeaveTypes = () =>
    api.get('/hr/leave-types')

export const getMyLeaveBalances = (year) =>
    api.get('/hr/leave-balances/mine', { params: year ? { year } : {} })

// Self-service (karyawan yang login)
export const getEmployeeLeaves = (params = {}) =>
    api.get('/hr/employee-leaves', { params })

export const getEmployeeLeave = (uuid) =>
    api.get(`/hr/employee-leaves/${uuid}`)

export const createEmployeeLeave = (data) =>
    api.post('/hr/employee-leaves', data)

export const deleteEmployeeLeave = (uuid) =>
    api.delete(`/hr/employee-leaves/${uuid}`)

// Team calendar (approved leaves — all employees same company)
export const getTeamLeaves = (params = {}) =>
    api.get('/hr/leaves/team', { params })

// ─── Payroll Settings (per karyawan) ─────────────────────────────────────────
export const getPayrollSettings = (uuid) =>
    api.get(`/hr/karyawan/${uuid}/payroll-settings`)

export const savePayrollSettings = (uuid, data) =>
    api.put(`/hr/karyawan/${uuid}/payroll-settings`, data)

export const getPph21Preview = (uuid, params = {}) =>
    api.get(`/hr/karyawan/${uuid}/pph21-preview`, { params })

// ─── Custom Potongan Otomatis (per karyawan) ──────────────────────────────────
export const getCustomDeductions = (uuid) =>
    api.get(`/hr/karyawan/${uuid}/custom-deductions`)

export const createCustomDeduction = (uuid, data) =>
    api.post(`/hr/karyawan/${uuid}/custom-deductions`, data)

export const updateCustomDeduction = (uuid, id, data) =>
    api.patch(`/hr/karyawan/${uuid}/custom-deductions/${id}`, data)

export const deleteCustomDeduction = (uuid, id) =>
    api.delete(`/hr/karyawan/${uuid}/custom-deductions/${id}`)

// ─── Custom Tunjangan Otomatis (per karyawan) ─────────────────────────────────
export const getCustomAllowances = (uuid) =>
    api.get(`/hr/karyawan/${uuid}/custom-allowances`)

export const createCustomAllowance = (uuid, data) =>
    api.post(`/hr/karyawan/${uuid}/custom-allowances`, data)

export const updateCustomAllowance = (uuid, id, data) =>
    api.patch(`/hr/karyawan/${uuid}/custom-allowances/${id}`, data)

export const deleteCustomAllowance = (uuid, id) =>
    api.delete(`/hr/karyawan/${uuid}/custom-allowances/${id}`)
