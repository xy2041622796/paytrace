import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：纯前端 + Supabase JS，无自建后端
// 使用 hash 路由，部署到 Vercel / 任意静态托管无需额外 rewrite 规则
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Naive UI 按需引入后 ui 约 751 kB（gzip 198 kB），
    // 已拆为独立长期缓存 chunk，业务代码改动不会让它失效
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 按依赖域拆包：业务代码改动不会让图表/组件库缓存失效，也便于并行下载
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('echarts') || id.includes('zrender')) return 'charts'
          if (
            id.includes('naive-ui') || id.includes('vueuc') || id.includes('vooks') ||
            id.includes('seemly') || id.includes('css-render') || id.includes('evtd') ||
            id.includes('date-fns') || id.includes('treemate')
          ) return 'ui'
          if (id.includes('@supabase')) return 'supabase'
          return 'vendor'
        }
      }
    }
  }
})
