async function publicRequest(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Portal publik tidak dapat dimuat.');
  return body;
}

export function fetchPublicSchool(schoolCode, signal) {
  return publicRequest(`/api/public/library/${encodeURIComponent(schoolCode)}`, { signal });
}

export function searchPublicBooks(schoolCode, { barcode = '', search = '' }, signal) {
  const query = new URLSearchParams();
  if (barcode) query.set('barcode', barcode);
  if (search) query.set('search', search);
  return publicRequest(`/api/public/library/${encodeURIComponent(schoolCode)}/books?${query}`, { signal });
}

export function loginPublicMember(schoolCode, identifier, password) {
  return publicRequest('/api/auth/school/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode, identifier, password })
  });
}
