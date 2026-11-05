// ============================================================
// 写操作互斥锁：防止快速连点造成重复插入
// 一个页面共用一个 busy，任何写操作进行中都会拒绝新的写请求
// ============================================================
import { ref } from 'vue'

export function useBusy(reportError) {
  const busy = ref(false)

  async function run(task) {
    if (busy.value) return false
    busy.value = true
    try {
      await task()
      return true
    } catch (e) {
      reportError(e?.message || '操作失败')
      return false
    } finally {
      busy.value = false
    }
  }

  return { busy, run }
}
