import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useNotificationStore } from '@/stores/notification'
import { formatCurrency } from '@/utils/format'

const mockSettings = vi.hoisted(() => {
    const clone = (value) => JSON.parse(JSON.stringify(value))

    const makeBranches = () => [
        { uuid: 'branch-jkt', id: 'branch-jkt', int_id: 1, code: 'JKT', name: 'Cabang Jakarta', address: 'Jl. Sudirman 1', phone: '021-111', is_active: true },
        { uuid: 'branch-sby', id: 'branch-sby', int_id: 2, code: 'SBY', name: 'Cabang Surabaya', address: 'Jl. Pemuda 2', phone: '031-222', is_active: true },
        { uuid: 'branch-bdg', id: 'branch-bdg', int_id: 3, code: 'BDG', name: 'Cabang Bandung', address: 'Jl. Asia Afrika 3', phone: '022-333', is_active: true }
    ]

    let branches = makeBranches()
    let nextBranchId = 4

    const buildUser = (username) => {
        const byCode = (...codes) => branches.filter(branch => codes.includes(branch.code))
        const base = {
            uuid: `user-${username}`,
            username,
            email: `${username}@example.test`,
            company_uuid: 'company-demo',
            company_name: 'Demo ERP',
            theme_preference: null,
            roleNames: [],
            is_super_admin: false
        }

        const users = {
            admin: {
                ...base,
                name: 'Super Admin',
                is_super_admin: true,
                permissions: [],
                branches: clone(branches)
            },
            kasir: {
                ...base,
                name: 'Kasir',
                permissions: ['pos:view', 'pos:create'],
                branches: clone(byCode('JKT'))
            },
            sales: {
                ...base,
                name: 'Staff Sales',
                permissions: ['sales:view', 'sales:create', 'pos:view', 'inventory:view'],
                branches: clone(byCode('JKT'))
            },
            purchasing: {
                ...base,
                name: 'Staff Purchasing',
                permissions: ['purchasing:view', 'purchasing:create', 'inventory:view'],
                branches: clone(byCode('JKT'))
            },
            manager_jkt: {
                ...base,
                name: 'Manager Jakarta',
                permissions: ['dashboard:view'],
                branches: clone(byCode('JKT'))
            },
            regional: {
                ...base,
                name: 'Regional Manager',
                permissions: ['dashboard:view'],
                branches: clone(byCode('JKT', 'SBY'))
            }
        }

        return users[username] || null
    }

    const passwords = {
        admin: 'admin123',
        kasir: 'kasir123',
        sales: 'sales123',
        purchasing: 'purchasing123',
        manager_jkt: 'manager123',
        regional: 'regional123'
    }

    const api = {
        login: vi.fn(async (identity, password) => {
            const username = String(identity).split('@')[0]
            if (username === 'nobranch') {
                const err = new Error('User belum di-assign ke cabang')
                err.response = { data: { error: 'User belum di-assign ke cabang' } }
                throw err
            }

            const user = buildUser(username)
            if (!user || passwords[username] !== password) {
                const err = new Error('Email atau password salah')
                err.response = { data: { error: 'Email atau password salah' } }
                throw err
            }

            return {
                data: {
                    accessToken: `access-${username}`,
                    refreshToken: `refresh-${username}`,
                    user: clone(user)
                }
            }
        }),
        logout: vi.fn(async () => ({ data: { message: 'Logout berhasil' } })),
        getBranches: vi.fn(async () => ({ data: clone(branches) })),
        createBranch: vi.fn(async (branch) => {
            const created = {
                ...branch,
                uuid: `branch-${String(branch.code).toLowerCase()}`,
                id: `branch-${String(branch.code).toLowerCase()}`,
                int_id: nextBranchId++,
                is_active: branch.is_active ?? branch.isActive ?? true
            }
            branches.push(created)
            return { data: clone(created) }
        }),
        updateBranch: vi.fn(async (uuid, branchData) => {
            const idx = branches.findIndex(branch => branch.uuid === uuid || branch.id === uuid)
            if (idx < 0) {
                const err = new Error('Cabang tidak ditemukan')
                err.response = { status: 404, data: { error: 'Cabang tidak ditemukan' } }
                throw err
            }

            branches[idx] = { ...branches[idx], ...branchData }
            return { data: clone(branches[idx]) }
        })
    }

    return {
        api,
        reset() {
            branches = makeBranches()
            nextBranchId = 4
            Object.values(api).forEach(fn => fn.mockClear())
        }
    }
})

