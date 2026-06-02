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
    
    // Performance Chart (Two Thirds)
    const perfCard = el('div', { class: 'bento-item bento-two-thirds' });
    perfCard.appendChild(el('h2', { class: 'card-title', text: 'Performance' }));
    perfCard.appendChild(this.renderSmoothLineChart());
    bento.appendChild(perfCard);

    // Activity Breakdown (Third)
    const deviceCard = el('div', { class: 'bento-item bento-third' });
    deviceCard.appendChild(el('h2', { class: 'card-title', text: 'Activity Breakdown' }));
    deviceCard.appendChild(this.renderDonutChart(ata.revenue, lta.revenue, ata.outstanding + lta.outstanding));
    bento.appendChild(deviceCard);
    
    // KPI Cards
    bento.appendChild(this.kpiCard('ATA Revenue', ata.revenue, 'ata', '+15%'));
    bento.appendChild(this.kpiCard('LTA Revenue', lta.revenue, 'lta', '+8%'));
    bento.appendChild(this.kpiCard('Total Outstanding', ata.outstanding + lta.outstanding, null, '-5%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', ata.overdue + lta.overdue, null, '+2%'));

    // Upcoming Disbursements widget (active entity)
    const disburseCard = el('div', { class: 'bento-item bento-half' });
    disburseCard.appendChild(el('h2', { class: 'card-title', text: 'Upcoming Disbursements' }));
    const upcoming = DB.getWhere('disbursements', d => {
      return d.entity === Auth.activeEntity && ['Submitted', 'Under Review', 'Approved'].includes(d.status);
    });
    if (upcoming.length === 0) {
      disburseCard.appendChild(el('p', { class: 'empty-state', text: 'No upcoming disbursements.' }));
    } else {
      const ul = el('ul', { style: 'margin:0;padding:0;list-style:none;' });
      upcoming.slice(0, 5).forEach(d => {
        const li = el('li', { style: 'padding:8px 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;' });
        li.appendChild(document.createTextNode(d.description + ' — ' + formatPHP(d.amount)));
        ul.appendChild(li);
      });
      disburseCard.appendChild(ul);
    }
    bento.appendChild(disburseCard);

    // Work Requests Due This Week widget (active entity)
    const dueCard = el('div', { class: 'bento-item bento-half' });
    dueCard.appendChild(el('h2', { class: 'card-title', text: 'Work Requests Due This Week' }));
    const now = new Date();
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const dueWrs = DB.getWhere('workRequests', wr => {
      if (wr.entity !== Auth.activeEntity) return false;
      if (!wr.dueDate) return false;
      const due = new Date(wr.dueDate);
      return due >= now && due <= weekEnd && wr.status !== 'Completed' && wr.status !== 'Cancelled';
    });
    if (dueWrs.length === 0) {
      dueCard.appendChild(el('p', { class: 'empty-state', text: 'No work requests due this week.' }));
    } else {
      const ul = el('ul', { style: 'margin:0;padding:0;list-style:none;' });
      dueWrs.slice(0, 5).forEach(wr => {
        const li = el('li', { style: 'padding:8px 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;' });
        const due = new Date(wr.dueDate);
        const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const diffDays = Math.round((dueMidnight - todayMidnight) / 86400000);
        
        let relText = '';
        let color = 'inherit';
        if (diffDays === 0) {
          relText = ' (Today)';
          color = '#dc2626'; // red
        } else if (diffDays === 1) {
          relText = ' (Tomorrow)';
          color = '#ea580c'; // orange
        } else {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          relText = ' (' + days[due.getDay()] + ')';
          color = 'var(--color-text-muted, #6b7280)';
        }
        
        li.appendChild(document.createTextNode(wr.title + ' — Due ' + formatDate(wr.dueDate)));
        li.appendChild(el('strong', { style: 'color: ' + color + ';' }, [relText]));
        ul.appendChild(li);
      });
      dueCard.appendChild(ul);
    }
    bento.appendChild(dueCard);

    container.appendChild(bento);

    const tableSection = el('div', { class: 'bento-item bento-full', style: 'padding: 0; background: transparent; box-shadow: none;' });
    tableSection.appendChild(this.renderComparisonTable(ata, lta));
    container.appendChild(tableSection);
    
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
  
  renderSmoothLineChart() {
    const container = el('div', { class: 'chart-container' });
    
    // Simple SVG representation of a smooth curve
    container.innerHTML = `
      <svg class="smooth-line-chart" viewBox="0 0 600 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="primary-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="1" />
            <stop offset="100%" stop-color="var(--color-surface)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <!-- Background Area -->
        <path class="smooth-line-bg" d="M 0,150 C 50,150 100,50 150,80 C 200,110 250,160 300,120 C 350,80 400,140 450,110 C 500,80 550,50 600,90 L 600,200 L 0,200 Z" />
        <!-- Stroke Line -->
        <path class="smooth-line" d="M 0,150 C 50,150 100,50 150,80 C 200,110 250,160 300,120 C 350,80 400,140 450,110 C 500,80 550,50 600,90" />
        <!-- Axis labels -->
        <text x="0" y="195" class="chart-x-axis">Jan</text>
        <text x="100" y="195" class="chart-x-axis">Feb</text>
        <text x="200" y="195" class="chart-x-axis">Mar</text>
        <text x="300" y="195" class="chart-x-axis">Apr</text>
        <text x="400" y="195" class="chart-x-axis">May</text>
        <text x="500" y="195" class="chart-x-axis">Jun</text>
        <text x="580" y="195" class="chart-x-axis">Jul</text>
      </svg>
    `;
    return container;
  },
  
  renderDonutChart(v1, v2, v3) {
    const total = v1 + v2 + v3 || 1;
    const p1 = Math.round((v1 / total) * 100) || 45;
    const p2 = Math.round((v2 / total) * 100) || 35;
    const p3 = Math.round((v3 / total) * 100) || 20;
    
    // Circumference of a circle with r=40 is ~251.3
    const c = 251.3;
    const o1 = (p1 / 100) * c;
    const o2 = (p2 / 100) * c;
    const o3 = (p3 / 100) * c;
    
    const container = el('div', { class: 'chart-container', style: 'flex-direction: column; justify-content: space-between;' });
    
    container.innerHTML = `
      <svg class="donut-chart" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-bg)" stroke-width="16" />
        
        <!-- Segment 1 -->
        <circle cx="50" cy="50" r="40" class="donut-segment donut-primary" 
          stroke-dasharray="${o1} ${c - o1}" stroke-dashoffset="0" />
          
        <!-- Segment 2 -->
        <circle cx="50" cy="50" r="40" class="donut-segment donut-secondary" 
          stroke-dasharray="${o2} ${c - o2}" stroke-dashoffset="-${o1 + 2}" />
          
        <!-- Segment 3 -->
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

  renderEntityScoped() {
    const metrics = this.getEntityMetrics(Auth.activeEntity);
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', {}, [Auth.activeEntity + ' Dashboard']));
    
    const bento = el('div', { class: 'bento-grid' });
    
    // Performance Chart (Full width for scoped)
    const perfCard = el('div', { class: 'bento-item bento-full' });
    perfCard.appendChild(el('h2', { class: 'card-title', text: 'Performance' }));
    perfCard.appendChild(this.renderSmoothLineChart());
    bento.appendChild(perfCard);

    bento.appendChild(this.kpiCard('Active Work Requests', metrics.activeWR, Auth.activeEntity.toLowerCase(), '+3%'));
    bento.appendChild(this.kpiCard('Revenue (Paid)', metrics.revenue, Auth.activeEntity.toLowerCase(), '+11%'));
    bento.appendChild(this.kpiCard('Outstanding', metrics.outstanding, null, '-2%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', metrics.overdue, null, '+1%'));

    // Upcoming Disbursements widget
    const disburseCard = el('div', { class: 'bento-item bento-half' });
    disburseCard.appendChild(el('h2', { class: 'card-title', text: 'Upcoming Disbursements' }));
    const upcoming = DB.getWhere('disbursements', d => {
      return d.entity === Auth.activeEntity && ['Submitted', 'Under Review', 'Approved'].includes(d.status);
    });
    if (upcoming.length === 0) {
      disburseCard.appendChild(el('p', { class: 'empty-state', text: 'No upcoming disbursements.' }));
    } else {
      const ul = el('ul', { style: 'margin:0;padding:0;list-style:none;' });
      upcoming.slice(0, 5).forEach(d => {
        const li = el('li', { style: 'padding:8px 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;' });
        li.appendChild(document.createTextNode(d.description + ' — ' + formatPHP(d.amount)));
        ul.appendChild(li);
      });
      disburseCard.appendChild(ul);
    }
    bento.appendChild(disburseCard);

    // Work Requests Due This Week widget
    const dueCard = el('div', { class: 'bento-item bento-half' });
    dueCard.appendChild(el('h2', { class: 'card-title', text: 'Work Requests Due This Week' }));
    const now = new Date();
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const dueWrs = DB.getWhere('workRequests', wr => {
      if (wr.entity !== Auth.activeEntity) return false;
      if (!wr.dueDate) return false;
      const due = new Date(wr.dueDate);
      return due >= now && due <= weekEnd && wr.status !== 'Completed' && wr.status !== 'Cancelled';
    });
    if (dueWrs.length === 0) {
      dueCard.appendChild(el('p', { class: 'empty-state', text: 'No work requests due this week.' }));
    } else {
      const ul = el('ul', { style: 'margin:0;padding:0;list-style:none;' });
      dueWrs.slice(0, 5).forEach(wr => {
        const li = el('li', { style: 'padding:8px 0;border-bottom:1px solid var(--color-border);font-size:0.875rem;' });
        const due = new Date(wr.dueDate);
        const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const diffDays = Math.round((dueMidnight - todayMidnight) / 86400000);
        
        let relText = '';
        let color = 'inherit';
        if (diffDays === 0) {
          relText = ' (Today)';
          color = '#dc2626'; // red
        } else if (diffDays === 1) {
          relText = ' (Tomorrow)';
          color = '#ea580c'; // orange
        } else {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          relText = ' (' + days[due.getDay()] + ')';
          color = 'var(--color-text-muted, #6b7280)';
        }
        
        li.appendChild(document.createTextNode(wr.title + ' — Due ' + formatDate(wr.dueDate)));
        li.appendChild(el('strong', { style: 'color: ' + color + ';' }, [relText]));
        ul.appendChild(li);
      });
      dueCard.appendChild(ul);
    }
    bento.appendChild(dueCard);

    container.appendChild(bento);
    return container;
  },

  init() {}
};
