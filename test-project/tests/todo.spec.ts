import { test, expect } from '@playwright/test';

test.describe('TodoMVC', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the app title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('todos');
  });

  test('should add a new todo item', async ({ page }) => {
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Buy groceries');
    await input.press('Enter');
    await expect(page.getByTestId('todo-title')).toHaveText('Buy groceries');
  });

  test('should mark a todo as completed', async ({ page }) => {
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Walk the dog');
    await input.press('Enter');
    await page.getByRole('checkbox').first().check();
    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should filter active todos', async ({ page }) => {
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('First task');
    await input.press('Enter');
    await input.fill('Second task');
    await input.press('Enter');
    await page.getByRole('checkbox').first().check();
    await page.getByRole('link', { name: 'Active' }).click();
    await expect(page.getByTestId('todo-title')).toHaveCount(1);
    await expect(page.getByTestId('todo-title')).toHaveText('Second task');
  });

  test('should show item count', async ({ page }) => {
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Task one');
    await input.press('Enter');
    await input.fill('Task two');
    await input.press('Enter');
    await expect(page.locator('.todo-count')).toContainText('2');
  });
});
