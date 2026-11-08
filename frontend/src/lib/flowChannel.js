// ============================================================
// 跨标签页流水同步（真实 / 演示模式通用）
// 任一标签页写入流水后广播，其它标签页静默重拉；BroadcastChannel
// 不可用时降级为无操作，不影响业务流程。
// ============================================================
const CHANNEL = 'paytrace:flow'

export function broadcastFlowChange() {
  try {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage('transactions-changed')
    ch.close()
  } catch {
    // 隐私模式 / 浏览器不支持：忽略
  }
}

// 返回取消订阅函数；组件卸载时必须调用
export function subscribeFlowChange(handler) {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => {}
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = () => handler()
    return () => {
      try { ch.close() } catch { /* noop */ }
    }
  } catch {
    return () => {}
  }
}
