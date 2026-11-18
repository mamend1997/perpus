async function requestBookApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api/school/books${path}`, {
    ...options,
    headers,
    body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan katalog buku gagal.');
  return result;
}

export async function fetchBookCatalog({ page = 1, limit = 25, search = '', collectionId = '', typeId = '', languageId = '', rackId = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (collectionId) query.set('collectionId', collectionId);
  if (typeId) query.set('typeId', typeId);
  if (languageId) query.set('languageId', languageId);
  if (rackId) query.set('rackId', rackId);
  return requestBookApi(`?${query}`, { signal });
}

export async function fetchBookCatalogMeta(signal) {
  return requestBookApi('/meta', { signal });
}

export async function searchStockBooks(search, signal) {
  const query = new URLSearchParams({ search });
  return requestBookApi(`/stock/books?${query}`, { signal });
}

export async function findStockBookByBarcode(barcode, signal) {
  const query = new URLSearchParams({ barcode });
  return requestBookApi(`/stock/books?${query}`, { signal });
}

export function addBookStock(bookId, quantity, note, stockDate) {
  return requestBookApi('/stock', {
    method: 'POST',
    body: { bookId, quantity, note, stockDate }
  });
}

export function fetchBookItems({ page = 1, limit = 25, search = '', sort = 'serial', direction = 'asc', status = '', signal } = {}) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    direction
  });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return requestBookApi(`/items?${query}`, { signal });
}

export function updateBookItem(id, item) {
  return requestBookApi(`/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: item
  });
}

export function deleteBookItem(id) {
  return requestBookApi(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchBook(id, signal) {
  return requestBookApi(`/${encodeURIComponent(id)}`, { signal });
}

export function saveBook(formData, id) {
  return requestBookApi(id ? `/${encodeURIComponent(id)}` : '', {
    method: id ? 'PATCH' : 'POST',
    body: formData
  });
}

export function importBooks(rows) {
  return requestBookApi('/import', {
    method: 'POST',
    body: { rows }
  });
}

export function deleteBooks(ids) {
  return requestBookApi('', {
    method: 'DELETE',
    body: { ids }
  });
}
