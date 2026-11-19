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

export async function fetchBookCatalog({
  page = 1, limit = 25, search = '',
  authorId = '', publisherId = '', agentId = '', topicId = '',
  collectionId = '', typeId = '', languageId = '', rackId = '', signal
} = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (authorId) query.set('authorId', authorId);
  if (publisherId) query.set('publisherId', publisherId);
  if (agentId) query.set('agentId', agentId);
  if (topicId) query.set('topicId', topicId);
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

export async function fetchRackTransferOptions(search = '', signal) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  return requestBookApi(`/rack-transfers/options?${query}`, { signal });
}

export function createRackTransfer(data) {
  return requestBookApi('/rack-transfers', { method: 'POST', body: data });
}

export async function fetchRackTransferHistory(signal) {
  const result = await requestBookApi('/rack-transfers/history', { signal });
  return result.transfers || [];
}

export function addBookStock(bookId, quantity, note, stockDate) {
  return requestBookApi('/stock', {
    method: 'POST',
    body: { bookId, quantity, note, stockDate }
  });
}

export async function fetchBookStockHistory({ page = 1, limit = 25, signal } = {}) {
  return requestBookApi(`/stock/history?${new URLSearchParams({ page: String(page), limit: String(limit) })}`, { signal });
}

export async function searchDestructibleBooks(search, signal) {
  const query = new URLSearchParams({ search });
  return requestBookApi(`/destructions/books?${query}`, { signal });
}

export async function fetchBookDestructionRacks(bookId, signal) {
  const query = new URLSearchParams({ bookId: String(bookId) });
  return requestBookApi(`/destructions/racks?${query}`, { signal });
}

export async function fetchBookDestructionHistory({ page = 1, limit = 25, signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return requestBookApi(`/destructions/history?${query}`, { signal });
}

export function createBookDestruction(destruction) {
  return requestBookApi('/destructions', { method: 'POST', body: destruction });
}

export function deleteBookDestructionHistory(destructionIds) {
  return requestBookApi('/destructions', {
    method: 'DELETE',
    body: { destructionIds }
  });
}

export async function fetchBookActivityLogs({ page = 1, limit = 25, signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return requestBookApi(`/activity-logs?${query}`, { signal });
}

export function logSchoolPageView(pageName) {
  return requestBookApi('/activity-logs/page-view', {
    method: 'POST',
    body: { pageName }
  });
}

export function updateBookStockMovement(id, movement) {
  return requestBookApi(`/stock/history/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: movement
  });
}

export function deleteBookStockMovements(movementIds) {
  return requestBookApi('/stock/history', {
    method: 'DELETE',
    body: { movementIds }
  });
}

export async function searchBookItemsBooks(search, signal) {
  const query = new URLSearchParams({ search });
  const result = await requestBookApi(`/items/books?${query}`, { signal });
  return result.books || [];
}

export function fetchBookItems({ page = 1, limit = 25, search = '', sort = 'serial', direction = 'asc', status = '', bookId = '', signal } = {}) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
    direction
  });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  if (bookId) query.set('bookId', bookId);
  return requestBookApi(`/items?${query}`, { signal });
}

export function updateBookItem(id, item) {
  return requestBookApi(`/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: item
  });
}

export function updateBookItemCondition(id, condition) {
  return requestBookApi(`/items/${encodeURIComponent(id)}/condition`, {
    method: 'PATCH',
    body: { condition }
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
