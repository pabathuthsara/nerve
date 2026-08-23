/**
 * A signed-in user without sending an email.
 *
 *   npm run db:user -- you@example.com
 *
 * Supabase's built-in sender allows a couple of emails an hour, which is fine
 * for a real user signing in once and useless for the person building the
 * thing. This creates a confirmed user with a password, straight through the
 * service role, and prints what to put in `.env.local` so `/auth` can offer a
 * one-click sign-in.
 *
 * Development only. The password path it enables refuses to run when
 * NODE_ENV is production, in the server action as well as in the UI.
 */

import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { loadEnvLocal } from './env'

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const email = process.argv.slice(2).find((arg) => arg.includes('@'))
  if (!email) {
    console.error('Which email? e.g.  npm run db:user -- you@example.com')
    process.exit(1)
  }

  // Reuse the configured password if there is one, so re-running this does not
  // invalidate the .env.local you already pasted it into.
  const password = process.env['DEV_LOGIN_PASSWORD'] || `dev-${randomBytes(12).toString('hex')}`

  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const found = existing?.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())

  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
    })
    if (error) {
      console.error(`Could not update ${email}: ${error.message}`)
      process.exit(1)
    }
    console.log(`Updated ${email} (${found.id}).`)
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) {
      console.error(`Could not create ${email}: ${error?.message}`)
      process.exit(1)
    }
    console.log(`Created ${email} (${data.user.id}).`)
  }

  console.log('\nPut these in .env.local, then restart the dev server:\n')
  console.log(`DEV_LOGIN_EMAIL=${email}`)
  console.log(`DEV_LOGIN_PASSWORD=${password}`)
  console.log('\n/auth will then show a one-click sign-in. No email involved.')
}

void main()
