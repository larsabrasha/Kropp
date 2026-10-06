import { expect, test } from '@playwright/test'

// The app's core claim: once opened, it starts, saves and shows what was saved with no network.
// Only the production build has the service worker, so this runs against `vite preview`.

test('starts, saves a workout and shows it again with no network', async ({ page, context }) => {
  await page.goto('/')
  // The worker precaches the app on install and claims the page when active (clientsClaim), so a
  // controller means the cache is complete.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  await page.reload()
  // The home page from the cache, not the browser's offline error. A fresh context has no workouts.
  await expect(page.getByTestId('empty-state')).toBeVisible()

  // An empty workout is the only choice without templates, and chosen already.
  await page.getByTestId('confirm-plan').click()
  // The page stays; the new workout is the one up next, and opens from there.
  await page.getByTestId('upcoming').click()
  await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/)
  const path = new URL(page.url()).pathname
  await expect(page.getByTestId('workout-body')).toBeVisible()

  // Saved on the device: still there after a reload, on its own page and as the next one at home.
  await page.reload()
  await expect(page.getByTestId('workout-body')).toBeVisible()
  await expect(page.getByTestId('not-found')).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByTestId('upcoming')).toHaveAttribute('href', path)
  await expect(page.getByTestId('empty-state')).toHaveCount(0)
})
