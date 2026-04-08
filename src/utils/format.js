export function formatCurrency(amount, currency = 'IDR') {
    const num = Number(amount) || 0
    if (currency === 'IDR') {
        return 'Rp ' + num.toLocaleString('id-ID')
    }
    const symbols = { USD: '$', EUR: '€', SGD: 'S$' }
    return (symbols[currency] || currency + ' ') + num.toLocaleString('en-US')
}

export function formatDate(dateStr) {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function getUnitName(units, unitId) {
    if (!units || !unitId) return '-'
    const u = units.find(u => u.id === unitId || u.uuid === unitId)
    return u ? u.name : '-'
}
