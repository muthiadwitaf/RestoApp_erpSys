<template>
  <div class="pkfb-wrapper">

    <div class="pkfb-fields">
      <div class="pkfb-field">
        <label class="pkfb-label">Dari</label>
        <input type="date" class="pkfb-input" :value="modelFilters.date_from"
               @change="set('date_from', $event.target.value)" id="pkfb-date-from" />
      </div>
      <div class="pkfb-field">
        <label class="pkfb-label">Sampai</label>
        <input type="date" class="pkfb-input" :value="modelFilters.date_to"
               @change="set('date_to', $event.target.value)" id="pkfb-date-to" />
      </div>
      <div class="pkfb-field" v-if="branches.length > 1">
        <label class="pkfb-label">Cabang</label>
        <select class="pkfb-input" :value="modelFilters.branch_id"
                @change="set('branch_id', $event.target.value)" id="pkfb-branch">
          <option value="">Semua Cabang</option>
          <option v-for="b in branches" :key="b.uuid" :value="b.uuid">{{ b.name }}</option>
        </select>
      </div>
      <div class="pkfb-field">
        <label class="pkfb-label">Kategori</label>
        <select class="pkfb-input" :value="modelFilters.category_id"
                @change="set('category_id', $event.target.value)" id="pkfb-category">
          <option value="">Semua Kategori</option>
          <option v-for="c in categories" :key="c.uuid" :value="c.uuid">{{ c.name }}</option>
        </select>
      </div>
    </div>

    <div class="pkfb-actions">
      <button class="pkfb-btn-load" @click="$emit('submit')" id="pkfb-btn-tampilkan">
        <i class="bi bi-search me-2"></i>Tampilkan
      </button>
      <button class="pkfb-btn-pdf" @click="$emit('export-pdf')" id="pkfb-btn-pdf">
        <i class="bi bi-file-earmark-pdf me-2"></i>Export PDF
      </button>
    </div>

  </div>
</template>

<script setup>
const props = defineProps({
  modelFilters: { type: Object, required: true },
  branches:     { type: Array,  default: () => [] },
  categories:   { type: Array,  default: () => [] },
})
const emit = defineEmits(['update:modelFilters', 'submit', 'export-pdf'])

function set(key, val) {
  emit('update:modelFilters', { ...props.modelFilters, [key]: val })
}
</script>

<style scoped>
.pkfb-wrapper {
  background: #fff; border-radius: 14px; border: 1px solid #e5e7eb;
  padding: 1rem 1.25rem; display: flex; flex-wrap: wrap;
  align-items: flex-end; gap: 0.75rem; margin-bottom: 1.25rem;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}
:global([data-theme="dark"]) .pkfb-wrapper { background: #1e2130; border-color: #2e3347; }

.pkfb-fields { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: flex-end; flex: 1; }
.pkfb-field  { display: flex; flex-direction: column; min-width: 130px; }
.pkfb-label  { font-size: 0.72rem; font-weight: 600; color: #6b7280; margin-bottom: 0.3rem; }
.pkfb-input  {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.65rem;
  font-size: 0.82rem; color: #1f2937; background: #f9fafb;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pkfb-input:focus { outline: none; border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.12); }
:global([data-theme="dark"]) .pkfb-input { background: #252840; border-color: #3a3f5c; color: #e2e8f0; }

.pkfb-actions { display: flex; gap: 0.5rem; align-items: flex-end; }
.pkfb-btn-load, .pkfb-btn-pdf {
  border: none; border-radius: 9px; padding: 0.45rem 1.1rem;
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; transition: all 0.15s;
}
.pkfb-btn-load {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff; box-shadow: 0 2px 8px rgba(34,197,94,0.3);
}
.pkfb-btn-load:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(34,197,94,0.4); }
.pkfb-btn-pdf { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.pkfb-btn-pdf:hover { background: #dcfce7; transform: translateY(-1px); }
</style>
