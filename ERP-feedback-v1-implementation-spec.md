# ERP Feedback v1 — Comprehensive Implementation Specification

**Date:** 2026-06-01  
**Status:** Specification Complete — Awaiting Execution Approval  
**Schema Target:** `v3` (migration from `v2`)  
**Architecture:** Vanilla JS + HTML/CSS + localStorage (browser-only prototype)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Locked Architecture Decisions (Grilling Session Results)](#2-locked-architecture-decisions-grilling-session-results)
3. [Phase-by-Phase Implementation Roadmap](#3-phase-by-phase-implementation-roadmap)
4. [Data Model — Schema v3](#4-data-model--schema-v3)
5. [Module Specifications](#5-module-specifications)
6. [RBAC & Permission Changes](#6-rbac--permission-changes)
7. [UI/UX Global Changes](#7-uiux-global-changes)
8. [Breaking Changes Catalog](#8-breaking-changes-catalog)
9. [Testing & Acceptance Criteria](#9-testing--acceptance-criteria)
10. [Known Risks & Mitigations](#10-known-risks--mitigations)

---

## 1. Executive Summary

This specification maps every item from `ERP-feedback-v1.md` into concrete implementation tasks for the ATA & LTA Accounting Firm ERP. All architectural uncertainties were resolved via a structured grilling session. The document is organized by execution phase so that teammates can claim independent modules without blocking each other.

**Core principle:** Build data-first. Every module modification must begin with the schema, then the migration, then the UI. The Admin Review Gate is the largest architectural pivot and must be implemented before any other structural mutation logic.

---

## 2. Locked Architecture Decisions (Grilling Session Results)

These decisions are **non-negotiable** and govern all downstream implementation.

### 2.1 Admin Review Gate

| Aspect | Decision |
|--------|----------|
| Scope | Structural mutations only: create/edit/delete of clients, work requests (operations), billing invoices, disbursements, transmittals |
| Excluded | Task status updates, time log entries, document uploads — direct-write with full audit logging |
| Bypass roles | Admin and Manager roles bypass the gate entirely; direct-save |
| Affected roles | Staff and Viewer must stage all structural changes |
| Model | **Strict pessimistic staging**: live record unchanged until Admin approves |
| Storage | `pendingChanges` table stores **full snapshot** of proposed record (not deltas) |
| Multiple edits | Multiple pending snapshots per `parentRecordId` allowed; Admin sees queue |
| Rejection flow | Rejected proposals retained in read-only "Rejected" section with Admin reason; Staff can clone/edit/resubmit |

### 2.2 Billing — VAT Excluded

| Aspect | Decision |
|--------|----------|
| UI | Remove VAT treatment dropdown from line items; no VAT breakdown shown |
| Schema | `invoice.vat` hardcoded to `0`; `invoice.total = invoice.subtotal` |
| PDF | Generated invoices include BIR compliance footer: *"This document is not valid for claim of input tax."* |
| Backward compat | Migration recalculates all existing seeded invoices: total = subtotal, vat = 0 |

### 2.3 Time Logging

| Aspect | Decision |
|--------|----------|
| Mode | Retrospective entry (not live timer) |
| Schema | `{startTime, endTime, date, note, hours}` where `hours` is derived |
| Rounding | Nearest 15-minute billing increment: `Math.round(rawHours * 4) / 4` |
| Billing linkage | **Internal tracking only** — no auto-generation of invoice line items |

### 2.4 Work Request Linkage

| Aspect | Decision |
|--------|----------|
| Pattern | **Manual linking** with related-records panel |
| Auto-generation | None. Staff link existing records manually |
| UI | Work Request detail shows "Related Records" (Billing, Disbursement, Transmittal) |
| Reverse linkage | Billing/Disbursement/Transmittal forms include "Link to Work Request" dropdown |

### 2.5 Board/Kanban View

| Aspect | Decision |
|--------|----------|
| Interactivity | **View-only** — cards grouped by status in columns |
| Drag-and-drop | Not implemented in this prototype |
| Status change | Existing status dropdown/edit flow remains the only mutation path |

### 2.6 Recurring Templates

| Aspect | Decision |
|--------|----------|
| Billing templates | New `billingTemplates` table; manual "Generate Next Period" button |
| Disbursement templates | New `disbursementTemplates` table; manual "Generate Next Period" button |
| Auto-schedule | Not implemented — no server-side cron in browser-only system |
| Pattern | Mirrors existing retainer template generation in `js/workflow.js` |

### 2.7 Departments Removal

| Aspect | Decision |
|--------|----------|
| `department` field | Removed from `users` schema, table, and form |
| DMS handover gate | Replaced by `dms:handover` permission in `Auth.can()` RBAC matrix |
| Assignment | Grant `dms:handover` to Admin, Manager, and designated Staff |

### 2.8 Reports

| Aspect | Decision |
|--------|----------|
| Structure | Three separate sub-views: **Daily Report**, **Weekly Summary**, **Monthly Pending** |
| Delivery | In-app only — no email automation |
| Daily | Task completions today with start/end times and employee |
| Weekly | Completed vs. pending per employee + overdue warnings |
| Monthly | Pending tasks grouped by employee + recurring retainer tasks due |

### 2.9 Original Document Tracking

| Aspect | Decision |
|--------|----------|
| Lifecycle | `collected` → `with_documentations` → `scanned` → `in_envelope` → `stored` |
| Envelope labels | Text only: `ENVELOPE-[clientId]-[seq]` — no QR/barcode libraries |
| Tracking | `documentLifecycle`, `scannedBy`, `envelopeId`, `storedLocation` fields on documents |

### 2.10 Transmittal Module

| Aspect | Decision |
|--------|----------|
| Definition | Formal document return letter — cover sheet with itemized document list |
| Tracking number | Auto-generated sequential number per entity |
| Acknowledgment | "Received By" text field + date (manual entry by staff when client physically signs paper) |
| No digital signature | Not implemented in prototype |

### 2.11 Mandatory Field Validation

| Aspect | Decision |
|--------|----------|
| Scope | Business-critical fields only (name/title, client, amount, date, status) |
| Optional fields | Description, trade name, receipt file, due date on rolling retainers remain nullable |
| Trigger point | Validation enforced at "Submit for Admin Review" stage, not on draft saves |

### 2.12 Clients Schema

| Aspect | Decision |
|--------|----------|
| `name` | Renamed to `taxpayer` in UI; schema key remains `name` (or migrate to `taxpayer`) |
| `contactPerson` | Replaced by `contactUserId` (FK to users table) — employee assigned as Point of Contact |
| `tradeName` | Added (nullable) |
| `address` | Already in schema; displayed in table |
| `relatedCompanies` | Array of `{clientId, relationType}` where `relationType` ∈ {"Parent","Subsidiary","Sister Company","Affiliate"} |
| `contactDetails` | Array of `{type, value, label}` (e.g., mobile, landline, email alternate) |
| Visibility rule | Staff see clients where: (a) assigned to any task/WR, OR (b) `contactUserId === Auth.user.id` |

---

## 3. Phase-by-Phase Implementation Roadmap

### Phase 0: Foundation & Schema Migration (Must be first — blocks everything)

**Owner:** Data layer lead  
**Files:** `js/data.js`, `js/utils.js`, `js/auth.js`

| # | Task | Details |
|---|------|---------|
| 0.1 | Bump `SCHEMA_VERSION` to `3` | Update `DB.SCHEMA_VERSION` constant |
| 0.2 | Write `migrateV2ToV3()` | Transform all existing localStorage records per Section 4 |
| 0.3 | Add `pendingChanges` seed | Empty array in `seedData` |
| 0.4 | Add `transmittals` seed | Empty array in `seedData` |
| 0.5 | Add `billingTemplates` seed | Empty array in `seedData` |
| 0.6 | Add `disbursementTemplates` seed | Empty array in `seedData` |
| 0.7 | Remove `department` from user seeds | Replace with `dms:handover` permission in `Auth.can()` |
| 0.8 | Update client seeds | Add `tradeName`, `contactUserId`, `relatedCompanies[]`, `contactDetails[]` |
| 0.9 | Update work request seeds | Add `linkedInvoiceId`, `linkedDisbursementIds[]`, `linkedTransmittalIds[]` |
| 0.10 | Update task seeds | Transform `timeLogs` to new shape; add `taskDocuments[]` |
| 0.11 | Update invoice seeds | Recalculate totals (remove VAT); add `payments[]`, `createdBy` |
| 0.12 | Update disbursement seeds | Add `paymentDetails{}`, `requestedBy` |
| 0.13 | Update document seeds | Add `comments[]`, `documentLifecycle`, `scannedBy`, `envelopeId`, `storedLocation` |
| 0.14 | Add `dms:handover` to `Auth.can()` | Admin + Manager default; designated Staff via permission |
| 0.15 | Remove `department` from `Auth.can()` references | Search and replace all `user.department` gates |

### Phase 1: Global Shell & Navigation (Non-breaking, can run in parallel with Phase 0)

**Owner:** UI lead  
**Files:** `index.html`, `css/styles.css`, `js/app.js`

| # | Task | Details |
|---|------|---------|
| 1.1 | Reorder menu | Dashboard → Client List → Work Request → Billing → Disbursement → Transmittal → Reports → Admin |
| 1.2 | Rename "Workflow" → "Operations" | `index.html` nav label, `js/app.js` route map, module title |
| 1.3 | Move save/edit/cancel to top-right | Refactor `.form-actions` in CSS; move button groups above forms in every module |
| 1.4 | Add Dashboard widgets | "Upcoming Disbursements" (status = Submitted/Under Review/Approved) + "Work Requests Due This Week" |
| 1.5 | View-mode toggle scaffolding | CSS classes for `.view-table`, `.view-board`, `.view-list`; state management pattern |
| 1.6 | Mandatory field validation helper | `validateRequiredFields(form)` utility in `js/utils.js` |

### Phase 2: Admin Review Gate (Blocks Phase 3)

**Owner:** Core architecture lead  
**Files:** New `js/pendingChanges.js` or inline in `js/app.js`, `js/users.js`

| # | Task | Details |
|---|------|---------|
| 2.1 | Implement `submitForReview(table, record)` | Wraps `DB.insert`/`DB.update` for Staff/Viewer; writes to `pendingChanges` |
| 2.2 | Admin "Pending Approvals" tab | New view in Admin panel showing queued snapshots with side-by-side diff |
| 2.3 | Admin "Approve" action | Merges snapshot into live record; logs to audit trail |
| 2.4 | Admin "Reject" action | Moves snapshot to `status: 'rejected'` with reason; notifies Staff |
| 2.5 | Staff "My Pending Submissions" panel | Shows pending + rejected proposals; allows clone/resubmit |
| 2.6 | Integration hooks | Modify every module's `submitForm()` to route through gate based on role |

### Phase 3: Module Refactors (Can parallelize per module after Phase 2)

#### 3A. Clients Module
**Files:** `js/clients.js`

| # | Task | Details |
|---|------|---------|
| 3A.1 | Rename UI labels | "Name" → "Taxpayer", "Contact" → "Point of Contact" |
| 3A.2 | Point of Contact dropdown | Employee selector (entity-scoped staff) writing to `contactUserId` |
| 3A.3 | Add `tradeName` field | Text input, nullable |
| 3A.4 | Add `relatedCompanies` UI | Multi-entry: select existing client + relation type; render clickable links |
| 3A.5 | Add `contactDetails` UI | Multi-entry: type (mobile/landline/email), value, label |
| 3A.6 | Update table columns | Show Taxpayer, TIN, Point of Contact, Trade Name, Address, Entity, Retainer |
| 3A.7 | Expand Staff visibility | `getFilteredClients()` OR-in `contactUserId === Auth.user.id` |

#### 3B. Operations Module (ex-Workflow)
**Files:** `js/workflow.js`

| # | Task | Details |
|---|------|---------|
| 3B.1 | Rename module references | "Workflow" → "Operations" throughout |
| 3B.2 | Priority dropdown | `<select>`: Urgent, Priority, Low Priority; migrate existing free-text values |
| 3B.3 | Add filters | Priority, Employees, Clients, Due Date (date range) |
| 3B.4 | View modes | Table (existing `<table>`), Board (Kanban columns by status), List (compact rows) |
| 3B.5 | Task document upload | Add upload UI in `renderTaskActivity()`; store metadata (not Base64) in `taskDocuments[]` |
| 3B.6 | Time logging from-to | Replace hours-only input with `startTime` + `endTime` fields; auto-calculate + round |
| 3B.7 | Related records panel | In WR detail: show linked Billing, Disbursement, Transmittal records |
| 3B.8 | Original document tracking | Extend DMS lifecycle statuses on task documents |

#### 3C. Billing Module
**Files:** `js/billing.js`

| # | Task | Details |
|---|------|---------|
| 3C.1 | Remove VAT options | Delete `vatTreatment` `<select>` from line items; hardcode no-VAT math |
| 3C.2 | Add filters | Work Request, Clients, Employee, Due Date (issue date range) |
| 3C.3 | View modes | Table, Board, List |
| 3C.4 | Track creators | Add `createdBy` (populated from `Auth.user.id` on creation) |
| 3C.5 | Track payment collector | Add `paymentCollectedBy` field on payment recording |
| 3C.6 | Payment details | `payments[]` array: `{amount, method, reference, date, recordedBy}`; migrate existing `paidAmount` |
| 3C.7 | PDF generation | Use `jsPDF` or browser print + `@media print` CSS; include BIR compliance footer |
| 3C.8 | Voucher format | Minimal print template stripping seller header/logo; reuse same invoice data |
| 3C.9 | Billing templates + recurring | New `billingTemplates` table; manual "Generate" button |
| 3C.10 | Link to Work Request | Dropdown in invoice form; update WR's related records panel |

#### 3D. Disbursement Module
**Files:** `js/disbursement.js`

| # | Task | Details |
|---|------|---------|
| 3D.1 | Verify no VAT | Confirm no VAT options exist (already clean) |
| 3D.2 | Add filters | Work Request, Clients, Employee, Due Date |
| 3D.3 | View modes | Table, Board, List |
| 3D.4 | Track requester | `requestedBy` field (explicit, not just `employeeId`) |
| 3D.5 | Track payment handler | `paymentHandledBy` on release |
| 3D.6 | Payment details | `paymentDetails{}`: `{method, reference, bank, date, processedBy}` |
| 3D.7 | PDF generation | Same pattern as Billing |
| 3D.8 | Voucher format | Minimal print template |
| 3D.9 | Disbursement templates + recurring | New `disbursementTemplates` table; manual "Generate" button |
| 3D.10 | Link to Work Request | Dropdown in form; update WR's related records panel |

#### 3E. Documents (DMS) Module
**Files:** `js/dms.js`

| # | Task | Details |
|---|------|---------|
| 3E.1 | Admin comments | `comments[]` array on documents; restricted to Admin role |
| 3E.2 | Add filters | Work Request, Clients, Employee, Due Date (upload date range) |
| 3E.3 | View modes | Table, Board, List |
| 3E.4 | Document lifecycle | Status transitions: collected → with_documentations → scanned → in_envelope → stored |
| 3E.5 | Envelope labeling | Text label: `ENVELOPE-[clientId]-[seq]` |
| 3E.6 | Update handover gate | Replace `department === 'Documentations'` with `Auth.can('dms:handover')` |

#### 3F. Transmittal Module (NEW)
**Files:** New `js/transmittal.js`, update `index.html`, `js/app.js`

| # | Task | Details |
|---|------|---------|
| 3F.1 | Schema | `transmittals[]`: `{id, workRequestId, clientId, trackingNumber, status, items[], sentAt, acknowledgedAt, sentBy, acknowledgedBy, notes, entity}` |
| 3F.2 | List view | Table with filters (Work Request, Client, Status, Date) + view-mode toggle |
| 3F.3 | Create form | Select WR → auto-populate client → add itemized document list → generate tracking number |
| 3F.4 | Detail view | Show transmittal letter preview, "Received By" acknowledgment form |
| 3F.5 | PDF generation | Generate formal transmittal letter with entity header, itemized list, signature block |
| 3F.6 | Link to Work Request | Transmittal detail shown in WR's related records panel |

#### 3G. Reports Module
**Files:** `js/reports.js`

| # | Task | Details |
|---|------|---------|
| 3G.1 | Filters | Work Request, Clients, Employee, Due Date (date range) applied across all report cards |
| 3G.2 | View modes | Table, Board, List (for filtered task lists) |
| 3G.3 | Daily Report | Tasks completed today per employee with start/end times |
| 3G.4 | Weekly Summary | Completed vs. pending per employee + overdue warnings |
| 3G.5 | Monthly Pending List | Pending tasks grouped by employee + recurring retainer tasks due |

#### 3H. Users (Admin) Module
**Files:** `js/users.js`

| # | Task | Details |
|---|------|---------|
| 3H.1 | Remove Department field | From form, table, and schema |
| 3H.2 | Add "Pending Approvals" tab | Admin panel shows queued changes from `pendingChanges` table |
| 3H.3 | Side-by-side diff | "Current (Approved)" vs. "Proposed (Pending)" view |
| 3H.4 | Approve/Reject actions | With rejection reason input |

---

## 4. Data Model — Schema v3

### 4.1 New Tables

```javascript
// pendingChanges
{
  id: string,               // pc-[timestamp]
  table: string,            // 'clients' | 'workRequests' | 'invoices' | 'disbursements' | 'transmittals'
  parentRecordId: string,     // ID of record being edited; null for new records
  proposedData: object,       // FULL SNAPSHOT of the record as proposed
  submittedBy: string,        // userId
  submittedAt: string,        // ISO timestamp
  status: string,             // 'pending' | 'approved' | 'rejected'
  rejectionReason: string,   // populated on reject
  reviewedBy: string,        // admin userId
  reviewedAt: string         // ISO timestamp
}

// transmittals
{
  id: string,
  workRequestId: string,
  clientId: string,
  trackingNumber: string,     // e.g., "ATA-TX-2025-001"
  status: string,             // 'Draft' | 'Sent' | 'Acknowledged'
  items: [{                   // itemized document list
    documentId: string,
    description: string,
    documentType: string
  }],
  sentAt: string,
  acknowledgedAt: string,
  sentBy: string,
  acknowledgedBy: string,     // "Received By" name
  notes: string,
  entity: string
}

// billingTemplates
{
  id: string,
  name: string,
  clientId: string,
  entity: string,
  schedule: string,            // 'monthly' | 'quarterly'
  pfAmount: number,
  lineItems: [{ description, amount, type }],
  createdAt: string
}

// disbursementTemplates
{
  id: string,
  name: string,
  category: string,
  description: string,
  amount: number,
  fundSource: string,
  entity: string,
  schedule: string,
  createdAt: string
}
```

### 4.2 Modified Tables

#### `clients`

```diff
+ tradeName: string
+ contactUserId: string        // FK to users; replaces contactPerson
+ relatedCompanies: [{ clientId, relationType }]
+ contactDetails: [{ type, value, label }]
```

#### `workRequests`

```diff
+ linkedInvoiceId: string | null
+ linkedDisbursementIds: string[]
+ linkedTransmittalIds: string[]
```

#### `tasks`

```diff
+ taskDocuments: [{ filename, uploadDate, uploaderId, description }]
// timeLogs shape change:
- { hours, date, note }
+ { startTime, endTime, date, note, hours }
```

#### `invoices`

```diff
+ createdBy: string
+ payments: [{ amount, method, reference, date, recordedBy }]
+ paymentCollectedBy: string
// VAT logic: vat hardcoded to 0, total = subtotal
```

#### `disbursements`

```diff
+ requestedBy: string          // explicit, not just employeeId
+ paymentHandledBy: string
+ paymentDetails: {
    method: string,
    reference: string,
    bank: string,
    date: string,
    processedBy: string
  }
```

#### `documents`

```diff
+ comments: [{ userId, date, comment }]
+ documentLifecycle: string    // 'collected' | 'with_documentations' | 'scanned' | 'in_envelope' | 'stored'
+ scannedBy: string
+ envelopeId: string
+ storedLocation: string
```

#### `users`

```diff
- department: string           // REMOVED
```

### 4.3 RBAC Permission Map (`Auth.can()`)

```javascript
const perms = {
  Admin:   ['*'], // all permissions including new dms:handover, pending:review
  Manager: ['clients:view','clients:edit', /* ... */ 'dms:handover','reports:view'],
  Staff:   ['clients:view','workflow:view','workflow:edit',
             'billing:view','disbursement:view','disbursement:create',
             'dms:view','dms:edit','reports:view',
             'transmittal:view','transmittal:edit'], // if assigned
  Viewer:  ['clients:view','workflow:view','billing:view',
            'disbursement:view','dms:view','reports:view']
};
```

**New permission:** `dms:handover` — granted to Admin, Manager, and designated Staff roles.

---

## 5. Module Specifications

### 5.1 Clients Module

**State:** `editingId`, `view` (list/form)  
**Staff filter logic:**

```javascript
const visibleClients = clients.filter(c => {
  if (isAdmin || isManager) return true;
  const isAssignedToTask = tasks.some(t => t.assigneeId === user.id && getWr(t.workRequestId).clientId === c.id);
  const isPointOfContact = c.contactUserId === user.id;
  return isAssignedToTask || isPointOfContact;
});
```

**Form fields (all required unless marked optional):**
- Taxpayer (required)
- TIN (required)
- Trade Name (optional)
- Business Address (optional)
- Point of Contact (required) — `<select>` of entity-scoped staff
- Contact Details (optional) — repeatable rows
- Related Companies (optional) — `<select>` existing client + relation type
- Entity (required)
- Retainer (checkbox)

### 5.2 Operations Module

**State:** `editingId`, `view` (list/form/detail/templates/templateForm), `detailWrId`, `templateEditingId`, `selectedTaskId`, `viewMode` (table/board/list)

**Priority mapping:**
- Existing free-text values → closest match ("High" → "Urgent", "Normal" → "Priority", "Low" → "Low Priority")

**Time log form (per task):**
- Date (required)
- Start Time (required) — `<input type="time">`
- End Time (required) — `<input type="time">`
- Note (optional)
- Hours (read-only, auto-calculated)

**Validation:** `endTime > startTime`, or reject.

**Task document upload:**
- File `<input>` — read metadata only (filename, size, type)
- Store in `taskDocuments[]` as metadata; do NOT store Base64 data

**View modes:**
- **Table:** Existing `<table>` with all columns
- **Board:** Kanban columns by status (`Draft`, `Pre-processing`, `Processing`, `Billing`, `Disbursement`, `Completed`, `Cancelled`)
- **List:** Compact rows (title + status + due date + assignee)

### 5.3 Billing Module

**State:** `view` (list/form/detail/aging), `detailId`, `viewMode` (table/board/list)

**Line items:**
- Type: `<select>` — PF, Government Fee
- Description: text
- Amount: number
- ~~VAT Treatment~~ (removed)

**Totals:**
- Subtotal = sum of line items
- ~~VAT~~ (hidden, hardcoded 0)
- Total = Subtotal

**PDF generation:**
- Standard invoice: full seller/buyer info, line items, totals, BIR footer
- Voucher: same data, stripped seller header, minimal layout

**Payment recording:**
- Amount Paid (required)
- Payment Date (required)
- Method: Cash, Check, Bank Transfer
- Reference # (optional)
- Recorded By: auto-populated `Auth.user.id`
- Payment Collected By: `<select>` of users

### 5.4 Disbursement Module

**State:** `view` (list/form/detail/report), `detailId`, `viewMode` (table/board/list)

**Form fields:**
- Category (required)
- Description (required)
- Amount (required)
- Receipt (optional file)
- Fund Source: Firm Fund / Client Fund (required)
- Linked Invoice (conditional, if Client Fund)
- Link to Work Request (optional dropdown)

**Approval chain:**
1. Staff submits → status: `Submitted`
2. Admin reviews → Approve & Release, or Reject
3. If rejected → Staff sees reason, can resubmit

### 5.5 Documents (DMS) Module

**State:** `view` (list/form/detail), `detailId`, `viewMode` (table/board/list)

**Document lifecycle transitions:**
| From | To | Who can transition |
|------|----|-------------------|
| `collected` | `with_documentations` | Any Staff (who received from client) |
| `with_documentations` | `scanned` | Documentation Staff (`dms:handover`) |
| `scanned` | `in_envelope` | Documentation Staff (`dms:handover`) |
| `in_envelope` | `stored` | Documentation Staff (`dms:handover`) |

**Admin comments:**
- Only Admin role can add comments
- Comment thread shown in document detail view

### 5.6 Transmittal Module (NEW)

**State:** `view` (list/form/detail), `detailId`

**Form:**
1. Select Work Request → auto-populate client
2. Itemized document list (add/remove rows)
3. Generate tracking number button
4. Notes

**Detail view:**
- Transmittal letter preview (printable)
- "Mark as Sent" action
- "Received By" acknowledgment form (name + date)
- Status: Draft → Sent → Acknowledged

### 5.7 Reports Module

**State:** `activeReport` (daily/weekly/monthly), `filters`, `viewMode`

**Daily Report:**
- Date picker (default: today)
- Table: Employee | Task | Client | Start Time | End Time | Hours | Status
- Only tasks with time logs for selected date

**Weekly Summary:**
- Week picker (default: current week)
- Table: Employee | Completed | Pending | Overdue
- Overdue tasks highlighted

**Monthly Pending List:**
- Month picker (default: current month)
- Grouped by employee
- Separate section: recurring retainer tasks due this month

---

## 6. RBAC & Permission Changes

### 6.1 Removed
- `department` field from `users` table and all UI references

### 6.2 Added
- `dms:handover` permission — controls who can record document handovers and lifecycle transitions

### 6.3 Updated Logic
- `Clients.getFilteredClients()` — Staff now see clients where `contactUserId === Auth.user.id` OR they have assigned tasks
- `DMS.recordHandover()` — Gate changed from `Auth.user.department === 'Documentations'` to `Auth.can('dms:handover')`

### 6.4 Admin Review Gate Integration

Every structural mutation submit function must wrap through the gate:

```javascript
function submitStructuralChange(table, record, isNew) {
  const role = Auth.user.role;
  if (role === 'Admin' || role === 'Manager') {
    // Direct save
    if (isNew) DB.insert(table, record);
    else DB.update(table, record.id, record);
  } else {
    // Stage for review
    DB.insert('pendingChanges', {
      id: generateId('pc'),
      table,
      parentRecordId: isNew ? null : record.id,
      proposedData: record,
      submittedBy: Auth.user.id,
      submittedAt: new Date().toISOString(),
      status: 'pending'
    });
  }
}
```

---

## 7. UI/UX Global Changes

### 7.1 Navigation Order

```
Dashboard → Client List → Work Request → Billing → Disbursement → Transmittal → Reports → Admin
```

**Note:** "Work Request" nav label stays as "Work Request" (not renamed to "Operations" in menu), but the module title and page heading say "Operations." This matches the feedback exactly: "Rename as OPERATIONS" but the menu path in the feedback lists "Work Request" in position 3.

**Correction:** Re-reading the feedback — the menu order says `Dashboard>Client List>Work Request>Billing...`. But also says "Rename as OPERATIONS." The consistent interpretation: the menu label should be "Operations" (replacing "Workflow") and the route name stays conceptually as work request operations. **Decision:** Nav label = "Operations", but keep the route/hash as `#workflow` internally to minimize code churn, or update to `#operations`. **Recommendation:** Update route to `#operations` for clarity.

### 7.2 Button Placement

All forms must have their primary actions at the **top-right** of the form container, inline with the page title/description:

```html
<div class="form-header-bar">
  <h2>Create Invoice</h2>
  <div class="form-actions-top">
    <button class="btn btn-primary">Save</button>
    <button class="btn btn-ghost">Cancel</button>
  </div>
</div>
```

**Legacy `.form-actions` at bottom of forms:** Can remain as secondary actions or be removed. **Decision:** Move all to top; remove bottom action bars.

### 7.3 View-Mode Toggle

A reusable view-mode toggle component:

```html
<div class="view-mode-toggle">
  <button data-mode="table" class="active">📋 Table</button>
  <button data-mode="board">📊 Board</button>
  <button data-mode="list">📄 List</button>
</div>
```

Persist preference in `localStorage` under key `erp_preferred_view_[module]`.

### 7.4 Mandatory Field Validation

Global validator utility:

```javascript
function validateRequiredFields(form) {
  const required = form.querySelectorAll('[required]');
  let valid = true;
  required.forEach(field => {
    if (!field.value.trim()) {
      valid = false;
      showFieldError(field, 'This field is required');
    }
  });
  return valid;
}
```

**Enforcement point:** Call `validateRequiredFields()` before `submitForReview()`, NOT on draft/auto-save.

---

## 8. Breaking Changes Catalog

| # | Change | Breaking? | Migration Required | Impact |
|---|--------|-----------|-------------------|--------|
| 1 | Admin Review Gate for structural mutations | **YES** | `pendingChanges` table seed | All module submit functions |
| 2 | Client `contactPerson` → `contactUserId` | **YES** | Map existing strings to user IDs or null | Clients module |
| 3 | Client schema additions (`tradeName`, `relatedCompanies`, `contactDetails`) | **YES** | Add empty defaults | Clients module |
| 4 | Work Request linkage fields | **YES** | Add empty arrays/nulls | Operations module |
| 5 | Task `timeLogs` shape change | **YES** | Transform `{hours, date, note}` → new shape | Operations module |
| 6 | Task `taskDocuments[]` | **YES** | Add empty arrays | Operations module |
| 7 | Invoice VAT removal | **YES** | Recalculate totals; remove VAT treatment | Billing module |
| 8 | Invoice `payments[]` array | **YES** | Migrate `paidAmount` → synthetic payment entry | Billing module |
| 9 | Disbursement `paymentDetails` | **YES** | Add null defaults | Disbursement module |
| 10 | Document `comments[]`, lifecycle fields | **YES** | Add empty arrays/null defaults | DMS module |
| 11 | User `department` removal | **YES** | Delete key; replace gates with `dms:handover` | Users + DMS modules |
| 12 | Menu reorder + rename | No | None | UI only |
| 13 | Dashboard widgets | No | None | Additive |
| 14 | View modes (Table/Board/List) | No | None | Additive UI |
| 15 | Filters additions | No | None | Additive UI |
| 16 | PDF generation | No | None | Additive (new library) |
| 17 | Transmittal module | No | None | Entirely new |
| 18 | Reports enhancements | No | None | Additive UI |

---

## 9. Testing & Acceptance Criteria

### 9.1 Schema Migration
- [ ] Clearing localStorage and reloading seeds all v3 fields correctly
- [ ] Existing v2 localStorage data migrates through `migrateV2ToV3()` without data loss
- [ ] `schemaVersion` updates to `3` after migration

### 9.2 Admin Review Gate
- [ ] Staff creates a client → appears in "My Pending Submissions" only
- [ ] Admin sees the proposal in "Pending Approvals" with side-by-side diff
- [ ] Admin approves → live record updates; Staff sees approved status
- [ ] Admin rejects → Staff sees rejection reason; can clone and resubmit
- [ ] Manager creates a client → direct-save, no pending queue
- [ ] Staff edits existing client → live record unchanged until approval

### 9.3 Clients Module
- [ ] Table shows: Taxpayer, TIN, Point of Contact, Trade Name, Address
- [ ] Point of Contact dropdown populated with entity-scoped staff
- [ ] Staff sees clients where they are Point of Contact even with no tasks
- [ ] Related Companies links navigate to referenced client detail
- [ ] Contact Details multi-entry works

### 9.4 Operations Module
- [ ] Priority dropdown: Urgent, Priority, Low Priority
- [ ] Time log accepts start/end times; auto-calculates rounded hours
- [ ] Task document upload stores metadata only
- [ ] Board view groups cards by status in columns (view-only)
- [ ] Related Records panel shows linked Billing, Disbursement, Transmittal

### 9.5 Billing Module
- [ ] Line items have no VAT treatment dropdown
- [ ] Invoice total equals subtotal (no VAT added)
- [ ] Payment recording creates entry in `payments[]`
- [ ] PDF includes BIR compliance footer
- [ ] Voucher PDF strips seller header
- [ ] "Generate Next Period" button clones billing template

### 9.6 Disbursement Module
- [ ] No VAT options present
- [ ] PDF and voucher generation work
- [ ] Payment details captured on release
- [ ] "Generate Next Period" button clones disbursement template

### 9.7 Documents (DMS)
- [ ] Admin can add comments on document detail
- [ ] Document lifecycle transitions track correctly
- [ ] Envelope ID generated as text label
- [ ] Handover recording gated by `dms:handover` permission

### 9.8 Transmittal Module
- [ ] Tracking number auto-generates per entity
- [ ] Transmittal letter PDF generated
- [ ] "Received By" acknowledgment records date and name
- [ ] Linked in Work Request detail panel

### 9.9 Reports Module
- [ ] Daily Report shows task completions with start/end times
- [ ] Weekly Summary shows completed/pending/overdue per employee
- [ ] Monthly Pending shows recurring retainer tasks due

### 9.10 Users Module
- [ ] Department field removed from form and table
- [ ] Admin sees "Pending Approvals" tab with queue
- [ ] Side-by-side diff renders correctly

---

## 10. Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `localStorage` 5MB limit exceeded by document metadata growth | Medium | High | Store only metadata (filename, size, type); never Base64 file data |
| Schema migration corrupts existing user data | Low | Critical | Test migration thoroughly; provide "Reset Demo Data" fallback |
| Admin Review Gate creates bottleneck if Admin is unavailable | Medium | Medium | Manager bypass already built in; consider adding "Manager can approve" as future enhancement |
| VAT removal violates BIR if firm later becomes VAT-registered | Low | High | Compliance footer on PDFs; document decision in spec; easy to revert by re-adding VAT logic |
| Multiple Staff submit conflicting edits to same client | Medium | Medium | Pessimistic staging handles this — Admin sees queue and picks correct snapshot |
| Board/Kanban view-only may disappoint user expectation | Low | Low | Clarify in training that drag-and-drop is Phase 4 enhancement |
| Recurring templates require manual generation — user may forget | Medium | Medium | Add dashboard widget showing "Templates Due for Generation This Month" |

---

## 11. Next Steps (Awaiting Execution Approval)

1. **Review this specification** with the team
2. **Assign module owners** per Phase 3 (3A–3H)
3. **Begin Phase 0** (schema migration) — single owner, no parallel work
4. **Phase 1 (shell) + Phase 2 (admin gate)** can follow in sequence
5. **Phase 3 modules** can parallelize once Phase 2 is complete

**Do not proceed to execution until this specification is explicitly approved.**

---

*Specification synthesized from:*
- *`ERP-feedback-v1.md` (client feedback)*
- *Full codebase review (`index.html`, `js/*.js`, `css/styles.css`)*
- *NotebookLM research on ERP best practices and vanilla JS implementation patterns*
- *Structured grilling session resolving 21 architectural dependencies*
