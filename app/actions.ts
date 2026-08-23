'use server'

/**
 * Form-shaped wrappers. A `<form action={...}>` hands the action a FormData,
 * which is the wrong shape for the typed functions in app/rep/actions.ts —
 * and loosening those to accept FormData would weaken every caller to please
 * one button.
 */

import { deleteSession } from './rep/actions'

export async function deleteSessionForm(form: FormData): Promise<void> {
  const id = String(form.get('sessionId') ?? '')
  if (id) await deleteSession(id)
}
