import { describe, expect, it } from 'vitest'
import { boundedRequestId, proxiedRequestId, PROVIDER_REQUEST_ID_HEADER, vendorRequestId } from './request-id'

describe('provider request identifiers', () => {
  it('retains only a bounded opaque identifier', () => {
    expect(boundedRequestId(' req_abcd-1234:5678 ')).toBe('req_abcd-1234:5678')
    for (const id of [null, '', 'x'.repeat(161), 'contains spaces', 'line\nbreak', '{"body":"secret"}']) {
      expect(boundedRequestId(id)).toBeNull()
    }
  })

  it('supports the two upstream request ID header names without forwarding other headers', () => {
    expect(vendorRequestId(new Headers({ 'x-request-id': 'openai-request' }))).toBe('openai-request')
    expect(vendorRequestId(new Headers({ 'request-id': 'eleven-request' }))).toBe('eleven-request')
    expect(vendorRequestId(new Headers({ authorization: 'a-standing-key' }))).toBeNull()
    expect(proxiedRequestId(new Headers({ [PROVIDER_REQUEST_ID_HEADER]: 'proxy-request' }))).toBe('proxy-request')
  })
})
