<template>
  <div class="pt-stat" :class="tone ? 'pt-stat--' + tone : ''">
    <div class="pt-stat-label"><slot name="label">{{ label }}</slot></div>
    <div class="pt-stat-value" :class="valueClass"><slot>{{ value }}</slot></div>
    <div v-if="hint || $slots.hint" class="pt-stat-hint"><slot name="hint">{{ hint }}</slot></div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '' },
  hint: { type: String, default: '' },
  tone: { type: String, default: '' },
  valueClass: { type: [String, Object, Array], default: '' }
})
</script>
