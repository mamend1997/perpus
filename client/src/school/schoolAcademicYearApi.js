async function request(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/academic-years${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan tahun pelajaran gagal.');
  return result;
}

export function fetchAcademicYears(signal) {
  return request('', { signal });
}

export function createAcademicYear(data) {
  return request('', { method: 'POST', body: data });
}

export function updateAcademicYear(id, data) {
  return request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
}

export function previewAcademicYearPromotion(signal) {
  return request('/promotion-preview', { signal });
}

export function activateAcademicYear(id) {
  return request(`/${encodeURIComponent(id)}/activate`, { method: 'PATCH' });
}

export function deleteAcademicYear(id) {
  return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
