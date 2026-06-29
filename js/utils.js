/**
 * Utility Functions
 * Safe DOM builder, formatting helpers, and general utilities.
 */

function formatPHP(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function generateId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function showFieldError(field, message) {
  // If the field is inside a datepicker/timepicker wrapper, target the form-group parent instead
  let container = field.parentElement;
  if (container && (container.classList.contains('mdp-wrapper') || container.classList.contains('mtp-wrapper'))) {
    // Also show error style on the wrapper
    container.classList.add('input-error');
    container = container.parentElement;
  }
  let errorEl = container.querySelector('.field-error');
  if (!errorEl) {
    errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    container.appendChild(errorEl);
  }
  errorEl.textContent = message;
  field.classList.add('input-error');
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach(el => el.remove());
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function validateRequiredFields(form) {
  const required = form.querySelectorAll('[required]');
  let valid = true;
  clearFieldErrors(form);
  required.forEach(field => {
    if (!field.value.trim()) {
      valid = false;
      showFieldError(field, 'This field is required');
    }
  });
  return valid;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // only for static HTML in plan
    else if (k === 'disabled') node.disabled = !!v;
    else node.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

function parseHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.firstChild || document.createTextNode('');
}


/**
 * View Mode Icons (Lucide-style, widely compatible SVGs)
 * Used across Table / Board / List toggles in all modules.
 */
const ViewIcons = {
  table: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  board: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
};

const PaymentIcons = {
  'GCash':    { color: '#005CEE', bg: '#EBF3FF', label: 'GCash', svg: '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#005CEE"/><path d="M12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6c3 0 5.6-2.3 5.9-5.2h-5.9v-2h8c.1.6.1 1.2.1 1.9 0 4.2-3.4 7.3-8.1 7.3-4.5 0-8.1-3.6-8.1-8s3.6-8 8.1-8c2.2 0 4.2.8 5.7 2.3l-1.9 1.9c-1-.9-2.3-1.5-3.8-1.5z" fill="white"/></svg>' },
  'Maya':     { color: '#000000', bg: '#E5FDF0', label: 'Maya', svg: '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#000000"/><path d="M6.5 16.5V7.5h2.8l2.7 4 2.7-4h2.8v9h-2.2v-5.4l-2.4 3.1h-1.8l-2.4-3.1v5.4h-2.2z" fill="#00E84D"/></svg>' },
  'PayPal':   { color: '#1E40AF', bg: '#EFF6FF', label: 'PayPal', svg: '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#1E40AF"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">P</text></svg>' },
  'Credit Card':{ color: '#1E293B', bg: '#F8FAFC', label: 'Credit', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E293B" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
  'Debit Card': { color: '#1E293B', bg: '#F8FAFC', label: 'Debit', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E293B" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
  'Bank Transfer':{ color: '#0369A1', bg: '#E0F2FE', label: 'Bank', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0369A1" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M3 21h18M4 18h16M5 18v-6M9 18v-6M15 18v-6M19 18v-6M2 12l10-8 10 8"/></svg>' },
  'Check':    { color: '#B45309', bg: '#FEF3C7', label: 'Check', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12l3 3 5-5"/></svg>' },
  'Cash':     { color: '#15803D', bg: '#DCFCE7', label: 'Cash', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/><text x="12" y="16" text-anchor="middle" fill="#15803D" font-size="10" font-weight="bold" font-family="Arial">₱</text></svg>' },
  'Other Digital':{ color: '#64748B', bg: '#F1F5F9', label: 'Digital', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 17h.01"/></svg>' }
};

/**
 * Searchable Dropdown (Combobox)
 * Drop-in replacement for <select> in filter bars.
 * Returns a wrapper div with .value getter/setter and dispatches 'change' events.
 *
 * @param {Object} opts
 * @param {string} opts.placeholder - Placeholder text (e.g. 'All Employees')
 * @param {Array<{value:string, text:string}>} opts.options - The selectable options
 * @param {string} [opts.maxWidth] - Optional max-width CSS value
 * @returns {HTMLElement} wrapper element with .value property
 */
function createSearchableDropdown({ placeholder, options, maxWidth, allowFreeText = false, addNewLabel = null }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-dropdown';
  if (maxWidth) wrapper.style.maxWidth = maxWidth;

  let iconHtml = '';
  if (placeholder.includes('Client')) {
    iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  } else if (placeholder.includes('Employee') || placeholder.includes('Uploader')) {
    iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>';
  }

  if (iconHtml) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'searchable-dropdown-icon';
    iconSpan.innerHTML = iconHtml;
    wrapper.appendChild(iconSpan);
    wrapper.classList.add('has-icon');
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'searchable-dropdown-input';
  input.placeholder = placeholder;
  input.setAttribute('autocomplete', 'off');

  const arrow = document.createElement('span');
  arrow.className = 'searchable-dropdown-arrow';
  arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  const clearBtn = document.createElement('span');
  clearBtn.className = 'searchable-dropdown-clear';
  clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>';
  clearBtn.style.display = 'none';

  const listbox = document.createElement('div');
  listbox.className = 'searchable-dropdown-listbox';

  wrapper.appendChild(input);
  wrapper.appendChild(clearBtn);
  wrapper.appendChild(arrow);
  wrapper.appendChild(listbox);

  let selectedValue = '';
  let selectedText = '';
  let isOpen = false;
  let highlightIdx = -1;

  function renderList(filter) {
    listbox.innerHTML = '';
    const query = (filter || '').toLowerCase();
    const filtered = options.filter(o => !query || o.text.toLowerCase().includes(query));

    const trimmedFilter = (filter || '').trim();
    if (trimmedFilter) {
      const hasExactMatch = options.some(o => o.text.toLowerCase() === trimmedFilter.toLowerCase());
      if (!hasExactMatch) {
        const label = addNewLabel ? addNewLabel(trimmedFilter) : trimmedFilter;
        filtered.push({ value: trimmedFilter, text: trimmedFilter, itemLabel: label });
      }
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'searchable-dropdown-empty';
      empty.textContent = 'No results';
      listbox.appendChild(empty);
      return;
    }

    filtered.forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'searchable-dropdown-item';
      if (opt.value === selectedValue) item.classList.add('selected');
      if (i === highlightIdx) item.classList.add('highlighted');
      item.textContent = opt.itemLabel || opt.text;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur
        selectOption(opt.value, opt.text);
        close();
      });
      item.addEventListener('mouseenter', () => {
        highlightIdx = i;
        listbox.querySelectorAll('.searchable-dropdown-item').forEach((el, j) => {
          el.classList.toggle('highlighted', j === i);
        });
      });
      listbox.appendChild(item);
    });
  }

  function selectOption(val, text) {
    const changed = selectedValue !== val;
    selectedValue = val;
    selectedText = text;
    input.value = val ? text : '';
    input.title = input.value || placeholder || '';
    clearBtn.style.display = val ? 'flex' : 'none';
    if (changed) {
      wrapper.dispatchEvent(new Event('change', { bubbles: true }));
      wrapper.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    highlightIdx = -1;
    wrapper.classList.add('open');
    renderList(selectedValue ? '' : input.value);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    wrapper.classList.remove('open');
    // Restore display text
    if (allowFreeText && !selectedValue && input.value.trim()) {
      selectedValue = input.value.trim();
      selectedText = selectedValue;
    }
    input.value = selectedValue ? selectedText : '';
    clearBtn.style.display = input.value ? 'flex' : 'none';
  }

  input.addEventListener('focus', () => {
    input.select();
    open();
  });

  input.addEventListener('input', () => {
    highlightIdx = -1;
    if (!isOpen) open();
    renderList(input.value);
    clearBtn.style.display = input.value ? 'flex' : 'none';
    wrapper.dispatchEvent(new Event('input', { bubbles: true }));
  });

  input.addEventListener('blur', () => {
    close();
  });

  input.addEventListener('keydown', (e) => {
    const items = listbox.querySelectorAll('.searchable-dropdown-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { open(); return; }
      highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === highlightIdx));
      if (items[highlightIdx]) items[highlightIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === highlightIdx));
      if (items[highlightIdx]) items[highlightIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < items.length) {
        items[highlightIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } else if (items.length > 0) {
        items[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });

  clearBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectOption('', '');
    close();
  });

  arrow.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (isOpen) { close(); input.blur(); }
    else { input.focus(); if (!isOpen) open(); }
  });

  // Close when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!wrapper.contains(e.target)) close();
  });

  // Expose .value as getter/setter for drop-in compatibility with <select>
  Object.defineProperty(wrapper, 'value', {
    get() { return selectedValue; },
    set(val) {
      if (val === '' || val == null) {
        selectedValue = '';
        selectedText = '';
        input.value = '';
      } else {
        const match = options.find(o => o.value === val);
        selectedValue = val;
        selectedText = match ? match.text : val;
        input.value = selectedText;
      }
      input.title = input.value || placeholder || '';
      clearBtn.style.display = val ? 'flex' : 'none';
    }
  });

  Object.defineProperty(wrapper, 'searchText', {
    get() { return input.value; }
  });

  // Expose addEventListener on wrapper (already works since it's a div)
  return wrapper;
}

