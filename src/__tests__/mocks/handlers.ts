import { http, HttpResponse } from 'msw'

const SUPABASE_URL = 'http://localhost:54321'

export const handlers = [
  // Auth endpoints
  http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'authenticated',
      },
    })
  }),

  // Get session
  http.get(`${SUPABASE_URL}/auth/v1/user`, () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'authenticated',
    })
  }),

  // Profiles endpoint
  http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (id === 'eq.test-user-id') {
      return HttpResponse.json([
        {
          id: 'test-user-id',
          email: 'test@example.com',
          full_name: 'Test Superintendent',
          role: 'super',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ])
    }

    return HttpResponse.json([])
  }),

  // Tasks endpoint
  http.get(`${SUPABASE_URL}/rest/v1/tasks`, () => {
    return HttpResponse.json([])
  }),

  http.post(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      id: 'new-task-id',
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }),
]
