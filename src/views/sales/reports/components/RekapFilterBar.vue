<template>
  <div class="rfb-wrapper">

    <!-- Period Selector -->
    <div class="rfb-period-group">
      <button
        v-for="p in PERIODS" :key="p.value"
        class="rfb-period-btn"
        :class="{ active: modelFilters.period === p.value }"
        @click="set('period', p.value)"
        :id="`rfb-period-${p.value}`"
      >
        <i :class="p.icon" class="me-1"></i>{{ p.label }}
      </button>
    </div>

    <!-- Filter Fields Row -->
    <div class="rfb-fields">
      <div class="rfb-field">
        <label class="rfb-label">Dari</label>
        <input type="date" class="rfb-input" :value="modelFilters.date_from"
               @change="set('date_from', $event.target.value)" id="rfb-date-from" />
      </div>
      <div class="rfb-field">
        <label class="rfb-label">Sampai</label>
        <input type="date" class="rfb-input" :value="modelFilters.date_to"
               @change="set('date_to', $event.target.value)" id="rfb-date-to" />
      </div>
      <div class="rfb-field" v-if="branches.length > 1">
        <label class="rfb-label">Cabang</label>
        <select class="rfb-input" :value="modelFilters.branch_id"
                @change="set('branch_id', $event.target.value)" id="rfb-branch">
          <option value="">Semua Cabang</option>
          <option v-for="b in branches" :key="b.uuid" :value="b.uuid">{{ b.name }}</option>
        </select>
      </div>
      <div class="rfb-field">
        <label class="rfb-label">Salesperson</label>
        <select class="rfb-input" :value="modelFilters.created_by"
                @change="set('created_by', $event.target.value)" id="rfb-salesperson">
          <option value="">Semua</option>
          <option v-for="sp in salespersons" :key="sp.username" :value="sp.username">{{ sp.username }}</option>
        </select>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="rfb-actions">
      <button class="rfb-btn-load" @click="$emit('submit')" id="rfb-btn-tampilkan">
        <i class="bi bi-search me-2"></i>Tampilkan
      </button>
      <button class="rfb-btn-pdf" @click="$emit('export-pdf')" id="rfb-btn-pdf">
        <i class="bi bi-file-earmark-pdf me-2"></i>Export PDF
      </button>
    </div>

  </div>
</template>

<script setup>
const props = defineProps({
  modelFilters: { type: Object, required: true },
  salespersons: { type: Array,  default: () => [] },
  branches:     { type: Array,  default: () => [] },
})
const emit = defineEmits(['update:modelFilters', 'submit', 'export-pdf'])

const PERIODS = [
  { value: 'daily',   label: 'Harian',   icon: 'bi bi-calendar-day' },
  { value: 'weekly',  label: 'Mingguan', icon: 'bi bi-calendar-week' },
  { value: 'monthly', label: 'Bulanan',  icon: 'bi bi-calendar-month' },
]

function set(key, val) {
  emit('update:modelFilters', { ...props.modelFilters, [key]: val })
}
</script>

<style scoped>
.rfb-wrapper {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  padding: 1rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}

/* Dark mode */
:global([data-theme="dark"]) .rfb-wrapper { background: #1e2130; border-color: #2e3347; }

/* Period pills */
.rfb-period-group {
  display: flex;
  gap: 0.35rem;
  background: #f3f4f6;
  border-radius: 10px;
  padding: 4px;
}
:global([data-theme="dark"]) .rfb-period-group { background: #252840; }

.rfb-period-btn {
  border: none;
  background: transparent;
  border-radius: 7px;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}
.rfb-period-btn:hover { background: rgba(99,102,241,0.08); color: #6366f1; }
.rfb-period-btn.active { background: #6366f1; color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.35); }

/* Fields */
.rfb-fields { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: flex-end; flex: 1; }
.rfb-field  { display: flex; flex-direction: column; min-width: 130px; }
.rfb-label  { font-size: 0.72rem; font-weight: 600; color: #6b7280; margin-bottom: 0.3rem; }
.rfb-input  {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  color: #1f2937;
  background: #f9fafb;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rfb-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
:global([data-theme="dark"]) .rfb-input { background: #252840; border-color: #3a3f5c; color: #e2e8f0; }

/* Action buttons */
.rfb-actions { display: flex; gap: 0.5rem; align-items: flex-end; }
.rfb-btn-load,
.rfb-btn-pdf {
  border: none;
  border-radius: 9px;
  padding: 0.45rem 1.1rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}
.rfb-btn-load {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
.rfb-btn-load:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
.rfb-btn-pdf  {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}
.rfb-btn-pdf:hover { background: #dcfce7; transform: translateY(-1px); }
</style>
