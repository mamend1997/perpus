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
  if (!response.ok) throw new Error(body.message || 'Permintaan akun sekolah gagal.');
  return body;
}

export async function fetchSchoolProfile() {
  return schoolRequest('/profile');
}

export async function updateSchoolProfile(profile) {
  return schoolRequest('/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile)
  });
}

export async function fetchSchoolIdentity() {
  return schoolRequest('/identity');
}

export async function updateSchoolIdentity(identity) {
  return schoolRequest('/identity', {
    method: 'PATCH',
    body: JSON.stringify(identity)
  });
}

export async function changeSchoolPassword(passwords) {
  return schoolRequest('/profile/password', {
    method: 'POST',
    body: JSON.stringify(passwords)
  });
}

export async function fetchSchoolSubscription() {
  return schoolRequest('/subscription');
}

export async function createSchoolRenewal(payload) {
  return schoolRequest('/subscription/renew', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
