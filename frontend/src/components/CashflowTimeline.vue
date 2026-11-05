<template>
  <div ref="chartEl" class="timeline" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkPointComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useThemeStore } from '../stores/theme'
import { useIsMobile } from '../composables/useMediaQuery'
import { DAY_TYPE_LABEL, formatMoney } from '../lib/labels'

// 按需注册：只打包折线图与用到的组件，避免全量 ECharts 撑大首屏包
echarts.use([
  LineChart, GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkPointComponent, CanvasRenderer
])

const props = defineProps({
  dates: { type: Array, default: () => [] },
  dayTypes: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  series: { type: Object, default: () => ({}) }, // { 情景名: 逐日余额[] }
  mainLabel: { type: String, default: '' }
})

const chartEl = ref(null)
const theme = useThemeStore()
const isMobile = useIsMobile()
let chart = null
let observer = null

// 图表配色全部从 CSS 变量读取：主题切换后重绘即生效，JS 里不维护第二套色板
function palette() {
  const s = getComputedStyle(document.documentElement)
  const v = (name, fallback) => (s.getPropertyValue(name) || '').trim() || fallback
  return {
    text: v('--c-text', '#1F2937'),
    text2: v('--c-text-2', '#6B7280'),
    text3: v('--c-text-3', '#9CA3AF'),
    border: v('--c-border', '#E5E7EB'),
    split: v('--c-split', '#F3F4F6'),
    surface: v('--c-surface', '#FFFFFF'),
    primary: v('--c-primary', '#FF6B35'),
    success: v('--c-success', '#10B981'),
    danger: v('--c-danger', '#EF4444'),
    warning: v('--c-warning', '#F59E0B')
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(255,107,53,${alpha})`
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function buildOption() {
  const p = palette()
  const mobile = isMobile.value
  const labels = Object.keys(props.series)
  const styleOf = (l, i) =>
    l === props.mainLabel
      ? { color: p.primary, width: 2.5, type: 'solid' }
      : { color: i % 2 ? '#9CA3AF' : '#60A5FA', width: 1.5, type: 'dashed' }

  const seriesArr = labels.map((l, i) => {
    const st = styleOf(l, i)
    return {
      name: l,
      type: 'line',
      data: props.series[l],
      smooth: true,
      symbol: 'none',
      // 折线从左到右逐点绘出；只影响绘制过程，数据点与数值不变
      animationDelay: (idx) => idx * 8,
      lineStyle: { color: st.color, width: st.width, type: st.type },
      itemStyle: { color: st.color },
      areaStyle:
        l === props.mainLabel
          ? {
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: hexToRgba(p.primary, 0.18) },
                  { offset: 1, color: hexToRgba(p.primary, 0.01) }
                ]
              }
            }
          : undefined,
      z: l === props.mainLabel ? 3 : 1
    }
  })

  const markData = props.events.map((e) => ({
    xAxis: props.dates[e.day - 1],
    yAxis: props.series[props.mainLabel] ? props.series[props.mainLabel][e.day - 1] : 0,
    value: e.label,
    itemStyle: {
      color: e.type === 'pay' ? p.success : e.type === 'repay' ? p.danger : p.warning
    }
  }))

  const labelInterval = Math.max(1, Math.floor(props.dates.length / (mobile ? 5 : 10)))

  return {
    animation: true,
    animationDuration: 520,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 320,
    animationEasingUpdate: 'cubicOut',
    grid: { left: mobile ? 46 : 56, right: mobile ? 12 : 24, top: 38, bottom: 40 },
    legend: {
      data: labels,
      top: 0,
      textStyle: { color: p.text2, fontSize: 11 },
      itemWidth: 18,
      itemHeight: 10,
      itemGap: mobile ? 8 : 12
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.18);',
      axisPointer: { lineStyle: { color: p.border } },
      formatter: (param) => {
        if (!param || !param.length) return ''
        const idx = param[0].dataIndex
        const dt = DAY_TYPE_LABEL[props.dayTypes[idx]] || ''
        const ev = props.events
          .filter((e) => e.day - 1 === idx)
          .map((e) => `${e.label}：${formatMoney(e.amount)}`)
          .join('<br/>')
        const lines = param.map((s) => `${s.seriesName}：<b>${formatMoney(s.data)}</b>`).join('<br/>')
        return `${props.dates[idx]} · ${dt}<br/>${lines}${ev ? '<br/>' + ev : ''}`
      }
    },
    xAxis: {
      type: 'category',
      data: props.dates,
      axisLine: { lineStyle: { color: p.border } },
      axisLabel: { color: p.text2, fontSize: 11, interval: labelInterval },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '元',
      nameTextStyle: { color: p.text3 },
      splitLine: { lineStyle: { color: p.split } },
      axisLabel: { color: p.text2, fontSize: 11 }
    },
    series: seriesArr.map((s, i) =>
      i === 0
        ? {
            ...s,
            markLine: {
              silent: true,
              symbol: 'none',
              data: [{ yAxis: 0 }],
              lineStyle: { color: p.text3, type: 'dashed' },
              label: { formatter: '零线', color: p.text3 }
            },
            markPoint: { data: markData, symbolSize: 10, label: { show: false } }
          }
        : s
    )
  }
}

function render() {
  if (!chart) return
  chart.setOption(buildOption(), true)
}
function resize() {
  chart && chart.resize()
}

onMounted(() => {
  chart = echarts.init(chartEl.value)
  render()
  window.addEventListener('resize', resize)
  // 容器宽度变化（侧边栏折叠、移动端旋屏）不一定触发 window resize
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(chartEl.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  observer && observer.disconnect()
  observer = null
  chart && chart.dispose()
  chart = null
})
watch(() => [props.dates, props.series, props.events, props.dayTypes], render, { deep: true })
watch(() => theme.mode, () => nextTick(render))
watch(() => isMobile.value, () => nextTick(render))
</script>

<style scoped>
.timeline { width: 100%; height: 340px; }

@media (max-width: 768px) {
  .timeline { height: 260px; }
}
</style>
