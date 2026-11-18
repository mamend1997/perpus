export async function fetchCirculationAnalytics({ startDate, endDate, signal }) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');

  const query = new URLSearchParams({ startDate, endDate });
  const response = await fetch(`/api/school/circulation/analytics?${query}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Analitik sirkulasi gagal dimuat.');
  return result;
}
