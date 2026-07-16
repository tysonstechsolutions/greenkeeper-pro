import type { Profile } from '@/types/database'

export const mockSuperintendent: Profile = {
  id: 'test-super-id',
  email: 'super@test.com',
  full_name: 'Test Superintendent',
  display_name: 'Super',
  role: 'super',
  phone: '555-0100',
  avatar_url: null,
  user_preferences: null,
  is_active: true,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

export const mockCrewMember: Profile = {
  id: 'test-crew-id',
  email: 'crew@test.com',
  full_name: 'Test Crew Member',
  display_name: 'Crew',
  role: 'crew',
  phone: '555-0101',
  avatar_url: null,
  user_preferences: null,
  is_active: true,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}
