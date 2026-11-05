// ============================================================
// 响应式媒体查询：供需要切换组件 props（而非纯 CSS）的场景使用
// ============================================================
import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useMediaQuery(query) {
  const matches = ref(false)
  let mq = null
  const onChange = (e) => { matches.value = e.matches }

  onMounted(() => {
    mq = window.matchMedia(query)
    matches.value = mq.matches
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  })
  onBeforeUnmount(() => {
    if (!mq) return
    if (mq.removeEventListener) mq.removeEventListener('change', onChange)
    else if (mq.removeListener) mq.removeListener(onChange)
  })
  return matches
}

export const useIsMobile = () => useMediaQuery('(max-width: 768px)')