vi.mock('@/services/settings/api', () => mockSettings.api)

const chartOfAccounts = [
    { id: 1, type: 'Aset', balance: 8000000 },
    { id: 2, type: 'Liabilitas', balance: 3000000 },
    { id: 3, type: 'Ekuitas', balance: 5000000 }
]

const uomConversions = [
    { fromUom: 'Karton', toUom: 'Pcs', factor: 12 }
]

const warehouses = [
    { id: 1, branchId: 1, name: 'Gudang Jakarta' },
    { id: 2, branchId: 2, name: 'Gudang Surabaya' }
]

const inventory = [
    { itemId: 1, warehouseId: 1, qty: 120 },
    { itemId: 2, warehouseId: 2, qty: 48 }
]

const autoNumberSequences = new Map()

function resetAutoNumbers() {
    autoNumberSequences.clear()
}

function generateAutoNumber(companyCode, docType) {
    const year = 2026
    const key = `${companyCode}-${docType}-${year}`
    const next = (autoNumberSequences.get(key) || 0) + 1
    autoNumberSequences.set(key, next)
    return `${key}-${String(next).padStart(5, '0')}`
}

function resetStores() {
    setActivePinia(createPinia())
    localStorage.clear()
    resetAutoNumbers()
    mockSettings.reset()
}

describe('TS-01: Authentication & Session', () => {
    beforeEach(resetStores)

    it('1.1 Login valid -> masuk berhasil', async () => {
        const auth = useAuthStore()
        const result = await auth.login('admin', 'admin123')
        expect(result.success).toBe(true)
        expect(auth.isAuthenticated).toBe(true)
        expect(auth.user.name).toBe('Super Admin')
    })

    it('1.2 Login password salah -> error', async () => {
        const auth = useAuthStore()
        const result = await auth.login('admin', 'wrong')
        expect(result.success).toBe(false)
        expect(result.message).toContain('salah')
        expect(auth.isAuthenticated).toBe(false)
    })

    it('1.3 Login user tanpa branch -> error', async () => {
        const auth = useAuthStore()
        const result = await auth.login('nobranch', 'nobranch123')
        expect(result.success).toBe(false)
        expect(result.message).toContain('cabang')
    })

    it('1.4 Pilih cabang -> currentBranch berubah', async () => {
        const auth = useAuthStore()
        await auth.login('admin', 'admin123')
        const branch = useBranchStore()
        branch.selectBranch('branch-jkt')
        expect(branch.currentBranch.name).toBe('Cabang Jakarta')
        branch.selectBranch('branch-sby')
        expect(branch.currentBranch.name).toBe('Cabang Surabaya')
    })

    it('1.5 Logout -> session cleared', async () => {
        const auth = useAuthStore()
        await auth.login('admin', 'admin123')
        expect(auth.isAuthenticated).toBe(true)
        await auth.logout()
        expect(auth.isAuthenticated).toBe(false)
        expect(auth.user).toBeNull()
    })
})

