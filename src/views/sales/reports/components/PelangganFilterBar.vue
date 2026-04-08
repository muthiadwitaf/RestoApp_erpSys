<template>
  <div class="ppfb-wrapper">

    <div class="ppfb-fields">
      <div class="ppfb-field">
        <label class="ppfb-label">Dari</label>
        <input type="date" class="ppfb-input" :value="modelFilters.date_from"
               @change="set('date_from', $event.target.value)" id="ppfb-date-from" />
      </div>
      <div class="ppfb-field">
        <label class="ppfb-label">Sampai</label>
        <input type="date" class="ppfb-input" :value="modelFilters.date_to"
               @change="set('date_to', $event.target.value)" id="ppfb-date-to" />
      </div>
      <div class="ppfb-field" v-if="branches.length > 1">
        <label class="ppfb-label">Cabang</label>
        <select class="ppfb-input" :value="modelFilters.branch_id"
                @change="set('branch_id', $event.target.value)" id="ppfb-branch">
          <option value="">Semua Cabang</option>
          <option v-for="b in branches" :key="b.uuid" :value="b.uuid">{{ b.name }}</option>
        </select>
      </div>
      <div class="ppfb-field">
        <label class="ppfb-label">Grup Pelanggan</label>
        <select class="ppfb-input" :value="modelFilters.group_id"
                @change="set('group_id', $event.target.value)" id="ppfb-group">
          <option value="">Semua Grup</option>
          <option v-for="g in customerGroups" :key="g.uuid" :value="g.uuid">{{ g.name }}</option>
        </select>
      </div>
    </div>

    <div class="ppfb-actions">
      <button class="ppfb-btn-load" @click="$emit('submit')" id="ppfb-btn-tampilkan">
        <i class="bi bi-search me-2"></i>Tampilkan
      </button>
      <button class="ppfb-btn-pdf" @click="$emit('export-pdf')" id="ppfb-btn-pdf">
        <i class="bi bi-file-earmark-pdf me-2"></i>Export PDF
      </button>
    </div>

  </div>
</template>

<script setup>
const props = defineProps({
  modelFilters:   { type: Object, required: true },
  branches:       { type: Array,  default: () => [] },
  customerGroups: { type: Array,  default: () => [] },
})
const emit = defineEmits(['update:modelFilters', 'submit', 'export-pdf'])

function set(key, val) {
  emit('update:modelFilters', { ...props.modelFilters, [key]: val })
}
</script>

<style scoped>
.ppfb-wrapper {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  padding: 1rem 1.25rem; display: flex; flex-wrap: wrap;
  align-items: flex-end; gap: 0.75rem; margin-bottom: 1.25rem;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}
:global([data-theme="dark"]) .ppfb-wrapper { background: #1e2130; border-color: #2e3347; }

.ppfb-fields { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: flex-end; flex: 1; }
.ppfb-field  { display: flex; flex-direction: column; min-width: 130px; }
.ppfb-label  { font-size: 0.72rem; font-weight: 600; color: #6b7280; margin-bottom: 0.3rem; }
.ppfb-input  {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.65rem;
  font-size: 0.82rem; color: #1f2937; background: #f9fafb;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ppfb-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
:global([data-theme="dark"]) .ppfb-input { background: #252840; border-color: #3a3f5c; color: #e2e8f0; }

.ppfb-actions { display: flex; gap: 0.5rem; align-items: flex-end; }
.ppfb-btn-load, .ppfb-btn-pdf {
  border: none; border-radius: 9px; padding: 0.45rem 1.1rem;
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; transition: all 0.15s;
}
.ppfb-btn-load {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.3);
}
.ppfb-btn-load:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
.ppfb-btn-pdf { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.ppfb-btn-pdf:hover { background: #dcfce7; transform: translateY(-1px); }
</style>
