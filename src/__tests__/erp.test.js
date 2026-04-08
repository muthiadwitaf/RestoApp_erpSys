import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useNotificationStore } from '@/stores/notification'
// mock imports removed — tests need to be updated to use API

describe('TS-01: Authentication & Session', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    it('1.1 Login valid → masuk berhasil', () => {
        const auth = useAuthStore()
        const result = auth.login('admin', 'admin123')
        expect(result.success).toBe(true)
        expect(auth.isAuthenticated).toBe(true)
        expect(auth.user.name).toBe('Super Admin')
    })

    it('1.2 Login password salah → error', () => {
        const auth = useAuthStore()
        const result = auth.login('admin', 'wrong')
        expect(result.success).toBe(false)
        expect(result.message).toContain('salah')
        expect(auth.isAuthenticated).toBe(false)
    })

    it('1.3 Login user tanpa branch → error', () => {
        const auth = useAuthStore()
        const result = auth.login('nobranch', 'nobranch123')
        expect(result.success).toBe(false)
        expect(result.message).toContain('cabang')
    })

    it('1.4 Pilih cabang → currentBranch berubah', () => {
        const auth = useAuthStore()
        auth.login('admin', 'admin123')
        const branch = useBranchStore()
        branch.selectBranch(1)
        expect(branch.currentBranch.name).toBe('Cabang Jakarta')
        branch.selectBranch(2)
        expect(branch.currentBranch.name).toBe('Cabang Surabaya')
    })

    it('1.5 Logout → session cleared', () => {
        const auth = useAuthStore()
        auth.login('admin', 'admin123')
        expect(auth.isAuthenticated).toBe(true)
        auth.logout()
        expect(auth.isAuthenticated).toBe(false)
        expect(auth.user).toBeNull()
    })
})

describe('TS-02: RBAC & Permission', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    it('2.1 Super Admin → semua permission', () => {
        const auth = useAuthStore()
        auth.login('admin', 'admin123')
        expect(auth.hasPermission('dashboard:view')).toBe(true)
        expect(auth.hasPermission('accounting:create')).toBe(true)
        expect(auth.hasPermission('sales:delete')).toBe(true)
        expect(auth.hasPermission('settings:edit')).toBe(true)
        expect(auth.hasPermission('branch:delete')).toBe(true)
    })

    it('2.2 Kasir → hanya POS', () => {
        const auth = useAuthStore()
        auth.login('kasir', 'kasir123')
        expect(auth.hasPermission('pos:view')).toBe(true)
        expect(auth.hasPermission('pos:create')).toBe(true)
        expect(auth.hasPermission('dashboard:view')).toBe(false)
        expect(auth.hasPermission('sales:view')).toBe(false)
        expect(auth.hasPermission('accounting:view')).toBe(false)
        expect(auth.hasPermission('settings:view')).toBe(false)
    })

    it('2.3 Staff Sales → sales+pos+inventory read', () => {
        const auth = useAuthStore()
        auth.login('sales', 'sales123')
        expect(auth.hasPermission('sales:view')).toBe(true)
        expect(auth.hasPermission('sales:create')).toBe(true)
        expect(auth.hasPermission('pos:view')).toBe(true)
        expect(auth.hasPermission('inventory:view')).toBe(true)
        expect(auth.hasPermission('inventory:create')).toBe(false)
        expect(auth.hasPermission('purchasing:view')).toBe(false)
        expect(auth.hasPermission('accounting:view')).toBe(false)
    })

    it('2.4 Staff Purchasing → purchasing+inventory read', () => {
        const auth = useAuthStore()
        auth.login('purchasing', 'purchasing123')
        expect(auth.hasPermission('purchasing:view')).toBe(true)
        expect(auth.hasPermission('purchasing:create')).toBe(true)
        expect(auth.hasPermission('inventory:view')).toBe(true)
        expect(auth.hasPermission('sales:view')).toBe(false)
    })

    it('2.5 hasAnyPermission works correctly', () => {
        const auth = useAuthStore()
        auth.login('kasir', 'kasir123')
        expect(auth.hasAnyPermission(['pos:view', 'sales:view'])).toBe(true)
        expect(auth.hasAnyPermission(['accounting:view', 'sales:view'])).toBe(false)
    })
})

