<template>
  <svg
    class="pt-icon"
    :width="size" :height="size"
    viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: 'info' },
  size: { type: [Number, String], default: 18 }
})

// 统一线性图标集：路径来自内部常量表，不接受任何外部输入，纯 SVG 渲染
const ICONS = {
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  calendar: ['M3 5h18v16H3z', 'M3 9h18', 'M8 3v4', 'M16 3v4'],
  sparkles: ['M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z', 'M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z'],
  book: ['M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z', 'M4 5v14', 'M8 7h7'],
  settings: ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M19.1 4.9L17 7', 'M7 17l-2.1 2.1'],
  shield: ['M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z', 'M9 12l2 2 4-4'],
  check: ['M20 6L9 17l-5-5'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  sun: ['M12 7a5 5 0 100 10 5 5 0 000-10z', 'M12 1v3', 'M12 20v3', 'M1 12h3', 'M20 12h3', 'M4.2 4.2l2.1 2.1', 'M17.7 17.7l2.1 2.1', 'M19.8 4.2l-2.1 2.1', 'M6.3 17.7l-2.1 2.1'],
  moon: ['M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z'],
  logout: ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z'],
  refresh: ['M20 11a8 8 0 10-2.3 6.7', 'M20 4v7h-7'],
  left: ['M15 18l-6-6 6-6'],
  right: ['M9 18l6-6-6-6'],
  alert: ['M12 3L2 20h20z', 'M12 9v5', 'M12 17h.01'],
  wallet: ['M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M3 7V6a2 2 0 012-2h12', 'M16 13h3'],
  chart: ['M3 3v18h18', 'M7 15l4-5 3 3 5-7'],
  target: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 11a1 1 0 100 2 1 1 0 000-2z'],
  info: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 11v5', 'M12 8h.01'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 018 0v4'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21a8 8 0 0116 0'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  eyeOff: ['M3 3l18 18', 'M10.6 10.6a3 3 0 004.2 4.2', 'M9.9 5.2A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.2 3.1', 'M6.2 6.2C3.7 7.9 2 12 2 12s3.5 7 10 7a10 10 0 002.2-.2'],
  arrowRight: ['M4 12h16', 'M14 6l6 6-6 6'],
  file: ['M6 2h9l5 5v15H6z', 'M15 2v5h5', 'M9 13h6', 'M9 17h6'],
  coins: ['M12 3a9 3 0 100 6 9 3 0 000-6z', 'M3 9v6c0 1.7 4 3 9 3s9-1.3 9-3V9', 'M3 15v3c0 1.7 4 3 9 3s9-1.3 9-3v-3'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v5l3 2'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  inbox: ['M3 5h18v14H3z', 'M3 13h5l2 3h4l2-3h5'],
  trend: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  shieldCheck: ['M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z', 'M8.5 12l2.5 2.5 4.5-4.5'],
  listCheck: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M3 6l1.5 1.5L7 5', 'M3 12l1.5 1.5L7 11', 'M3 18l1.5 1.5L7 17'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0012 3z']
}

const paths = computed(() => ICONS[props.name] || ICONS.info)
</script>

<style scoped>
.pt-icon { display: block; flex: none; }
</style>
