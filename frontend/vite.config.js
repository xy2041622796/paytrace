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
          if (id.includes('@supabase')) return 'supabase'
          // vue 生态单独成 chunk：既不回落到 vendor 形成 ui ↔ vendor 循环，
          // 也不会把一个 chunk 撑过 800 kB；ui 只依赖 framework，方向单向
          if (/[\\/]node_modules[\\/](?:vue|@vue|pinia|vue-router)[\\/]/.test(id)) return 'framework'
          if (/[\\/]node_modules[\\/](?:naive-ui|vueuc|vooks|seemly|css-render|evtd|date-fns|treemate)[\\/]/.test(id)) return 'ui'
          return 'vendor'
        }
      }
    }
  }
})
