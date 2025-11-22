import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        global: 'window', // Polyfill global for simple-peer
    },
    resolve: {
        alias: {
            events: 'events',
            util: 'util',
        },
    },
    optimizeDeps: {
        include: ['events', 'util'],
    },
})
