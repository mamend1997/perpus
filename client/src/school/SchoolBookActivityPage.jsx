import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchBookActivityLogs } from './schoolBookApi.js';

const pageSize = 25;

function activityDate(value, dateOnly) {
  const date = new Date(dateOnly ? `${String(value).slice(0, 10)}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      ...(dateOnly ? {} : { timeStyle: 'short' }),
      timeZone: 'Asia/Jakarta'
    }).format(date);
}

export default function SchoolBookActivityPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchBookActivityLogs({ page, limit: pageSize, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setLogs(result.logs || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);

  return (
    <div className="library-module-page book-activity-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">AUDIT PERPUSTAKAAN</span>
        <h1>Log Aktivitas</h1>
        <p>Riwayat perubahan data, login, dan halaman yang dibuka pengguna sekolah.</p>
      </header>
      {error && <div className="library-error" role="alert">{error}</div>}
      <section className="library-panel book-activity-panel">
        <div className="library-panel-heading">
          <div><span className="library-eyebrow">AKTIVITAS SEKOLAH</span><h2>Riwayat Aktivitas</h2><p>{Number(pagination.total || 0).toLocaleString('id-ID')} aktivitas</p></div>
          <Activity size={19} />
        </div>
        <div className="master-table-scroll">
          <table className="master-table">
            <thead><tr><th>No</th><th>Waktu</th><th>Aktivitas</th><th>Jenis</th><th>Endpoint</th><th>Alamat IP</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={6}>Memuat log aktivitas...</td></tr>
                : !logs.length ? <tr><td className="master-empty-cell" colSpan={6}>Belum ada aktivitas tercatat.</td></tr>
                  : logs.map((log, index) => <tr key={log.id}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{activityDate(log.activity_date, log.date_only)}</td>
                    <td><b>{log.actor_name || 'Akun dihapus'}</b><small className="book-activity-description">{log.activity}</small></td>
                    <td>{log.event_type === 'login' ? 'Login' : log.event_type === 'page_view' ? 'Buka halaman' : 'Perubahan'}</td>
                    <td>{log.route || '—'}</td>
                    <td>{log.ip_address || '—'}</td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {Math.max(1, pagination.totalPages || 0)}</span>
          <div>
            <button type="button" className="master-icon-button" aria-label="Halaman sebelumnya" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
            <button type="button" className="master-icon-button" aria-label="Halaman berikutnya" disabled={loading || page >= (pagination.totalPages || 0)} onClick={() => setPage((value) => value + 1)}>›</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
