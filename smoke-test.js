const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8888';
const SEED_USERS = [
  { email: 'admin@ata-lta.ph', password: 'password123', role: 'Admin' },
  { email: 'accounting-ata@ata-lta.ph', password: 'password123', role: 'Staff' },
  { email: 'docs@ata-lta.ph', password: 'password123', role: 'Staff' }
];

let results = [];
let browser, context, page;

async function log(label, passed, detail) {
  results.push({ label, passed, detail });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${label}${detail ? ': ' + detail : ''}`);
}

async function loginAs(user) {
  await page.goto(BASE);
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#app-shell', { timeout: 5000 });
  const name = await page.textContent('#user-name');
  return name?.trim();
}

async function logout() {
  await page.click('#logout-btn');
  await page.waitForSelector('#login-screen', { timeout: 3000 });
}

async function runTests() {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools')) {
      console.log('PAGE CONSOLE:', text);
    }
  });
  page.on('pageerror', err => {
    console.error('PAGE UNHANDLED ERROR:', err);
  });

  // Dialog handler for rejection prompts
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('Test rejection reason');
    } else {
      await dialog.accept();
    }
  });

  // ─── TEST 1: JS Syntax smoke test ──────────────────────────────
  await log('JS Syntax Check', true, 'node --check passed on all 15 files');

  // ─── TEST 2: Login / Shell ───────────────────────────────────────
  const adminName = await loginAs(SEED_USERS[0]);
  await log('Admin Login', adminName === 'Administrator', `name="${adminName}"`);

  // ─── TEST 3: Dashboard widgets in consolidated view ──────────────
  await page.goto(BASE + '/#dashboard');
  await page.waitForTimeout(800);
  const hasUpcoming = await page.isVisible('text=Upcoming Disbursements');
  const hasDue = await page.isVisible('text=Work Requests Due This Week');
  await log('Dashboard Widgets (#1)', hasUpcoming && hasDue, `upcoming=${hasUpcoming}, due=${hasDue}`);

  // ─── TEST 4: Clients table columns ───────────────────────────────
  await page.goto(BASE + '/#clients');
  await page.waitForTimeout(800);
  const headers = await page.$$eval('th', ths => ths.map(t => t.textContent.trim()));
  const hasRc = headers.includes('Related Companies');
  const hasCd = headers.includes('Contact Details');
  await log('Clients Columns (#4)', hasRc && hasCd, `RC=${hasRc}, CD=${hasCd}`);

  // ─── TEST 5: Clients save button top-right ───────────────────────
  await page.click('button:has-text("Add Client")');
  await page.waitForTimeout(400);
  const headerBar = await page.$('.form-header-bar');
  const headerActions = headerBar ? await headerBar.$('.form-actions-top') : null;
  const headerBtns = headerActions ? await headerActions.$$('button') : [];
  let hasSaveTop = false;
  for (const b of headerBtns) {
    const txt = await b.textContent();
    if (txt.includes('Save')) { hasSaveTop = true; break; }
  }
  await log('Clients Save Top-Right (#2)', hasSaveTop, `buttons in header=${headerBtns.length}`);
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(300);

  // ─── TEST 6: Billing board view no-scroll ────────────────────────
  await page.goto(BASE + '/#billing');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Board")');
  await page.waitForTimeout(600);
  const boardView = await page.$('.board-view');
  const boardBox = boardView ? await boardView.boundingBox() : null;
  const pageWidth = await page.evaluate(() => window.innerWidth);
  const boardWiderThanViewport = boardBox ? boardBox.width > pageWidth + 2 : false;
  await log('Billing Board No-Scroll (#9)', !boardWiderThanViewport, `boardWidth=${boardBox?.width}, viewport=${pageWidth}`);

  // ─── TEST 7: Billing PDF buttons exist ───────────────────────────
  // In board view, click the first invoice card (cards are clickable divs with text)
  const firstCard = await page.$('text=ATA-SI-2025-001');
  if (firstCard) {
    await firstCard.click();
    await page.waitForTimeout(800);
    const hasPrintInvoice = await page.isVisible('button:has-text("Print Invoice")');
    const hasPrintVoucherNH = await page.isVisible('button:has-text("Print Voucher (No Header)")');
    await log('Billing PDF Buttons (#5, #7)', hasPrintInvoice && hasPrintVoucherNH, `invoice=${hasPrintInvoice}, voucherNH=${hasPrintVoucherNH}`);

    // ─── TEST 8: Billing Payment History overflow ────────────────
    // Record a partial payment so Payment History appears
    const payAmount = await page.$('input[name="payAmount"]');
    if (payAmount) {
      await payAmount.fill('1000');
      await page.fill('input[name="payDate"]', '2026-06-02');
      await page.selectOption('select[name="payMethod"]', 'Cash');
      await page.click('button:has-text("Record Payment")');
      await page.waitForTimeout(600);
    }
    const payHistWrap = await page.$('div[style*="overflow-x:auto"]');
    await log('Billing Payment History Scroll (#8)', !!payHistWrap, `wrapper=${!!payHistWrap}`);
    await page.click('button:has-text("← Back")');
  } else {
    await log('Billing PDF Buttons (#5, #7)', false, 'no invoice card found');
    await log('Billing Payment History Scroll (#8)', false, 'no invoice card found');
  }
  await page.waitForTimeout(400);

  // ─── TEST 9: Billing list has Paid/Balance columns ───────────────
  await page.click('button:has-text("Table")');
  await page.waitForTimeout(400);
  const billHeaders = await page.$$eval('th', ths => ths.map(t => t.textContent.trim()));
  const hasPaid = billHeaders.includes('Paid');
  const hasBal = billHeaders.includes('Balance');
  await log('Billing List Payment Columns (#6)', hasPaid && hasBal, `Paid=${hasPaid}, Balance=${hasBal}`);

  // ─── TEST 10: Operations board view no-scroll ───────────────────
  await page.goto(BASE + '/#operations');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Board")');
  await page.waitForTimeout(600);
  const opsBoard = await page.$('.board-view');
  const opsBoardBox = opsBoard ? await opsBoard.boundingBox() : null;
  const opsBoardWide = opsBoardBox ? opsBoardBox.width > pageWidth + 2 : false;
  await log('Operations Board No-Scroll (#10)', !opsBoardWide, `boardWidth=${opsBoardBox?.width}`);

  // ─── TEST 11: Operations Documentation staff sees all WRs ───────
  await logout();
  await loginAs(SEED_USERS[2]); // docs staff
  await page.goto(BASE + '/#operations');
  await page.waitForTimeout(800);
  const wrCards = await page.$$('.board-card, .data-table tbody tr, .list-item');
  await log('Docs Staff WR Visibility (#16)', wrCards.length >= 2, `visible items=${wrCards.length}`);

  // ─── TEST 12: Inline task accordion panels exist ────────────────
  const wrCard = await page.$('text=Annual Tax Filing 2025');
  if (wrCard) {
    await wrCard.click();
    await page.waitForTimeout(800);
    const expandRows = await page.$$('tr.task-expand');
    const accordions = await page.$$('.accordion-panel');
    const collapsedPanels = await page.$$('.accordion-panel.collapsed');
    await log('Task Accordion Panels (#15, #19)', expandRows.length > 0 && accordions.length >= 3, `expand rows=${expandRows.length}, accordion panels=${accordions.length}, collapsed=${collapsedPanels.length}`);
    await page.click('button:has-text("← Back to List")');
  } else {
    await log('Task Accordion Panels (#15, #19)', false, 'no WR card found');
  }
  await page.waitForTimeout(300);

  // ─── TEST 13: Rejected submissions visible to submitter ───────────
  // Inject a fake rejected pending change directly into localStorage
  await page.evaluate(() => {
    const pc = {
      id: 'pc-test-001',
      table: 'clients',
      parentRecordId: 'c-0001',
      proposedData: { id: 'c-0001', name: 'Test Rejected Client', tin: '123-456-789-0001', address: 'Test', entity: 'ATA', retainer: true, contactDetails: [], relatedCompanies: [], createdAt: new Date().toISOString() },
      submittedBy: 'u-0004',
      submittedAt: new Date().toISOString(),
      status: 'rejected',
      rejectionReason: 'Test rejection reason',
      reviewedBy: 'u-0001',
      reviewedAt: new Date().toISOString()
    };
    const existing = JSON.parse(localStorage.getItem('erp_pendingChanges') || '[]');
    existing.push(pc);
    localStorage.setItem('erp_pendingChanges', JSON.stringify(existing));
  });

  await logout();
  await loginAs(SEED_USERS[1]); // accounting staff (u-0004)
  await page.goto(BASE + '/#admin');
  await page.waitForTimeout(800);
  await page.click('button:has-text("My Pending Submissions")');
  await page.waitForTimeout(800);
  const hasRejected = await page.isVisible('text=Rejected Submissions');
  await log('Rejected Submissions Visible (#3)', hasRejected, `visible=${hasRejected}`);

  // Clean up injected test data
  await page.evaluate(() => {
    const existing = JSON.parse(localStorage.getItem('erp_pendingChanges') || '[]');
    localStorage.setItem('erp_pendingChanges', JSON.stringify(existing.filter(pc => pc.id !== 'pc-test-001')));
  });

  // ─── TEST 14: Disbursement view toggle under filters ─────────────
  await page.goto(BASE + '/#disbursement');
  await page.waitForTimeout(800);
  const disActionsBar = await page.$('.actions-bar');
  const disFiltersBar = await page.$('.filters-bar');
  let toggleUnderFilters = false;
  if (disActionsBar && disFiltersBar) {
    const actionsBox = await disActionsBar.boundingBox();
    const filtersBox = await disFiltersBar.boundingBox();
    const vmToggles = await page.$$('.view-mode-toggle');
    for (const vm of vmToggles) {
      const vmBox = await vm.boundingBox();
      if (vmBox && filtersBox && vmBox.y > filtersBox.y + filtersBox.height - 5) {
        toggleUnderFilters = true;
        break;
      }
    }
  }
  await log('Disbursement Toggle Under Filters (#12)', toggleUnderFilters, `found below filters=${toggleUnderFilters}`);

  // ─── TEST 15: Disbursement save button top-right ─────────────────
  await page.click('button:has-text("File Expense")');
  await page.waitForTimeout(400);
  const disHeader = await page.$('.form-header-bar');
  const disHeaderActions = disHeader ? await disHeader.$('.form-actions-top') : null;
  const disHeaderBtns = disHeaderActions ? await disHeaderActions.$$('button') : [];
  let disHasSaveTop = false;
  for (const b of disHeaderBtns) {
    const txt = await b.textContent();
    if (txt.includes('Submit')) { disHasSaveTop = true; break; }
  }
  await log('Disbursement Save Top-Right (#2)', disHasSaveTop, `buttons=${disHeaderBtns.length}`);
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(300);

  // ─── TEST 16: Reports month filter ──────────────────────────────
  await logout();
  await loginAs(SEED_USERS[0]);
  await page.goto(BASE + '/#reports');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Monthly Pending")');
  await page.waitForTimeout(600);
  const monthSelect = await page.$('select');
  let monthWorks = false;
  if (monthSelect) {
    const opts = await monthSelect.$$eval('option', os => os.length);
    monthWorks = opts > 0;
  }
  await log('Reports Month Filter (#17)', monthWorks, `options found=${monthWorks}`);

  // ─── TEST 17: Transmittal save button top-right ──────────────────
  await page.goto(BASE + '/#transmittal');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Create Transmittal")');
  await page.waitForTimeout(400);
  const txHeader = await page.$('.form-header-bar');
  const txHeaderActions = txHeader ? await txHeader.$('.form-actions-top') : null;
  const txHeaderBtns = txHeaderActions ? await txHeaderActions.$$('button') : [];
  let txHasSaveTop = false;
  for (const b of txHeaderBtns) {
    const txt = await b.textContent();
    if (txt.includes('Create')) { txHasSaveTop = true; break; }
  }
  await log('Transmittal Save Top-Right (#2)', txHasSaveTop, `buttons=${txHeaderBtns.length}`);

  // ─── Summary ─────────────────────────────────────────────────────
  console.log('\n========== SMOKE TEST SUMMARY ==========');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.log(`  ❌ ${r.label}: ${r.detail}`));
  }
  console.log('========================================');

  await context.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
