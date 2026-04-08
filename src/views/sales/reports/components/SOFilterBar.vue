<template>
  <div class="sofb-wrapper">

    <!-- Filter Fields Row -->
    <div class="sofb-fields">
      <div class="sofb-field">
        <label class="sofb-label">Dari</label>
        <input type="date" class="sofb-input" :value="modelFilters.date_from"
               @change="set('date_from', $event.target.value)" id="sofb-date-from" />
      </div>
      <div class="sofb-field">
        <label class="sofb-label">Sampai</label>
        <input type="date" class="sofb-input" :value="modelFilters.date_to"
               @change="set('date_to', $event.target.value)" id="sofb-date-to" />
      </div>
      <div class="sofb-field" v-if="branches.length > 1">
        <label class="sofb-label">Cabang</label>
        <select class="sofb-input" :value="modelFilters.branch_id"
                @change="set('branch_id', $event.target.value)" id="sofb-branch">
          <option value="">Semua Cabang</option>
          <option v-for="b in branches" :key="b.uuid" :value="b.uuid">{{ b.name }}</option>
        </select>
      </div>
      <div class="sofb-field">
        <label class="sofb-label">Status</label>
        <select class="sofb-input" :value="modelFilters.status"
                @change="set('status', $event.target.value)" id="sofb-status">
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div class="sofb-field">
        <label class="sofb-label">Salesperson</label>
        <select class="sofb-input" :value="modelFilters.salesperson"
                @change="set('salesperson', $event.target.value)" id="sofb-salesperson">
          <option value="">Semua</option>
          <option v-for="sp in salespersons" :key="sp.username" :value="sp.username">{{ sp.username }}</option>
        </select>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="sofb-actions">
      <button class="sofb-btn-load" @click="$emit('submit')" id="sofb-btn-tampilkan">
        <i class="bi bi-search me-2"></i>Tampilkan
      </button>
      <button class="sofb-btn-pdf" @click="$emit('export-pdf')" id="sofb-btn-pdf">
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
  statusOptions:{ type: Array,  default: () => [] },
})
const emit = defineEmits(['update:modelFilters', 'submit', 'export-pdf'])

function set(key, val) {
  emit('update:modelFilters', { ...props.modelFilters, [key]: val })
}
</script>

<style scoped>
.sofb-wrapper {
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
:global([data-theme="dark"]) .sofb-wrapper { background: #1e2130; border-color: #2e3347; }

.sofb-fields { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: flex-end; flex: 1; }
.sofb-field  { display: flex; flex-direction: column; min-width: 130px; }
.sofb-label  { font-size: 0.72rem; font-weight: 600; color: #6b7280; margin-bottom: 0.3rem; }
.sofb-input  {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  color: #1f2937;
  background: #f9fafb;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sofb-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
:global([data-theme="dark"]) .sofb-input { background: #252840; border-color: #3a3f5c; color: #e2e8f0; }

.sofb-actions { display: flex; gap: 0.5rem; align-items: flex-end; }
.sofb-btn-load,
.sofb-btn-pdf {
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
.sofb-btn-load {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
.sofb-btn-load:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
.sofb-btn-pdf  {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}
.sofb-btn-pdf:hover { background: #dcfce7; transform: translateY(-1px); }
</style>
