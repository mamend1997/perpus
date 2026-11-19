async function requestProcurementApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api/school/procurements${path}`, {
    ...options,
    headers,
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan pengadaan buku gagal.');
  return result;
}

export function fetchProcurements({ page = 1, limit = 10, search = '', status = '', sort = 'date', direction = 'desc', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), sort, direction });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return requestProcurementApi(`?${query}`, { signal });
}

export function createProcurement(proposal) {
  return requestProcurementApi('', { method: 'POST', body: proposal });
}

export function searchProcurementBooks(search, signal) {
  const query = new URLSearchParams({ search });
  return requestProcurementApi(`/books?${query}`, { signal });
}

export function updateProcurement(id, changes) {
  return requestProcurementApi(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes
  });
}

export function deleteProcurements(ids) {
  return requestProcurementApi('/bulk', {
    method: 'DELETE',
    body: { ids }
  });
}
