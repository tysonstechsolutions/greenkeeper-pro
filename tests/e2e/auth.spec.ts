import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')

    // Check page elements based on actual login page
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // Check branding elements
    await expect(page.getByRole('heading', { name: 'GreenKeeper Pro' })).toBeVisible()
    await expect(page.getByText('Championship Course Management')).toBeVisible()
  })

  test('shows validation error for empty form', async ({ page }) => {
    await page.goto('/login')

    // Click submit without filling form
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Should show HTML5 validation - both fields are required
    const emailInput = page.getByLabel('Email address')
    const passwordInput = page.getByLabel('Password')

    await expect(emailInput).toHaveAttribute('required')
    await expect(passwordInput).toHaveAttribute('required')
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill with invalid credentials
    await page.getByLabel('Email address').fill('invalid@test.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Should show error message (wait for API response)
    // The error appears in a div with AlertCircle icon
    await expect(page.locator('div').filter({ hasText: /invalid|error|incorrect/i }).first()).toBeVisible({ timeout: 10000 })
  })

  test('redirects unauthenticated users from dashboard', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('displays loading state during submission', async ({ page }) => {
    await page.goto('/login')

    // Fill with any credentials to trigger submission
    await page.getByLabel('Email address').fill('test@example.com')
    await page.getByLabel('Password').fill('testpassword')

    // Start submission
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Should show loading state with "Signing in..." text
    await expect(page.getByText('Signing in...')).toBeVisible({ timeout: 2000 })
  })
})