/**
 * Wraps a standard input or select element with a relative container
 * and appends a clear button (SVG cancel icon) that resets its value.
 * Toggles the visibility of the clear button based on whether the field has a value.
 *
 * @param {HTMLElement} element - The select or input element to wrap
 * @param {function} [onClear] - Optional callback triggered when the field is cleared
 * @returns {HTMLElement} The wrapper element containing the select/input and the clear button
 */
function wrapFilterFieldWithClear(element, onClear) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filter-field-wrapper';
  
  let iconHtml = '';
  if (element.tagName === 'SELECT') {
    const text = element.options[0]?.text || '';
    if (text.includes('Work Request')) {
      iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>';
    } else if (text.includes('Status')) {
      iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (text.includes('Priority')) {
      iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (text.includes('Fund')) {
      iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>';
    } else if (text.includes('User')) {
      iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
  }

  if (iconHtml) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'filter-field-icon';
    iconSpan.innerHTML = iconHtml;
    wrapper.appendChild(iconSpan);
    wrapper.classList.add('has-icon');
  }

  if (element.style.maxWidth) wrapper.style.maxWidth = element.style.maxWidth;
  
  if (element.parentNode) {
    element.parentNode.insertBefore(wrapper, element);
  }
  wrapper.appendChild(element);
  
  const clearBtn = document.createElement('span');
  clearBtn.className = 'filter-field-clear';
  clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>';
  clearBtn.style.display = 'none';
  wrapper.appendChild(clearBtn);
  
  function updateClearVisibility() {
    const hasVal = !!element.value;
    const isVisible = hasVal && !element.disabled;
    clearBtn.style.display = isVisible ? 'flex' : 'none';
    wrapper.classList.toggle('has-value', isVisible);
  }
  
  // Intercept the setter on the element's value property so programmatic changes update the button
  let proto = Object.getPrototypeOf(element);
  let descriptor = null;
  while (proto) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor) break;
    proto = Object.getPrototypeOf(proto);
  }
  
  if (descriptor && descriptor.set) {
    Object.defineProperty(element, 'value', {
      get() {
        return descriptor.get.call(element);
      },
      set(val) {
        descriptor.set.call(element, val);
        updateClearVisibility();
      },
      configurable: true
    });
  }

  // Intercept the setter on the element's disabled property so programmatic changes update the button
  let disabledProto = Object.getPrototypeOf(element);
  let disabledDescriptor = null;
  while (disabledProto) {
    disabledDescriptor = Object.getOwnPropertyDescriptor(disabledProto, 'disabled');
    if (disabledDescriptor) break;
    disabledProto = Object.getPrototypeOf(disabledProto);
  }
  
  if (disabledDescriptor && disabledDescriptor.set) {
    Object.defineProperty(element, 'disabled', {
      get() {
        return disabledDescriptor.get.call(element);
      },
      set(val) {
        disabledDescriptor.set.call(element, val);
        updateClearVisibility();
      },
      configurable: true
    });
  }
  
  element.addEventListener('input', updateClearVisibility);
  element.addEventListener('change', updateClearVisibility);
  
  clearBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (element.disabled) return;
    element.value = '';
    updateClearVisibility();
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    if (onClear) onClear();
  });
  
  // Initial check
  updateClearVisibility();
  
  // Expose value on wrapper for direct setting
  Object.defineProperty(wrapper, 'value', {
    get() { return element.value; },
    set(val) {
      element.value = val;
      updateClearVisibility();
    }
  });

  return wrapper;
}

