import { useEffect, useState } from 'react';
import { Activity, BookOpen, CalendarDays, ClipboardList, RefreshCw, Users } from 'lucide-react';
import { fetchSchoolDashboard } from './schoolApi.js';

const number = (value) => new Intl.NumberFormat('id-ID').format(value || 0);

const statCards = [
  { key: 'visitors', label: 'Total Pengunjung', icon: Users, tone: 'blue' },
  { key: 'activeBooks', label: 'Total Buku Aktif', icon: BookOpen, tone: 'orange' },
  { key: 'activeLoans', label: 'Peminjaman Berjalan', icon: Activity, tone: 'violet' },
  { key: 'pendingProcurements', label: 'Pengajuan Pending', icon: ClipboardList, tone: 'green' }
];

function packageLabel(value) {
  const labels = { trial: 'Uji coba', basic: 'Basic', premium: 'Premium', lifetime: 'Lifetime' };
  return labels[value] || value || 'Belum diatur';
}

export default function SchoolDashboard({ account }) {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('school-token');
    if (!token) {
      setError('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
      return () => controller.abort();
    }

    setError('');
    fetchSchoolDashboard(token, controller.signal)
      .then(setDashboard)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });

    return () => controller.abort();
  }, [retry]);

  const schoolName = dashboard?.school?.name || account.school?.name || 'Sekolah';
  const recentProcurements = dashboard?.recentProcurements || [];
  const categories = dashboard?.availabilityByCategory || [];
  const maxCategoryItems = Math.max(1, ...categories.map((category) => category.total_items || 0));

  return (
    <div className="library-dashboard">
      <section className="library-welcome">
        <div>
          <span className="library-eyebrow"><i /> DASHBOARD PERPUSTAKAAN</span>
          <h1>Selamat datang, {account.name}</h1>
          <p>Ringkasan koleksi dan aktivitas perpustakaan {schoolName}.</p>
        </div>
        <div className="library-subscription">
          <span>Status langganan</span>
          <b>{packageLabel(dashboard?.school?.packageType || account.school?.packageType)}</b>
          <small>{dashboard?.school?.status || account.school?.status || 'Aktif'}</small>
        </div>
      </section>

      {error && (
        <div className="library-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} /> Coba lagi</button>
        </div>
      )}

      <section className="library-stat-grid" aria-label="Statistik perpustakaan">
        {statCards.map(({ key, label, icon: Icon, tone }) => (
          <article className={`library-stat-card ${tone}`} key={key}>
            <span className="library-stat-icon"><Icon size={18} /></span>
            <div><small>{label}</small><b>{dashboard ? number(dashboard.stats[key]) : '—'}</b></div>
          </article>
        ))}
      </section>

      <section className="library-dashboard-grid">
        <article className="library-panel">
          <div className="library-panel-heading">
            <div><span className="library-eyebrow">PENGADAAN</span><h2>Usulan buku terbaru</h2></div>
            <ClipboardList size={18} />
          </div>
          {recentProcurements.length ? (
            <div className="library-list">
              {recentProcurements.map((request) => (
                <div className="library-list-row" key={request.id}>
                  <span className="library-book-icon"><BookOpen size={16} /></span>
                  <div><b>{request.title}</b><small>{request.requester} · {request.request_date}</small></div>
                  <span className={`library-status ${request.status === 'Pending' ? 'pending' : 'complete'}`}>{request.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="library-empty">{dashboard ? 'Belum ada usulan pengadaan buku.' : 'Memuat usulan terbaru...'}</div>
          )}
        </article>

        <article className="library-panel">
          <div className="library-panel-heading">
            <div><span className="library-eyebrow">INVENTARIS</span><h2>Ketersediaan per koleksi</h2></div>
            <CalendarDays size={18} />
          </div>
          {categories.length ? (
            <div className="library-category-chart">
              {categories.map((category) => (
                <div className="library-category-row" key={category.id}>
                  <div><b>{category.name}</b><small>{number(category.available_items)} tersedia dari {number(category.total_items)}</small></div>
                  <span className="library-category-track"><i style={{ width: `${Math.min(100, (category.total_items / maxCategoryItems) * 100)}%` }} /></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="library-empty">{dashboard ? 'Tambahkan kategori koleksi dan eksemplar untuk melihat grafik.' : 'Memuat ketersediaan koleksi...'}</div>
          )}
        </article>
      </section>

      <p className="library-dashboard-footnote"><Activity size={13} /> Statistik diperbarui setiap kali dashboard dimuat.</p>
    </div>
  );
}
