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

/**
 * View Mode Icons (Lucide-style, widely compatible SVGs)
 * Used across Table / Board / List toggles in all modules.
 */
const ViewIcons = {
  table: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>',
  board: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>',
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
  }

  input.addEventListener('focus', () => {
    input.select();
    open();
  });

  input.addEventListener('input', () => {
    highlightIdx = -1;
    if (!isOpen) open();
    renderList(input.value);
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
    clearBtn.style.display = hasVal ? 'flex' : 'none';
    wrapper.classList.toggle('has-value', hasVal);
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
  
  element.addEventListener('input', updateClearVisibility);
  element.addEventListener('change', updateClearVisibility);
  
  clearBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
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
