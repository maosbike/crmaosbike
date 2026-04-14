const BASE = '/api';

// Access token en memoria — nunca en localStorage
// XSS no puede leerlo vía storage APIs (document.cookie o localStorage)
let _token = null;

export const setToken = (t) => { _token = t; };
export const clearToken = () => { _token = null; };

let _refreshing = null;

const tryRefresh = async () => {
  try {
    // El refresh token viaja como cookie httpOnly — el browser la envía automáticamente
    // credentials: 'include' es necesario para que las cookies same-site se incluyan
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const { token } = await res.json();
    _token = token; // Almacenado solo en memoria
    return true;
  } catch {
    return false;
  }
};

// Para endpoints que devuelven Blob (descarga de archivos)
const requestBlob = async (method, path) => {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'include' });
  if (!res.ok) {
    let msg = 'Error al descargar';
    try { const d = await res.json(); msg = d.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.blob();
};

const request = async (method, path, body, _retry = false) => {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const opts = { method, headers, credentials: 'include' };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) {
    delete headers['Content-Type'];
    opts.headers = _token ? { 'Authorization': `Bearer ${_token}` } : {};
    opts.body = body;
  }

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401 && !_retry) {
    // Intentar renovar silenciosamente (una sola vez, deduplicado)
    if (!_refreshing) _refreshing = tryRefresh();
    const ok = await _refreshing;
    _refreshing = null;
    if (ok) return request(method, path, body, true);
    // Refresh falló — limpiar sesión
    _token = null;
    window.location.reload();
    throw new Error('Sesión expirada');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

export const api = {
  // Auth
  login: (identifier, password) => request('POST', '/auth/login', { email: identifier, password }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),

  // Tickets
  getTickets: (params) => request('GET', `/tickets?${new URLSearchParams(params)}`),
  getTicket: (id) => request('GET', `/tickets/${id}`),
  createTicket: (data) => request('POST', '/tickets', data),
  updateTicket: (id, data) => request('PUT', `/tickets/${id}`, data),
  addTimeline: (id, data) => request('POST', `/tickets/${id}/timeline`, data),
  addEvidence: (id, formData) => request('POST', `/tickets/${id}/evidence`, formData),
  dashboardStats: () => request('GET', '/tickets/stats/dashboard'),

  // Inventory
  getInventory: (params) => request('GET', `/inventory?${new URLSearchParams(params || {})}`),
  getInvCounts: () => request('GET', '/inventory/counts'),
  createInventory: (data) => request('POST', '/inventory', data),
  updateInventory: (id, data) => request('PUT', `/inventory/${id}`, data),
  uploadInvPhoto: (id, file, field) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('field', field);
    return request('POST', `/inventory/${id}/photo`, fd);
  },
  importInventoryPreview: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/inventory/import/preview', fd);
  },
  importInventoryConfirm: (rows) => request('POST', '/inventory/import/confirm', { rows }),
  sellInventory: (id, data) => request('POST', `/inventory/${id}/sell`, data),
  getInventoryHistory: (id) => request('GET', `/inventory/${id}/history`),
  reorderInventory: (items) => request('PUT', '/inventory/reorder', { items }),
  deleteInventory: (id) => request('DELETE', `/inventory/${id}`),
  uploadBranchPhoto: (id, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request('POST', `/catalog/branches/${id}/photo`, fd);
  },
  exportInventory: (params) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return requestBlob('GET', `/inventory/export${qs}`);
  },

  // Catalog
  getModels: (params) => request('GET', `/catalog/models?${new URLSearchParams(params || {})}`),
  getCategories: () => request('GET', '/catalog/categories'),
  renameCategory: (from, to) => request('PATCH', '/catalog/categories/rename', { from, to }),
  getBrands: () => request('GET', '/catalog/brands'),
  createModel: (data) => request('POST', '/catalog/models', data),
  updateModel: (id, data) => request('PATCH', `/catalog/models/${id}`, data),
  deleteModel: (id) => request('DELETE', `/catalog/models/${id}`),
  uploadModelImage: (id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    return request('POST', `/catalog/models/${id}/image`, fd);
  },
  addModelGalleryPhoto: (id, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request('POST', `/catalog/models/${id}/gallery`, fd);
  },
  removeModelGalleryPhoto: (id, url) =>
    request('DELETE', `/catalog/models/${id}/gallery`, { url }),
  uploadModelSpec: (id, file) => {
    const fd = new FormData();
    fd.append('pdf', file);
    return request('POST', `/catalog/models/${id}/spec`, fd);
  },
  uploadColorPhoto: (id, color, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('color', color);
    return request('POST', `/catalog/models/${id}/color-photo`, fd);
  },
  removeColorPhoto: (id, color) =>
    request('DELETE', `/catalog/models/${id}/color-photo`, { color }),

  // Other
  getBranches: () => request('GET', '/catalog/branches'),
  getUsers: (params) => request('GET', `/catalog/users?${new URLSearchParams(params || {})}`),
  getSellers: () => request('GET', '/catalog/sellers'),

  // Users management
  changePassword: (current_password, new_password, confirm_password) =>
    request('PUT', '/users/change-password', { current_password, new_password, confirm_password }),
  listUsers: () => request('GET', '/users'),
  createUser: (data) => request('POST', '/users', data),
  editUser: (id, data) => request('PUT', `/users/${id}`, data),
  resetPassword: (id) =>
    request('PUT', `/users/${id}/reset-password`),
  getUserActiveTickets: (id) => request('GET', `/users/${id}/active-tickets`),
  deactivateUser: (id, data) => request('POST', `/users/${id}/deactivate`, data || {}),

  // Notificaciones
  getNotifications: (params) => request('GET', `/notifications?${new URLSearchParams(params || {})}`),
  getUnreadCount: () => request('GET', '/notifications/unread-count'),
  markRead: (id) => request('PUT', `/notifications/${id}/read`),
  markAllRead: () => request('PUT', '/notifications/read-all'),

  // Recordatorios
  getReminders: (params) => request('GET', `/reminders?${new URLSearchParams(params || {})}`),
  getReminder: (id) => request('GET', `/reminders/${id}`),
  createReminder: (data) => request('POST', '/reminders', data),
  updateReminder: (id, data) => request('PUT', `/reminders/${id}`, data),
  completeReminder: (id) => request('PUT', `/reminders/${id}/complete`),
  deleteReminder: (id) => request('DELETE', `/reminders/${id}`),

  // Calendario
  getCalendarEvents: (params) => request('GET', `/calendar/events?${new URLSearchParams(params || {})}`),

  // Reasignaciones
  getReassignments: (ticketId) => request('GET', `/reassignments/ticket/${ticketId}`),
  getReassignmentLog: (params) => request('GET', `/reassignments?${new URLSearchParams(params || {})}`),
  manualReassign: (data) => request('POST', '/reassignments/manual', data),

  // Dashboard comercial
  getCommercialStats: () => request('GET', '/dashboard/commercial'),

  // Reportes
  getReports: (params) => request('GET', `/reports?${new URLSearchParams(params || {})}`),

  // Admin
  resetDemoData: () => request('DELETE', '/admin/reset-data'),
  resetImports: () => request('DELETE', '/admin/reset-imports'),
  resetCatalog: () => request('DELETE', '/admin/reset-catalog'),

  // ── Nuevo flujo: importación CSV/Excel con staging (super_admin) ──────────
  uploadPriceFile: (formData) => {
    return fetch(`${BASE}/priceimport/upload`, {
      method: 'POST',
      headers: _token ? { Authorization: `Bearer ${_token}` } : {},
      credentials: 'include',
      body: formData,
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al subir archivo');
      return data;
    });
  },
  getPriceBatches: () => request('GET', '/priceimport/batches'),
  getPriceBatch:   (id) => request('GET', `/priceimport/batches/${id}`),
  updatePriceRow:  (id, data) => request('PATCH', `/priceimport/rows/${id}`, data),
  rejectPriceRow:  (id) => request('DELETE', `/priceimport/rows/${id}`),
  publishPriceBatch: (id, rowIds) => request('POST', `/priceimport/batches/${id}/publish`, { row_ids: rowIds || [] }),
  deletePriceBatch: (id) => request('DELETE', `/priceimport/batches/${id}`),
  getPriceTemplate: () => `${BASE}/priceimport/template`,

  // Importación masiva (solo super_admin)
  importPreview: (formData) => {
    return fetch(`${BASE}/import/preview`, {
      method: 'POST',
      headers: _token ? { Authorization: `Bearer ${_token}` } : {},
      credentials: 'include',
      body: formData,
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error en preview');
      return data;
    });
  },
  importConfirm: (data)   => request('POST', '/import/confirm', data),
  getImportLogs: ()       => request('GET',  '/import/logs'),
  getImportTemplate: ()   => `${BASE}/import/template`,

  // Model aliases
  getAliases:    ()     => request('GET',    '/catalog/aliases'),
  createAlias:   (data) => request('POST',   '/catalog/aliases', data),
  deleteAlias:   (id)   => request('DELETE', `/catalog/aliases/${id}`),

  // Ventas
  getSales:       (params) => request('GET',   `/sales?${new URLSearchParams(params || {})}`),
  getSalesStats:  (params) => request('GET',   `/sales/stats?${new URLSearchParams(params || {})}`),
  getSale:        (id)     => request('GET',   `/sales/${id}`),
  createSale:     (data)   => request('POST',  '/sales', data),
  updateSale:     (id, data) => request('PATCH', `/sales/${id}`, data),
  uploadSaleDoc:  (id, field, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('field', field);
    return request('POST', `/sales/${id}/doc`, fd);
  },
  deleteSale: (id, isNote) => request('DELETE', `/sales/${id}${isNote ? '?note=1' : ''}`),

  // Pagos a proveedor
  extractSupplierPayment: (invoiceFile, receiptFile) => {
    const fd = new FormData();
    if (invoiceFile) fd.append('invoice', invoiceFile);
    if (receiptFile) fd.append('receipt', receiptFile);
    return request('POST', '/supplier-payments/extract', fd);
  },
  getSupplierPayments: (params) => request('GET', `/supplier-payments?${new URLSearchParams(params || {})}`),
  getSupplierPayment:  (id) => request('GET', `/supplier-payments/${id}`),
  createSupplierPayment: (data) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k,v]) => { if (v !== null && v !== undefined && v !== '') fd.append(k, v); });
    return request('POST', '/supplier-payments', fd);
  },
  updateSupplierPayment: (id, data) => request('PATCH', `/supplier-payments/${id}`, data),
  deleteSupplierPayment: (id) => request('DELETE', `/supplier-payments/${id}`),
  syncSupplierPaymentsFromDrive: () => request('POST', '/supplier-payments/sync-drive'),
};
