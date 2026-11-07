<template>
  <section
    class="pt-card"
    :class="{
      'pt-card--flat': flat,
      'pt-card--accent': accent,
      'pt-card--muted': muted
    }"
  >
    <div v-if="title || $slots.actions" class="pt-section-head">
      <div>
        <div class="pt-section-title">
          <span v-if="icon" class="pt-ico"><AppIcon :name="icon" :size="16" /></span>
          <span>{{ title }}</span>
          <slot name="title-extra" />
        </div>
        <p v-if="desc" class="pt-section-desc">{{ desc }}</p>
      </div>
      <div v-if="$slots.actions" class="pt-section-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="pt-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  icon: { type: String, default: '' },
  flat: { type: Boolean, default: false },
  accent: { type: Boolean, default: false },
  muted: { type: Boolean, default: false }
})
</script>
