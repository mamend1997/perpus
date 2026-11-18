export async function fetchSchoolDashboard(token, signal) {
  const response = await fetch('/api/school/dashboard', {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Ringkasan perpustakaan gagal dimuat.');
  }
  return body;
}