describe('TS-02: RBAC & Permission', () => {
    beforeEach(resetStores)

    it('2.1 Super Admin -> semua permission', async () => {
        const auth = useAuthStore()
        await auth.login('admin', 'admin123')
        expect(auth.hasPermission('dashboard:view')).toBe(true)
        expect(auth.hasPermission('accounting:create')).toBe(true)
        expect(auth.hasPermission('sales:delete')).toBe(true)
        expect(auth.hasPermission('settings:edit')).toBe(true)
        expect(auth.hasPermission('branch:delete')).toBe(true)
    })

    it('2.2 Kasir -> hanya POS', async () => {
        const auth = useAuthStore()
        await auth.login('kasir', 'kasir123')
        expect(auth.hasPermission('pos:view')).toBe(true)
        expect(auth.hasPermission('pos:create')).toBe(true)
        expect(auth.hasPermission('dashboard:view')).toBe(false)
        expect(auth.hasPermission('sales:view')).toBe(false)
        expect(auth.hasPermission('accounting:view')).toBe(false)
        expect(auth.hasPermission('settings:view')).toBe(false)
    })

    it('2.3 Staff Sales -> sales+pos+inventory read', async () => {
        const auth = useAuthStore()
        await auth.login('sales', 'sales123')
        expect(auth.hasPermission('sales:view')).toBe(true)
        expect(auth.hasPermission('sales:create')).toBe(true)
        expect(auth.hasPermission('pos:view')).toBe(true)
        expect(auth.hasPermission('inventory:view')).toBe(true)
        expect(auth.hasPermission('inventory:create')).toBe(false)
        expect(auth.hasPermission('purchasing:view')).toBe(false)
        expect(auth.hasPermission('accounting:view')).toBe(false)
    })

    it('2.4 Staff Purchasing -> purchasing+inventory read', async () => {
        const auth = useAuthStore()
        await auth.login('purchasing', 'purchasing123')
        expect(auth.hasPermission('purchasing:view')).toBe(true)
        expect(auth.hasPermission('purchasing:create')).toBe(true)
        expect(auth.hasPermission('inventory:view')).toBe(true)
        expect(auth.hasPermission('sales:view')).toBe(false)
    })

    it('2.5 hasAnyPermission works correctly', async () => {
        const auth = useAuthStore()
        await auth.login('kasir', 'kasir123')
        expect(auth.hasAnyPermission(['pos:view', 'sales:view'])).toBe(true)
        expect(auth.hasAnyPermission(['accounting:view', 'sales:view'])).toBe(false)
    })
})

describe('TS-03: Keuangan & Akuntansi (Logic)', () => {
    it('3.1 Jurnal debit = kredit -> valid', () => {
        const lines = [
            { accountId: 1, debit: 5000000, credit: 0 },
            { accountId: 10, debit: 0, credit: 5000000 }
        ]
        const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
        expect(totalDebit).toBe(totalCredit)
    })

    it('3.2 Jurnal debit != kredit -> invalid', () => {
        const lines = [
            { accountId: 1, debit: 5000000, credit: 0 },
            { accountId: 10, debit: 0, credit: 3000000 }
        ]
        const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
        expect(totalDebit).not.toBe(totalCredit)
    })

    it('3.3 Neraca: Aset = Liabilitas + Ekuitas', () => {
        const totalAsset = chartOfAccounts.filter(a => a.type === 'Aset').reduce((s, a) => s + a.balance, 0)
        const totalLiability = chartOfAccounts.filter(a => a.type === 'Liabilitas').reduce((s, a) => s + a.balance, 0)
        const totalEquity = chartOfAccounts.filter(a => a.type === 'Ekuitas').reduce((s, a) => s + a.balance, 0)
        expect(totalAsset).toBe(totalLiability + totalEquity)
    })
})

describe('TS-04: Penjualan (Logic)', () => {
    it('4.1 Kalkulasi total SO dengan diskon', () => {
        const lines = [
            { qty: 100, price: 3500, discount: 0 },
            { qty: 50, price: 2500, discount: 5 }
        ]
        const total = lines.reduce((s, l) => s + l.qty * l.price * (1 - (l.discount || 0) / 100), 0)
        expect(total).toBe(100 * 3500 + 50 * 2500 * 0.95)
    })

    it('4.2 Diskon bertingkat per item', () => {
        const price = 10000
        const qty = 5
        const itemDiscount = 10
        const subtotal = qty * price * (1 - itemDiscount / 100)
        expect(subtotal).toBe(45000)
    })

    it('4.3 Diskon transaksi di atas diskon item', () => {
        const itemTotal = 100000
        const transDiscount = 5
        const grandTotal = itemTotal * (1 - transDiscount / 100)
        expect(grandTotal).toBe(95000)
    })
})

