<template>
  <span class="pt-chip" :class="tone ? 'pt-chip--' + tone : ''">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
  // primary | danger | warning | success | info | ''（中性）
  tone: { type: String, default: '' }
})
</script>
