<template>
  <div v-if="visible" class="modal fade show d-block" tabindex="-1" @click.self="onCancel">
    <div class="modal-dialog modal-dialog-centered" :class="'modal-' + size">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h6 class="modal-title"><i class="bi bi-question-circle me-2"></i>{{ title }}</h6>
          <button type="button" class="btn-close" @click="onCancel"></button>
        </div>
        <div class="modal-body py-3">
          <div class="mb-0" v-html="message"></div>
        </div>
        <div class="modal-footer py-2">
          <button class="btn btn-sm btn-secondary" @click="onCancel">{{ cancelText }}</button>
          <button class="btn btn-sm" :class="'btn-' + variant" @click="onConfirm">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show" v-if="visible" @click="onCancel"></div>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { visible, title, message, confirmText, cancelText, variant, size, onConfirm, onCancel } = useConfirm()
</script>
