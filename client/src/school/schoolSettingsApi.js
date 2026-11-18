async function schoolRequest(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const response = await fetch(`/api/school${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Permintaan pengaturan sekolah gagal.');
  return body;
}

export async function fetchSchoolUsers() {
  return schoolRequest('/users');
}

export async function fetchMySchoolPermissions() {
  return schoolRequest('/permissions/me');
}

export async function createSchoolUser(user) {
  return schoolRequest('/users', {
    method: 'POST',
    body: JSON.stringify(user)
  });
}

export async function updateSchoolUser(id, user) {
  return schoolRequest(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(user)
  });
}

export async function deleteSchoolUser(id) {
  return schoolRequest(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchRolePermissions(role) {
  return schoolRequest(`/permissions/${encodeURIComponent(role)}`);
}

export async function saveRolePermissions(role, permissions) {
  return schoolRequest(`/permissions/${encodeURIComponent(role)}`, {
    method: 'PUT',
    body: JSON.stringify({ permissions })
  });
}

export async function fetchLibrarySettings() {
  return schoolRequest('/settings/library');
}

export async function saveLibrarySettings(settings) {
  return schoolRequest('/settings/library', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}

export async function fetchMobileNavbarSettings() {
  return schoolRequest('/settings/mobile-navbar');
}

export async function saveMobileNavbarSettings(settings) {
  return schoolRequest('/settings/mobile-navbar', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}
