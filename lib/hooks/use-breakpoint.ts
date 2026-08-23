'use client'

import { useEffect, useState } from 'react'

export function useBreakpoint() {
  const [isDesktop, setDesktop] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return { isDesktop }
}

