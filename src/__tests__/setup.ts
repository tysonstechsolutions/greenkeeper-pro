import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'
import '@testing-library/jest-dom/vitest'

// There is no app server in tests. A page that fetches a relative URL (for
// example a Supabase URL left blank) would make happy-dom dial
// localhost:3000 and print a connection error. Fail those the same way,
// without the network or the noise.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let url: URL | null = null
  try {
    url = new URL(raw, globalThis.location?.href ?? 'http://localhost:3000/')
  } catch {
    url = null
  }
  if (url && /^(localhost|127\.0\.0\.1)$/.test(url.hostname) && url.port === '3000') {
    return Promise.reject(new TypeError(`Failed to fetch ${url.pathname} (no app server in tests)`))
  }
  return realFetch(input, init)
}) as typeof fetch

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers after each test
afterEach(() => {
  cleanup()
  server.resetHandlers()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})
