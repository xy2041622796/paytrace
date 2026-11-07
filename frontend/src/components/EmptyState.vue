<template>
  <div class="pt-empty">
    <span class="pt-ico"><AppIcon :name="icon" :size="22" /></span>
    <span><slot>{{ text }}</slot></span>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  text: { type: String, default: '暂无数据' },
  icon: { type: String, default: 'inbox' }
})
</script>
