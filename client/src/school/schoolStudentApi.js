async function request(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/students${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan data siswa gagal.');
  return result;
}

export function fetchStudents({ page = 1, limit = 25, search = '', rombel = '', status = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (rombel) query.set('rombel', rombel);
  if (status) query.set('status', status);
  return request(`?${query}`, { signal });
}

export function fetchStudentClasses(signal) {
  return request('/classes', { signal });
}

export function fetchStudentAcademicYears(signal) {
  return request('/academic-years', { signal });
}

export function fetchStudentArchives({ schoolYearId, page = 1, limit = 25, search = '', signal } = {}) {
  const query = new URLSearchParams({ schoolYearId, page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  return request(`/archives?${query}`, { signal });
}

export function createStudent(student) {
  return request('', { method: 'POST', body: student });
}

export function updateStudent(id, student) {
  return request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: student });
}

export function deleteStudent(id) {
  return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function deleteStudents(ids) {
  return request('/bulk', { method: 'DELETE', body: { ids } });
}

export function importStudents(rows) {
  return request('/import', { method: 'POST', body: { rows } });
}
