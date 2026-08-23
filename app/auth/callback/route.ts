/**
 * OAuth code exchange. Nothing routes here yet — it exists so that turning on
 * Google (§04) is a dashboard change plus one button, not a new code path.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/db/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=oauth`)
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=oauth`)
  }
  return NextResponse.redirect(`${origin}${next}`)
}
