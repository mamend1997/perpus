async function request(path, signal) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`/api/school/reports?${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Laporan gagal dimuat.');
  return result;
}

export function fetchSchoolReport(filters, signal) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) query.set(key, String(value));
  });
  return request(query.toString(), signal);
}
