async function requestReviewsApi(path, options = {}) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/reviews${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Permintaan ulasan gagal.');
  return result;
}

export function fetchReviews({ page = 1, limit = 25, search = '', rating = '', bookId = '', signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (rating) query.set('rating', rating);
  if (bookId) query.set('bookId', bookId);
  return requestReviewsApi(`?${query}`, { signal });
}

export function fetchEligibleReviewBooks(search = '', signal) {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  return requestReviewsApi(`/eligible-books?${query}`, { signal });
}

export function createReview({ bookId, rating, review }) {
  return requestReviewsApi('', { method: 'POST', body: { bookId, rating, review } });
}

export function deleteReview(id) {
  return requestReviewsApi(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function deleteReviews(ids) {
  return requestReviewsApi('/bulk', { method: 'DELETE', body: { ids } });
}
