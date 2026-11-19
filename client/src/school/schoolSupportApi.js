async function requestSupportApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api/school/support${path}`, { ...options, headers, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan bantuan gagal.');
  return result;
}

export async function fetchSchoolSupportTickets({ page = 1, limit = 20, signal } = {}) {
  return requestSupportApi(`/tickets?${new URLSearchParams({ page: String(page), limit: String(limit) })}`, { signal });
}

export function fetchSchoolSupportTicket(id, signal) {
  return requestSupportApi(`/tickets/${encodeURIComponent(id)}`, { signal });
}

export function createSchoolSupportTicket(ticket) {
  return requestSupportApi('/tickets', { method: 'POST', body: ticket });
}

export function replyToSchoolSupportTicket(id, message) {
  return requestSupportApi(`/tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: { message }
  });
}