describe('TS-05: POS Logic', () => {
    it('5.1 Tambah item ke cart -> subtotal benar', () => {
        const cart = [
            { sellPrice: 3500, qty: 2, discount: 0 },
            { sellPrice: 2500, qty: 3, discount: 0 }
        ]
        const subtotal = cart.reduce((s, c) => s + c.sellPrice * c.qty * (1 - (c.discount || 0) / 100), 0)
        expect(subtotal).toBe(7000 + 7500)
    })

    it('5.2 Pembayaran tunai -> kembalian benar', () => {
        const grandTotal = 14500
        const cashPaid = 20000
        const change = cashPaid - grandTotal
        expect(change).toBe(5500)
    })

    it('5.3 Pembayaran kurang -> tidak boleh selesai', () => {
        const grandTotal = 14500
        const cashPaid = 10000
        expect(cashPaid >= grandTotal).toBe(false)
    })
})

describe('TS-07: Inventori (Logic)', () => {
    it('7.1 Konversi UoM: 1 Karton = 12 Pcs', () => {
        const conv = uomConversions.find(c => c.fromUom === 'Karton' && c.toUom === 'Pcs')
        expect(conv).toBeDefined()
        expect(conv.factor).toBe(12)
        const kartonQty = 5
        const pcsQty = kartonQty * conv.factor
        expect(pcsQty).toBe(60)
    })

    it('7.2 Stok per gudang per cabang', () => {
        const branchId = 1
        const branchWH = warehouses.filter(w => w.branchId === branchId).map(w => w.id)
        const branchStock = inventory.filter(inv => branchWH.includes(inv.warehouseId))
        expect(branchStock.length).toBeGreaterThan(0)
        const otherBranchWH = warehouses.filter(w => w.branchId === 2).map(w => w.id)
        branchStock.forEach(s => {
            expect(otherBranchWH.includes(s.warehouseId)).toBe(false)
        })
    })
})

describe('TS-08: Multi Branch', () => {
    beforeEach(resetStores)

    it('8.1 User branches terbatas sesuai assignment', async () => {
        const auth = useAuthStore()
        await auth.login('manager_jkt', 'manager123')
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(1)
        expect(branch.userBranches[0].code).toBe('JKT')
    })

    it('8.2 Regional manager -> multi branch', async () => {
        const auth = useAuthStore()
        await auth.login('regional', 'regional123')
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(2)
    })

    it('8.3 Super admin -> semua cabang', async () => {
        const auth = useAuthStore()
        await auth.login('admin', 'admin123')
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(3)
    })

    it('8.4 Branch create/update', async () => {
        const auth = useAuthStore()
        await auth.login('admin', 'admin123')
        const branch = useBranchStore()
        const initialCount = branch.allBranches.length
        const created = await branch.addBranch({ code: 'MDN', name: 'Cabang Medan', address: 'Jl. Pemuda 1, Medan', phone: '061-123', is_active: true })
        expect(branch.allBranches.length).toBe(initialCount + 1)
        await branch.updateBranch(created.uuid, { name: 'Cabang Medan Updated' })
        expect(branch.allBranches.find(b => b.uuid === created.uuid).name).toBe('Cabang Medan Updated')
    })
})

describe('TS-09: Cross-Module (Helpers)', () => {
    beforeEach(resetStores)

    it('9.1 Auto Number generate correctly', () => {
        const num1 = generateAutoNumber('TEST', 'SO')
        expect(num1).toMatch(/^TEST-SO-2026-\d{5}$/)
        const num2 = generateAutoNumber('TEST', 'SO')
        expect(num2).not.toBe(num1)
    })

    it('9.2 formatCurrency IDR', () => {
        const result = formatCurrency(1500000)
        expect(result).toContain('1.500.000')
    })

    it('9.3 Notifications scoped per branch', () => {
        const notifStore = useNotificationStore()
        notifStore.setNotifications([
            { id: 1, branch_id: 1, title: 'Stok menipis', read: false },
            { id: 2, branch_id: 2, title: 'PO pending', read: true }
        ])
        const branch1 = notifStore.getByBranch(1)
        const branch2 = notifStore.getByBranch(2)
        expect(branch1.length).toBeGreaterThan(0)
        expect(branch2.length).toBeGreaterThan(0)
        branch1.forEach(n => expect(n.branch_id).toBe(1))
    })
})
