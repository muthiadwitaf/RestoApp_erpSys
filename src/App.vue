<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
  <ToastContainer />
  <ConfirmDialog />
</template>

<script setup>
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
</script>
