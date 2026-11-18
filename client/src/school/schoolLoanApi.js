async function requestLoanApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const response = await fetch(`/api/school/loans${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan peminjaman gagal.');
  return result;
}

export function fetchLoans({ page = 1, limit = 25, search = '', status = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return requestLoanApi(`?${query}`, { signal });
}

export function fetchFines({ page = 1, limit = 25, search = '', status = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return requestLoanApi(`/fines?${query}`, { signal });
}

export function updateFinePerDay(finePerDay) {
  return requestLoanApi('/fines/rule', { method: 'PUT', body: { finePerDay } });
}

export async function searchLoanMembers(search, signal) {
  const query = new URLSearchParams({ search });
  const result = await requestLoanApi(`/members?${query}`, { signal });
  return result.members || [];
}

export async function searchLoanItems(search, signal) {
  const query = new URLSearchParams({ search });
  const result = await requestLoanApi(`/items?${query}`, { signal });
  return result.items || [];
}

export function createLoan(loan) {
  return requestLoanApi('', { method: 'POST', body: loan });
}

export function updateLoanStatus(id, status) {
  return requestLoanApi(`/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
}

export function returnLoan(id) {
  return requestLoanApi(`/${encodeURIComponent(id)}/return`, { method: 'POST' });
}

export function updateLoanFineStatus(id, status, note = '') {
  return requestLoanApi(`/${encodeURIComponent(id)}/fine-status`, { method: 'PATCH', body: { status, note } });
}
