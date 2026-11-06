<template>
  <!-- 纯 SVG 状态伙伴：不使用 emoji，随余额状态换表情与配色，深浅色主题均可读 -->
  <svg
    class="mascot"
    :width="size"
    :height="size"
    viewBox="0 0 120 120"
    role="img"
    :aria-label="aria"
  >
    <circle cx="60" cy="62" r="52" :fill="glow" opacity=".16" />
    <path d="M28 44 L30 16 L52 34 Z" :fill="face" :stroke="line" stroke-width="2" stroke-linejoin="round" />
    <path d="M92 44 L90 16 L68 34 Z" :fill="face" :stroke="line" stroke-width="2" stroke-linejoin="round" />
    <circle cx="60" cy="64" r="38" :fill="face" :stroke="line" stroke-width="2" />
    <g v-if="level === 'neg'">
      <path d="M42 58 l10 8 M52 58 l-10 8" :stroke="line" stroke-width="3" stroke-linecap="round" fill="none" />
      <path d="M68 58 l10 8 M78 58 l-10 8" :stroke="line" stroke-width="3" stroke-linecap="round" fill="none" />
    </g>
    <g v-else-if="level === 'ok'">
      <path d="M40 58 q6 -9 12 0" :stroke="line" stroke-width="3" stroke-linecap="round" fill="none" />
      <path d="M68 58 q6 -9 12 0" :stroke="line" stroke-width="3" stroke-linecap="round" fill="none" />
    </g>
    <g v-else>
      <circle cx="46" cy="59" r="3.6" :fill="line" />
      <circle cx="74" cy="59" r="3.6" :fill="line" />
    </g>
    <g v-if="level === 'ok' || level === 'mid'" opacity=".5">
      <ellipse cx="35" cy="72" rx="7" ry="4" fill="#FF9A76" />
      <ellipse cx="85" cy="72" rx="7" ry="4" fill="#FF9A76" />
    </g>
    <path :d="mouth" :stroke="line" stroke-width="3" stroke-linecap="round" fill="none" />
    <g :stroke="line" stroke-width="1.6" stroke-linecap="round" opacity=".4">
      <path d="M18 68 h12 M20 76 h11" />
      <path d="M102 68 h-12 M100 76 h-11" />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: { type: String, default: 'mid' },
  size: { type: Number, default: 96 }
})

const palette = {
  ok: { face: '#D9F7E9', line: '#0F9D6E', glow: '#34D399' },
  mid: { face: '#FFE7DA', line: '#D9531E', glow: '#FF8457' },
  low: { face: '#FFF0CC', line: '#A15C07', glow: '#FBBF24' },
  neg: { face: '#FFE0E0', line: '#B52D2D', glow: '#F87171' }
}
const colors = computed(() => palette[props.level] || palette.mid)
const face = computed(() => colors.value.face)
const line = computed(() => colors.value.line)
const glow = computed(() => colors.value.glow)
const mouth = computed(() => ({
  ok: 'M50 76 q10 12 20 0',
  mid: 'M52 78 q8 5 16 0',
  low: 'M50 81 q10 -6 20 0',
  neg: 'M50 85 q10 -12 20 0'
}[props.level] || 'M52 78 q8 5 16 0'))
const aria = computed(() => ({
  ok: '状态：宽裕', mid: '状态：平稳', low: '状态：偏紧', neg: '状态：告急'
}[props.level] || '状态：平稳'))
</script>

<style scoped>
.mascot { display: block; flex-shrink: 0; }
</style>
