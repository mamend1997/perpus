async function requestReservationApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/reservations${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan booking gagal.');
  return result;
}

export function fetchReservations({ page = 1, limit = 25, search = '', status = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return requestReservationApi(`?${query}`, { signal });
}

export function searchReservationBooks(search, signal) {
  const query = new URLSearchParams({ search });
  return requestReservationApi(`/books?${query}`, { signal });
}

export function fetchReservationNotifications(signal) {
  return requestReservationApi('/notifications', { signal });
}

export function markReservationNotificationRead(id) {
  return requestReservationApi(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function createReservation({ bookId, quantity = 1, notes = '' }) {
  return requestReservationApi('', { method: 'POST', body: { bookId, quantity, notes } });
}

export function cancelReservation(id) {
  return requestReservationApi(`/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function notifyReservationReady(id) {
  return requestReservationApi(`/${encodeURIComponent(id)}/ready`, { method: 'POST' });
}

export function fulfillReservation(id) {
  return requestReservationApi(`/${encodeURIComponent(id)}/fulfill`, { method: 'POST' });
}

export function deleteReservations(ids) {
  return requestReservationApi('/bulk', { method: 'DELETE', body: { ids } });
}
