async function request(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/students/members${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan data member gagal.');
  return result;
}

export function fetchMembers({ page = 1, limit = 25, search = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  return request(`?${query}`, { signal });
}

export function fetchMemberCandidates({ search = '', rombel = '', signal } = {}) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (rombel) query.set('rombel', rombel);
  return request(`/candidates?${query}`, { signal });
}

export function addMembers(studentIds) {
  return request('', { method: 'POST', body: { studentIds } });
}

export function updateMemberCredentials(id, credentials) {
  return request(`/${encodeURIComponent(id)}/credentials`, { method: 'PATCH', body: credentials });
}
