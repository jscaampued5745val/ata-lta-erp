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

    const timeLogPrompt = this.renderTimeLogPrompt();
    if (timeLogPrompt) container.appendChild(timeLogPrompt);
    
    // 1. Linear Activity Bar (Top)
    container.appendChild(this.renderLinearActivityBar(ata.revenue, lta.revenue, ata.outstanding + lta.outstanding));

    const bento = el('div', { class: 'bento-grid' });
    
    // 2. Calendar Card (Main area)
    const calendarCard = this.renderCalendarCard();
    calendarCard.className = 'bento-item bento-full dashboard-calendar-card'; // Make full width for better month view
    this.calendarCardRef = calendarCard;
    bento.appendChild(calendarCard);

    // 3. KPI Cards (Below Calendar)
    bento.appendChild(this.kpiCard('ATA Revenue', ata.revenue, 'ata', '+15%'));
    bento.appendChild(this.kpiCard('LTA Revenue', lta.revenue, 'lta', '+8%'));
    bento.appendChild(this.kpiCard('Total Outstanding', ata.outstanding + lta.outstanding, null, '-5%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', ata.overdue + lta.overdue, null, '+2%'));
    
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
    
    const timeLogPrompt = this.renderTimeLogPrompt();
    if (timeLogPrompt) container.appendChild(timeLogPrompt);

    // 1. Linear Activity Bar (Top)
    container.appendChild(this.renderLinearActivityBar(metrics.revenue, 0, metrics.outstanding));

    const bento = el('div', { class: 'bento-grid' });
    
    // 2. Calendar Card (Main area)
    const calendarCard = this.renderCalendarCard();
    calendarCard.className = 'bento-item bento-full dashboard-calendar-card';
    this.calendarCardRef = calendarCard;
    bento.appendChild(calendarCard);

    // 3. KPI Cards (Below Calendar)
    bento.appendChild(this.kpiCard('Active Work Requests', metrics.activeWR, Auth.activeEntity.toLowerCase(), '+3%'));
    bento.appendChild(this.kpiCard('Revenue (Paid)', metrics.revenue, Auth.activeEntity.toLowerCase(), '+11%'));
    bento.appendChild(this.kpiCard('Outstanding', metrics.outstanding, null, '-2%'));
    bento.appendChild(this.kpiCard('Overdue Tasks', metrics.overdue, null, '+1%'));

    container.appendChild(bento);
    return container;
  },

  renderTimeLogPrompt() {
    const now = new Date();
    // Only prompt if it's 5 PM (17:00) or later
    if (now.getHours() < 17) return null;

    // Check if user has assigned tasks that are not completed
    const myTasks = DB.getWhere('tasks', t => t.assigneeId === Auth.user.id && t.status !== 'Completed');
    if (myTasks.length === 0) return null;

    // Check if user logged time today for these incomplete tasks
    const todayStr = now.toISOString().slice(0, 10);
    const tasksNeedingLogs = myTasks.filter(t => !t.timeLogs || !t.timeLogs.some(log => log.date === todayStr));

    // If all incomplete tasks have a log today, no prompt needed.
    if (tasksNeedingLogs.length === 0) return null;

    const banner = el('div', { 
      class: 'alert-banner', 
      style: 'background: #fffbeb; border: 1px solid #f59e0b; color: #92400e; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);' 
    });
    
    const left = el('div', { style: 'display: flex; align-items: center; gap: 12px;' });
    left.innerHTML = `<span style="font-size: 1.25rem;">⏰</span> <div><strong>End of Day Reminder:</strong> You have ${tasksNeedingLogs.length} incomplete assigned task(s) but haven't submitted your daily time log for them yet. Please log your time before finishing your day.</div>`;
    banner.appendChild(left);

    const right = el('button', { class: 'btn btn-primary btn-sm', text: 'Go to Tasks' });
    right.onclick = () => {
      location.hash = '#operations';
      App.handleRoute();
    };
    banner.appendChild(right);

    return banner;
  },

  renderLinearActivityBar(ataRev, ltaRev, outstanding) {
    const total = ataRev + ltaRev + outstanding || 1;
    const p1 = Math.round((ataRev / total) * 100);
    const p2 = Math.round((ltaRev / total) * 100);
    const p3 = Math.round((outstanding / total) * 100);

    const wrapper = el('div', { class: 'activity-bar-container' });
    wrapper.appendChild(el('div', { class: 'activity-bar-title', text: 'Firm Activity Breakdown' }));
    
    // Blended colors logic
    const ataColor = '#2563eb'; 
    const ltaColor = '#10b981';
    const outColor = '#e34234'; // Vermillion
    
    // Calculate midpoints for blending
    const stop1 = Math.max(0, p1 - 5);
    const stop2 = Math.min(100, p1 + 5);
    const stop3 = Math.max(0, p1 + p2 - 5);
    const stop4 = Math.min(100, p1 + p2 + 5);

    let gradientStr = `linear-gradient(to right, 
      ${ataColor} 0%, 
      ${ataColor} ${stop1}%, 
      ${ltaColor} ${stop2}%, 
      ${ltaColor} ${stop3}%, 
      ${outColor} ${stop4}%, 
      ${outColor} 100%)`;

    // If a segment is 0, handle cleanly (basic fallback)
    if (p1 === 0 && p2 === 0) gradientStr = outColor;
    else if (p1 === 0 && p3 === 0) gradientStr = ltaColor;
    else if (p2 === 0 && p3 === 0) gradientStr = ataColor;
    else if (p1 === 0) {
       gradientStr = `linear-gradient(to right, ${ltaColor} 0%, ${ltaColor} ${Math.max(0, p2-5)}%, ${outColor} ${Math.min(100, p2+5)}%, ${outColor} 100%)`;
    } else if (p2 === 0) {
       gradientStr = `linear-gradient(to right, ${ataColor} 0%, ${ataColor} ${Math.max(0, p1-5)}%, ${outColor} ${Math.min(100, p1+5)}%, ${outColor} 100%)`;
    } else if (p3 === 0) {
       gradientStr = `linear-gradient(to right, ${ataColor} 0%, ${ataColor} ${Math.max(0, p1-5)}%, ${ltaColor} ${Math.min(100, p1+5)}%, ${ltaColor} 100%)`;
    }

    const bar = el('div', { class: 'linear-activity-bar', style: `background: ${gradientStr};` });
    
    // Keep labels but position them relative to their sections without background
    if (p1 > 0) {
      const s = el('div', { class: 'activity-segment', style: `width: ${p1}%; background: transparent;`, text: `${p1}%` });
      bar.appendChild(s);
    }
    if (p2 > 0) {
      const s = el('div', { class: 'activity-segment', style: `width: ${p2}%; background: transparent;`, text: `${p2}%` });
      bar.appendChild(s);
    }
    if (p3 > 0) {
      const s = el('div', { class: 'activity-segment', style: `width: ${p3}%; background: transparent;`, text: `${p3}%` });
      bar.appendChild(s);
    }
    wrapper.appendChild(bar);

    const legend = el('div', { class: 'activity-legend' });
    legend.appendChild(this.legendItem('ATA Revenue', ataColor));
    if (ltaRev > 0) legend.appendChild(this.legendItem('LTA Revenue', ltaColor));
    legend.appendChild(this.legendItem('Outstanding Invoices', outColor));
    wrapper.appendChild(legend);

    return wrapper;
  },

  legendItem(label, color) {
    const item = el('div', { class: 'legend-item' });
    item.appendChild(el('span', { class: 'legend-dot', style: `background: ${color}` }));
    item.appendChild(el('span', { text: label }));
    return item;
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
    this.calView = 'week';
  },

  renderCalendarCard(container) {
    if (!container) {
      container = el('div', { class: 'bento-item bento-full dashboard-calendar-card' });
    } else {
      container.innerHTML = '';
    }

    if (this.calMonth === undefined || this.calYear === undefined) {
      const todayDate = new Date();
      this.calMonth = todayDate.getMonth();
      this.calYear = todayDate.getFullYear();
    }

    if (!this.selectedDay) {
      const now = new Date();
      this.selectedDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    
    if (this.calView === undefined) this.calView = 'week';

    const events = this.getCalendarEvents();

    // Left Calendar Main View
    const mainView = el('div', { class: 'calendar-main-view' });

    // Calendar Header (Reference: September 2023 | Today < > | Day Week Month)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const header = el('div', { class: 'calendar-header' });
    
    const headerLeft = el('div', { class: 'calendar-header-left' });
    
    let headerText = `${months[this.calMonth]} ${this.calYear}`;
    let isCurrentlyToday = true;
    
    if (this.calView !== 'month' && this.selectedDay) {
      const d = new Date(this.selectedDay);
      headerText = `${months[d.getMonth()]} ${d.getFullYear()}`;
      
      const todayDate = new Date();
      const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
      
      if (this.calView === 'day') {
        isCurrentlyToday = this.selectedDay === todayStr;
      } else if (this.calView === 'week') {
        const selectedDate = new Date(this.selectedDay);
        const dayOfWeek = selectedDate.getDay();
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(selectedDate.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        const todayTime = todayDate.getTime();
        isCurrentlyToday = todayTime >= startOfWeek.getTime() && todayTime <= endOfWeek.getTime() + 86400000;
      }
    } else if (this.calView === 'month') {
        const todayDate = new Date();
        isCurrentlyToday = this.calMonth === todayDate.getMonth() && this.calYear === todayDate.getFullYear();
    }
    
    headerLeft.appendChild(el('h3', { class: 'calendar-month-year', text: headerText }));
    
    let btnText = 'Today';
    if (!isCurrentlyToday && this.selectedDay && this.calView !== 'month') {
        const d = new Date(this.selectedDay);
        btnText = `${months[d.getMonth()].substring(0, 3)} ${d.getDate()}`;
    }
    
    const todayBtn = el('button', { class: 'calendar-today-btn', text: btnText });
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
      if (this.calView === 'month') {
        this.calMonth--;
        if (this.calMonth < 0) {
          this.calMonth = 11;
          this.calYear--;
        }
      } else {
        const d = new Date(this.selectedDay);
        d.setDate(d.getDate() - (this.calView === 'week' ? 7 : 1));
        this.selectedDay = d.toISOString().slice(0, 10);
        this.calMonth = d.getMonth();
        this.calYear = d.getFullYear();
      }
      this.refreshCalendarCard();
    };

    const nextBtn = el('button', { class: 'calendar-arrow-btn', text: '›' });
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.calView === 'month') {
        this.calMonth++;
        if (this.calMonth > 11) {
          this.calMonth = 0;
          this.calYear++;
        }
      } else {
        const d = new Date(this.selectedDay);
        d.setDate(d.getDate() + (this.calView === 'week' ? 7 : 1));
        this.selectedDay = d.toISOString().slice(0, 10);
        this.calMonth = d.getMonth();
        this.calYear = d.getFullYear();
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
      const mode = v.toLowerCase();
      const btn = el('button', { 
        class: `view-btn ${this.calView === mode ? 'active' : ''}`, 
        text: v 
      });
      btn.onclick = (e) => {
        e.stopPropagation();
        this.calView = mode;
        this.refreshCalendarCard();
      };
      viewToggle.appendChild(btn);
    });
    headerRight.appendChild(viewToggle);
    
    header.appendChild(headerRight);
    mainView.appendChild(header);

    // Grid
    const gridClass = this.calView === 'week' ? 'calendar-week-grid' : (this.calView === 'day' ? 'calendar-day-grid' : 'calendar-grid');
    const grid = el('div', { class: gridClass });
    
    if (this.calView === 'month') {
      this.renderMonthGrid(grid, events);
    } else if (this.calView === 'week') {
      this.renderWeekGrid(grid, events);
    } else if (this.calView === 'day') {
      this.renderDayGrid(grid, events);
    }

    mainView.appendChild(grid);
    container.appendChild(mainView);


    // Right Sidebar
    const sidebar = el('div', { class: 'calendar-sidebar' });
    this.renderSidebarContent(sidebar, events);
    container.appendChild(sidebar);

    // Auto-scroll to current time for week/day views
    if (this.calView === 'week' || this.calView === 'day') {
      setTimeout(() => {
        if (this.calendarCardRef) {
          const gridEl = this.calendarCardRef.querySelector('.calendar-week-grid, .calendar-day-grid');
          if (gridEl) {
             const nowHour = new Date().getHours();
             // timeSlots start at 09 AM (index 1 after 'All Day').
             // So hour 9 is index 1. Hour 15 is index 7.
             let targetIdx = nowHour - 9 + 1; 
             if (targetIdx < 0) targetIdx = 0;
             // approximate row height is 71px. We want to center the row a bit, so maybe targetIdx * 71
             gridEl.scrollTo({ top: targetIdx * 71, behavior: 'smooth' });
          }
        }
      }, 50);
    }

    return container;
  },

  calMonthView() {
    this.calView = 'month';
  },

  renderWeekGrid(grid, events) {
    const now = new Date(this.calYear, this.calMonth, parseInt(this.selectedDay ? this.selectedDay.split('-')[2] : new Date().getDate()));
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);

    // Header Row
    grid.appendChild(el('div', { class: 'week-time-label empty' })); 
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDates.push(d);
      
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = dateStr === new Date().toISOString().slice(0, 10);
      
      const dayHeader = el('div', { class: `week-day-header ${isToday ? 'today' : ''}` });
      dayHeader.innerHTML = `<span class="day-name">${days[i]}</span><span class="day-num">${String(d.getDate()).padStart(2, '0')}</span>`;
      
      if (isToday) {
          const now = new Date();
          const nowHour = now.getHours();
          const nowMin = now.getMinutes();
          const percent = ((nowHour * 60 + nowMin) / (24 * 60)) * 100;
          
          const timeBubble = el('div', { 
            class: 'week-vertical-time-bubble', 
            text: `${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`,
            style: `left: ${percent}%;`
          });
          dayHeader.appendChild(timeBubble);
          
          const lineWrap = el('div', { class: 'week-vertical-time-line-wrap', style: `left: ${percent}%;` });
          const line = el('div', { class: 'week-vertical-time-line' });
          lineWrap.appendChild(line);
          dayHeader.appendChild(lineWrap);
      }
      grid.appendChild(dayHeader);
    }

    // Time Rows
    const timeSlots = ['All Day', '09 AM', '10 AM', '11 AM', '12 PM', '01 PM', '02 PM', '03 PM', '04 PM', '05 PM'];
    
    timeSlots.forEach((time, slotIndex) => {
      const nowHour = new Date().getHours();
      const isCurrentHour = (slotIndex > 0 && (slotIndex + 8 === nowHour));
      const rowClass = isCurrentHour ? 'week-time-label current-hour' : 'week-time-label';
      
      grid.appendChild(el('div', { class: rowClass, text: time }));
      
      for (let i = 0; i < 7; i++) {
        const d = weekDates[i];
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayEvents = events[dateStr] || [];
        
        const isToday = dateStr === new Date().toISOString().slice(0, 10);
        const cellClass = `week-cell ${isCurrentHour && isToday ? 'current-hour-cell' : ''}`;
        const cell = el('div', { class: cellClass, 'data-date': dateStr });
        
        const slotEvents = dayEvents.filter(ev => {
           let hash = 0;
           for(let k=0; k<ev.data.id.length; k++) hash += ev.data.id.charCodeAt(k);
           let evSlot = (hash % 9) + 1; // 1 to 9
           if (slotIndex === 0 && dayEvents.length > 5) return true; // dump in All day if many
           if (slotIndex === 0 && dayEvents.length <= 5 && evSlot > 9) return true; // fallback
           return evSlot === slotIndex;
        });

        if (slotEvents.length > 0) {
            slotEvents.forEach(ev => {
                const isCompleted = ev.type === 'wr' ? ev.data.status === 'Completed' : ['Released', 'Paid'].includes(ev.data.status);
                
                let colorClass = 'bg-cyan-500';
                let avatarName = 'U';
                
                if (ev.type === 'wr') {
                    const wrTasks = DB.getWhere('tasks', t => t.workRequestId === ev.data.id);
                    const total = wrTasks.length;
                    if (total === 0) {
                       colorClass = 'bg-purple-500';
                    } else {
                       const comp = wrTasks.filter(t => t.status === 'Completed').length;
                       const pct = comp / total;
                       if (pct === 1) colorClass = 'bg-green-500';
                       else if (pct >= 0.5) colorClass = 'bg-blue-500';
                       else if (pct > 0) colorClass = 'bg-yellow-500';
                       else colorClass = 'bg-orange-500';
                    }
                    if (ev.data.status === 'Cancelled') colorClass = 'bg-orange-500';
                    
                    if (ev.data.assignedTo) {
                        const u = DB.getById('users', ev.data.assignedTo);
                        if (u) avatarName = u.name;
                    }
                } else {
                    const s = ev.data.status;
                    if (s === 'Paid' || s === 'Released') colorClass = 'bg-green-500';
                    else if (s === 'Approved') colorClass = 'bg-blue-500';
                    else if (s === 'Under Review') colorClass = 'bg-yellow-500';
                    else colorClass = 'bg-purple-500';
                    
                    if (ev.data.requestedBy) {
                        const u = DB.getById('users', ev.data.requestedBy);
                        if (u) avatarName = u.name;
                    }
                }

                const badge = el('div', { 
                  class: `week-event-pill ${colorClass} ${isCompleted ? 'completed' : ''}`,
                  title: ev.type === 'wr' ? `Work Request: ${ev.data.title}` : `Disbursement: ${ev.data.description}`
                });
                
                const avatarWrap = el('div', { class: 'week-event-avatars' });
                // We'll just show the single assignee/requester avatar for simplicity, or we could generate random based on hash if needed, but actual assignee is better.
                const img = el('img', { class: 'week-event-avatar', src: `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random` });
                avatarWrap.appendChild(img);
                badge.appendChild(avatarWrap);
                
                const titleText = ev.type === 'wr' ? ev.data.title : ev.data.description;
                badge.appendChild(el('span', { class: 'week-event-title', text: titleText }));
                badge.appendChild(el('span', { class: 'week-event-arrow', text: '›' }));

                badge.onclick = (e) => {
                  e.stopPropagation();
                  this.selectedDay = dateStr;
                  this.expandedItemId = ev.data.id;
                  this.refreshCalendarCard();
                };
                
                cell.appendChild(badge);
            });
        }
        
        cell.onclick = (e) => {
            e.stopPropagation();
            this.selectedDay = this.selectedDay === dateStr ? null : dateStr;
            this.expandedItemId = null;
            this.refreshCalendarCard();
        };

        grid.appendChild(cell);
      }
    });
  },

  renderDayGrid(grid, events) {
    const d = new Date(this.selectedDay);
    const dateStr = this.selectedDay;
    const isToday = dateStr === new Date().toISOString().slice(0, 10);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Header Row
    grid.appendChild(el('div', { class: 'week-time-label empty' })); 
    
    const dayHeader = el('div', { class: `week-day-header ${isToday ? 'today' : ''}` });
    dayHeader.innerHTML = `<span class="day-name">${days[d.getDay()]}</span><span class="day-num">${String(d.getDate()).padStart(2, '0')}</span>`;
    
    if (isToday) {
        const now = new Date();
        const nowHour = now.getHours();
        const nowMin = now.getMinutes();
        const percent = ((nowHour * 60 + nowMin) / (24 * 60)) * 100;
        
        const timeBubble = el('div', { 
          class: 'week-vertical-time-bubble', 
          text: `${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`,
          style: `left: ${percent}%;`
        });
        dayHeader.appendChild(timeBubble);
        
        const lineWrap = el('div', { class: 'week-vertical-time-line-wrap', style: `left: ${percent}%;` });
        const line = el('div', { class: 'week-vertical-time-line' });
        lineWrap.appendChild(line);
        dayHeader.appendChild(lineWrap);
    }
    grid.appendChild(dayHeader);

    // Time Rows
    const timeSlots = ['All Day', '09 AM', '10 AM', '11 AM', '12 PM', '01 PM', '02 PM', '03 PM', '04 PM', '05 PM'];
    
    timeSlots.forEach((time, slotIndex) => {
      const nowHour = new Date().getHours();
      const isCurrentHour = (slotIndex > 0 && (slotIndex + 8 === nowHour));
      const rowClass = isCurrentHour ? 'week-time-label current-hour' : 'week-time-label';
      
      grid.appendChild(el('div', { class: rowClass, text: time }));
      
      const dayEvents = events[dateStr] || [];
      const cellClass = `week-cell ${isCurrentHour && isToday ? 'current-hour-cell' : ''}`;
      const cell = el('div', { class: cellClass, 'data-date': dateStr });
      
      const slotEvents = dayEvents.filter(ev => {
         let hash = 0;
         for(let k=0; k<ev.data.id.length; k++) hash += ev.data.id.charCodeAt(k);
         let evSlot = (hash % 9) + 1;
         if (slotIndex === 0 && dayEvents.length > 5) return true;
         if (slotIndex === 0 && dayEvents.length <= 5 && evSlot > 9) return true;
         return evSlot === slotIndex;
      });

      if (slotEvents.length > 0) {
          slotEvents.forEach(ev => {
              const isCompleted = ev.type === 'wr' ? ev.data.status === 'Completed' : ['Released', 'Paid'].includes(ev.data.status);
              
              let colorClass = 'bg-cyan-500';
              let avatarName = 'U';
              
              if (ev.type === 'wr') {
                  const wrTasks = DB.getWhere('tasks', t => t.workRequestId === ev.data.id);
                  const total = wrTasks.length;
                  if (total === 0) {
                     colorClass = 'bg-purple-500';
                  } else {
                     const comp = wrTasks.filter(t => t.status === 'Completed').length;
                     const pct = comp / total;
                     if (pct === 1) colorClass = 'bg-green-500';
                     else if (pct >= 0.5) colorClass = 'bg-blue-500';
                     else if (pct > 0) colorClass = 'bg-yellow-500';
                     else colorClass = 'bg-orange-500';
                  }
                  if (ev.data.status === 'Cancelled') colorClass = 'bg-orange-500';
                  
                  if (ev.data.assignedTo) {
                      const u = DB.getById('users', ev.data.assignedTo);
                      if (u) avatarName = u.name;
                  }
              } else {
                  const s = ev.data.status;
                  if (s === 'Paid' || s === 'Released') colorClass = 'bg-green-500';
                  else if (s === 'Approved') colorClass = 'bg-blue-500';
                  else if (s === 'Under Review') colorClass = 'bg-yellow-500';
                  else colorClass = 'bg-purple-500';
                  
                  if (ev.data.requestedBy) {
                      const u = DB.getById('users', ev.data.requestedBy);
                      if (u) avatarName = u.name;
                  }
              }

              const badge = el('div', { 
                class: `week-event-pill ${colorClass} ${isCompleted ? 'completed' : ''}`,
                title: ev.type === 'wr' ? `Work Request: ${ev.data.title}` : `Disbursement: ${ev.data.description}`
              });
              
              const avatarWrap = el('div', { class: 'week-event-avatars' });
              const img = el('img', { class: 'week-event-avatar', src: `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=random` });
              avatarWrap.appendChild(img);
              badge.appendChild(avatarWrap);
              
              const titleText = ev.type === 'wr' ? ev.data.title : ev.data.description;
              badge.appendChild(el('span', { class: 'week-event-title', text: titleText }));
              badge.appendChild(el('span', { class: 'week-event-arrow', text: '›' }));

              badge.onclick = (e) => {
                e.stopPropagation();
                this.expandedItemId = ev.data.id;
                this.refreshCalendarCard();
              };
              
              cell.appendChild(badge);
          });
      }
      grid.appendChild(cell);
    });
  },

  renderMonthGrid(grid, events) {
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
        const isCompleted = ev.type === 'wr' ? ev.data.status === 'Completed' : ['Released', 'Paid'].includes(ev.data.status);
        
        let colorClass = 'bg-cyan-500';
        
        if (ev.type === 'wr') {
            const wrTasks = DB.getWhere('tasks', t => t.workRequestId === ev.data.id);
            const total = wrTasks.length;
            if (total === 0) {
               colorClass = 'bg-purple-500';
            } else {
               const comp = wrTasks.filter(t => t.status === 'Completed').length;
               const pct = comp / total;
               if (pct === 1) colorClass = 'bg-green-500';
               else if (pct >= 0.5) colorClass = 'bg-blue-500';
               else if (pct > 0) colorClass = 'bg-yellow-500';
               else colorClass = 'bg-orange-500';
            }
            if (ev.data.status === 'Cancelled') colorClass = 'bg-orange-500';
        } else {
            const s = ev.data.status;
            if (s === 'Paid' || s === 'Released') colorClass = 'bg-green-500';
            else if (s === 'Approved') colorClass = 'bg-blue-500';
            else if (s === 'Under Review') colorClass = 'bg-yellow-500';
            else colorClass = 'bg-purple-500';
        }

        const badge = el('div', { 
          class: `calendar-event-badge ${ev.type}-badge ${isCompleted ? 'completed' : ''}`,
          title: ev.type === 'wr' ? `Work Request: ${ev.data.title}` : `Disbursement: ${ev.data.description}`,
          style: `border-left-color: transparent; background: transparent; padding:0; box-shadow:none;`
        });
        
        const pill = el('div', { class: `week-event-pill ${colorClass}`, style: 'margin-bottom:0; width:100%;' });

        // Status dot inside badge
        const status = (ev.data.status || 'Draft').toLowerCase();
        const dot = el('span', { class: `status-dot status-${status.replace(/\s+/g, '-')}`, style: 'background:#fff; margin-right:4px;' });
        pill.appendChild(dot);
        
        const titleText = ev.type === 'wr' ? ev.data.title : ev.data.description;
        pill.appendChild(el('span', { class: 'week-event-title', style: 'color:#fff;', text: titleText }));
        
        badge.appendChild(pill);
        
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
      if (wr.dueDate && wr.status !== 'Cancelled') {
        addToEvents(wr.dueDate, 'wr', wr);
      }
    });

    disbursements.forEach(d => {
      if (['Submitted', 'Under Review', 'Approved', 'Released', 'Paid'].includes(d.status)) {
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
        
        // Show remaining incomplete tasks for logged in staff
        const myTasks = DB.getWhere('tasks', t => t.workRequestId === item.id && t.assigneeId === Auth.user.id && t.status !== 'Completed');
        if (myTasks.length > 0) {
          const taskWrap = el('div', { class: 'detail-desc', style: 'border-left-color: var(--color-warning);' });
          taskWrap.appendChild(el('strong', { text: `My Incomplete Tasks (${myTasks.length}):` }));
          const ul = el('ul', { style: 'margin: 4px 0 0 16px; padding: 0;' });
          myTasks.forEach(t => {
            ul.appendChild(el('li', { text: t.title }));
          });
          taskWrap.appendChild(ul);
          details.appendChild(taskWrap);
        } else if (item.description) {
          details.appendChild(el('div', { class: 'detail-desc', text: item.description }));
        }
      } else {
        const emp = DB.getById('users', item.requestedBy || item.employeeId);
        details.appendChild(this.renderDetailRow('Entity', item.entity.toUpperCase()));
        details.appendChild(this.renderDetailRow('Category', item.category));
        details.appendChild(this.renderDetailRow('Amount', formatPHP(item.amount)));
        details.appendChild(this.renderDetailRow('Status', item.status));
        details.appendChild(this.renderDetailRow('Fund Source', item.fundSource));
        details.appendChild(this.renderDetailRow('Requested By', emp ? emp.name : '—'));
      }

      const btnText = type === 'wr' ? 'View Tasks' : 'View Disbursement';
      const viewBtn = el('button', { class: 'btn btn-primary btn-xs btn-block', style: 'margin-top:12px;', text: btnText });
      viewBtn.onclick = (e) => {
        e.stopPropagation();
        if (type === 'wr') {
          Workflow.view = 'detail';
          Workflow.detailWrId = item.id;
          // Note: The detail view in workflow natively shows the tasks list.
          location.hash = '#operations';
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