function getChecklistItemTotalHours(item) {
  return (item.timeLogs || []).reduce((sum, log) => sum + (log.hours || 0), 0);
}

function getTaskTotalHours(task) {
  const taskLogs = (task.timeLogs || []).reduce((sum, log) => sum + (log.hours || 0), 0);
  const checklistLogs = (task.checklist || []).reduce((sum, item) => sum + getChecklistItemTotalHours(item), 0);
  return taskLogs + checklistLogs;
}

function isChecklistBlocked(item, checklist) {
  if (!item.dependsOn) return false;
  if (item.dependsOn === '*') {
    return (checklist || []).some(c => c.id !== item.id && !c.completed);
  }
  const prereq = (checklist || []).find(c => c.id === item.dependsOn);
  return !prereq || !prereq.completed;
}

function getIncompleteChecklistNames(task) {
  return (task.checklist || [])
    .filter(item => !item.completed && !isChecklistBlocked(item, task.checklist))
    .map(item => item.text);
}

function getTaskChecklistCompletion(task) {
  const list = task.checklist || [];
  const done = list.filter(i => i.completed).length;
  return { done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
}

/**
 * Return all distinct assignee names for a task: primary assigneeName plus
 * any coAssignees, falling back to resolving the registered user name from
 * assigneeId / assignedTo when no explicit name is stored.
 */
function getTaskAllAssigneeNames(task) {
  const names = new Set();
  if (task.assigneeName) names.add(task.assigneeName);
  (task.coAssignees || []).forEach(n => { if (n) names.add(n); });
  if (!task.assigneeName && (task.assigneeId || task.assignedTo)) {
    const u = DB.getById('users', task.assigneeId || task.assignedTo);
    if (u?.name) names.add(u.name);
  }
  return Array.from(names);
}

function manilaToday() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).toISOString().slice(0, 10);
}

