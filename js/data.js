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

function makeId(prefix, num) {
  return prefix + '-' + String(num).padStart(4, '0');
}

const seedData = {
  schemaVersion: 1,

  users: [
    {
      id: makeId('u', 1),
      name: 'Administrator',
      email: 'admin@ata-lta.ph',
      password: 'password123',
      role: 'Admin',
      department: 'Managerial',
      entities: ['ata', 'lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 2),
      name: 'Manager',
      email: 'manager@ata-lta.ph',
      password: 'password123',
      role: 'Manager',
      department: 'Managerial',
      entities: ['ata', 'lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 3),
      name: 'Manager ATA',
      email: 'manager-ata@ata-lta.ph',
      password: 'password123',
      role: 'Manager',
      department: 'Accounting',
      entities: ['ata'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 4),
      name: 'Accounting Staff ATA',
      email: 'accounting-ata@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Accounting',
      entities: ['ata'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 5),
      name: 'Accounting Staff LTA',
      email: 'accounting-lta@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Accounting',
      entities: ['lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 6),
      name: 'Operations Staff ATA',
      email: 'ops-ata@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Operations',
      entities: ['ata'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 7),
      name: 'Operations Staff LTA',
      email: 'ops-lta@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Operations',
      entities: ['lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 8),
      name: 'Documentation Staff',
      email: 'docs@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Documentations',
      entities: ['ata', 'lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 9),
      name: 'HR Staff',
      email: 'hr@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'HR',
      entities: ['ata', 'lta'],
      isActive: true,
      createdAt: now
    },
    {
      id: makeId('u', 10),
      name: 'Admin Staff',
      email: 'admin-staff@ata-lta.ph',
      password: 'password123',
      role: 'Staff',
      department: 'Admin',
      entities: ['ata', 'lta'],
      isActive: true,
      createdAt: now
    }
  ],

  clients: [
    {
      id: makeId('c', 1),
      name: 'Manila Fresh Foods Inc.',
      tin: '123-456-789-0001',
      contact: 'Juan dela Cruz',
      phone: '0917-123-4567',
      email: 'juan.dcruz@manilafresh.ph',
      address: '123 Mabini St, Ermita, Manila, Metro Manila',
      entity: 'ata',
      isRetainer: true,
      createdAt: now
    },
    {
      id: makeId('c', 2),
      name: 'Cebu Trading Co.',
      tin: '234-567-890-0002',
      contact: 'Maria Santos',
      phone: '0918-234-5678',
      email: 'maria.santos@cebutrade.ph',
      address: '456 Osmena Blvd, Cebu City, Cebu',
      entity: 'ata',
      isRetainer: false,
      createdAt: now
    },
    {
      id: makeId('c', 3),
      name: 'Davao Agri Ventures',
      tin: '345-678-901-0003',
      contact: 'Ricardo Reyes',
      phone: '0919-345-6789',
      email: 'ricardo.reyes@davaoagri.ph',
      address: '789 Roxas Ave, Davao City, Davao del Sur',
      entity: 'ata',
      isRetainer: true,
      createdAt: now
    },
    {
      id: makeId('c', 4),
      name: 'Iloilo Manufacturing Corp.',
      tin: '456-789-012-0004',
      contact: 'Ana Lim',
      phone: '0920-456-7890',
      email: 'ana.lim@iloilomfg.ph',
      address: '321 Magsaysay St, Iloilo City, Iloilo',
      entity: 'ata',
      isRetainer: false,
      createdAt: now
    },
    {
      id: makeId('c', 5),
      name: 'Batangas Industrial Group',
      tin: '567-890-123-0005',
      contact: 'Pedro Garcia',
      phone: '0921-567-8901',
      email: 'pedro.garcia@batindustrial.ph',
      address: '654 JP Laurel Hwy, Tanauan, Batangas',
      entity: 'lta',
      isRetainer: true,
      createdAt: now
    },
    {
      id: makeId('c', 6),
      name: 'Laguna Logistics Ltd.',
      tin: '678-901-234-0006',
      contact: 'Elena Torres',
      phone: '0922-678-9012',
      email: 'elena.torres@lagunalogistics.ph',
      address: '987 National Hwy, Calamba, Laguna',
      entity: 'lta',
      isRetainer: false,
      createdAt: now
    },
    {
      id: makeId('c', 7),
      name: 'Pampanga Retailers Inc.',
      tin: '789-012-345-0007',
      contact: 'Carlos Mendoza',
      phone: '0923-789-0123',
      email: 'carlos.mendoza@pampangaretail.ph',
      address: '147 McArthur Hwy, Angeles, Pampanga',
      entity: 'lta',
      isRetainer: true,
      createdAt: now
    },
    {
      id: makeId('c', 8),
      name: 'Tagaytay Hospitality Group',
      tin: '890-123-456-0008',
      contact: 'Sofia Ramos',
      phone: '0924-890-1234',
      email: 'sofia.ramos@tagaytayhospitality.ph',
      address: '258 Aguinaldo Hwy, Tagaytay, Cavite',
      entity: 'lta',
      isRetainer: false,
      createdAt: now
    }
  ],

  workRequests: [
    {
      id: makeId('wr', 1),
      title: 'Annual Tax Filing 2025',
      description: 'Comprehensive annual income tax return preparation and filing for CY 2024.',
      clientId: makeId('c', 1),
      entity: 'ata',
      status: 'Processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 4),
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 2),
      title: 'Monthly Bookkeeping',
      description: 'Recurring monthly bookkeeping service for retainer client.',
      clientId: makeId('c', 3),
      entity: 'ata',
      status: 'Completed',
      requestedBy: makeId('u', 3),
      assignedTo: makeId('u', 4),
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('wr', 3),
      title: 'VAT Compliance Review',
      description: 'Quarterly VAT reconciliation and BIR compliance review.',
      clientId: makeId('c', 2),
      entity: 'ata',
      status: 'Billing',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 4),
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('wr', 4),
      title: 'Audited Financial Statements',
      description: 'Preparation of audited financial statements for SEC filing.',
      clientId: makeId('c', 5),
      entity: 'lta',
      status: 'Pre-processing',
      requestedBy: makeId('u', 1),
      assignedTo: makeId('u', 5),
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('wr', 5),
      title: 'Quarterly Tax Filing Q1 2025',
      description: 'Quarterly percentage tax and income tax filing for Q1.',
      clientId: makeId('c', 7),
      entity: 'lta',
      status: 'Draft',
      requestedBy: makeId('u', 2),
      assignedTo: null,
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('wr', 6),
      title: 'Payroll Tax Compliance',
      description: 'Annualized withholding tax on compensation review and correction.',
      clientId: makeId('c', 6),
      entity: 'lta',
      status: 'Cancelled',
      requestedBy: makeId('u', 2),
      assignedTo: makeId('u', 5),
      createdAt: lastMonth,
      updatedAt: now
    }
  ],

  tasks: [
    // Work Request 1 - Annual Tax Filing 2025 (ATA)
    {
      id: makeId('t', 1),
      workRequestId: makeId('wr', 1),
      title: 'Gather source documents',
      description: 'Collect all receipts, invoices, and financial records from client.',
      status: 'Completed',
      assignedTo: makeId('u', 4),
      dependencies: [],
      dueDate: lastMonth,
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 2),
      workRequestId: makeId('wr', 1),
      title: 'Encode trial balance',
      description: 'Input client trial balance into accounting software.',
      status: 'Completed',
      assignedTo: makeId('u', 4),
      dependencies: [makeId('t', 1)],
      dueDate: lastWeek,
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 3),
      workRequestId: makeId('wr', 1),
      title: 'Prepare tax schedules',
      description: 'Build detailed tax computation schedules and supporting docs.',
      status: 'In Progress',
      assignedTo: makeId('u', 4),
      dependencies: [makeId('t', 2)],
      dueDate: today,
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
      assignedTo: makeId('u', 4),
      dependencies: [],
      dueDate: lastMonth,
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 5),
      workRequestId: makeId('wr', 2),
      title: 'Generate financial reports',
      description: 'Produce income statement and balance sheet for review.',
      status: 'Completed',
      assignedTo: makeId('u', 4),
      dependencies: [makeId('t', 4)],
      dueDate: lastWeek,
      createdAt: lastMonth,
      updatedAt: now
    },
    {
      id: makeId('t', 6),
      workRequestId: makeId('wr', 2),
      title: 'Client review meeting',
      description: 'Present reports to client and obtain sign-off.',
      status: 'Completed',
      assignedTo: makeId('u', 3),
      dependencies: [makeId('t', 5)],
      dueDate: lastWeek,
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
      assignedTo: makeId('u', 4),
      dependencies: [],
      dueDate: lastWeek,
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 8),
      workRequestId: makeId('wr', 3),
      title: 'Cross-check with 2550Q returns',
      description: 'Validate quarterly VAT return figures against ledgers.',
      status: 'For Review',
      assignedTo: makeId('u', 4),
      dependencies: [makeId('t', 7)],
      dueDate: today,
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 9),
      workRequestId: makeId('wr', 3),
      title: 'Prepare compliance memo',
      description: 'Draft findings memo with recommendations for client.',
      status: 'Draft',
      assignedTo: makeId('u', 3),
      dependencies: [makeId('t', 8)],
      dueDate: today,
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
      assignedTo: makeId('u', 5),
      dependencies: [],
      dueDate: lastWeek,
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 11),
      workRequestId: makeId('wr', 4),
      title: 'Perform analytical review',
      description: 'Compare current year ratios and balances against prior year.',
      status: 'In Progress',
      assignedTo: makeId('u', 5),
      dependencies: [makeId('t', 10)],
      dueDate: today,
      createdAt: lastWeek,
      updatedAt: now
    },
    {
      id: makeId('t', 12),
      workRequestId: makeId('wr', 4),
      title: 'Draft audit report',
      description: 'Prepare independent auditor\'s report for partner review.',
      status: 'Assigned',
      assignedTo: makeId('u', 5),
      dependencies: [makeId('t', 11)],
      dueDate: today,
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
      assignedTo: null,
      dependencies: [],
      dueDate: today,
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 14),
      workRequestId: makeId('wr', 5),
      title: 'Compute percentage tax due',
      description: 'Calculate 3% percentage tax on gross sales/receipts.',
      status: 'Draft',
      assignedTo: null,
      dependencies: [makeId('t', 13)],
      dueDate: today,
      createdAt: today,
      updatedAt: today
    },
    {
      id: makeId('t', 15),
      workRequestId: makeId('wr', 5),
      title: 'File 2551Q via eBIR',
      description: 'Submit quarterly percentage tax return electronically.',
      status: 'Draft',
      assignedTo: null,
      dependencies: [makeId('t', 14)],
      dueDate: today,
      createdAt: today,
      updatedAt: today
    }
  ],

  invoices: [
    {
      id: makeId('inv', 1),
      clientId: makeId('c', 1),
      entity: 'ata',
      invoiceNumber: 'ATA-INV-2025-001',
      issueDate: lastWeek,
      dueDate: today,
      status: 'Sent',
      lineItems: [
        { description: 'Professional Fee - Annual Tax Filing', amount: 45000.00, type: 'PF' },
        { description: 'BIR DST', amount: 150.00, type: 'GovtFee' },
        { description: 'SEC Filing Fee', amount: 500.00, type: 'GovtFee' }
      ],
      subtotal: 45650.00,
      vatRate: 0.12,
      vatAmount: 5478.00,
      total: 51128.00,
      amountPaid: 0.00,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 2),
      clientId: makeId('c', 3),
      entity: 'ata',
      invoiceNumber: 'ATA-INV-2025-002',
      issueDate: lastMonth,
      dueDate: lastWeek,
      status: 'Paid',
      lineItems: [
        { description: 'Professional Fee - Monthly Bookkeeping (Retainer)', amount: 15000.00, type: 'PF' }
      ],
      subtotal: 15000.00,
      vatRate: 0.12,
      vatAmount: 1800.00,
      total: 16800.00,
      amountPaid: 16800.00,
      createdAt: lastMonth,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 3),
      clientId: makeId('c', 5),
      entity: 'lta',
      invoiceNumber: 'LTA-INV-2025-001',
      issueDate: lastWeek,
      dueDate: today,
      status: 'Partially Paid',
      lineItems: [
        { description: 'Professional Fee - Audit Engagement', amount: 85000.00, type: 'PF' },
        { description: 'SEC Filing Fee', amount: 1000.00, type: 'GovtFee' },
        { description: 'PCC Fee', amount: 800.00, type: 'GovtFee' }
      ],
      subtotal: 86800.00,
      vatRate: 0.12,
      vatAmount: 10416.00,
      total: 97216.00,
      amountPaid: 48608.00,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('inv', 4),
      clientId: makeId('c', 7),
      entity: 'lta',
      invoiceNumber: 'LTA-INV-2025-002',
      issueDate: today,
      dueDate: today,
      status: 'Draft',
      lineItems: [
        { description: 'Professional Fee - Quarterly Tax Filing Q1', amount: 22000.00, type: 'PF' },
        { description: 'BIR eFiling Fee', amount: 100.00, type: 'GovtFee' }
      ],
      subtotal: 22100.00,
      vatRate: 0.12,
      vatAmount: 2652.00,
      total: 24752.00,
      amountPaid: 0.00,
      createdAt: today,
      updatedAt: today
    }
  ],

  disbursements: [
    {
      id: makeId('d', 1),
      invoiceId: makeId('inv', 1),
      clientId: makeId('c', 1),
      entity: 'ata',
      description: 'BIR Documentary Stamp Tax payment',
      amount: 150.00,
      type: 'ClientFunded',
      status: 'Released',
      requestedBy: makeId('u', 4),
      approvedBy: makeId('u', 3),
      releasedAt: lastWeek,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('d', 2),
      invoiceId: makeId('inv', 1),
      clientId: makeId('c', 1),
      entity: 'ata',
      description: 'SEC Filing Fee payment',
      amount: 500.00,
      type: 'ClientFunded',
      status: 'Released',
      requestedBy: makeId('u', 4),
      approvedBy: makeId('u', 3),
      releasedAt: lastWeek,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('d', 3),
      invoiceId: null,
      clientId: null,
      entity: 'ata',
      description: 'Office supplies procurement',
      amount: 3250.00,
      type: 'FirmFund',
      status: 'Approved',
      requestedBy: makeId('u', 6),
      approvedBy: makeId('u', 2),
      releasedAt: null,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('d', 4),
      invoiceId: makeId('inv', 3),
      clientId: makeId('c', 5),
      entity: 'lta',
      description: 'SEC Filing Fee for audited FS',
      amount: 1000.00,
      type: 'ClientFunded',
      status: 'Submitted',
      requestedBy: makeId('u', 5),
      approvedBy: null,
      releasedAt: null,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('d', 5),
      invoiceId: null,
      clientId: null,
      entity: 'lta',
      description: 'Transportation allowance - field audit',
      amount: 1800.00,
      type: 'FirmFund',
      status: 'Released',
      requestedBy: makeId('u', 5),
      approvedBy: makeId('u', 2),
      releasedAt: lastWeek,
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('d', 6),
      invoiceId: null,
      clientId: null,
      entity: 'lta',
      description: 'Employee training seminar fee',
      amount: 12500.00,
      type: 'FirmFund',
      status: 'Under Review',
      requestedBy: makeId('u', 9),
      approvedBy: null,
      releasedAt: null,
      createdAt: lastWeek,
      updatedAt: lastWeek
    }
  ],

  documents: [
    {
      id: makeId('doc', 1),
      title: 'Certificate of Registration (BIR Form 2303)',
      clientId: makeId('c', 1),
      entity: 'ata',
      category: 'Tax',
      isOriginal: true,
      location: 'Vault A, Shelf 3',
      handoverLog: [
        { action: 'Received', by: makeId('u', 4), date: lastMonth },
        { action: 'Stored', by: makeId('u', 8), date: lastMonth }
      ],
      createdAt: lastMonth,
      updatedAt: lastMonth
    },
    {
      id: makeId('doc', 2),
      title: 'Articles of Incorporation - Certified Copy',
      clientId: makeId('c', 1),
      entity: 'ata',
      category: 'Corporate',
      isOriginal: false,
      location: 'Vault A, Shelf 3',
      handoverLog: [
        { action: 'Received', by: makeId('u', 4), date: lastMonth },
        { action: 'Stored', by: makeId('u', 8), date: lastMonth }
      ],
      createdAt: lastMonth,
      updatedAt: lastMonth
    },
    {
      id: makeId('doc', 3),
      title: 'Audited Financial Statements 2024',
      clientId: makeId('c', 3),
      entity: 'ata',
      category: 'Audit',
      isOriginal: true,
      location: 'Vault B, Shelf 1',
      handoverLog: [
        { action: 'Received', by: makeId('u', 4), date: lastWeek },
        { action: 'Stored', by: makeId('u', 8), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 4),
      title: 'General Information Sheet (GIS) 2024',
      clientId: makeId('c', 3),
      entity: 'ata',
      category: 'Corporate',
      isOriginal: true,
      location: 'Vault B, Shelf 1',
      handoverLog: [
        { action: 'Received', by: makeId('u', 4), date: lastWeek },
        { action: 'Stored', by: makeId('u', 8), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 5),
      title: 'BIR Form 1701 - Annual ITR 2024',
      clientId: makeId('c', 1),
      entity: 'ata',
      category: 'Tax',
      isOriginal: false,
      location: 'Digital / Filed electronically',
      handoverLog: [
        { action: 'Generated', by: makeId('u', 4), date: lastWeek },
        { action: 'Filed', by: makeId('u', 4), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 6),
      title: 'Bank Reconciliation Statement - Feb 2025',
      clientId: makeId('c', 3),
      entity: 'ata',
      category: 'Accounting',
      isOriginal: false,
      location: 'Digital / Shared Drive',
      handoverLog: [
        { action: 'Generated', by: makeId('u', 4), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 7),
      title: 'Certificate of Registration (BIR Form 2303)',
      clientId: makeId('c', 5),
      entity: 'lta',
      category: 'Tax',
      isOriginal: true,
      location: 'Vault A, Shelf 5',
      handoverLog: [
        { action: 'Received', by: makeId('u', 5), date: lastMonth },
        { action: 'Stored', by: makeId('u', 8), date: lastMonth }
      ],
      createdAt: lastMonth,
      updatedAt: lastMonth
    },
    {
      id: makeId('doc', 8),
      title: 'Audited Financial Statements 2024',
      clientId: makeId('c', 5),
      entity: 'lta',
      category: 'Audit',
      isOriginal: true,
      location: 'Vault B, Shelf 2',
      handoverLog: [
        { action: 'Received', by: makeId('u', 5), date: lastWeek },
        { action: 'Stored', by: makeId('u', 8), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 9),
      title: 'General Information Sheet (GIS) 2024',
      clientId: makeId('c', 7),
      entity: 'lta',
      category: 'Corporate',
      isOriginal: true,
      location: 'Vault A, Shelf 6',
      handoverLog: [
        { action: 'Received', by: makeId('u', 5), date: lastMonth },
        { action: 'Stored', by: makeId('u', 8), date: lastMonth }
      ],
      createdAt: lastMonth,
      updatedAt: lastMonth
    },
    {
      id: makeId('doc', 10),
      title: 'BIR Form 2551Q - Q4 2024',
      clientId: makeId('c', 7),
      entity: 'lta',
      category: 'Tax',
      isOriginal: false,
      location: 'Digital / Filed electronically',
      handoverLog: [
        { action: 'Generated', by: makeId('u', 5), date: lastWeek },
        { action: 'Filed', by: makeId('u', 5), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    },
    {
      id: makeId('doc', 11),
      title: 'Minutes of Annual Stockholders Meeting 2024',
      clientId: makeId('c', 5),
      entity: 'lta',
      category: 'Corporate',
      isOriginal: true,
      location: 'Vault A, Shelf 5',
      handoverLog: [
        { action: 'Received', by: makeId('u', 5), date: lastMonth },
        { action: 'Stored', by: makeId('u', 8), date: lastMonth }
      ],
      createdAt: lastMonth,
      updatedAt: lastMonth
    },
    {
      id: makeId('doc', 12),
      title: 'Payroll Register - March 2025',
      clientId: makeId('c', 6),
      entity: 'lta',
      category: 'HR',
      isOriginal: false,
      location: 'Digital / Shared Drive',
      handoverLog: [
        { action: 'Generated', by: makeId('u', 5), date: lastWeek }
      ],
      createdAt: lastWeek,
      updatedAt: lastWeek
    }
  ],

  retainerTemplates: [
    {
      id: makeId('rt', 1),
      name: 'Monthly Bookkeeping',
      description: 'Standard monthly bookkeeping package including bank reconciliation, expense coding, and financial report generation.',
      entity: 'ata',
      defaultAmount: 15000.00,
      billingCycle: 'Monthly',
      tasks: [
        'Reconcile bank statements',
        'Encode transactions',
        'Generate financial reports',
        'Client review meeting'
      ],
      createdAt: now
    },
    {
      id: makeId('rt', 2),
      name: 'Quarterly Tax Filing',
      description: 'Quarterly percentage tax and income tax return preparation and electronic filing.',
      entity: 'lta',
      defaultAmount: 22000.00,
      billingCycle: 'Quarterly',
      tasks: [
        'Verify gross revenue figures',
        'Compute percentage tax due',
        'Prepare 2551Q / 1701Q',
        'File via eBIR Forms'
      ],
      createdAt: now
    }
  ],

  auditLog: [
    {
      id: makeId('al', 1),
      action: 'LOGIN',
      entity: 'ata',
      userId: makeId('u', 1),
      details: 'Admin logged in from Chrome on Windows',
      timestamp: lastMonth + 'T08:30:00Z'
    },
    {
      id: makeId('al', 2),
      action: 'WORK_REQUEST_CREATED',
      entity: 'ata',
      userId: makeId('u', 1),
      details: 'Created work request WR-0001: Annual Tax Filing 2025',
      timestamp: lastMonth + 'T09:15:00Z'
    },
    {
      id: makeId('al', 3),
      action: 'TASK_COMPLETED',
      entity: 'ata',
      userId: makeId('u', 4),
      details: 'Completed task T-0001: Gather source documents for WR-0001',
      timestamp: lastMonth + 'T14:20:00Z'
    },
    {
      id: makeId('al', 4),
      action: 'INVOICE_SENT',
      entity: 'ata',
      userId: makeId('u', 3),
      details: 'Sent invoice ATA-INV-2025-001 to Manila Fresh Foods Inc.',
      timestamp: lastWeek + 'T10:00:00Z'
    },
    {
      id: makeId('al', 5),
      action: 'DISBURSEMENT_RELEASED',
      entity: 'ata',
      userId: makeId('u', 3),
      details: 'Released BIR DST payment of P150.00 for client C-0001',
      timestamp: lastWeek + 'T11:30:00Z'
    },
    {
      id: makeId('al', 6),
      action: 'LOGIN',
      entity: 'lta',
      userId: makeId('u', 2),
      details: 'Manager logged in from Firefox on macOS',
      timestamp: lastWeek + 'T08:45:00Z'
    },
    {
      id: makeId('al', 7),
      action: 'WORK_REQUEST_CREATED',
      entity: 'lta',
      userId: makeId('u', 2),
      details: 'Created work request WR-0005: Quarterly Tax Filing Q1 2025',
      timestamp: today + 'T09:00:00Z'
    },
    {
      id: makeId('al', 8),
      action: 'DOCUMENT_STORED',
      entity: 'lta',
      userId: makeId('u', 8),
      details: 'Stored original DOC-0007 for Batangas Industrial Group in Vault A',
      timestamp: lastMonth + 'T16:00:00Z'
    },
    {
      id: makeId('al', 9),
      action: 'DISBURSEMENT_SUBMITTED',
      entity: 'lta',
      userId: makeId('u', 5),
      details: 'Submitted SEC Filing Fee disbursement of P1,000.00 for client C-0005',
      timestamp: lastWeek + 'T13:15:00Z'
    },
    {
      id: makeId('al', 10),
      action: 'LOGOUT',
      entity: 'ata',
      userId: makeId('u', 1),
      details: 'Admin logged out',
      timestamp: lastWeek + 'T17:00:00Z'
    }
  ]
};

// ============================================================
// LOCALSTORAGE DB API
// ============================================================

const DB = {
  SCHEMA_VERSION: 1,

  init() {
    const stored = localStorage.getItem('erp_schema_version');
    if (!stored || parseInt(stored, 10) !== this.SCHEMA_VERSION) {
      this.resetToSeed();
    }
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
