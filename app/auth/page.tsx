import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/db/server'
import { AuthForm } from './auth-form'
import { DevSignIn } from './dev-sign-in'

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await currentUser()) redirect('/')
  const { error } = await searchParams

  // Mirrors the gates inside devSignIn(). The action re-checks them itself —
  // this only decides whether to draw the button.
  const devLogin =
    process.env.NODE_ENV !== 'production'
    && !!process.env.DEV_LOGIN_EMAIL
    && !!process.env.DEV_LOGIN_PASSWORD

  return (
    <>
      <AuthForm linkError={error === 'link' || error === 'oauth'} />
      {devLogin && <DevSignIn email={process.env.DEV_LOGIN_EMAIL!} />}
    </>
  )
}
