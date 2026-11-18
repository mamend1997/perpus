import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, ChevronLeft, ChevronRight, ClipboardList, LoaderCircle, Plus, Search, X
} from 'lucide-react';
import { createProcurement, fetchProcurements, updateProcurement } from './schoolProcurementApi.js';

const pageSize = 10;

function formatRequestDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function RequestFormModal({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', author: '', publisher: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal procurement-modal" role="dialog" aria-modal="true" aria-labelledby="procurement-create-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">USULAN KOLEKSI</span><h2 id="procurement-create-title">Usulkan Buku</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="procurement-modal-form" onSubmit={submit}>
          <label>Judul Buku
            <input name="title" value={form.title} onChange={update} maxLength={255} required autoFocus placeholder="Masukkan judul buku yang diusulkan" />
          </label>
          <label>Pengarang
            <input name="author" value={form.author} onChange={update} maxLength={180} placeholder="Nama pengarang (opsional)" />
          </label>
          <label>Penerbit
            <input name="publisher" value={form.publisher} onChange={update} maxLength={180} placeholder="Nama penerbit (opsional)" />
          </label>
          <p>Usulan akan berstatus Pending sampai ditinjau oleh Admin atau Kepala Perpustakaan.</p>
          <footer className="procurement-modal-actions">
            <button type="button" className="master-button master-button-light" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Plus size={15} />}
              {saving ? 'Mengirim...' : 'Kirim Usulan'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function ReviewRequestModal({ request, onClose, onSave }) {
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.notes || '');
  const [addToCatalog, setAddToCatalog] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ status, notes, addToCatalog: status === 'Diterima' && addToCatalog });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal procurement-modal" role="dialog" aria-modal="true" aria-labelledby="procurement-review-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">TINJAUAN PENGADAAN</span><h2 id="procurement-review-title">Validasi Usulan</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <div className="procurement-review-details">
          <b>{request.title}</b>
          <span>Pengarang: {request.author || '—'} · Penerbit: {request.publisher || '—'}</span>
          <small>Diajukan oleh {request.requester || 'Member'} pada {formatRequestDate(request.request_date)}</small>
        </div>
        <form className="procurement-modal-form" onSubmit={submit}>
          <label>Pilih Tindakan
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="Pending">Pending</option>
              <option value="Diterima">Diterima</option>
              <option value="Ditolak">Ditolak</option>
            </select>
          </label>
          <label>Catatan / Alasan
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} rows={4} placeholder="Tulis catatan untuk pemohon (opsional)" />
            <small>{notes.length}/5000 karakter</small>
          </label>
          {status === 'Diterima' && <label className="procurement-add-catalog">
            <input type="checkbox" checked={addToCatalog} onChange={(event) => setAddToCatalog(event.target.checked)} />
            <span><b>Tambahkan ke Daftar Pustaka</b><small>Buat data katalog dengan stok awal 0. Pengarang dan penerbit akan ditautkan ke Master Data.</small></span>
          </label>}
          <footer className="procurement-modal-actions">
            <button type="button" className="master-button master-button-light" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function ProcurementStatus({ status }) {
  const className = status === 'Pending' ? 'is-pending' : status === 'Diterima' ? 'is-approved' : 'is-rejected';
  return <span className={`procurement-status ${className}`}>{status}</span>;
}

