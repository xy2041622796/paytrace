<template>
  <!-- 纯 SVG 状态伙伴：不使用 emoji，随余额状态换表情与配色，深浅色主题均可读。
       加入可爱安静的二次元微动效：轻浮动、呼吸、眨眼，状态切换时有俏皮回落。 -->
  <svg
    class="mascot"
    :width="size"
    :height="size"
    viewBox="0 0 120 120"
    role="img"
    :aria-label="aria"
    :style="{ '--mascot-amt': Math.max(1, size * 0.03) + 'px' }"
  >
    <circle class="mascot-glow" cx="60" cy="62" r="52" :style="{ fill: glow }" opacity=".16" />
    <g class="mascot-body">
      <g class="mascot-face" :key="level">
        <path class="mascot-ear" d="M28 44 L30 16 L52 34 Z" :style="{ fill: face, stroke: line }" stroke-width="2" stroke-linejoin="round" />
        <path class="mascot-ear" d="M92 44 L90 16 L68 34 Z" :style="{ fill: face, stroke: line }" stroke-width="2" stroke-linejoin="round" />
        <circle cx="60" cy="64" r="38" :style="{ fill: face, stroke: line }" stroke-width="2" />
        <g class="mascot-eyes" v-if="level === 'neg'">
          <path d="M42 58 l10 8 M52 58 l-10 8" :style="{ stroke: line }" stroke-width="3" stroke-linecap="round" fill="none" />
          <path d="M68 58 l10 8 M78 58 l-10 8" :style="{ stroke: line }" stroke-width="3" stroke-linecap="round" fill="none" />
        </g>
        <g class="mascot-eyes" v-else-if="level === 'ok'">
          <path d="M40 58 q6 -9 12 0" :style="{ stroke: line }" stroke-width="3" stroke-linecap="round" fill="none" />
          <path d="M68 58 q6 -9 12 0" :style="{ stroke: line }" stroke-width="3" stroke-linecap="round" fill="none" />
        </g>
        <g class="mascot-eyes" v-else>
          <circle cx="46" cy="59" r="3.6" :style="{ fill: line }" />
          <circle cx="74" cy="59" r="3.6" :style="{ fill: line }" />
        </g>
        <g class="mascot-blush" v-if="level === 'ok' || level === 'mid'" opacity=".5">
          <ellipse cx="35" cy="72" rx="7" ry="4" :style="{ fill: blush }" />
          <ellipse cx="85" cy="72" rx="7" ry="4" :style="{ fill: blush }" />
        </g>
        <path :d="mouth" :style="{ stroke: line }" stroke-width="3" stroke-linecap="round" fill="none" />
        <g class="mascot-whisker" :style="{ stroke: line }" stroke-width="1.6" stroke-linecap="round" opacity=".4">
          <path d="M18 68 h12 M20 76 h11" />
          <path d="M102 68 h-12 M100 76 h-11" />
        </g>
      </g>
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: { type: String, default: 'mid' },
  size: { type: Number, default: 96 }
})

// 配色统一走设计系统语义 token：soft 底色 + 对应语义描边，深浅色主题皆可读。
// 通过 :style 绑定上色（CSS 属性支持 var()；SVG presentation attribute 不支持）。
const palette = {
  ok:  { face: 'var(--c-success-soft)', line: 'var(--c-success)', glow: 'var(--c-success)', blush: 'var(--c-primary)' },
  mid: { face: 'var(--c-primary-soft)', line: 'var(--c-primary)', glow: 'var(--c-primary)', blush: 'var(--c-primary)' },
  low: { face: 'var(--c-warning-soft)', line: 'var(--c-warning)', glow: 'var(--c-warning)', blush: 'var(--c-warning)' },
  neg: { face: 'var(--c-danger-soft)',  line: 'var(--c-danger)',  glow: 'var(--c-danger)',  blush: 'var(--c-danger)' }
}
const colors = computed(() => palette[props.level] || palette.mid)
const face = computed(() => colors.value.face)
const line = computed(() => colors.value.line)
const glow = computed(() => colors.value.glow)
const blush = computed(() => colors.value.blush)
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
.mascot {
  display: block;
  flex-shrink: 0;
  transform-origin: 50% 100%;
  will-change: transform;
  animation: mascot-float 4s var(--ease-out) infinite;
}
/* 状态切换时整张脸俏皮回落（:key 在 level 变化时重建子树，重放入场） */
.mascot-face {
  transform-box: fill-box;
  transform-origin: 50% 58%;
  animation: mascot-settle .55s var(--ease-out) backwards;
}
/* 身体随呼吸轻微缩放 */
.mascot-body {
  transform-box: fill-box;
  transform-origin: 50% 62%;
  animation: mascot-breathe 3.6s ease-in-out infinite;
}
/* 眼睛周期性眨一下 */
.mascot-eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: mascot-blink 4.6s infinite;
}
/* 光晕随呼吸明灭 */
.mascot-glow {
  animation: mascot-glow 3.6s ease-in-out infinite;
}

@keyframes mascot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(calc(var(--mascot-amt) * -1)); }
}
@keyframes mascot-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}
@keyframes mascot-settle {
  0% { transform: scale(.82) translateY(6%); }
  60% { transform: scale(1.05) translateY(-2%); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes mascot-blink {
  0%, 90%, 100% { transform: scaleY(1); }
  93% { transform: scaleY(.08); }
  96% { transform: scaleY(1); }
}
@keyframes mascot-glow {
  0%, 100% { opacity: .12; }
  50% { opacity: .24; }
}

/* 尊重系统的「减少动态效果」偏好 */
@media (prefers-reduced-motion: reduce) {
  .mascot,
  .mascot-body,
  .mascot-face,
  .mascot-eyes,
  .mascot-glow {
    animation: none !important;
  }
}
</style>
