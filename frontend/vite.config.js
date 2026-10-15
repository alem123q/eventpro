import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// A donde reenvia Vite los pedidos a la API. En Docker es el servicio
// "backend"; corriendo sin Docker, el backend local.
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'

// HTTPS en desarrollo (certificado de prueba): los navegadores del celular
// solo permiten usar la camara en paginas con HTTPS. Se desactiva con
// VITE_HTTPS=false.
const useHttps = process.env.VITE_HTTPS !== 'false'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl({ name: 'eventpro-dev' })] : [])],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    // La pagina pide todo a su propio servidor (/api, /media) y Vite lo
    // reenvia al backend. Asi funciona igual desde la PC (localhost) que
    // desde el celular (IP de la PC en la red local).
    proxy: {
      '/api': { target: backendUrl, changeOrigin: true },
      '/media': { target: backendUrl, changeOrigin: true },
    },
  },
})
