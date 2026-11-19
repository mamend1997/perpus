import { useEffect, useState } from 'react';
import { Activity, LoaderCircle } from 'lucide-react';

const pageSize = 25;

async function fetchAuditLogs(page, signal) {
  const token = localStorage.getItem('super-admin-token');
  const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  const response = await fetch(`/api/super-admin/audit-logs?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Log aktivitas gagal dimuat.');
  return result;
}

function activityDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(date);
}

export default function PlatformAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchAuditLogs(page, controller.signal)
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
    <section className="admin-module-page">
      <header className="management-heading"><div><h1>Log Aktivitas</h1><p>Riwayat perubahan data, login, dan halaman yang dibuka Super Admin.</p></div></header>
      {error && <div className="error-panel" role="alert">{error}</div>}
      <section className="panel platform-audit-panel">
        <div className="panel-heading"><div><h3>Aktivitas Platform</h3><p>{Number(pagination.total || 0).toLocaleString('id-ID')} aktivitas tercatat</p></div><Activity size={19} /></div>
        <div className="activity-table platform-audit-table">
          <div className="activity-header"><span>AKTIVITAS</span><span>ADMIN</span><span>ALAMAT IP</span><span>WAKTU</span></div>
          {loading ? <div className="empty-state"><LoaderCircle size={18} className="book-stock-spinner" />Memuat aktivitas...</div>
            : !logs.length ? <div className="empty-state">Belum ada aktivitas tercatat.</div>
              : logs.map((log) => <div className="activity-row" key={log.id}>
                <span><span className="activity-dot" />{log.activity}</span>
                <span>{log.admin_name}</span>
                <span>{log.ip_address || '—'}</span>
                <span>{activityDate(log.created_at)}</span>
              </div>)}
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {Math.max(1, pagination.totalPages || 0)}</span>
          <div>
            <button type="button" className="master-icon-button" aria-label="Halaman sebelumnya" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
            <button type="button" className="master-icon-button" aria-label="Halaman berikutnya" disabled={loading || page >= (pagination.totalPages || 0)} onClick={() => setPage((value) => value + 1)}>›</button>
          </div>
        </footer>
      </section>
    </section>
  );
}
