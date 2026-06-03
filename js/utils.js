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
  // If the field is inside a datepicker wrapper, target the form-group parent instead
  let container = field.parentElement;
  if (container && container.classList.contains('mdp-wrapper')) {
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
    else node.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

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
