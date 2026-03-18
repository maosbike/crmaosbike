const BASE = '/api';

const getToken = () => localStorage.getItem('crm_token');

const request = async (method, path, body) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) {
    delete headers['Content-Type'];
    if (token) opts.headers = { 'Authorization': `Bearer ${token}` };
    opts.body = body;
  }

  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.reload();
    throw new Error('Sesión expirada');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

export const api = {
  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),

  // Tickets
  getTickets: (params) => request('GET', `/tickets?${new URLSearchParams(params)}`),
  getTicket: (id) => request('GET', `/tickets/${id}`),
  createTicket: (data) => request('POST', '/tickets', data),
  updateTicket: (id, data) => request('PUT', `/tickets/${id}`, data),
  addTimeline: (id, data) => request('POST', `/tickets/${id}/timeline`, data),
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

  // Catalog
  getModels: (params) => request('GET', `/catalog/models?${new URLSearchParams(params || {})}`),
  getBrands: () => request('GET', '/catalog/brands'),
  createModel: (data) => request('POST', '/catalog/models', data),
  uploadModelImage: (id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    return request('POST', `/catalog/models/${id}/image`, fd);
  },

  // Other
  getBranches: () => request('GET', '/catalog/branches'),
  getUsers: (params) => request('GET', `/catalog/users?${new URLSearchParams(params || {})}`),
  getSellers: () => request('GET', '/catalog/sellers'),

  // Users management
  changePassword: (current_password, new_password) =>
    request('PUT', '/users/change-password', { current_password, new_password }),
  listUsers: () => request('GET', '/users'),
  createUser: (data) => request('POST', '/users', data),
  editUser: (id, data) => request('PUT', `/users/${id}`, data),
  resetPassword: (id, new_password) =>
    request('PUT', `/users/${id}/reset-password`, { new_password }),

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
};
