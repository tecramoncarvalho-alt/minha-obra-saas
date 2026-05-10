'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EquipeRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/membros') }, [])
  return null
}
