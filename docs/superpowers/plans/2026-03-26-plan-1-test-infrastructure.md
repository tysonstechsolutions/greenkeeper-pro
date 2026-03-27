# Plan 1: Test Infrastructure Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up complete test infrastructure with Vitest, React Testing Library, MSW, and Playwright for the GreenKeeper Pro application.

**Architecture:** Test stack uses Vitest as the test runner (fast, Vite-native), React Testing Library for component tests, MSW for mocking Supabase API calls, and Playwright for E2E tests. Tests are organized by type in `src/__tests__/` and `tests/e2e/`.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/user-event, MSW 2.x, Playwright, happy-dom

---

## File Structure

```
src/
├── __tests__/
│   ├── setup.ts                    # Vitest setup with MSW
│   ├── utils/
│   │   └── test-utils.tsx          # Custom render with providers
│   ├── mocks/
│   │   ├── handlers.ts             # MSW request handlers
│   │   ├── server.ts               # MSW server setup
│   │   └── data/
│   │       ├── profiles.ts         # Mock profile data
│   │       ├── tasks.ts            # Mock task data
│   │       └── chemicals.ts        # Mock chemical data
│   ├── unit/
│   │   └── utils/
│   │       └── cn.test.ts          # Test cn utility
│   ├── hooks/
│   │   ├── useAuth.test.tsx        # Auth hook tests
│   │   ├── useTasks.test.tsx       # Tasks hook tests
│   │   └── useChemicals.test.tsx   # Chemicals hook tests
│   └── components/
│       └── ui/
│           └── button.test.tsx     # Button component test
tests/
├── e2e/
│   ├── auth.spec.ts                # Login/logout E2E tests
│   ├── tasks.spec.ts               # Task CRUD E2E tests
│   └── fixtures/
│       └── test-user.ts            # E2E test fixtures
└── playwright.config.ts            # Playwright configuration
vitest.config.ts                    # Vitest configuration
.env.test                           # Test environment variables
```

---

### Task 1: Install Test Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vitest and React Testing Library**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/dom happy-dom
```

- [ ] **Step 2: Install MSW for API mocking**

```bash
npm install -D msw@latest
```

- [ ] **Step 3: Install Playwright for E2E tests**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 4: Verify package.json has all test dependencies**

Run: `npm list vitest @testing-library/react msw @playwright/test`

Expected: All packages listed with versions

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add test dependencies (vitest, RTL, MSW, playwright)"
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test scripts)

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'tests/e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'src/__tests__',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `scripts` section in `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 3: Verify Vitest config is valid**

Run: `npx vitest --version`

Expected: Vitest version number printed

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest with happy-dom and path aliases"
```

---

### Task 3: Create Test Setup and MSW Server

**Files:**
- Create: `src/__tests__/setup.ts`
- Create: `src/__tests__/mocks/server.ts`
- Create: `src/__tests__/mocks/handlers.ts`

- [ ] **Step 1: Create MSW handlers**

```typescript
// src/__tests__/mocks/handlers.ts
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
```

- [ ] **Step 2: Create MSW server**

```typescript
// src/__tests__/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

- [ ] **Step 3: Create test setup file**

```typescript
// src/__tests__/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'

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
```

- [ ] **Step 4: Verify setup file syntax is correct**

Run: `npx tsc --noEmit src/__tests__/setup.ts src/__tests__/mocks/server.ts src/__tests__/mocks/handlers.ts`

Expected: No errors (or create tsconfig for tests if needed)

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/setup.ts src/__tests__/mocks/server.ts src/__tests__/mocks/handlers.ts
git commit -m "test: add MSW server setup and initial handlers"
```

---

### Task 4: Create Test Utilities

**Files:**
- Create: `src/__tests__/utils/test-utils.tsx`
- Create: `src/__tests__/mocks/data/profiles.ts`
- Create: `src/__tests__/mocks/data/tasks.ts`

- [ ] **Step 1: Create mock profile data**

```typescript
// src/__tests__/mocks/data/profiles.ts
import type { Profile } from '@/types/database'

