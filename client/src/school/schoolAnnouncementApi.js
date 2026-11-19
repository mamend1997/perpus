async function request(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/announcements${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan pengumuman gagal.');
  return result;
}

export function fetchAnnouncements({ search = '', status = '', category = '', signal } = {}) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (category) query.set('category', category);
  return request(`?${query}`, { signal });
}

export function fetchActiveAnnouncements(signal) {
  return request('/active', { signal });
}

export function dismissAnnouncement(id) {
  return request(`/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
}

export function createAnnouncement(data) {
  return request('', { method: 'POST', body: data });
}

export function updateAnnouncement(id, data) {
  return request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
}

export function deleteAnnouncement(id) {
  return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
