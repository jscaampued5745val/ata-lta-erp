/**
 * Data Layer
 * localStorage persistence, seed data, schema versioning, and CRUD wrapper.
 */

// ============================================================
// SEED DATA
// ============================================================

const now = new Date().toISOString();
const today = new Date().toISOString().slice(0, 10);
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const inFiveDays = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

function makeId(prefix, num) {
  return prefix + '-' + String(num).padStart(4, '0');
}

const seedData = {
  schemaVersion: 3,

  users: [
    {
      id: makeId('u', 1),
      name: 'Administrator',
      email: 'admin@ata-lta.ph',
      password: 'password123',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/men/1.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 2),
      name: 'Manager',
      email: 'manager@ata-lta.ph',
      password: 'password123',
      role: 'Manager',
      entities: ['ATA', 'LTA'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/women/2.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 3),
      name: 'Manager ATA',
      email: 'manager-ata@ata-lta.ph',
      password: 'password123',
      role: 'Manager',
      entities: ['ata'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/men/3.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 4),
      name: 'Accounting Staff ATA',
      email: 'accounting-ata@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['ata'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/women/4.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 5),
      name: 'Accounting Staff LTA',
      email: 'accounting-lta@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['lta'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/men/5.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 6),
      name: 'Operations Staff ATA',
      email: 'ops-ata@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['ata'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/women/6.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 7),
      name: 'Operations Staff LTA',
      email: 'ops-lta@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['lta'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/men/7.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 8),
      name: 'Documentation Staff',
      email: 'docs@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['ATA', 'LTA'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/women/8.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 9),
      name: 'HR Staff',
      email: 'hr@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['ATA', 'LTA'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/women/9.jpg',
      createdAt: now
    },
    {
      id: makeId('u', 10),
      name: 'Admin Staff',
      email: 'admin-staff@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      entities: ['ATA', 'LTA'],
      isActive: true,
      avatarUrl: 'https://randomuser.me/api/portraits/men/10.jpg',
      createdAt: now
    }
  ],

  clients: [
    {
      id: makeId('c', 1),
      name: 'Manila Fresh Foods Inc.',
      tin: '123-456-789-0001',
      contactPerson: 'Juan dela Cruz',
      phone: '0917-123-4567',
      email: 'juan.dcruz@manilafresh.ph',
      address: '123 Mabini St, Ermita, Manila, Metro Manila',
      entity: 'ATA',
      retainer: true,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 2),
      name: 'Cebu Trading Co.',
      tin: '234-567-890-0002',
      contactPerson: 'Maria Santos',
      phone: '0918-234-5678',
      email: 'maria.santos@cebutrade.ph',
      address: '456 Osmena Blvd, Cebu City, Cebu',
      entity: 'ATA',
      retainer: false,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 3),
      name: 'Davao Agri Ventures',
      tin: '345-678-901-0003',
      contactPerson: 'Ricardo Reyes',
      phone: '0919-345-6789',
      email: 'ricardo.reyes@davaoagri.ph',
      address: '789 Roxas Ave, Davao City, Davao del Sur',
      entity: 'ATA',
      retainer: true,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 4),
      name: 'Iloilo Manufacturing Corp.',
      tin: '456-789-012-0004',
      contactPerson: 'Ana Lim',
      phone: '0920-456-7890',
      email: 'ana.lim@iloilomfg.ph',
      address: '321 Magsaysay St, Iloilo City, Iloilo',
      entity: 'ATA',
      retainer: false,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 5),
      name: 'Batangas Industrial Group',
      tin: '567-890-123-0005',
      contactPerson: 'Pedro Garcia',
      phone: '0921-567-8901',
      email: 'pedro.garcia@batindustrial.ph',
      address: '654 JP Laurel Hwy, Tanauan, Batangas',
      entity: 'LTA',
      retainer: true,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 6),
      name: 'Laguna Logistics Ltd.',
      tin: '678-901-234-0006',
      contactPerson: 'Elena Torres',
      phone: '0922-678-9012',
      email: 'elena.torres@lagunalogistics.ph',
      address: '987 National Hwy, Calamba, Laguna',
      entity: 'LTA',
      retainer: false,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 7),
      name: 'Pampanga Retailers Inc.',
      tin: '789-012-345-0007',
      contactPerson: 'Carlos Mendoza',
      phone: '0923-789-0123',
      email: 'carlos.mendoza@pampangaretail.ph',
      address: '147 McArthur Hwy, Angeles, Pampanga',
      entity: 'LTA',
      retainer: true,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 8),
      name: 'Tagaytay Hospitality Group',
      tin: '890-123-456-0008',
      contactPerson: 'Sofia Ramos',
      phone: '0924-890-1234',
      email: 'sofia.ramos@tagaytayhospitality.ph',
      address: '258 Aguinaldo Hwy, Tagaytay, Cavite',
      entity: 'LTA',
      retainer: false,
      tradeName: '',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 9),
      name: 'Pioneer Logistics Inc.',
      tin: '901-123-456-0009',
      contactPerson: 'David Tan',
      phone: '0925-123-4567',
      email: 'david.tan@pioneerlog.ph',
      address: '77 Pioneer St, Mandaluyong, Metro Manila',
      entity: 'ATA',
      retainer: true,
      tradeName: 'Pioneer Log',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 10),
      name: 'Taguig Tech Solutions',
      tin: '012-234-567-0010',
      contactPerson: 'Grace Lee',
      phone: '0926-234-5678',
      email: 'grace.lee@taguigtech.ph',
      address: '88 BGC High Street, Taguig, Metro Manila',
      entity: 'LTA',
      retainer: false,
      tradeName: 'Taguig Tech',
      contactUserId: '',
      relatedCompanies: [],
      contactDetails: [],
      createdAt: now
    },
    {
      id: makeId('c', 11),
      name: 'Apex Global Solutions (Archived)',
      tin: '901-234-567-0011',
      contactPerson: 'Robert Tan',
      phone: '0925-901-2345',
      email: 'robert.tan@apexglobal.ph',
      address: '12 Pioneer St, Mandaluyong City',
      entity: 'ATA',
      retainer: true,
      tradeName: 'Apex Global',
      contactUserId: makeId('u', 4),
      relatedCompanies: [],
      contactDetails: [{ type: 'email', value: 'info@apexglobal.ph', label: 'Work' }],
      status: 'Archived',
      createdAt: lastMonth
    },
    {
      id: makeId('c', 12),
      name: 'Summit Summit Summit (Archived)',
      tin: '012-345-678-0012',
      contactPerson: 'Lisa Go',
      phone: '0926-012-3456',
      email: 'lisa.go@summit.ph',
      address: '88 Shaw Blvd, Pasig City',
      entity: 'LTA',
      retainer: false,
      tradeName: 'Summit Group',
      contactUserId: makeId('u', 5),
      relatedCompanies: [],
      contactDetails: [{ type: 'mobile', value: '09260123456', label: 'Mobile' }],
      status: 'Archived',
      createdAt: lastMonth
    }
  ],

  workRequests: [
    {
      id: makeId('wr', 102),
      title: 'Completed Assessment - Mock',
      description: 'Mock completed item due today to demonstrate green styling.',
      clientId: makeId('c', 2),
      entity: 'ATA',
      status: 'Completed',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today,
      dueDate: today
    },
    {
      id: makeId('wr', 101),
      title: 'Urgent Processing - All Staff (Mock)',
      description: 'Mock item due today to demonstrate daily task views.',
      clientId: makeId('c', 1),
      entity: 'ATA',
      status: 'Processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today,
      dueDate: today
    },
    {
      id: makeId('wr', 99),
      title: 'Monthly VAT Declaration - Mock',
      description: 'Mock item due this week.',
      clientId: makeId('c', 1),
      entity: 'ATA',
      status: 'Processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today,
      dueDate: inThreeDays
    },
    {
      id: makeId('wr', 100),
      title: 'Quarterly Income Tax - Mock',
      description: 'Mock item due this week.',
      clientId: makeId('c', 5),
      entity: 'LTA',
      status: 'Processing',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 5),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today,
      dueDate: tomorrow
    },
    {
      id: makeId('wr', 1),
      title: 'Annual Tax Filing 2025',
      description: 'Comprehensive annual income tax return preparation and filing for CY 2024.',
      clientId: makeId('c', 1),
      entity: 'ATA',
      status: 'Processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 2),
      title: 'Monthly Bookkeeping',
      description: 'Recurring monthly bookkeeping service for retainer client.',
      clientId: makeId('c', 3),
      entity: 'ATA',
      status: 'Completed',
      requestedBy: makeId('u', 3),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 3),
      title: 'VAT Compliance Review',
      description: 'Quarterly VAT reconciliation and BIR compliance review.',
      clientId: makeId('c', 2),
      entity: 'ATA',
      status: 'Billing',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('wr', 4),
      title: 'Audited Financial Statements',
      description: 'Preparation of audited financial statements for SEC filing.',
      clientId: makeId('c', 5),
      entity: 'LTA',
      status: 'Pre-processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 5),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('wr', 5),
      title: 'Quarterly Tax Filing Q1 2025',
      description: 'Quarterly percentage tax and income tax filing for Q1.',
      clientId: makeId('c', 7),
      entity: 'LTA',
      status: 'Draft',
      requestedBy: makeId('u', 2),
      assignedTo: null,
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('wr', 6),
      title: 'Payroll Tax Compliance',
      description: 'Annualized withholding tax on compensation review and correction.',
      clientId: makeId('c', 6),
      entity: 'LTA',
      status: 'Cancelled',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 5),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 7),
      title: 'Business Permit Renewal 2026',
      description: 'Local Government Unit (LGU) business permit renewal process.',
      clientId: makeId('c', 1),
      entity: 'ATA',
      status: 'Processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 6),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('wr', 8),
      title: 'SEC GIS Filing 2026',
      description: 'General Information Sheet filing with the Securities and Exchange Commission.',
      clientId: makeId('c', 7),
      entity: 'LTA',
      status: 'Pre-processing',
      requestedBy: makeId('u', 4),
      assignedTo: makeId('u', 7),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('wr', 9),
      title: 'Apex Setup Phase 1',
      description: 'Initial tax mapping and consulting setup.',
      clientId: makeId('c', 11),
      entity: 'ATA',
      status: 'Cancelled',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 4),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 10),
      title: 'Summit Financial Audit',
      description: 'Staged financial audit of local accounts.',
      clientId: makeId('c', 12),
      entity: 'LTA',
      status: 'Cancelled',
      requestedBy: makeId('u', 3),
      assignedTo: makeId('u', 5),
      linkedInvoiceId: null,
      linkedDisbursementIds: [],
      linkedTransmittalIds: [],
      createdAt: lastMonth,
      updatedAt: now
    }
  ],

  tasks: [
    {
      id: makeId('t', 994),
      workRequestId: makeId('wr', 102),
      title: 'Complete assessment review',
      description: 'Review is done.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 991),
      workRequestId: makeId('wr', 101),
      title: 'Review initial documentation',
      description: 'Check for completeness.',
      status: 'Pending',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 992),
      workRequestId: makeId('wr', 101),
      title: 'Process compliance',
      description: 'Ensure compliance with LTA/ATA standards.',
      status: 'In Progress',
      assigneeId: makeId('u', 5),
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 993),
      workRequestId: makeId('wr', 99),
      title: 'Draft VAT Return',
      description: 'Drafting the VAT return.',
      status: 'Pending',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: inThreeDays,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    // Work Request 1 - Annual Tax Filing 2025 (ATA)
    {
      id: makeId('t', 1),
      workRequestId: makeId('wr', 1),
      title: 'Gather source documents',
      description: 'Collect all receipts, invoices, and financial records from client.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: lastMonth,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 2),
      workRequestId: makeId('wr', 1),
      title: 'Encode trial balance',
      description: 'Input client trial balance into accounting software.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [makeId('t', 1)],
      dueDate: lastWeek,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 3),
      workRequestId: makeId('wr', 1),
      title: 'Prepare tax schedules',
      description: 'Build detailed tax computation schedules and supporting docs.',
      status: 'In Progress',
      assigneeId: makeId('u', 4),
      predecessors: [makeId('t', 2)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    // Work Request 2 - Monthly Bookkeeping (ATA)
    {
      id: makeId('t', 4),
      workRequestId: makeId('wr', 2),
      title: 'Reconcile bank statements',
      description: 'Match bank transactions with internal records.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: lastMonth,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 5),
      workRequestId: makeId('wr', 2),
      title: 'Generate financial reports',
      description: 'Produce income statement and balance sheet for review.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [makeId('t', 4)],
      dueDate: lastWeek,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 6),
      workRequestId: makeId('wr', 2),
      title: 'Client review meeting',
      description: 'Present reports to client and obtain sign-off.',
      status: 'Completed',
      assigneeId: makeId('u', 3),
      predecessors: [makeId('t', 5)],
      dueDate: lastWeek,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastMonth,
      updatedAt: now
    },
    // Work Request 3 - VAT Compliance Review (ATA)
    {
      id: makeId('t', 7),
      workRequestId: makeId('wr', 3),
      title: 'Extract VAT summary',
      description: 'Pull VAT input and output data from accounting system.',
      status: 'Completed',
      assigneeId: makeId('u', 4),
      predecessors: [],
      dueDate: lastWeek,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 8),
      workRequestId: makeId('wr', 3),
      title: 'Cross-check with 2550Q returns',
      description: 'Validate quarterly VAT return figures against ledgers.',
      status: 'For Review',
      assigneeId: makeId('u', 4),
      predecessors: [makeId('t', 7)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 9),
      workRequestId: makeId('wr', 3),
      title: 'Prepare compliance memo',
      description: 'Draft findings memo with recommendations for client.',
      status: 'Draft',
      assigneeId: makeId('u', 3),
      predecessors: [makeId('t', 8)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    // Work Request 4 - Audited Financial Statements (LTA)
    {
      id: makeId('t', 10),
      workRequestId: makeId('wr', 4),
      title: 'Send PBC list to client',
      description: 'Request prepared-by-client documents and confirmations.',
      status: 'Completed',
      assigneeId: makeId('u', 5),
      predecessors: [],
      dueDate: lastWeek,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 11),
      workRequestId: makeId('wr', 4),
      title: 'Perform analytical review',
      description: 'Compare current year ratios and balances against prior year.',
      status: 'In Progress',
      assigneeId: makeId('u', 5),
      predecessors: [makeId('t', 10)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 12),
      workRequestId: makeId('wr', 4),
      title: 'Draft audit report',
      description: 'Prepare independent auditor\'s report for partner review.',
      status: 'Assigned',
      assigneeId: makeId('u', 5),
      predecessors: [makeId('t', 11)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    // Work Request 5 - Quarterly Tax Filing Q1 2025 (LTA)
    {
      id: makeId('t', 13),
      workRequestId: makeId('wr', 5),
      title: 'Verify gross revenue figures',
      description: 'Confirm Q1 gross revenue with client finance team.',
      status: 'Draft',
      assigneeId: null,
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 14),
      workRequestId: makeId('wr', 5),
      title: 'Compute percentage tax due',
      description: 'Calculate 3% percentage tax on gross sales/receipts.',
      status: 'Draft',
      assigneeId: null,
      predecessors: [makeId('t', 13)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 15),
      workRequestId: makeId('wr', 5),
      title: 'File 2551Q via eBIR',
      description: 'Submit quarterly percentage tax return electronically.',
      status: 'Draft',
      assigneeId: null,
      predecessors: [makeId('t', 14)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    // Work Request 7 - Business Permit Renewal (ATA)
    {
      id: makeId('t', 16),
      workRequestId: makeId('wr', 7),
      title: 'Assess LGU requirements',
      description: 'Gather necessary documents for business permit renewal.',
      status: 'In Progress',
      assigneeId: makeId('u', 6),
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 17),
      workRequestId: makeId('wr', 7),
      title: 'Submit application to City Hall',
      description: 'Process and file the business permit renewal physically.',
      status: 'Draft',
      assigneeId: makeId('u', 6),
      predecessors: [makeId('t', 16)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: lastWeek,
      updatedAt: now
    },
    // Work Request 8 - SEC GIS Filing (LTA)
    {
      id: makeId('t', 18),
      workRequestId: makeId('wr', 8),
      title: 'Draft GIS 2026',
      description: 'Prepare the General Information Sheet for review.',
      status: 'For Review',
      assigneeId: makeId('u', 7),
      predecessors: [],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 19),
      workRequestId: makeId('wr', 8),
      title: 'Upload GIS via eFAST',
      description: 'Upload the signed and notarized GIS through the SEC portal.',
      status: 'Draft',
      assigneeId: makeId('u', 7),
      predecessors: [makeId('t', 18)],
      dueDate: today,
      timeLogs: [],
      taskDocuments: [],
      createdAt: today,
      updatedAt: today
    }
  ],

  invoices: [
    {
      id: makeId('inv', 1),
      clientId: makeId('c', 1),
      entity: 'ATA',
      workRequestId: makeId('wr', 1),
      invoiceNumber: 'ATA-SI-2025-001',
      issueDate: lastWeek,
      dueDate: today,
      status: 'Sent',
      lineItems: [
        { description: 'Professional Fee - Annual Tax Filing', amount: 45000.00, type: 'Professional Fee' },
        { description: 'BIR DST', amount: 150.00, type: 'Government Fee' },
        { description: 'SEC Filing Fee', amount: 500.00, type: 'Government Fee' }
      ],
      subtotal: 45650.00,
      vat: 0,
      total: 45650.00,
      paidAmount: 0.00,
      payments: [],
      createdBy: makeId('u', 3),
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 2),
      clientId: makeId('c', 3),
      entity: 'ATA',
      workRequestId: makeId('wr', 2),
      invoiceNumber: 'ATA-SI-2025-002',
      issueDate: lastMonth,
      dueDate: lastWeek,
      status: 'Paid',
      lineItems: [
        { description: 'Professional Fee - Monthly Bookkeeping (Retainer)', amount: 15000.00, type: 'Professional Fee' }
      ],
      subtotal: 15000.00,
      vat: 0,
      total: 15000.00,
      paidAmount: 15000.00,
      payments: [
        { amount: 15000.00, method: 'Cash', reference: 'Migrated', date: lastWeek, recordedBy: '' }
      ],
      createdBy: makeId('u', 3),
      createdAt: lastMonth,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 5),
      clientId: makeId('c', 2),
      entity: 'ATA',
      workRequestId: makeId('wr', 3),
      invoiceNumber: 'ATA-SI-2025-003',
      issueDate: lastWeek,
      dueDate: today,
      status: 'Sent',
      lineItems: [
        { description: 'Professional Fee - VAT Compliance Review', amount: 25000.00, type: 'Professional Fee' },
        { description: 'BIR eFile Access Fee', amount: 200.00, type: 'Government Fee' }
      ],
      subtotal: 25200.00,
      vat: 0,
      total: 25200.00,
      paidAmount: 0.00,
      payments: [],
      createdBy: makeId('u', 3),
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 3),
      clientId: makeId('c', 5),
      entity: 'LTA',
      invoiceNumber: 'LTA-SI-2025-001',
      issueDate: lastWeek,
      dueDate: today,
      status: 'Partially Paid',
      lineItems: [
        { description: 'Professional Fee - Audit Engagement', amount: 85000.00, type: 'Professional Fee' },
        { description: 'SEC Filing Fee', amount: 1000.00, type: 'Government Fee' },
        { description: 'PCC Fee', amount: 800.00, type: 'Government Fee' }
      ],
      subtotal: 86800.00,
      vat: 0,
      total: 86800.00,
      paidAmount: 48500.00,
      payments: [
        { amount: 48500.00, method: 'Cash', reference: 'Migrated', date: lastWeek, recordedBy: '' }
      ],
      createdBy: makeId('u', 3),
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 4),
      clientId: makeId('c', 7),
      entity: 'LTA',
      invoiceNumber: 'LTA-SI-2025-002',
      issueDate: today,
      dueDate: today,
      status: 'Draft',
      lineItems: [
        { description: 'Professional Fee - Quarterly Tax Filing Q1', amount: 22000.00, type: 'Professional Fee' },
        { description: 'BIR eFiling Fee', amount: 100.00, type: 'Government Fee' }
      ],
      subtotal: 22100.00,
      vat: 0,
      total: 22100.00,
      paidAmount: 0.00,
      payments: [],
      createdBy: makeId('u', 3),
      createdAt: today,
      updatedAt: today
    }
  ],

  disbursements: [
    {
      id: makeId('d', 100),
      category: 'Representation',
      description: 'Completed representation expense (Mock)',
      amount: 4500.00,
      fundSource: 'Company Fund',
      linkedInvoiceId: null,
      linkedWorkRequestId: makeId('wr', 102),
      entity: 'ATA',
      employeeId: makeId('u', 4),
      requestedBy: makeId('u', 4),
      status: 'Released',
      submittedAt: today,
      dueDate: today,
      accountingApprovedBy: makeId('u', 1),
      paymentHandledBy: makeId('u', 1),
      paymentDetails: { method: 'Cash', reference: 'VOU-001', bank: '', date: today, processedBy: makeId('u', 1) },
      updatedAt: today
    },
    {
      id: makeId('d', 99),
      category: 'Travel',
      description: 'Client visit travel expenses (Mock)',
      amount: 1200.00,
      fundSource: 'Petty Cash',
      linkedInvoiceId: null,
      linkedWorkRequestId: makeId('wr', 99),
      entity: 'ATA',
      employeeId: makeId('u', 4),
      requestedBy: makeId('u', 4),
      status: 'Approved',
      submittedAt: today,
      dueDate: inFiveDays,
      accountingApprovedBy: makeId('u', 1),
      paymentHandledBy: makeId('u', 1),
      paymentDetails: { method: '', reference: '', bank: '', date: '', processedBy: '' },
      updatedAt: today
    },
    {
      id: makeId('d', 1),
      category: 'Government Fee',
      description: 'BIR Documentary Stamp Tax payment',
      amount: 150.00,
      fundSource: 'Client Fund',
      linkedInvoiceId: makeId('inv', 1),
      linkedWorkRequestId: makeId('wr', 1),
      entity: 'ATA',
      employeeId: makeId('u', 4),
      requestedBy: makeId('u', 4),
      status: 'Released',
      submittedAt: lastWeek,
      accountingApprovedBy: makeId('u', 3),
      releasedAt: lastWeek,
      receiptFilename: 'bir-dst-receipt.pdf',
      paymentHandledBy: makeId('u', 3),
      paymentDetails: { method: 'Cash', reference: '', bank: '', date: lastWeek, processedBy: makeId('u', 3) }
    },
    {
      id: makeId('d', 2),
      category: 'Government Fee',
      description: 'SEC Filing Fee payment',
      amount: 500.00,
      fundSource: 'Client Fund',
      linkedInvoiceId: makeId('inv', 1),
      linkedWorkRequestId: makeId('wr', 1),
      entity: 'ATA',
      employeeId: makeId('u', 4),
      requestedBy: makeId('u', 4),
      status: 'Released',
      submittedAt: lastWeek,
      accountingApprovedBy: makeId('u', 3),
      releasedAt: lastWeek,
      receiptFilename: 'sec-filing-receipt.pdf',
      paymentHandledBy: makeId('u', 3),
      paymentDetails: { method: 'Cash', reference: '', bank: '', date: lastWeek, processedBy: makeId('u', 3) }
    },
    {
      id: makeId('d', 3),
      category: 'Other',
      description: 'Office supplies procurement',
      amount: 3250.00,
      fundSource: 'Firm Fund',
      linkedInvoiceId: null,
      entity: 'ATA',
      employeeId: makeId('u', 6),
      requestedBy: makeId('u', 6),
      status: 'Approved',
      submittedAt: lastWeek,
      managerApprovedBy: makeId('u', 2),
      accountingApprovedBy: makeId('u', 3),
      releasedAt: null,
      receiptFilename: 'office-supplies.pdf',
      paymentHandledBy: '',
      paymentDetails: { method: '', reference: '', bank: '', date: '', processedBy: '' }
    },
    {
      id: makeId('d', 4),
      category: 'Government Fee',
      description: 'SEC Filing Fee for audited FS',
      amount: 1000.00,
      fundSource: 'Client Fund',
      linkedInvoiceId: makeId('inv', 3),
      entity: 'LTA',
      employeeId: makeId('u', 5),
      requestedBy: makeId('u', 5),
      status: 'Submitted',
      submittedAt: lastWeek,
      releasedAt: null,
      receiptFilename: null,
      paymentHandledBy: '',
      paymentDetails: { method: '', reference: '', bank: '', date: '', processedBy: '' }
    },
    {
      id: makeId('d', 5),
      category: 'Transportation',
      description: 'Transportation allowance - field audit',
      amount: 1800.00,
      fundSource: 'Firm Fund',
      linkedInvoiceId: null,
      entity: 'LTA',
      employeeId: makeId('u', 5),
      requestedBy: makeId('u', 5),
      status: 'Released',
      submittedAt: lastWeek,
      managerApprovedBy: makeId('u', 2),
      accountingApprovedBy: makeId('u', 3),
      releasedAt: lastWeek,
      receiptFilename: 'transportation-allowance.pdf',
      paymentHandledBy: makeId('u', 3),
      paymentDetails: { method: 'Cash', reference: '', bank: '', date: lastWeek, processedBy: makeId('u', 3) }
    },
    {
      id: makeId('d', 6),
      category: 'Other',
      description: 'Employee training seminar fee',
      amount: 12500.00,
      fundSource: 'Firm Fund',
      linkedInvoiceId: null,
      entity: 'LTA',
      employeeId: makeId('u', 9),
      requestedBy: makeId('u', 9),
      status: 'Under Review',
      submittedAt: lastWeek,
      managerApprovedBy: makeId('u', 2),
      releasedAt: null,
      receiptFilename: null,
      paymentHandledBy: '',
      paymentDetails: { method: '', reference: '', bank: '', date: '', processedBy: '' }
    }
  ],

  documents: [
    {
      id: makeId('doc', 1),
      fileName: 'BIR-2303-ManilaFresh.pdf',
      workRequestId: makeId('wr', 1),
      document_type: 'original_scan',
      category: 'Requirement Docs',
      uploader: makeId('u', 4),
      uploadDate: lastMonth,
      description: 'BIR Form 2303 copy for reference.',
      handover_log: [
        { handed_to: 'Juan dela Cruz', handed_date: lastMonth, method: 'In-Person' }
      ],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 2),
      fileName: 'Articles-of-Incorporation-ManilaFresh.pdf',
      workRequestId: makeId('wr', 1),
      document_type: 'generated_copy',
      category: 'Requirement Docs',
      uploader: makeId('u', 4),
      uploadDate: lastMonth,
      description: 'Certified copy of Articles of Incorporation.',
      handover_log: [],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 3),
      fileName: 'AFS-2024-DavaoAgri.pdf',
      workRequestId: makeId('wr', 2),
      document_type: 'original_scan',
      category: 'Final Deliverables',
      uploader: makeId('u', 4),
      uploadDate: lastWeek,
      description: 'Signed audited financial statements.',
      handover_log: [
        { handed_to: 'Ricardo Reyes', handed_date: lastWeek, method: 'Courier' }
      ],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 4),
      fileName: 'GIS-2024-DavaoAgri.pdf',
      workRequestId: makeId('wr', 2),
      document_type: 'original_scan',
      category: 'Processed Forms',
      uploader: makeId('u', 4),
      uploadDate: lastWeek,
      description: 'GIS 2024 submission copy.',
      handover_log: [
        { handed_to: 'Ricardo Reyes', handed_date: lastWeek, method: 'In-Person' }
      ],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 5),
      fileName: 'BIR-1701-ManilaFresh.pdf',
      workRequestId: makeId('wr', 1),
      document_type: 'generated_copy',
      category: 'Processed Forms',
      uploader: makeId('u', 4),
      uploadDate: lastWeek,
      description: 'Annual ITR filing copy.',
      handover_log: [],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 6),
      fileName: 'Bank-Recon-Feb-2025.pdf',
      workRequestId: makeId('wr', 2),
      document_type: 'generated_copy',
      category: 'Final Deliverables',
      uploader: makeId('u', 4),
      uploadDate: lastWeek,
      description: 'Bank reconciliation for Feb 2025.',
      handover_log: [],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 7),
      fileName: 'BIR-2303-BatangasIndustrial.pdf',
      workRequestId: makeId('wr', 4),
      document_type: 'original_scan',
      category: 'Requirement Docs',
      uploader: makeId('u', 5),
      uploadDate: lastMonth,
      description: 'BIR Form 2303 original scan.',
      handover_log: [
        { handed_to: 'Pedro Garcia', handed_date: lastMonth, method: 'Pickup' }
      ],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 8),
      fileName: 'AFS-2024-BatangasIndustrial.pdf',
      workRequestId: makeId('wr', 4),
      document_type: 'generated_copy',
      category: 'Final Deliverables',
      uploader: makeId('u', 5),
      uploadDate: lastWeek,
      description: 'Audit engagement deliverable copy.',
      handover_log: [],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 9),
      fileName: 'GIS-2024-PampangaRetailers.pdf',
      workRequestId: makeId('wr', 5),
      document_type: 'original_scan',
      category: 'Processed Forms',
      uploader: makeId('u', 5),
      uploadDate: lastMonth,
      description: 'GIS 2024 original scan.',
      handover_log: [
        { handed_to: 'Carlos Mendoza', handed_date: lastMonth, method: 'Courier' }
      ],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 10),
      fileName: 'BIR-2551Q-Q4-2024.pdf',
      workRequestId: makeId('wr', 5),
      document_type: 'generated_copy',
      category: 'Government Receipts',
      uploader: makeId('u', 5),
      uploadDate: lastWeek,
      description: 'Filed 2551Q copy for Q4 2024.',
      handover_log: [],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 11),
      fileName: 'ASM-Minutes-2024-BatangasIndustrial.pdf',
      workRequestId: makeId('wr', 4),
      document_type: 'original_scan',
      category: 'Requirement Docs',
      uploader: makeId('u', 5),
      uploadDate: lastMonth,
      description: 'Minutes of annual stockholders meeting.',
      handover_log: [
        { handed_to: 'Pedro Garcia', handed_date: lastMonth, method: 'In-Person' }
      ],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 12),
      fileName: 'Payroll-Register-Mar-2025.pdf',
      workRequestId: makeId('wr', 6),
      document_type: 'generated_copy',
      category: 'Other',
      uploader: makeId('u', 5),
      uploadDate: lastWeek,
      description: 'Payroll register for March 2025.',
      handover_log: [],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: ''
    },
    {
      id: makeId('doc', 13),
      fileName: 'Apex-Tax-Plan-2025.pdf',
      workRequestId: makeId('wr', 9),
      document_type: 'original_scan',
      category: 'Requirement Docs',
      uploader: makeId('u', 4),
      uploadDate: lastMonth,
      description: 'Archived draft tax planning paper.',
      handover_log: [],
      entity: 'ATA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: '',
      status: 'Archived',
      archived: true
    },
    {
      id: makeId('doc', 14),
      fileName: 'Summit-Trial-Balance.xlsx',
      workRequestId: makeId('wr', 10),
      document_type: 'original_scan',
      category: 'Requirement Docs',
      uploader: makeId('u', 5),
      uploadDate: lastMonth,
      description: 'Archived preliminary trial balance.',
      handover_log: [],
      entity: 'LTA',
      dataUrl: '',
      versions: [],
      comments: [],
      documentLifecycle: 'collected',
      scannedBy: '',
      envelopeId: '',
      storedLocation: '',
      status: 'Archived',
      archived: true
    }
  ],

  retainerTemplates: [
    {
      id: makeId('rt', 1),
      name: 'Monthly Bookkeeping',
      description: 'Standard monthly bookkeeping package including bank reconciliation, expense coding, and financial report generation.',
      entity: 'ATA',
      clientId: makeId('c', 3),
      schedule: 'monthly',
      pfAmount: 15000.00,
      tasks: [
        { id: makeId('rtt', 1), title: 'Reconcile bank statements', predecessors: [] },
        { id: makeId('rtt', 2), title: 'Encode transactions', predecessors: [makeId('rtt', 1)] },
        { id: makeId('rtt', 3), title: 'Generate financial reports', predecessors: [makeId('rtt', 2)] },
        { id: makeId('rtt', 4), title: 'Client review meeting', predecessors: [makeId('rtt', 3)] }
      ],
      createdAt: now
    },
    {
      id: makeId('rt', 2),
      name: 'Quarterly Tax Filing',
      description: 'Quarterly percentage tax and income tax return preparation and electronic filing.',
      entity: 'LTA',
      clientId: makeId('c', 7),
      schedule: 'quarterly',
      pfAmount: 22000.00,
      tasks: [
        { id: makeId('rtt', 5), title: 'Verify gross revenue figures', predecessors: [] },
        { id: makeId('rtt', 6), title: 'Compute percentage tax due', predecessors: [makeId('rtt', 5)] },
        { id: makeId('rtt', 7), title: 'Prepare 2551Q / 1701Q', predecessors: [makeId('rtt', 6)] },
        { id: makeId('rtt', 8), title: 'File via eBIR Forms', predecessors: [makeId('rtt', 7)] }
      ],
      createdAt: now
    }
  ],

  auditLog: [
    {
      id: makeId('al', 1),
      action: 'LOGIN',
      entity: 'ATA',
      userId: makeId('u', 1),
      details: 'Admin logged in from Chrome on Windows',
      timestamp: lastMonth + 'T08:30:00Z'
    },
    {
      id: makeId('al', 2),
      action: 'WORK_REQUEST_CREATED',
      entity: 'ATA',
      userId: makeId('u', 1),
      details: 'Created work request WR-0001: Annual Tax Filing 2025',
      timestamp: lastMonth + 'T09:15:00Z'
    },
    {
      id: makeId('al', 3),
      action: 'TASK_COMPLETED',
      entity: 'ATA',
      userId: makeId('u', 4),
      details: 'Completed task T-0001: Gather source documents for WR-0001',
      timestamp: lastMonth + 'T14:20:00Z'
    },
    {
      id: makeId('al', 4),
      action: 'INVOICE_SENT',
      entity: 'ATA',
      userId: makeId('u', 3),
      details: 'Sent invoice ATA-INV-2025-001 to Manila Fresh Foods Inc.',
      timestamp: lastWeek + 'T10:00:00Z'
    },
    {
      id: makeId('al', 5),
      action: 'DISBURSEMENT_RELEASED',
      entity: 'ATA',
      userId: makeId('u', 3),
      details: 'Released BIR DST payment of P150.00 for client C-0001',
      timestamp: lastWeek + 'T11:30:00Z'
    },
    {
      id: makeId('al', 6),
      action: 'LOGIN',
      entity: 'LTA',
      userId: makeId('u', 2),
      details: 'Manager logged in from Firefox on macOS',
      timestamp: lastWeek + 'T08:45:00Z'
    },
    {
      id: makeId('al', 7),
      action: 'WORK_REQUEST_CREATED',
      entity: 'LTA',
      userId: makeId('u', 2),
      details: 'Created work request WR-0005: Quarterly Tax Filing Q1 2025',
      timestamp: today + 'T09:00:00Z'
    },
    {
      id: makeId('al', 8),
      action: 'DOCUMENT_STORED',
      entity: 'LTA',
      userId: makeId('u', 8),
      details: 'Stored original DOC-0007 for Batangas Industrial Group in Vault A',
      timestamp: lastMonth + 'T16:00:00Z'
    },
    {
      id: makeId('al', 9),
      action: 'DISBURSEMENT_SUBMITTED',
      entity: 'LTA',
      userId: makeId('u', 5),
      details: 'Submitted SEC Filing Fee disbursement of P1,000.00 for client C-0005',
      timestamp: lastWeek + 'T13:15:00Z'
    },
    {
      id: makeId('al', 10),
      action: 'LOGOUT',
      entity: 'ATA',
      userId: makeId('u', 1),
      details: 'Admin logged out',
      timestamp: lastWeek + 'T17:00:00Z'
    }
  ],

  pendingChanges: [],
  transmittals: [],
  billingTemplates: [],
  disbursementTemplates: []
};