export const mockSuperintendent: Profile = {
  id: 'test-super-id',
  email: 'super@test.com',
  full_name: 'Test Superintendent',
  display_name: 'Super',
  role: 'super',
  phone: '555-0100',
  avatar_url: null,
  hire_date: '2020-01-01',
  certifications: [],
  emergency_contact: null,
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
  hire_date: '2023-01-01',
  certifications: [],
  emergency_contact: null,
  is_active: true,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}
```

- [ ] **Step 2: Create mock task data**

```typescript
// src/__tests__/mocks/data/tasks.ts
import type { Task } from '@/types/database'

export const mockTask: Task = {
  id: 'test-task-id',
  title: 'Morning Mow - Greens',
  description: 'Daily morning mowing of all greens',
  category: 'mowing',
  priority: 'high',
  status: 'pending',
  assigned_to: 'test-crew-id',
  assigned_crew: null,
  assigned_by: 'test-super-id',
  due_date: new Date().toISOString().split('T')[0],
  due_time: '06:00:00',
  estimated_minutes: 120,
  actual_minutes: null,
  zone_id: null,
  hole_numbers: [],
  equipment_needed: ['Greens Mower #1'],
  materials_needed: [],
  checklist: [
    { id: '1', text: 'Check mower height', checked: false },
  ],
  requires_photo_before: false,
  requires_photo_after: false,
  weather_dependent: true,
  weather_conditions: null,
  recurring_rule: null,
  template_id: null,
  plan_goal_id: null,
  parent_task_id: null,
  notes: null,
  completed_at: null,
  completed_by: null,
  verified_at: null,
  verified_by: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

export const mockCompletedTask: Task = {
  ...mockTask,
  id: 'completed-task-id',
  title: 'Completed Task',
  status: 'completed',
  completed_at: '2024-01-01T10:00:00Z',
  completed_by: 'test-crew-id',
}
```

- [ ] **Step 3: Create custom render utility**

```typescript
// src/__tests__/utils/test-utils.tsx
import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Wrapper component for providers (add as needed)
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllTheProviders, ...options }),
  }
}

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }
export { userEvent }
```

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/utils/test-utils.tsx src/__tests__/mocks/data/profiles.ts src/__tests__/mocks/data/tasks.ts
git commit -m "test: add test utilities and mock data fixtures"
```

---

### Task 5: Create First Unit Test

**Files:**
- Create: `src/__tests__/unit/utils/cn.test.ts`

- [ ] **Step 1: Write the test for cn utility**

```typescript
// src/__tests__/unit/utils/cn.test.ts
import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn utility', () => {
  it('merges class names', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    const result = cn('base', true && 'included', false && 'excluded')
    expect(result).toBe('base included')
  })

  it('handles undefined and null', () => {
    const result = cn('base', undefined, null, 'end')
    expect(result).toBe('base end')
  })

  it('merges Tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })

  it('returns empty string for no arguments', () => {
    const result = cn()
    expect(result).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/unit/utils/cn.test.ts`

Expected: All 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/unit/utils/cn.test.ts
git commit -m "test: add unit tests for cn utility function"
```

---

### Task 6: Create Component Test

**Files:**
- Create: `src/__tests__/components/ui/button.test.tsx`

- [ ] **Step 1: Write Button component test**

```typescript
// src/__tests__/components/ui/button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../utils/test-utils'
import { Button } from '@/components/ui/button'

