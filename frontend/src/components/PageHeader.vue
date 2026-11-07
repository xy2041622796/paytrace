<template>
  <header class="pt-page-head">
    <div class="pt-page-head-main">
      <span v-if="eyebrow" class="pt-eyebrow">{{ eyebrow }}</span>
      <h1 class="pt-title">{{ title }}</h1>
      <p v-if="desc" class="pt-sub">{{ desc }}</p>
      <slot name="sub" />
    </div>
    <div v-if="$slots.actions" class="pt-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  desc: { type: String, default: '' }
})
</script>
