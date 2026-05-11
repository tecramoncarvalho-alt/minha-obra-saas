import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Minha Obra',
    short_name: 'Minha Obra',
    description: 'Gestão de obras com Linha de Balanço',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1e3a5f',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
