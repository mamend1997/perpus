async function requestVisitorApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const response = await fetch(`/api/school/visitors${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan buku tamu gagal.');
  return result;
}

export function fetchVisitorRecords({ page = 1, limit = 25, search = '', date = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (date) query.set('date', date);
  return requestVisitorApi(`?${query}`, { signal });
}

export async function searchVisitorMembers(search, signal) {
  const query = new URLSearchParams({ search });
  const result = await requestVisitorApi(`/members?${query}`, { signal });
  return result.members || [];
}

export function checkInVisitor(visit) {
  return requestVisitorApi('', { method: 'POST', body: visit });
}

export function deleteVisitorRecords(ids) {
  return requestVisitorApi('/bulk', { method: 'DELETE', body: { ids } });
}