describe('TS-03: Keuangan & Akuntansi (Logic)', () => {
    it('3.1 Jurnal debit = kredit → valid', () => {
        const lines = [
            { accountId: 1, debit: 5000000, credit: 0 },
            { accountId: 10, debit: 0, credit: 5000000 }
        ]
        const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
        expect(totalDebit).toBe(totalCredit)
    })

    it('3.2 Jurnal debit ≠ kredit → invalid', () => {
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
    it('5.1 Tambah item ke cart → subtotal benar', () => {
        const cart = [
            { sellPrice: 3500, qty: 2, discount: 0 },
            { sellPrice: 2500, qty: 3, discount: 0 }
        ]
        const subtotal = cart.reduce((s, c) => s + c.sellPrice * c.qty * (1 - (c.discount || 0) / 100), 0)
        expect(subtotal).toBe(7000 + 7500)
    })

    it('5.2 Pembayaran tunai → kembalian benar', () => {
        const grandTotal = 14500
        const cashPaid = 20000
        const change = cashPaid - grandTotal
        expect(change).toBe(5500)
    })

    it('5.3 Pembayaran kurang → tidak boleh selesai', () => {
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
        // Stok cabang 1 tidak termasuk gudang cabang 2
        const otherBranchWH = warehouses.filter(w => w.branchId === 2).map(w => w.id)
        branchStock.forEach(s => {
            expect(otherBranchWH.includes(s.warehouseId)).toBe(false)
        })
    })
})

describe('TS-08: Multi Branch', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    it('8.1 User branches terbatas sesuai assignment', () => {
        const auth = useAuthStore()
        auth.login('manager_jkt', 'manager123') // branchIds: [1]
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(1)
        expect(branch.userBranches[0].code).toBe('JKT')
    })

    it('8.2 Regional manager → multi branch', () => {
        const auth = useAuthStore()
        auth.login('regional', 'regional123') // branchIds: [1, 2]
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(2)
    })

    it('8.3 Super admin → semua cabang', () => {
        const auth = useAuthStore()
        auth.login('admin', 'admin123') // branchIds: [1, 2, 3]
        const branch = useBranchStore()
        expect(branch.userBranches.length).toBe(3)
    })

    it('8.4 Branch CRUD', () => {
        const auth = useAuthStore()
        auth.login('admin', 'admin123')
        const branch = useBranchStore()
        const initialCount = branch.allBranches.length
        const newId = branch.addBranch({ code: 'MDN', name: 'Cabang Medan', address: 'Jl. Pemuda 1, Medan', phone: '061-123', isActive: true })
        expect(branch.allBranches.length).toBe(initialCount + 1)
        branch.updateBranch(newId, { name: 'Cabang Medan Updated' })
        expect(branch.allBranches.find(b => b.id === newId).name).toBe('Cabang Medan Updated')
        branch.deleteBranch(newId)
        expect(branch.allBranches.length).toBe(initialCount)
    })
})

describe('TS-09: Cross-Module (Helpers)', () => {
    it('9.1 Auto Number generate correctly', () => {
        const num1 = generateAutoNumber('TEST', 'SO')
        expect(num1).toMatch(/^TEST-SO-2026-\d{5}$/)
        const num2 = generateAutoNumber('TEST', 'SO')
        expect(num2).not.toBe(num1) // sequential
    })

    it('9.2 formatCurrency IDR', () => {
        const result = formatCurrency(1500000)
        expect(result).toContain('1.500.000')
    })

    it('9.3 Notifications scoped per branch', () => {
        setActivePinia(createPinia())
        const notifStore = useNotificationStore()
        const branch1 = notifStore.getByBranch(1)
        const branch2 = notifStore.getByBranch(2)
        expect(branch1.length).toBeGreaterThan(0)
        // Branch 2 should have fewer or no notifications from mock
        branch1.forEach(n => expect(n.branchId).toBe(1))
    })
})
