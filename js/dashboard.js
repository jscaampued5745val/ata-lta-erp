/**
 * Dashboard Module — Firm Overview
 * Consolidated KPIs for managerial users; entity-scoped for staff.
 */

const Dashboard = {
  render() {
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    if (isManagerial && Auth.user.entities.length > 1) {
      return this.renderConsolidated();
    }
    return this.renderEntityScoped();
  },

  renderConsolidated() {
    const ata = this.getEntityMetrics('ATA');
    const lta = this.getEntityMetrics('LTA');
    
    const container = el('div', { class: 'page' });
    const h1 = el('h1', {}, ['Firm Overview']);
    container.appendChild(h1);
    
    const bento = el('div', { class: 'bento-grid' });
    
    // KPI Cards
    bento.appendChild(this.kpiCard('ATA Revenue', ata.revenue, 'ata', '+15%'));
    bento.appendChild(this.kpiCard('LTA Revenue', lta.revenue, 'lta', '+8%'));
    bento.appendChild(this.kpiCard('Total Outstanding', ata.outstanding + lta.outstanding, null, '-5%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', ata.overdue + lta.overdue, null, '+2%'));

    // Calendar Card (Two Thirds)
    const calendarCard = this.renderCalendarCard();
    this.calendarCardRef = calendarCard;
    bento.appendChild(calendarCard);

    // Activity Breakdown (Third)
    const deviceCard = el('div', { class: 'bento-item bento-third' });
    deviceCard.appendChild(el('h2', { class: 'card-title', text: 'Activity Breakdown' }));
    deviceCard.appendChild(this.renderDonutChart(ata.revenue, lta.revenue, ata.outstanding + lta.outstanding));
    bento.appendChild(deviceCard);
    
    container.appendChild(bento);

    const tableSection = el('div', { class: 'bento-item bento-full', style: 'padding: 0; background: transparent; box-shadow: none;' });
    tableSection.appendChild(this.renderComparisonTable(ata, lta));
    container.appendChild(tableSection);
    
    return container;
  },

  renderEntityScoped() {
    const metrics = this.getEntityMetrics(Auth.activeEntity);
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', {}, [Auth.activeEntity + ' Dashboard']));
    
    const bento = el('div', { class: 'bento-grid' });
    
    bento.appendChild(this.kpiCard('Active Work Requests', metrics.activeWR, Auth.activeEntity.toLowerCase(), '+3%'));
    bento.appendChild(this.kpiCard('Revenue (Paid)', metrics.revenue, Auth.activeEntity.toLowerCase(), '+11%'));
    bento.appendChild(this.kpiCard('Outstanding', metrics.outstanding, null, '-2%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', metrics.overdue, null, '+1%'));

    // Calendar Card (Full Width for Scoped)
    const calendarCard = this.renderCalendarCard();
    calendarCard.className = 'bento-item bento-full dashboard-calendar-card';
    this.calendarCardRef = calendarCard;
    bento.appendChild(calendarCard);

    container.appendChild(bento);
    return container;
  },

  getEntityMetrics(entity) {
    const wrs = DB.getWhere('workRequests', r => r.entity === entity);
    const invs = DB.getWhere('invoices', r => r.entity === entity);
    const tasks = DB.getWhere('tasks', r => {
      const wr = DB.getById('workRequests', r.workRequestId);
      return wr && wr.entity === entity;
    });
    return {
      activeWR: wrs.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length,
      revenue: invs
        .filter(r => r.status === 'Paid' || r.status === 'Partially Paid')
        .reduce((sum, r) => {
          const paid = r.paidAmount ?? r.amountPaid ?? r.total ?? 0;
          return sum + paid;
        }, 0),
      outstanding: invs
        .filter(r => r.status === 'Sent' || r.status === 'Partially Paid' || r.status === 'Overdue')
        .reduce((sum, r) => {
          const paid = r.paidAmount ?? r.amountPaid ?? 0;
          return sum + (r.total - paid);
        }, 0),
      overdue: tasks.filter(r => r.status !== 'Completed' && r.status !== 'Cancelled' && new Date(r.dueDate) < new Date()).length
    };
  },

  kpiCard(label, value, entity, trend) {
    const card = el('div', { class: 'bento-item bento-quarter kpi-card' + (entity ? ' ' + entity : '') });
    
    const icon = el('div', { class: 'kpi-icon' + (entity === 'lta' ? ' lta-icon' : '') }, [
      entity === 'ata' ? 'A' : entity === 'lta' ? 'L' : '∑'
    ]);
    
    const lbl = el('div', { class: 'kpi-label' }, [label]);
    const val = el('div', { class: 'kpi-value' }, [typeof value === 'number' && value > 100 ? formatPHP(value) : String(value)]);
    
    card.appendChild(icon);
    card.appendChild(lbl);
    card.appendChild(val);
    
    if (trend) {
      const isPos = trend.startsWith('+');
      const trendEl = el('div', { class: 'kpi-trend ' + (isPos ? 'positive' : 'negative') }, [trend]);
      card.appendChild(trendEl);
    }
    
    return card;
  },
  
  renderDonutChart(v1, v2, v3) {
    const total = v1 + v2 + v3 || 1;
    const p1 = Math.round((v1 / total) * 100) || 45;
    const p2 = Math.round((v2 / total) * 100) || 35;
    const p3 = Math.round((v3 / total) * 100) || 20;
    
    const c = 251.3;
    const o1 = (p1 / 100) * c;
    const o2 = (p2 / 100) * c;
    const o3 = (p3 / 100) * c;
    
    const container = el('div', { class: 'chart-container', style: 'flex-direction: column; justify-content: space-between;' });
    
    container.innerHTML = `
      <svg class="donut-chart" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-bg)" stroke-width="16" />
        <circle cx="50" cy="50" r="40" class="donut-segment donut-primary" 
          stroke-dasharray="${o1} ${c - o1}" stroke-dashoffset="0" />
        <circle cx="50" cy="50" r="40" class="donut-segment donut-secondary" 
          stroke-dasharray="${o2} ${c - o2}" stroke-dashoffset="-${o1 + 2}" />
        <circle cx="50" cy="50" r="40" class="donut-segment donut-tertiary" 
          stroke-dasharray="${o3} ${c - o3}" stroke-dashoffset="-${o1 + o2 + 4}" />
      </svg>
      <div class="donut-legend">
        <div class="legend-item">
          <div class="legend-label"><span class="legend-dot" style="background: var(--color-primary)"></span> ATA Revenue</div>
          <div class="legend-value">${p1}%</div>
        </div>
        <div class="legend-item">
          <div class="legend-label"><span class="legend-dot" style="background: #22c55e"></span> LTA Revenue</div>
          <div class="legend-value">${p2}%</div>
        </div>
        <div class="legend-item">
          <div class="legend-label"><span class="legend-dot" style="background: var(--color-lta)"></span> Outstanding</div>
          <div class="legend-value">${p3}%</div>
        </div>
      </div>
    `;
    return container;
  },

  renderComparisonTable(ata, lta) {
    const section = el('div', { class: 'entity-comparison card', style: 'margin-bottom: 0;' });
    const h2 = el('h2', { class: 'card-title' }, ['Entity Comparison']);
    section.appendChild(h2);
    const table = el('table', { class: 'data-table' });

    const thead = el('thead');
    const headerRow = el('tr');
    headerRow.appendChild(el('th', {}, ['Metric']));
    headerRow.appendChild(el('th', {}, ['ATA']));
    headerRow.appendChild(el('th', {}, ['LTA']));
    headerRow.appendChild(el('th', {}, ['Total']));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    const rows = [
      { label: 'Active Work Requests', ata: ata.activeWR, lta: lta.activeWR, isCurrency: false },
      { label: 'Revenue (Paid)', ata: ata.revenue, lta: lta.revenue, isCurrency: true },
      { label: 'Outstanding', ata: ata.outstanding, lta: lta.outstanding, isCurrency: true },
      { label: 'Overdue Tasks', ata: ata.overdue, lta: lta.overdue, isCurrency: false }
    ];
    rows.forEach(row => {
      const tr = el('tr');
      tr.appendChild(el('td', {}, [row.label]));
      tr.appendChild(el('td', {}, [row.isCurrency ? formatPHP(row.ata) : String(row.ata)]));
      tr.appendChild(el('td', {}, [row.isCurrency ? formatPHP(row.lta) : String(row.lta)]));
      tr.appendChild(el('td', {}, [row.isCurrency ? formatPHP(row.ata + row.lta) : String(row.ata + row.lta)]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  },

  init() {
    this.selectedDay = null;
    this.expandedItemId = null;
  },

  renderCalendarCard(container) {
    if (!container) {
      container = el('div', { class: 'bento-item bento-two-thirds dashboard-calendar-card' });
    } else {
      container.innerHTML = '';
    }

    if (this.calMonth === undefined || this.calYear === undefined) {
      const todayDate = new Date();
      this.calMonth = todayDate.getMonth();
      this.calYear = todayDate.getFullYear();
    }

    const events = this.getCalendarEvents();

    // Left Calendar Main View
    const mainView = el('div', { class: 'calendar-main-view' });

    // Calendar Header
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const header = el('div', { class: 'calendar-header' });
    
    const headerLeft = el('div', { class: 'calendar-header-left' });
    headerLeft.appendChild(el('h3', { class: 'calendar-month-year', text: `${months[this.calMonth]} ${this.calYear}` }));
    
    const todayBtn = el('button', { class: 'calendar-today-btn', text: 'Today' });
    todayBtn.onclick = (e) => {
      e.stopPropagation();
      const now = new Date();
      this.calMonth = now.getMonth();
      this.calYear = now.getFullYear();
      this.selectedDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      this.refreshCalendarCard();
    };
    headerLeft.appendChild(todayBtn);

    const navs = el('div', { class: 'calendar-nav-arrows' });
    const prevBtn = el('button', { class: 'calendar-arrow-btn', text: '‹' });
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      this.calMonth--;
      if (this.calMonth < 0) {
        this.calMonth = 11;
        this.calYear--;
      }
      this.refreshCalendarCard();
    };

    const nextBtn = el('button', { class: 'calendar-arrow-btn', text: '›' });
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      this.calMonth++;
      if (this.calMonth > 11) {
        this.calMonth = 0;
        this.calYear++;
      }
      this.refreshCalendarCard();
    };

    navs.appendChild(prevBtn);
    navs.appendChild(nextBtn);
    headerLeft.appendChild(navs);
    header.appendChild(headerLeft);

    const headerRight = el('div', { class: 'calendar-header-right' });
    const viewToggle = el('div', { class: 'calendar-view-toggle' });
    ['Day', 'Week', 'Month'].forEach(v => {
      const btn = el('button', { class: `view-btn ${v === 'Month' ? 'active' : ''}`, text: v });
      viewToggle.appendChild(btn);
    });
    headerRight.appendChild(viewToggle);

    const createBtnWrapper = el('div', { class: 'calendar-create-wrapper' });
    const createBtn = el('button', { class: 'calendar-create-btn', text: '+ New Create' });
    createBtnWrapper.appendChild(createBtn);
    headerRight.appendChild(createBtnWrapper);
    
    header.appendChild(headerRight);
    mainView.appendChild(header);

    // Grid
    const grid = el('div', { class: 'calendar-grid' });

    // Day Headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
      grid.appendChild(el('div', { class: 'calendar-day-name', text: d }));
    });

    // Calendar Cells (42 cells)
    const firstDayIndex = new Date(this.calYear, this.calMonth, 1).getDay();
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const prevMonthDays = new Date(this.calYear, this.calMonth, 0).getDate();

    const todayDate = new Date();
    const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

    // Previous month padding cells
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const m = this.calMonth === 0 ? 11 : this.calMonth - 1;
      const y = this.calMonth === 0 ? this.calYear - 1 : this.calYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      grid.appendChild(this.renderDayCell(day, dateStr, true, events[dateStr], todayStr));
    }

    // Current month cells
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      grid.appendChild(this.renderDayCell(i, dateStr, false, events[dateStr], todayStr));
    }

    // Next month padding cells
    const totalRendered = firstDayIndex + daysInMonth;
    const remaining = 42 - totalRendered;
    for (let i = 1; i <= remaining; i++) {
      const m = this.calMonth === 11 ? 0 : this.calMonth + 1;
      const y = this.calMonth === 11 ? this.calYear + 1 : this.calYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      grid.appendChild(this.renderDayCell(i, dateStr, true, events[dateStr], todayStr));
    }

    mainView.appendChild(grid);
    container.appendChild(mainView);

    // Right Sidebar
    const sidebar = el('div', { class: 'calendar-sidebar' });
    this.renderSidebarContent(sidebar, events);
    container.appendChild(sidebar);

    return container;
  },

  renderDayCell(dayNum, dateStr, isOtherMonth, dayEvents, todayStr) {
    const classes = ['calendar-cell'];
    if (isOtherMonth) classes.push('other-month');
    if (dateStr === todayStr) classes.push('today');
    if (this.selectedDay === dateStr) classes.push('selected-day');

    const cell = el('div', { class: classes.join(' '), 'data-date': dateStr });
    
    const numWrapper = el('div', { class: 'day-number-wrapper' });
    numWrapper.appendChild(el('span', { class: 'day-number', text: String(dayNum) }));
    cell.appendChild(numWrapper);

    const eventsContainer = el('div', { class: 'calendar-cell-events' });
    if (dayEvents && dayEvents.length > 0) {
      // Group by type for visual separation
      const wrs = dayEvents.filter(e => e.type === 'wr');
      const dbs = dayEvents.filter(e => e.type === 'db');

      const renderBadge = (ev) => {
        const badge = el('div', { 
          class: `calendar-event-badge ${ev.type}-badge`,
          title: ev.type === 'wr' ? `Work Request: ${ev.data.title}` : `Disbursement: ${ev.data.description}`
        });
        
        // Status dot inside badge
        const status = (ev.data.status || 'Draft').toLowerCase();
        const dot = el('span', { class: `status-dot status-${status.replace(/\s+/g, '-')}` });
        badge.appendChild(dot);
        
        const titleText = ev.type === 'wr' ? ev.data.title : ev.data.description;
        badge.appendChild(el('span', { class: 'badge-text', text: titleText }));
        
        badge.onclick = (e) => {
          e.stopPropagation();
          this.selectedDay = dateStr;
          this.expandedItemId = ev.data.id;
          this.refreshCalendarCard();
        };
        return badge;
      };

      if (wrs.length > 0) {
        const wrGroup = el('div', { class: 'cell-events-group' });
        wrs.slice(0, 2).forEach(ev => wrGroup.appendChild(renderBadge(ev)));
        eventsContainer.appendChild(wrGroup);
      }
      if (dbs.length > 0) {
        const dbGroup = el('div', { class: 'cell-events-group' });
        dbs.slice(0, 2).forEach(ev => dbGroup.appendChild(renderBadge(ev)));
        eventsContainer.appendChild(dbGroup);
      }

      if (dayEvents.length > 4) {
        eventsContainer.appendChild(el('div', { class: 'events-more', text: `+${dayEvents.length - 4} more` }));
      }
    }
    cell.appendChild(eventsContainer);

    cell.onclick = (e) => {
      e.stopPropagation();
      this.selectedDay = this.selectedDay === dateStr ? null : dateStr;
      this.expandedItemId = null;
      this.refreshCalendarCard();
    };

    return cell;
  },

  getCalendarEvents() {
    const isConsolidated = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    const userEntities = Auth.user.entities.map(e => e.toUpperCase());
    
    let wrs = DB.getAll('workRequests');
    let disbursements = DB.getAll('disbursements');
    
    // Filter by Entity Access
    if (!isConsolidated || Auth.user.entities.length === 1) {
      const active = (Auth.activeEntity || '').toUpperCase();
      wrs = wrs.filter(wr => wr.entity.toUpperCase() === active);
      disbursements = disbursements.filter(d => d.entity.toUpperCase() === active);
    } else {
      wrs = wrs.filter(wr => userEntities.includes(wr.entity.toUpperCase()));
      disbursements = disbursements.filter(d => userEntities.includes(d.entity.toUpperCase()));
    }

    const eventsByDate = {};
    const addToEvents = (dateStr, type, item) => {
      if (!dateStr) return;
      const key = dateStr.slice(0, 10);
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push({ type, data: item });
    };

    wrs.forEach(wr => {
      if (wr.dueDate && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
        addToEvents(wr.dueDate, 'wr', wr);
      }
    });

    disbursements.forEach(d => {
      if (['Submitted', 'Under Review', 'Approved'].includes(d.status)) {
        let dDate = d.dueDate || d.submittedAt;
        if (d.linkedWorkRequestId) {
          const wr = DB.getById('workRequests', d.linkedWorkRequestId);
          if (wr && wr.dueDate) dDate = wr.dueDate;
        }
        if (dDate) addToEvents(dDate, 'db', d);
      }
    });

    return eventsByDate;
  },

  refreshCalendarCard() {
    if (this.calendarCardRef) {
      this.renderCalendarCard(this.calendarCardRef);
    }
  },

  renderSidebarContent(sidebar, events) {
    sidebar.innerHTML = '';
    
    if (this.selectedDay) {
      const headerRow = el('div', { class: 'sidebar-header' });
      headerRow.appendChild(el('h3', { class: 'sidebar-title', text: `Schedule: ${formatDate(this.selectedDay)}` }));
      
      const clearBtn = el('button', { class: 'btn btn-ghost btn-xs', text: 'Clear' });
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        this.selectedDay = null;
        this.expandedItemId = null;
        this.refreshCalendarCard();
      };
      headerRow.appendChild(clearBtn);
      sidebar.appendChild(headerRow);

      const dayEvents = events[this.selectedDay] || [];
      if (dayEvents.length === 0) {
        sidebar.appendChild(el('p', { class: 'empty-state', text: 'Nothing scheduled for this day.' }));
      } else {
        const wrs = dayEvents.filter(e => e.type === 'wr');
        const dbs = dayEvents.filter(e => e.type === 'db');

        if (wrs.length > 0) {
          const sec = el('div', { class: 'sidebar-section' });
          sec.appendChild(el('h4', { text: 'Work Requests' }));
          wrs.forEach(ev => sec.appendChild(this.renderSidebarItemCard('wr', ev.data)));
          sidebar.appendChild(sec);
        }
        if (dbs.length > 0) {
          const sec = el('div', { class: 'sidebar-section' });
          sec.appendChild(el('h4', { text: 'Disbursements' }));
          dbs.forEach(ev => sec.appendChild(this.renderSidebarItemCard('db', ev.data)));
          sidebar.appendChild(sec);
        }
      }
    } else {
      sidebar.appendChild(el('h3', { class: 'sidebar-title', text: 'Upcoming This Week' }));
      
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const weekEndMidnight = todayMidnight + 7 * 86400000;

      const upcomingEvents = [];
      Object.keys(events).forEach(dateKey => {
        const d = new Date(dateKey).getTime();
        if (d >= todayMidnight && d <= weekEndMidnight) {
          events[dateKey].forEach(ev => upcomingEvents.push(ev));
        }
      });

      if (upcomingEvents.length === 0) {
        sidebar.appendChild(el('p', { class: 'empty-state', text: 'No items due this week.' }));
      } else {
        upcomingEvents.sort((a, b) => {
          const dateA = new Date(a.type === 'wr' ? a.data.dueDate : (a.data.dueDate || a.data.submittedAt));
          const dateB = new Date(b.type === 'wr' ? b.data.dueDate : (b.data.dueDate || b.data.submittedAt));
          return dateA - dateB;
        });

        const wrs = upcomingEvents.filter(e => e.type === 'wr');
        const dbs = upcomingEvents.filter(e => e.type === 'db');

        if (wrs.length > 0) {
          const sec = el('div', { class: 'sidebar-section' });
          sec.appendChild(el('h4', { text: 'Work Requests' }));
          wrs.forEach(ev => sec.appendChild(this.renderSidebarItemCard('wr', ev.data)));
          sidebar.appendChild(sec);
        }
        if (dbs.length > 0) {
          const sec = el('div', { class: 'sidebar-section' });
          sec.appendChild(el('h4', { text: 'Disbursements' }));
          dbs.forEach(ev => sec.appendChild(this.renderSidebarItemCard('db', ev.data)));
          sidebar.appendChild(sec);
        }
      }
    }
  },

  renderSidebarItemCard(type, item) {
    const isExpanded = this.expandedItemId === item.id;
    const card = el('div', { class: `sidebar-item ${type}-item ${isExpanded ? 'expanded' : ''}` });

    const header = el('div', { class: 'sidebar-item-header' });
    const titleText = type === 'wr' ? item.title : item.description;
    const dateText = type === 'wr' ? formatDate(item.dueDate) : formatDate(item.dueDate || item.submittedAt);

    const info = el('div', { class: 'item-info' });
    info.appendChild(el('span', { class: 'item-title', text: titleText }));
    info.appendChild(el('span', { class: 'item-date', text: dateText }));
    header.appendChild(info);

    const arrow = el('span', { class: 'item-arrow', text: '›' });
    header.appendChild(arrow);
    card.appendChild(header);

    if (isExpanded) {
      const details = el('div', { class: 'sidebar-item-details' });
      
      if (type === 'wr') {
        const client = DB.getById('clients', item.clientId);
        const assigned = DB.getById('users', item.assignedTo);
        details.appendChild(this.renderDetailRow('Entity', item.entity.toUpperCase()));
        details.appendChild(this.renderDetailRow('Client', client ? client.name : '—'));
        details.appendChild(this.renderDetailRow('Status', item.status));
        details.appendChild(this.renderDetailRow('Assigned', assigned ? assigned.name : '—'));
        if (item.description) details.appendChild(el('div', { class: 'detail-desc', text: item.description }));
      } else {
        const emp = DB.getById('users', item.requestedBy || item.employeeId);
        details.appendChild(this.renderDetailRow('Entity', item.entity.toUpperCase()));
        details.appendChild(this.renderDetailRow('Category', item.category));
        details.appendChild(this.renderDetailRow('Amount', formatPHP(item.amount)));
        details.appendChild(this.renderDetailRow('Status', item.status));
        details.appendChild(this.renderDetailRow('Fund Source', item.fundSource));
        details.appendChild(this.renderDetailRow('Requested By', emp ? emp.name : '—'));
      }

      const viewBtn = el('button', { class: 'btn btn-primary btn-xs btn-block', style: 'margin-top:12px;', text: 'View Record' });
      viewBtn.onclick = (e) => {
        e.stopPropagation();
        if (type === 'wr') {
          Workflow.view = 'detail';
          Workflow.detailWrId = item.id;
          location.hash = '#workflow';
        } else {
          Disbursement.view = 'detail';
          Disbursement.detailId = item.id;
          location.hash = '#disbursement';
        }
        App.handleRoute();
      };
      details.appendChild(viewBtn);

      card.appendChild(details);
    }

    card.onclick = (e) => {
      e.stopPropagation();
      this.expandedItemId = isExpanded ? null : item.id;
      this.refreshCalendarCard();
    };

    return card;
  },

  renderDetailRow(label, value) {
    const row = el('div', { class: 'detail-row' });
    row.appendChild(el('span', { class: 'detail-lbl', text: label }));
    row.appendChild(el('span', { class: 'detail-val', text: value }));
    return row;
  }
};
