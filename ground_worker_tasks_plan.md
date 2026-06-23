# Implementation Plan: Ground Worker Task Assignment & Checklist Integration (Approved)

This plan outlines the restructuring, database updates, and UI modifications to implement the Ground Worker task assignment model with dynamically available requirement checklists, a copy-paste email requester, and a standard tasks selector.

---

## 1. Final Architecture Decisions

### A. Task Schema
Tasks will support checklists, ground worker assignees, and modified time logs:
```typescript
interface Task {
  id: string;
  workRequestId: string;
  title: string;
  description: string;
  status: 'Draft' | 'Assigned' | 'In Progress' | 'For Review' | 'Completed' | 'Cancelled';
  assigneeId: string | null;      // Link to registered User (Admin/Manager/Staff)
  assigneeName: string | null;    // Dynamic name of Ground Worker (external)
  predecessors: string[];
  dueDate: string;
  taskDocuments: any[];
  
  // Dynamic requirement checklist
  checklist: {
    id: string;
    text: string;
    completed: boolean;
  }[];
  
  // Time logs updated to support worker attribution
  timeLogs: {
    workerName: string;           // Name of worker (Ground Worker or Staff)
    loggedByUserId: string;       // User ID of the logged-in system user who entered it
    startTime: string;
    endTime: string;
    date: string;
    note: string;
    hours: number;
  }[];
}
```

### B. Ground Worker Registry Table
* A new table `groundWorkers` (`{ id: string, name: string }`) will be added to the DB in `js/data.js`.
* When a user types a new ground worker's name under "Others..." (now labeled "Ground Worker"), the name is automatically registered in this table.
* Subsequent task assignments will provide an autocompleting list of these registered ground workers.

### C. Standard Tasks Templates
The system will support a standard list of 8 task templates:
1. **Gathering requirements and preparing documents for preprocessing** (includes default checklist: SEC Certificate, Articles of Incorporation, Mayor's Permit, BIR Form 1901/1903)
2. **Creation of ORUS account**
3. **Registration of Books of Accounts**
4. **Application and Received of Authority to Print**
5. **Pickup of Sales/Service Invoice**
6. **Billing**
7. **Disbursement**
8. **Transmittal**

---

## 2. Phase-by-Phase Execution Roadmap

### Phase 1: Database Setup & Migration (`js/data.js`)
1. Create `groundWorkers` table in the initial store database. Seed it with 2-3 sample names.
2. Update task database migration to ensure all tasks have a `checklist: []` field and update `timeLogs` schemas so `userId` maps to `loggedByUserId` and `workerName` matches the assignee or staff name.
3. Update the Work Request creation form logic to automatically self-assign new work requests to their creator (`assignedTo = Auth.user.id` or `requestedBy`).

### Phase 2: Add Task Modal & Template Selection (`js/workflow.js`)
1. Inside `showAddTaskModal`:
   * Add a "Standard Task Template" dropdown containing the 8 default titles.
   * Selecting a template auto-populates the Task Title.
   * If "Gathering requirements..." is selected, it pre-populates a set of default checklist items in the state.
2. Add a dynamic checklist builder inside the modal to allow creators to add/remove custom checklist items before saving.

### Phase 3: Task Checklist UI & Completion Blocking (`js/workflow.js`)
1. **Checklist UI Rendering**:
   * Render the checklist inline in the task list row or expanded detail row.
   * Display checkboxes for each item.
   * Allow logged-in staff to check/uncheck items directly, updating the DB instantly.
   * Provide "Add Checklist Item" input and "Delete" icons to manage items on existing tasks.
2. **Strict Validation Block**:
   * Update `updateTaskStatus` so that transitioning a task to `'Completed'` or `'For Review'` returns an error if any checklist item has `completed: false`.

### Phase 4: Ground Worker Autocomplete Selector (`js/workflow.js`)
1. Refine the assignee selection layout in the task detail table.
2. Replace the simple text input for "Others..." with a searchable dropdown or autocomplete field that queries the `groundWorkers` registry.
3. If a new name is typed, insert it into `groundWorkers` upon save.

### Phase 5: Email Log Request & EOD Banner (`js/workflow.js`)
1. **EOD Email Draft Requester**:
   * Add a email/mail icon or button labeled **"Request Log"** for tasks assigned to ground workers.
   * Clicking it copies the following formatted text to the clipboard:
     ```text
     Subject: Time Log Request: [Task Title]
     
     Hi [Worker Name],
     
     Please reply with your time log for today for the task: [Task Title] (Work Request: [WR Title]).
     
     Please include:
     - Start Time:
     - End Time:
     - Brief description of what you accomplished:
     
     Thank you!
     ```
2. **EOD Reminder Banner**:
   * Update the check to show the banner to the Work Request's `assignedTo` (or `requestedBy`) user.
   * Trigger if any tasks under the active Work Request are assigned to ground workers and have no time logs logged for today.
   * The "Log Time" button inside the banner will open the log modal with the ground worker's name pre-selected.
