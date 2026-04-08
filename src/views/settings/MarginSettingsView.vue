<template>
  <div class="ms-container">
    <div class="ms-header">
      <div>
        <h4 class="ms-title"><i class="bi bi-percent me-2"></i>Margin Default</h4>
        <p class="ms-subtitle">Persentase margin otomatis yang digunakan sistem saat menghitung Harga Jual setelah Penerimaan Barang (GR).</p>
      </div>
    </div>

    <div class="ms-card">
      <div class="ms-card-body">
        <!-- Info banner -->
        <div class="ms-info-banner mb-4">
          <i class="bi bi-info-circle-fill me-2"></i>
          <div>
            <strong>Bagaimana ini bekerja?</strong>
            <p class="mb-0 mt-1 small">Ketika Gudang memproses Penerimaan Barang (GR) dari PO, sistem otomatis menghitung HPP (Harga Pokok) dan membuat/memperbarui Harga Jual di Pricelist menggunakan rumus:<br>
            <code class="ms-formula">Harga Jual = HPP × (1 + Margin%)</code><br>
            Sales masih bisa mengubah harga jual secara manual di Pricelist kapan saja.</p>
          </div>
        </div>

        <div v-if="loading" class="text-center py-4">
          <div class="spinner-border text-primary" style="width:2rem;height:2rem" role="status"></div>
        </div>

        <div v-else class="ms-form-section">
          <!-- Current setting display -->
          <div class="ms-current-card mb-4">
            <div class="ms-current-label">Margin Default Saat Ini</div>
            <div class="ms-current-value">{{ (currentMargin || 0).toFixed(1) }}<span class="ms-current-pct">%</span></div>
            <div class="ms-current-meta" v-if="updatedBy">
              <i class="bi bi-person-circle me-1"></i>Diperbarui oleh <strong>{{ updatedBy }}</strong>
              <span v-if="updatedAt"> &bull; {{ formatDate(updatedAt) }}</span>
            </div>
          </div>

          <!-- Example calculation -->
          <div class="ms-example mb-4">
            <div class="ms-example-title"><i class="bi bi-calculator me-1"></i>Contoh Kalkulasi</div>
            <div class="ms-example-row">
              <span class="text-muted">HPP dari GR</span>
              <span class="fw-semibold">Rp {{ formatCurrency(exampleHpp) }}</span>
            </div>
            <div class="ms-example-row">
              <span class="text-muted">Margin {{ (editValue || 0).toFixed(1) }}%</span>
              <span class="text-success fw-semibold">+ Rp {{ formatCurrency(Math.round(exampleHpp * (editValue || 0) / 100)) }}</span>
            </div>
            <div class="ms-example-divider"></div>
            <div class="ms-example-row">
              <span class="fw-semibold">Harga Jual Otomatis</span>
              <span class="fw-bold text-primary fs-5">Rp {{ formatCurrency(Math.round(exampleHpp * (1 + (editValue || 0) / 100))) }}</span>
            </div>
          </div>

          <!-- Edit form -->
          <div class="ms-edit-section">
            <label class="ms-label">Ubah Margin Default</label>
            <div class="ms-slider-group">
              <div class="d-flex align-items-center gap-3 mb-2">
                <input type="range" class="form-range flex-grow-1" v-model.number="editValue" min="0" max="200" step="0.5" />
                <div class="input-group" style="width:130px;flex-shrink:0">
                  <input type="number" class="form-control text-center fw-bold"
                         v-model.number="editValue" min="0" max="1000" step="0.5"
                         :class="{'is-invalid': editValue < 0 || editValue > 1000}" />
                  <span class="input-group-text fw-bold">%</span>
                </div>
              </div>
              <!-- Preset buttons -->
              <div class="ms-presets">
                <span class="text-muted small me-2">Preset:</span>
                <button v-for="p in [5,10,15,20,25,30,35,50]" :key="p" type="button"
                        class="btn btn-sm me-1 mb-1"
                        :class="editValue === p ? 'btn-primary' : 'btn-outline-secondary'"
                        @click="editValue = p">{{ p }}%</button>
              </div>
            </div>

            <div class="d-flex gap-2 mt-4">
              <button type="button" class="btn btn-primary px-4" @click="save" :disabled="saving || editValue < 0 || editValue > 1000">
                <span v-if="saving"><span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...</span>
                <span v-else><i class="bi bi-check-lg me-1"></i>Simpan Perubahan</span>
              </button>
              <button type="button" class="btn btn-outline-secondary" @click="reset" :disabled="saving">Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '@/composables/useToast'
