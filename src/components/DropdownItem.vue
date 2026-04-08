<template>
  <component 
    :is="to ? 'router-link' : href ? 'a' : 'button'"
    :to="to"
    :href="href"
    class="dropdown-item d-flex align-items-center gap-2 py-2"
    :class="variant ? `text-${variant}` : ''"
    @click="$emit('click', $event)"
  >
    <i v-if="icon" :class="icon" class="fs-5"></i>
    <div class="d-flex flex-column">
      <span class="fw-semibold" style="font-size: 0.9rem;"><slot></slot></span>
      <span v-if="description" class="small text-muted" style="font-size: 0.75rem;">{{ description }}</span>
    </div>
  </component>
</template>

<script setup>
defineProps({
  icon: String,
  to: [String, Object],
  href: String,
  description: String,
  variant: String // 'danger', 'success' dll
})
defineEmits(['click'])
</script>

<style scoped>
.dropdown-item {
  color: #374151;
  transition: all 0.2s ease;
  border-radius: 6px;
  margin: 0 0.5rem;
  width: calc(100% - 1rem);
}
.dropdown-item:hover {
  background-color: #f3f4f6;
  color: #111827;
}
.dropdown-item.text-danger:hover {
  background-color: #fef2f2;
}
</style>
