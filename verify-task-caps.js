const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8888';
const ADMIN_USER = { email: 'admin@ata-lta.ph', password: 'password123' };

async function runVerification() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  // Log in
  await page.goto(BASE);
  await page.fill('#email', ADMIN_USER.email);
  await page.fill('#password', ADMIN_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#app-shell', { timeout: 5000 });

  // Run tests in browser context
  const results = await page.evaluate(() => {
    const testResults = [];

    function assert(label, condition, detail) {
      testResults.push({ label, passed: !!condition, detail });
      console.log(`[TEST] ${label}: ${condition ? 'PASSED' : 'FAILED'} (${detail})`);
    }

    try {
      // ----------------------------------------------------
      // Phase-dependent task progress caps tests
      // ----------------------------------------------------
      const wrDraftId = 'wr-test-draft';
      const wrPreprocId = 'wr-test-preproc';
      const wrBillingId = 'wr-test-billing';
      const wrCompletedId = 'wr-test-completed';

      const taskDraftWrId = 't-test-draft-wr';
      const taskReqPreprocId = 't-test-req-preproc';
      const taskNonReqPreprocId = 't-test-nonreq-preproc';
      const taskBillingId = 't-test-billing-wr';
      const taskCompletedId = 't-test-completed-wr';

      // Insert Work Requests
      DB.insert('workRequests', { id: wrDraftId, title: 'Draft WR', status: 'Draft' });
      DB.insert('workRequests', { id: wrPreprocId, title: 'Pre-processing WR', status: 'Pre-processing' });
      DB.insert('workRequests', { id: wrBillingId, title: 'Billing WR', status: 'Billing' });
      DB.insert('workRequests', { id: wrCompletedId, title: 'Completed WR', status: 'Completed' });

      // Insert Tasks
      DB.insert('tasks', { id: taskDraftWrId, workRequestId: wrDraftId, title: 'Standard Task in Draft WR', status: 'Draft', assigneeId: 'u-0004' });
      DB.insert('tasks', { id: taskReqPreprocId, workRequestId: wrPreprocId, title: 'Requirement gathering task', status: 'Draft', assigneeId: 'u-0004' });
      DB.insert('tasks', { id: taskNonReqPreprocId, workRequestId: wrPreprocId, title: 'Regular coding task', status: 'Draft', assigneeId: 'u-0004' });
      DB.insert('tasks', { id: taskBillingId, workRequestId: wrBillingId, title: 'Billing task', status: 'In Progress', assigneeId: 'u-0004' });
      DB.insert('tasks', { id: taskCompletedId, workRequestId: wrCompletedId, title: 'Completed WR task', status: 'In Progress', assigneeId: 'u-0004' });

      // Case 1: Work Request is in Draft
      const taskDraft = DB.getById('tasks', taskDraftWrId);
      const allowedDraft = Workflow.getValidNextStatuses(taskDraft);
      assert(
        'Case 1: getValidNextStatuses for Draft WR',
        allowedDraft.includes('Draft') && allowedDraft.includes('Assigned') && allowedDraft.includes('Cancelled') && !allowedDraft.includes('In Progress'),
        `Allowed statuses: ${JSON.stringify(allowedDraft)}`
      );

      const res1_invalid = Workflow.updateTaskStatus(taskDraftWrId, 'In Progress');
      assert(
        'Case 1: updateTaskStatus to In Progress (Invalid)',
        res1_invalid.error === 'Task status cannot be set to "In Progress" in the "Draft" phase.',
        `Result error: ${res1_invalid.error}`
      );

      const res1_valid = Workflow.updateTaskStatus(taskDraftWrId, 'Assigned');
      assert(
        'Case 1: updateTaskStatus to Assigned (Valid)',
        res1_valid.success === true,
        `Result: ${JSON.stringify(res1_valid)}`
      );

      // Case 2: Work Request is in Pre-processing (Requirement task)
      let taskReq = DB.getById('tasks', taskReqPreprocId);
      let allowedReq = Workflow.getValidNextStatuses(taskReq);
      assert(
        'Case 2: getValidNextStatuses for Requirement Task (Draft)',
        allowedReq.includes('Assigned') && !allowedReq.includes('In Progress'),
        `Allowed statuses: ${JSON.stringify(allowedReq)}`
      );

      let res2_assigned = Workflow.updateTaskStatus(taskReqPreprocId, 'Assigned');
      assert('Case 2: Transition to Assigned', res2_assigned.success === true, `Result: ${JSON.stringify(res2_assigned)}`);

      taskReq = DB.getById('tasks', taskReqPreprocId);
      allowedReq = Workflow.getValidNextStatuses(taskReq);
      assert(
        'Case 2: getValidNextStatuses for Requirement Task (Assigned)',
        allowedReq.includes('In Progress') && !allowedReq.includes('For Review'),
        `Allowed statuses: ${JSON.stringify(allowedReq)}`
      );

      let res2_in_progress = Workflow.updateTaskStatus(taskReqPreprocId, 'In Progress');
      assert('Case 2: Transition to In Progress', res2_in_progress.success === true, `Result: ${JSON.stringify(res2_in_progress)}`);

      taskReq = DB.getById('tasks', taskReqPreprocId);
      allowedReq = Workflow.getValidNextStatuses(taskReq);
      assert(
        'Case 2: getValidNextStatuses for Requirement Task (In Progress)',
        allowedReq.includes('For Review') && !allowedReq.includes('Completed'),
        `Allowed statuses: ${JSON.stringify(allowedReq)}`
      );

      let res2_for_review = Workflow.updateTaskStatus(taskReqPreprocId, 'For Review');
      assert('Case 2: Transition to For Review', res2_for_review.success === true, `Result: ${JSON.stringify(res2_for_review)}`);

      taskReq = DB.getById('tasks', taskReqPreprocId);
      allowedReq = Workflow.getValidNextStatuses(taskReq);
      assert(
        'Case 2: getValidNextStatuses for Requirement Task (For Review)',
        allowedReq.includes('Completed'),
        `Allowed statuses: ${JSON.stringify(allowedReq)}`
      );

      let res2_completed = Workflow.updateTaskStatus(taskReqPreprocId, 'Completed');
      assert('Case 2: Transition to Completed', res2_completed.success === true, `Result: ${JSON.stringify(res2_completed)}`);

      // Case 3: Work Request is in Pre-processing (Non-requirement task)
      let taskNonReq = DB.getById('tasks', taskNonReqPreprocId);
      let allowedNonReq = Workflow.getValidNextStatuses(taskNonReq);
      assert(
        'Case 3: getValidNextStatuses for Non-Requirement Task (Draft)',
        allowedNonReq.includes('Draft') && allowedNonReq.includes('Assigned') && allowedNonReq.includes('Cancelled') && !allowedNonReq.includes('In Progress'),
        `Allowed statuses: ${JSON.stringify(allowedNonReq)}`
      );

      let res3_assigned = Workflow.updateTaskStatus(taskNonReqPreprocId, 'Assigned');
      assert('Case 3: Transition to Assigned', res3_assigned.success === true, `Result: ${JSON.stringify(res3_assigned)}`);

      taskNonReq = DB.getById('tasks', taskNonReqPreprocId);
      allowedNonReq = Workflow.getValidNextStatuses(taskNonReq);
      assert(
        'Case 3: getValidNextStatuses for Non-Requirement Task (Assigned)',
        allowedNonReq.includes('Draft') && allowedNonReq.includes('Assigned') && allowedNonReq.includes('Cancelled') && !allowedNonReq.includes('In Progress'),
        `Allowed statuses: ${JSON.stringify(allowedNonReq)}`
      );

      let res3_invalid = Workflow.updateTaskStatus(taskNonReqPreprocId, 'In Progress');
      assert(
        'Case 3: updateTaskStatus non-requirement task to In Progress (Invalid)',
        res3_invalid.error === 'Task status cannot be set to "In Progress" in the "Pre-processing" phase.',
        `Result error: ${res3_invalid.error}`
      );

      // Case 4: Work Request is in Billing
      const taskBilling = DB.getById('tasks', taskBillingId);
      const allowedBilling = Workflow.getValidNextStatuses(taskBilling);
      assert(
        'Case 4: getValidNextStatuses for Task in Billing WR',
        allowedBilling.includes('In Progress') && !allowedBilling.includes('For Review') && !allowedBilling.includes('Completed'),
        `Allowed statuses: ${JSON.stringify(allowedBilling)}`
      );

      const res4_invalid = Workflow.updateTaskStatus(taskBillingId, 'For Review');
      assert(
        'Case 4: updateTaskStatus to For Review (Invalid)',
        res4_invalid.error === 'Task status cannot be set to "For Review" in the "Billing" phase.',
        `Result error: ${res4_invalid.error}`
      );

      // Case 5: Work Request is in Completed
      const taskCompleted = DB.getById('tasks', taskCompletedId);
      const allowedCompleted = Workflow.getValidNextStatuses(taskCompleted);
      assert(
        'Case 5: getValidNextStatuses for Task in Completed WR',
        allowedCompleted.length === 1 && allowedCompleted[0] === 'In Progress',
        `Allowed statuses: ${JSON.stringify(allowedCompleted)}`
      );

      const res5_invalid = Workflow.updateTaskStatus(taskCompletedId, 'Completed');
      assert(
        'Case 5: updateTaskStatus on Completed WR task (Invalid)',
        res5_invalid.error === 'Task status cannot be set to "Completed" in the "Completed" phase.',
        `Result error: ${res5_invalid.error}`
      );

      // Clean up phase-dependent task progress caps tests
      DB.delete('workRequests', wrDraftId);
      DB.delete('workRequests', wrPreprocId);
      DB.delete('workRequests', wrBillingId);
      DB.delete('workRequests', wrCompletedId);

      DB.delete('tasks', taskDraftWrId);
      DB.delete('tasks', taskReqPreprocId);
      DB.delete('tasks', taskNonReqPreprocId);
      DB.delete('tasks', taskBillingId);
      DB.delete('tasks', taskCompletedId);

      // ----------------------------------------------------
      // Assignee dropdown and block transition verification
      // ----------------------------------------------------
      // 1. Verify that renderForm() contains a select element with name="assignedTo"
      Workflow.editingId = null;
      const formEl = Workflow.renderForm();
      const assigneeDropdown = formEl.querySelector('select[name="assignedTo"]');
      assert(
        'Case 6: Assignee dropdown presence',
        !!assigneeDropdown,
        `Assignee dropdown element: ${assigneeDropdown ? 'found' : 'not found'}`
      );

      // 2. Verify that saving a Work Request with assignedTo saves correctly
      const testClientId = DB.getAll('clients')[0]?.id || 'c-test-1';
      const staffUser = DB.getWhere('users', u => u.role === 'Accounting')[0];
      const testStaffId = staffUser ? staffUser.id : 'u-test-staff';
      
      const formNode = formEl.querySelector('form');
      
      // Let's inspect required fields
      const requiredFieldsBefore = Array.from(formNode.querySelectorAll('[required]'));
      console.log('Required fields in form:', JSON.stringify(requiredFieldsBefore.map(f => ({ name: f.name, tagName: f.tagName, value: f.value }))));

      // Set field values
      formNode.querySelector('input[name="title"]').value = 'Test WR with Assignee';
      formNode.querySelector('input[name="description"]').value = 'Test Description';
      formNode.querySelector('input[name="dueDate"]').value = '2026-06-25';
      formNode.querySelector('select[name="clientId"]').value = testClientId;
      formNode.querySelector('select[name="assignedTo"]').value = testStaffId;

      // Mock submitForm by calling it
      Workflow.submitForm(formNode);

      // Check if it exists in workRequests DB now
      const savedWr = DB.getAll('workRequests').find(wr => wr.title === 'Test WR with Assignee');
      assert(
        'Case 7: AssignedTo field saved in workRequests',
        savedWr && savedWr.assignedTo === testStaffId,
        `Saved WR: ${JSON.stringify(savedWr)}`
      );

      // 3. Verify that a Work Request with an assignee or all tasks assigned is no longer blocked from transitioning
      if (savedWr) {
        // Subcase 8a: WR itself is assigned, has no tasks -> should not have Employee assignment error
        const ts1 = Workflow.getPhaseTransitionStatus(savedWr.id);
        const err1 = ts1?.missing?.includes('Employee assignment');
        assert(
          'Case 8a: WR assigned, no tasks -> Transition allowed',
          !err1,
          `Missing: ${JSON.stringify(ts1?.missing)}`
        );

        // Subcase 8b: WR itself is NOT assigned, has no tasks -> should have Employee assignment error
        DB.update('workRequests', savedWr.id, { assignedTo: null });
        const ts2 = Workflow.getPhaseTransitionStatus(savedWr.id);
        const err2 = ts2?.missing?.includes('Employee assignment');
        assert(
          'Case 8b: WR NOT assigned, no tasks -> Blocked',
          err2 === true,
          `Missing: ${JSON.stringify(ts2?.missing)}`
        );

        // Subcase 8c: WR itself is NOT assigned, has tasks, but some are unassigned -> should have Employee assignment error
        const taskId1 = 't-test-trans-1';
        const taskId2 = 't-test-trans-2';
        DB.insert('tasks', { id: taskId1, workRequestId: savedWr.id, title: 'Task 1', assigneeId: testStaffId });
        DB.insert('tasks', { id: taskId2, workRequestId: savedWr.id, title: 'Task 2', assigneeId: null });
        const ts3 = Workflow.getPhaseTransitionStatus(savedWr.id);
        const err3 = ts3?.missing?.includes('Employee assignment');
        assert(
          'Case 8c: WR NOT assigned, some tasks unassigned -> Blocked',
          err3 === true,
          `Missing: ${JSON.stringify(ts3?.missing)}`
        );

        // Subcase 8d: WR itself is NOT assigned, has tasks, and ALL tasks are assigned -> should not have Employee assignment error
        DB.update('tasks', taskId2, { assigneeId: testStaffId });
        const ts4 = Workflow.getPhaseTransitionStatus(savedWr.id);
        const err4 = ts4?.missing?.includes('Employee assignment');
        assert(
          'Case 8d: WR NOT assigned, all tasks assigned -> Transition allowed',
          !err4,
          `Missing: ${JSON.stringify(ts4?.missing)}`
        );

        // Clean up created WR and associated tasks
        DB.delete('workRequests', savedWr.id);
        DB.delete('tasks', taskId1);
        DB.delete('tasks', taskId2);
      }

    } catch (e) {
      testResults.push({ label: 'Error inside evaluate', passed: false, detail: e.toString() });
    }

    return testResults;
  });

  await context.close();
  await browser.close();

  console.log('\n========== VERIFICATION RESULTS ==========');
  let failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.label} -- ${r.detail}`);
    if (!r.passed) failed++;
  }
  console.log(`==========================================`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All verification checks passed successfully.');
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
