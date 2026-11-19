async function requestMasterData(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const response = await fetch(`/api/school/master-categories${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Permintaan Master Data gagal.');
  return body;
}

export async function fetchMasterCategories(type, signal) {
  const query = new URLSearchParams({ type });
  const result = await requestMasterData(`?${query}`, { signal });
  if (!Array.isArray(result.categories)) {
    throw new Error('Respons data Master Data tidak valid. Muat ulang halaman atau coba lagi.');
  }
  return result.categories;
}

export function saveMasterCategory(type, category, id) {
  const options = {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify({ ...category, type })
  };
  return requestMasterData(id ? `/${encodeURIComponent(id)}` : '', options);
}

export function importMasterCategories(type, rows) {
  return requestMasterData('/import', {
    method: 'POST',
    body: JSON.stringify({ type, rows })
  });
}

export function deleteMasterCategories(type, ids) {
  return requestMasterData('', {
    method: 'DELETE',
    body: JSON.stringify({ type, ids })
  });
}
