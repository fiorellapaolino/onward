import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' → rutas relativas. Necesario para que funcione
// tanto en itch.io (navegador) como dentro de Electron (.exe / .app).
export default defineConfig({
  plugins: [react()],
  base: './',
})
