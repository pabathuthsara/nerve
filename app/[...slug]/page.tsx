import { isAuthRoute, RouteView, type AuthContext } from '@/components/route-view'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { currentUser } from '@/lib/db/server'

async function authContext(path: string): Promise<AuthContext> {
  return {
    recoverySession: path === '/reset-password' ? !!(await currentUser()) : false,
    devLoginEmail:
      process.env.NODE_ENV !== 'production' && process.env.DEV_LOGIN_EMAIL && process.env.DEV_LOGIN_PASSWORD
        ? process.env.DEV_LOGIN_EMAIL
        : null,
  }
}

export default async function FrontendRoute({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params
  const path = `/${slug.join('/')}`
  await enforceFrontendGuard(path)
  const raw = await searchParams
  const query = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  return <RouteView path={path} query={query} auth={isAuthRoute(path) ? await authContext(path) : undefined} />
}