// ============================================================
// LOCALSTORAGE DB API
// ============================================================

const DB = {
  SCHEMA_VERSION: 7,

  init() {
    const stored = localStorage.getItem('erp_schema_version');
    if (!stored || parseInt(stored, 10) !== this.SCHEMA_VERSION) {
      const oldVersion = stored ? parseInt(stored, 10) : 0;
      if (oldVersion === 2) {
        this.migrateV2ToV3();
      } else {
        this.resetToSeed();
      }
    }
  },

  migrateV2ToV3() {
    // Migrate users: remove department
    const users = this.getAll('users');
    users.forEach(u => { delete u.department; });
    this.save('users', users);

    // Migrate clients: add new fields
    const clients = this.getAll('clients');
    clients.forEach(c => {
      c.tradeName = c.tradeName || '';
      c.contactUserId = c.contactUserId || '';
      c.relatedCompanies = c.relatedCompanies || [];
      c.contactDetails = c.contactDetails || [];
    });
    this.save('clients', clients);

    // Migrate workRequests: add linkage fields
    const workRequests = this.getAll('workRequests');
    workRequests.forEach(wr => {
      wr.linkedInvoiceId = wr.linkedInvoiceId || null;
      wr.linkedDisbursementIds = wr.linkedDisbursementIds || [];
      wr.linkedTransmittalIds = wr.linkedTransmittalIds || [];
    });
    this.save('workRequests', workRequests);

    // Migrate tasks: add taskDocuments, transform timeLogs
    const tasks = this.getAll('tasks');
    tasks.forEach(t => {
      t.taskDocuments = t.taskDocuments || [];
      if (Array.isArray(t.timeLogs)) {
        t.timeLogs = t.timeLogs.map(log => {
          if (log.startTime !== undefined) return log;
          const startTime = '09:00';
          const hours = parseFloat(log.hours) || 0;
          const endH = Math.floor(9 + hours);
          const endM = Math.round((9 + hours - endH) * 60);
          const endTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
          return { startTime, endTime, date: log.date || today, note: log.note || '', hours: log.hours };
        });
      } else {
        t.timeLogs = [];
      }
    });
    this.save('tasks', tasks);

    // Migrate invoices: remove VAT, recalculate totals, add payments/createdBy
    const invoices = this.getAll('invoices');
    invoices.forEach(inv => {
      inv.vat = 0;
      inv.total = inv.subtotal || 0;
      if (inv.lineItems) {
        inv.lineItems.forEach(li => { delete li.vatTreatment; });
      }
      inv.payments = inv.payments || [];
      if ((inv.paidAmount || 0) > 0 && inv.payments.length === 0) {
        inv.payments.push({
          amount: inv.paidAmount,
          method: 'Cash',
          reference: 'Migrated',
          date: inv.updatedAt || inv.issueDate || today,
          recordedBy: ''
        });
      }
      inv.createdBy = inv.createdBy || '';
      inv.paymentCollectedBy = inv.paymentCollectedBy || '';
    });
    this.save('invoices', invoices);

    // Migrate disbursements: add requestedBy, paymentHandledBy, paymentDetails
    const disbursements = this.getAll('disbursements');
    disbursements.forEach(d => {
      d.requestedBy = d.requestedBy || d.employeeId || '';
      d.paymentHandledBy = d.paymentHandledBy || '';
      d.paymentDetails = d.paymentDetails || { method: '', reference: '', bank: '', date: '', processedBy: '' };
    });
    this.save('disbursements', disbursements);

    // Migrate documents: add lifecycle fields
    const documents = this.getAll('documents');
    documents.forEach(doc => {
      doc.comments = doc.comments || [];
      doc.documentLifecycle = doc.documentLifecycle || 'collected';
      doc.scannedBy = doc.scannedBy || '';
      doc.envelopeId = doc.envelopeId || '';
      doc.storedLocation = doc.storedLocation || '';
    });
    this.save('documents', documents);

    // Initialize new tables
    if (!localStorage.getItem('erp_pendingChanges')) this.save('pendingChanges', []);
    if (!localStorage.getItem('erp_transmittals')) this.save('transmittals', []);
    if (!localStorage.getItem('erp_billingTemplates')) this.save('billingTemplates', []);
    if (!localStorage.getItem('erp_disbursementTemplates')) this.save('disbursementTemplates', []);

    localStorage.setItem('erp_schema_version', String(this.SCHEMA_VERSION));
  },

  getAll(table) {
    return JSON.parse(localStorage.getItem('erp_' + table) || '[]');
  },

  getById(table, id) {
    return this.getAll(table).find(r => r.id === id);
  },

  getWhere(table, filterFn) {
    return this.getAll(table).filter(filterFn);
  },

  save(table, records) {
    localStorage.setItem('erp_' + table, JSON.stringify(records));
  },

  insert(table, record) {
    const all = this.getAll(table);
    all.push(record);
    this.save(table, all);
  },

  update(table, id, changes) {
    const all = this.getAll(table);
    const idx = all.findIndex(r => r.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...changes };
      this.save(table, all);
    }
  },

  delete(table, id) {
    const all = this.getAll(table).filter(r => r.id !== id);
    this.save(table, all);
  },

  resetToSeed() {
    for (const [key, value] of Object.entries(seedData)) {
      localStorage.setItem('erp_' + key, JSON.stringify(value));
    }
    localStorage.setItem('erp_schema_version', String(this.SCHEMA_VERSION));
  }
};

DB.init();
