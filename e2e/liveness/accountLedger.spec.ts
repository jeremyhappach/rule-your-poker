import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { e2eEnvironment, requireTwoPlayerEnvironment } from './support/env';
import { acquireIdentityLease } from './support/runIsolation';
import { formatAccountAmount } from '../../src/lib/accountMoney';

test('published account statements show exact balances and explicit read failures', async ({ browser }, info) => {
  const credentials = requireTwoPlayerEnvironment();
  const lease = acquireIdentityLease(credentials, e2eEnvironment.isolation);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('/auth');
    await page.locator('#login-email').fill(credentials.player1.email);
    await page.locator('#login-password').fill(credentials.player1.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('Game Lobby', { exact: true }).first()).toBeVisible();
    const accountsResponse = page.waitForResponse(r => r.url().includes('/rpc/admin_account_balances') && r.request().method() === 'POST');
    await page.getByTitle('Player Balances', { exact: true }).click();
    const accountsHttp = await accountsResponse;
    expect(accountsHttp.ok()).toBe(true);
    const accounts = await accountsHttp.json();
    expect(accounts.length).toBeGreaterThan(0);
    const account = accounts[0];
    expect(typeof account.balance).toBe('string');
    const row = page.getByRole('dialog').getByRole('button').filter({ has: page.getByText(account.username, { exact: true }) }).first();
    await expect(row).toContainText(`$${formatAccountAmount(account.balance)}`);
    const statementResponse = page.waitForResponse(r => r.url().includes('/rpc/account_statement') && r.request().method() === 'POST' && r.request().postDataJSON()?.p_profile_id === account.id);
    await row.click();
    const statementHttp = await statementResponse;
    expect(statementHttp.ok()).toBe(true);
    const statement = await statementHttp.json();
    expect(statement.balance).toBe(account.balance);
    await expect(page.getByRole('dialog')).toContainText(`$${formatAccountAmount(statement.balance)}`);
    await expect(page.getByText('Transaction History', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('account-history.png') });
    await page.getByRole('button', { name: 'Back to player balances' }).click();
    await page.route('**/rest/v1/rpc/account_statement', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Deliberate read-failure verification' }) }));
    await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText(account.username, { exact: true }) }).first().click();
    await expect(page.getByRole('alert')).toContainText('Unable to load this account');
    await expect(page.getByRole('dialog')).not.toContainText('No transactions yet');
    await page.unroute('**/rest/v1/rpc/account_statement');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toContainText(`$${formatAccountAmount(statement.balance)}`);
  } finally {
    await context.close();
    lease?.release();
  }
});