import { formatCurrency, formatDate } from '@/utils/format'
import * as settingsApi from '@/services/settings/api'

const { showToast } = useToast()
const loading = ref(true)
const saving = ref(false)
const currentMargin = ref(20)
const editValue = ref(20)
const updatedBy = ref('')
const updatedAt = ref(null)
const exampleHpp = 10000  // Rp 10.000 sebagai ilustrasi

async function load() {
  loading.value = true
  try {
    const res = await settingsApi.getMarginDefault()
    currentMargin.value = parseFloat(res.data.margin_pct) || 20
    editValue.value = currentMargin.value
    updatedBy.value = res.data.updated_by || ''
    updatedAt.value = res.data.updated_at
  } catch {
    showToast('Gagal memuat pengaturan margin', 'danger')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (editValue.value < 0 || editValue.value > 1000) {
    showToast('Margin harus antara 0% dan 1000%', 'warning')
    return
  }
  saving.value = true
  try {
    const res = await settingsApi.updateMarginDefault(editValue.value)
    currentMargin.value = parseFloat(res.data.margin_pct)
    updatedBy.value = res.data.updated_by || ''
    updatedAt.value = res.data.updated_at
    showToast(`Margin default diperbarui ke ${editValue.value}%`, 'success')
  } catch (e) {
    showToast(e.response?.data?.error || 'Gagal menyimpan', 'danger')
  } finally {
    saving.value = false
  }
}

function reset() {
  editValue.value = currentMargin.value
}

onMounted(load)
</script>

<style scoped>
.ms-container { padding: 1.5rem; max-width: 720px; }
.ms-header { margin-bottom: 1.5rem; }
.ms-title { font-weight: 700; color: #1e293b; margin: 0 0 .25rem; }
.ms-subtitle { color: #64748b; margin: 0; font-size: .9rem; }

.ms-card { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(0,0,0,.08); border: 1px solid #e8ecf0; }
.ms-card-body { padding: 2rem; }

.ms-info-banner {
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: 1px solid #bfdbfe;
  border-radius: 12px; padding: 1rem 1.25rem;
  display: flex; gap: .75rem; color: #1e40af;
}
.ms-info-banner strong { display: block; margin-bottom: .25rem; }
.ms-formula {
  display: inline-block; margin-top: .35rem;
  background: #dbeafe; padding: .15rem .5rem; border-radius: 6px;
  font-weight: 700; color: #1d4ed8;
}

.ms-current-card {
  background: linear-gradient(135deg, #f8faff, #fdfcff);
  border: 1px solid #e2e8f0; border-radius: 14px;
  padding: 1.5rem 2rem; text-align: center;
}
.ms-current-label { color: #64748b; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; margin-bottom: .5rem; }
.ms-current-value { font-size: 3.5rem; font-weight: 800; color: #3b82f6; line-height: 1; }
.ms-current-pct { font-size: 1.5rem; font-weight: 600; color: #94a3b8; margin-left: .25rem; }
.ms-current-meta { color: #94a3b8; font-size: .8rem; margin-top: .5rem; }

.ms-example { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.25rem; }
.ms-example-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: .75rem; }
.ms-example-row { display: flex; justify-content: space-between; align-items: center; padding: .25rem 0; }
.ms-example-divider { border-top: 1px dashed #e2e8f0; margin: .5rem 0; }

.ms-label { font-size: .875rem; font-weight: 600; color: #374151; display: block; margin-bottom: .75rem; }
.ms-presets { display: flex; flex-wrap: wrap; align-items: center; }
</style>