class SidePane {
  constructor() {
    this.overlay = null;
    this.pane = null;
    this.body = null;
    this.activeElement = null;
    this.onCloseCallback = null;
    this.onExpandCallback = null;
    this.init();
  }

  init() {
    let overlay = document.getElementById('global-side-pane-overlay');
    let pane = document.getElementById('global-side-pane');
    
    if (!overlay) {
      overlay = el('div', { id: 'global-side-pane-overlay', class: 'side-pane-overlay' });
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => this.close());
    }
    
    if (!pane) {
      pane = el('div', { id: 'global-side-pane', class: 'side-pane' });
      document.body.appendChild(pane);
    }
    
    this.overlay = overlay;
    this.pane = pane;
    
    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Close when clicking outside (since overlay is hidden/non-blocking)
    document.addEventListener('click', (e) => {
      if (this.isOpen()) {
        let path = e.composedPath ? e.composedPath() : null;
        if (!path) {
          path = [];
          let currentEl = e.target;
          while (currentEl) {
            path.push(currentEl);
            currentEl = currentEl.parentNode;
          }
          path.push(document);
          path.push(window);
        }
        const clickedTrigger = path.some(el => {
          if (!el || !el.classList) return false;
          return el.classList.contains('board-card') ||
                 el.classList.contains('list-item') ||
                 el.classList.contains('task-row') ||
                 el.classList.contains('status-select') ||
                 el.classList.contains('modal-overlay') ||
                 el.classList.contains('modal') ||
                 el.classList.contains('searchable-dropdown') ||
                 el.classList.contains('mdp-wrapper') ||
                 el.classList.contains('mtp-wrapper') ||
                 el.classList.contains('mdp-overlay') ||
                 el.classList.contains('mtp-overlay') ||
                 el.classList.contains('sidebar') ||
                 el.classList.contains('sidebar-collapse-btn') ||
                 el.classList.contains('notion-embed-popover');
        });
        const clickedInsidePane = path.some(el => el === this.pane);
        if (!clickedInsidePane && !clickedTrigger) {
          this.close();
        }
      }
    });
  }

  isOpen() {
    return this.pane && this.pane.classList.contains('open');
  }

  open({ title, content, onClose, onExpand, triggerElement }) {
    this.close(); // Close any currently open pane first (clears active classes)
    
    this.onCloseCallback = onClose;
    this.onExpandCallback = onExpand;
    this.activeElement = triggerElement;
    
    if (this.activeElement) {
      this.activeElement.classList.add('side-pane-active');
    }
    
    this.pane.innerHTML = '';
    
    // Header
    const headerLeft = el('div', { class: 'side-pane-header-left', style: 'display: flex; align-items: center; gap: 4px;' });
    
    // Close button (Notion-style double chevron right >>)
    const closeBtn = el('button', { 
      class: 'side-pane-close-btn', 
      title: 'Close',
      html: '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"/></svg>'
    });
    closeBtn.addEventListener('click', () => this.close());
    headerLeft.appendChild(closeBtn);
    
    // Expand button (diagonal resize icon next to Close)
    if (onExpand) {
      const expandBtn = el('button', { 
        class: 'side-pane-expand-btn', 
        title: 'Open as full page',
        html: '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'
      });
      expandBtn.addEventListener('click', () => {
        this.close();
        onExpand();
      });
      headerLeft.appendChild(expandBtn);
    }
    
    const header = el('div', { class: 'side-pane-header' }, [headerLeft]);
    this.pane.appendChild(header);
    
    // Body
    this.body = el('div', { class: 'side-pane-body' });
    if (content) {
      if (typeof content === 'string') {
        this.body.innerHTML = content;
      } else {
        this.body.appendChild(content);
      }
    }
    this.pane.appendChild(this.body);
    
    // Transition classes
    requestAnimationFrame(() => {
      this.overlay.classList.add('open');
      this.pane.classList.add('open');
      // Do NOT set document.body.style.overflow = 'hidden' to match Notion's scrollable canvas behavior
    });
  }

  close() {
    if (!this.isOpen()) return;
    
    if (this.overlay) this.overlay.classList.remove('open');
    if (this.pane) this.pane.classList.remove('open');
    // Do NOT reset document.body.style.overflow
    
    if (this.activeElement) {
      this.activeElement.classList.remove('side-pane-active');
      this.activeElement = null;
    }
    
    if (this.onCloseCallback) {
      const cb = this.onCloseCallback;
      this.onCloseCallback = null;
      cb();
    }
  }
}

