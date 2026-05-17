"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OrganizationsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/manage') }, [router])
  return null
}