describe('Button component', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const handleClick = vi.fn()
    const { user } = render(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('renders different variants', () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-destructive')

    rerender(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toHaveClass('border')
  })

  it('renders different sizes', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-9')
  })

  it('renders as child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    )
    expect(screen.getByRole('link', { name: /link button/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the component test**

Run: `npx vitest run src/__tests__/components/ui/button.test.tsx`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/ui/button.test.tsx
git commit -m "test: add component tests for Button"
```

---

### Task 7: Create Test Environment File

**Files:**
- Create: `.env.test`

- [ ] **Step 1: Create test environment variables**

```bash
# .env.test
# Test environment - uses mock services

NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
NEXT_PUBLIC_WEATHER_API_KEY=test-weather-key
ANTHROPIC_API_KEY=test-anthropic-key
DAILY_BRIEFING_SECRET=test-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 2: Add .env.test to .gitignore exception (keep in repo)**

Verify `.env.test` is NOT in `.gitignore` (test config is safe to commit)

- [ ] **Step 3: Commit**

```bash
git add .env.test
git commit -m "chore: add test environment configuration"
```

---

### Task 8: Configure Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/test-user.ts`

- [ ] **Step 1: Create Playwright config**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
```

- [ ] **Step 2: Create test user fixture**

```typescript
// tests/e2e/fixtures/test-user.ts
export const testUser = {
  email: 'e2e-test@greenkeeper.test',
  password: 'TestPassword123!',
  name: 'E2E Test User',
}

// For authenticated tests, we'll use this stored auth state
export const STORAGE_STATE = 'tests/e2e/.auth/user.json'
```

- [ ] **Step 3: Create auth directory for Playwright**

```bash
mkdir -p tests/e2e/.auth
echo '{}' > tests/e2e/.auth/.gitkeep
```

- [ ] **Step 4: Add auth state to gitignore**

Add to `.gitignore`:
```
tests/e2e/.auth/user.json
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures/test-user.ts tests/e2e/.auth/.gitkeep .gitignore
git commit -m "chore: configure Playwright for E2E testing"
```

---

### Task 9: Create First E2E Test

**Files:**
- Create: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Write login page E2E test**

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')

    // Check page elements
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows validation error for empty form', async ({ page }) => {
    await page.goto('/login')

    // Click submit without filling form
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show some form of validation (HTML5 or custom)
    const emailInput = page.getByLabel(/email/i)
    await expect(emailInput).toHaveAttribute('required')
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill with invalid credentials
    await page.getByLabel(/email/i).fill('invalid@test.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show error message (wait for API response)
    await expect(page.getByText(/invalid|error|incorrect/i)).toBeVisible({ timeout: 10000 })
  })

  test('redirects unauthenticated users from dashboard', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})
```

- [ ] **Step 2: Run the E2E test (requires dev server)**

Run: `npx playwright test tests/e2e/auth.spec.ts --headed`

Expected: Tests run (some may fail if login page differs - adjust selectors)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth.spec.ts
git commit -m "test: add E2E tests for authentication flow"
```

---

### Task 10: Verify Full Test Suite

**Files:**
- None (verification only)

- [ ] **Step 1: Run all unit/component tests**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 2: Run tests with coverage**

Run: `npm run test:coverage`

Expected: Coverage report generated

- [ ] **Step 3: Run E2E tests**

Run: `npm run test:e2e`

Expected: E2E tests run (pass or provide clear failure reasons)

- [ ] **Step 4: Verify all test scripts work**

Run: `npm run test -- --help`

Expected: Vitest help output

- [ ] **Step 5: Final commit for test infrastructure**

```bash
git add -A
git commit -m "test: complete test infrastructure setup

- Vitest configured with happy-dom
- React Testing Library with custom render
- MSW for API mocking
- Playwright for E2E testing
- Test utilities and mock data
- Initial unit, component, and E2E tests"
```

---

## Summary

After completing Plan 1, you will have:

1. **Vitest** configured with happy-dom environment and path aliases
2. **React Testing Library** with custom render utilities
3. **MSW** server for mocking Supabase API calls
4. **Playwright** configured for E2E testing
5. **Mock data** for profiles and tasks
6. **Initial tests** demonstrating each test type
7. **npm scripts** for running tests

The foundation is ready for Plan 2 to add more comprehensive test coverage for critical features.
