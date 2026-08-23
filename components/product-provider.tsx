'use client'

import { MotionConfig } from 'framer-motion'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Track } from '@/lib/data/types'

interface ProductContextValue {
  track: Track
  setTrack: (track: Track) => void
  selectedInterviewerId: string
  setSelectedInterviewerId: (id: string) => void
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function ProductProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<Track>('dating')
  const [selectedInterviewerId, setSelectedInterviewerId] = useState('aisha-rahman')
  const value = useMemo(() => ({ track, setTrack, selectedInterviewerId, setSelectedInterviewerId }), [selectedInterviewerId, track])
  return <ProductContext.Provider value={value}><MotionConfig reducedMotion="user">{children}</MotionConfig></ProductContext.Provider>
}

export function useProduct() {
  const value = useContext(ProductContext)
  if (!value) throw new Error('useProduct must be used inside ProductProvider')
  return value
}