window.SidePaneInstance = new SidePane();

/**
 * Opens a form inside the side panel with Notion-style layout:
 * Icon + Title at top, form content in body, action buttons in sticky footer.
 *
 * @param {Object} opts
 * @param {string} opts.icon - Emoji icon for the title
 * @param {string} opts.title - Panel title text
 * @param {HTMLElement} opts.formContent - The rendered form DOM (from renderForm())
 * @param {string} opts.formId - The form element's ID to find within the content
 * @param {Array<{text: string, class: string, type?: string, onClick?: Function}>} opts.actions - Footer buttons
 */
function openFormPanel({ icon, title, formContent, formId, actions }) {
  const wrapper = el('div');

  // Notion-style title section
  const titleSec = el('div', { class: 'side-pane-form-title' });
  titleSec.appendChild(el('div', { class: 'side-pane-icon', text: icon || '📝' }));
  titleSec.appendChild(el('h2', { text: title }));
  wrapper.appendChild(titleSec);

  // Form content area — wrap to hide the form's built-in header
  const contentArea = el('div', { class: 'side-pane-form-content' });
  formContent.classList.add('side-pane-form-wrapper');
  contentArea.appendChild(formContent);
  wrapper.appendChild(contentArea);

  // Sticky footer with action buttons
  if (actions && actions.length > 0) {
    const footer = el('div', { class: 'side-pane-form-footer' });
    actions.forEach(a => {
      const btn = el('button', { type: a.type || 'button', class: a.class || 'btn btn-secondary', text: a.text });
      if (a.form) btn.setAttribute('form', a.form);
      if (a.id) btn.id = a.id;
      if (a.testId) btn.setAttribute('data-testid', a.testId);
      if (a.onClick) btn.addEventListener('click', a.onClick);
      footer.appendChild(btn);
    });
    wrapper.appendChild(footer);
  }

  if (window.SidePaneInstance && typeof window.SidePaneInstance.open === 'function') {
    window.SidePaneInstance.open({ content: wrapper });
  }
}

/**
 * Safely closes the side panel (if initialized), updates the location hash,
 * and triggers global module re-routing to sync the lists underneath.
 *
 * @param {string} hash - The URL hash path to navigate to (e.g. '#billing')
 */
function closeFormPanelAndRoute(hash) {
  if (window.SidePaneInstance && typeof window.SidePaneInstance.close === 'function') {
    window.SidePaneInstance.close();
  }
  if (hash) {
    location.hash = hash;
  }
  if (window.App && typeof window.App.handleRoute === 'function') {
    window.App.handleRoute();
  }
}

