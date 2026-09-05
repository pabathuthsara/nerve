/** Only the provider's opaque request identifier crosses the proxy boundary.
 * Never forward arbitrary response headers or place response bodies in logs. */
export const PROVIDER_REQUEST_ID_HEADER = 'x-nerve-provider-request-id'

export function boundedRequestId(value: string | null | undefined): string | null {
  const id = value?.trim()
  return id && /^[A-Za-z0-9._:-]{1,160}$/.test(id) ? id : null
}

export function vendorRequestId(headers: Headers): string | null {
  return boundedRequestId(headers.get('x-request-id'))
    ?? boundedRequestId(headers.get('request-id'))
}

export function proxiedRequestId(headers: Headers): string | null {
  return boundedRequestId(headers.get(PROVIDER_REQUEST_ID_HEADER))
}