export default function SchoolProcurementsPage({ rights, role }) {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [direction, setDirection] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const canEdit = Boolean(rights?.edit);
  const canReview = canEdit && ['admin', 'kapus'].includes(role);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchProcurements({
      page,
      limit: pageSize,
      search,
      status: statusFilter,
      sort,
      direction,
      signal: controller.signal
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRequests(result.requests || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, search, statusFilter, sort, direction, refreshKey]);

  async function submitRequest(proposal) {
    await createProcurement(proposal);
    setCreateOpen(false);
    setNotice('Usulan buku berhasil dikirim dan berstatus Pending.');
    setPage(1);
    setRefreshKey((key) => key + 1);
  }

  async function saveReview(changes) {
    const result = await updateProcurement(reviewing.id, changes);
    setReviewing(null);
    const catalogMessage = changes.addToCatalog
      ? result.catalogBook?.created
        ? ' Buku juga berhasil ditambahkan ke Daftar Pustaka.'
        : ' Judul sudah tersedia di Daftar Pustaka, sehingga tidak dibuat duplikat.'
      : '';
    setNotice(`Status usulan "${result.request.title}" berhasil diperbarui.${catalogMessage}`);
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="library-module-page catalog-page procurements-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">PENGELOLAAN KOLEKSI</span>
        <h1>Pengadaan Buku</h1>
        <p>Tinjau kebutuhan buku yang diusulkan dan berikan keputusan kepada pemohon.</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Coba lagi</button></div>}

      <section className="catalog-toolbar-panel procurement-toolbar">
        <div className="procurement-toolbar-row">
          <label className="master-search procurement-search">
            <Search size={16} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari Disini..." maxLength={100} />
          </label>
          <div className="procurement-toolbar-actions">
            <label className="procurement-filter">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="">Semua status</option>
                <option value="Pending">Pending</option>
                <option value="Diterima">Diterima</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </label>
            <label className="procurement-filter">
              <span>Urutkan</span>
              <select value={`${sort}-${direction}`} onChange={(event) => {
                const [nextSort, nextDirection] = event.target.value.split('-');
                setSort(nextSort);
                setDirection(nextDirection);
                setPage(1);
              }}>
                <option value="date-desc">Tanggal terbaru</option>
                <option value="date-asc">Tanggal terlama</option>
                <option value="title-asc">Judul A-Z</option>
                <option value="title-desc">Judul Z-A</option>
                <option value="status-asc">Status A-Z</option>
                <option value="requester-asc">Nama pemohon A-Z</option>
              </select>
            </label>
            {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />Usulkan Buku
            </button>}
          </div>
        </div>
      </section>

      <section className="library-panel procurement-table-panel">
        <div className="catalog-table-heading">
          <div><span className="library-eyebrow">DAFTAR USULAN</span><h2>Usulan Pengadaan</h2></div>
          <span>{pagination.total.toLocaleString('id-ID')} usulan</span>
        </div>
        <div className="procurement-table-scroll">
          <table className="procurement-table">
            <thead>
              <tr>
                <th>No</th><th>Judul Buku</th><th>Pengarang</th><th>Penerbit</th>
                <th>Tanggal Pengajuan</th><th>Status</th><th>Catatan</th><th>Member</th>
                {canReview && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canReview ? 9 : 8} className="procurement-table-empty"><LoaderCircle size={17} className="book-stock-spinner" />Memuat usulan...</td></tr>
              ) : requests.length ? requests.map((request, index) => (
                <tr key={request.id}>
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td><b className="procurement-book-title">{request.title}</b></td>
                  <td>{request.author || '—'}</td>
                  <td>{request.publisher || '—'}</td>
                  <td>{formatRequestDate(request.request_date)}</td>
                  <td><ProcurementStatus status={request.status} /></td>
                  <td><span className="procurement-notes" title={request.notes || ''}>{request.notes || '—'}</span></td>
                  <td><div className="procurement-requester"><b>{request.requester}</b><small>{request.requester_role === 'member' ? 'Member' : request.requester_role === 'kepsek' ? 'Kepala Sekolah' : request.requester_role === 'kapus' ? 'Kepala Perpustakaan' : 'Admin'}</small></div></td>
                  {canReview && <td><button type="button" className="master-button master-button-light procurement-review-button" onClick={() => setReviewing(request)}>Tinjau</button></td>}
                </tr>
              )) : (
                <tr><td colSpan={canReview ? 9 : 8} className="procurement-table-empty"><ClipboardList size={20} />{search || statusFilter ? 'Tidak ada usulan yang cocok dengan pencarian atau filter.' : 'Belum ada usulan pengadaan buku.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages} · {pagination.total.toLocaleString('id-ID')} usulan</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
          </div>
        </footer>
      </section>

      {createOpen && <RequestFormModal onClose={() => setCreateOpen(false)} onSave={submitRequest} />}
      {reviewing && <ReviewRequestModal request={reviewing} onClose={() => setReviewing(null)} onSave={saveReview} />}
    </div>
  );
}
