import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BadgeCheck, CalendarClock, Check, ChevronLeft, ChevronRight, CircleDollarSign,
  History, LoaderCircle, RefreshCw, Search, Trash2, X
} from 'lucide-react';
import { deleteFineLoans, fetchFines, updateLoanFineStatus } from './schoolLoanApi.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';

const pageSize = 25;
const numberFormat = new Intl.NumberFormat('id-ID');
const currencyFormat = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fineStatusLabel(status) {
  if (status === 'paid') return 'Lunas';
  if (status === 'waived') return 'Dibebaskan';
  return 'Belum Lunas';
}

function FinePaymentModal({ fine, saving, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function submit(event) {
    event.preventDefault();
    if (note.trim().length > 500) {
      setError('Catatan pembayaran maksimal 500 karakter.');
      return;
    }
    setError('');
    try {
      await onConfirm(note.trim());
    } catch (paymentError) {
      setError(paymentError.message);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop loan-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal fine-modal" role="dialog" aria-modal="true" aria-labelledby="fine-payment-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">KONFIRMASI PEMBAYARAN</span><h2 id="fine-payment-title">Catat Pelunasan Denda</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form className="fine-payment-form" onSubmit={submit}>
          <div className="fine-payment-summary">
            <div><small>Anggota</small><b>{fine.member_name}</b></div>
            <div><small>Buku</small><b>{fine.book_title}</b></div>
            <div><small>ID transaksi</small><b>PJM-{String(fine.id).padStart(5, '0')}</b></div>
            <div><small>Jumlah diterima · Tunai</small><b>{currencyFormat.format(fine.fine_amount)}</b></div>
          </div>
          <label className="fine-note-field">
            Catatan kas (opsional)
            <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: pembayaran tunai diterima di loket perpustakaan" />
          </label>
          {error && <p className="master-form-error" role="alert">{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <><LoaderCircle size={15} className="book-stock-spinner" />Menyimpan...</> : <><Check size={15} />Catat Pembayaran</>}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function FinePaymentHistoryModal({ fine, onClose }) {
  return createPortal(
    <div className="master-modal-backdrop loan-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="master-modal fine-modal" role="dialog" aria-modal="true" aria-labelledby="fine-history-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">RIWAYAT KAS</span><h2 id="fine-history-title">Pembayaran Denda</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup riwayat"><X size={18} /></button>
        </header>
        <div className="fine-history-content">
          <div><small>Transaksi</small><b>PJM-{String(fine.id).padStart(5, '0')} · {fine.book_title}</b></div>
          <div><small>Anggota</small><b>{fine.member_name}{fine.nis_nisn ? ` · NIS/NISN ${fine.nis_nisn}` : ''}</b></div>
          <div><small>Jumlah diterima</small><b>{currencyFormat.format(fine.payment?.amount ?? fine.fine_amount)}</b></div>
          <div><small>Metode</small><b>{fine.payment?.method === 'cash' ? 'Tunai' : '—'}</b></div>
          <div><small>Tanggal dan waktu</small><b>{formatDateTime(fine.payment?.paid_at)}</b></div>
          <div><small>Dicatat oleh</small><b>{fine.payment?.paid_by || 'Pengguna tidak tersedia'}</b></div>
          <div><small>Catatan kas</small><b>{fine.payment?.note || 'Tidak ada catatan'}</b></div>
        </div>
        <footer className="master-modal-actions"><button type="button" className="master-button master-button-muted" onClick={onClose}>Tutup</button></footer>
      </section>
    </div>,
    document.body
  );
}

export default function SchoolFinesPage({ rights }) {
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [fines, setFines] = useState([]);
  const [selectedFineIds, setSelectedFineIds] = useState(() => new Set());
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyLoanId, setBusyLoanId] = useState('');
  const [paymentFine, setPaymentFine] = useState(null);
  const [historyFine, setHistoryFine] = useState(null);
  const [deleteFinesOpen, setDeleteFinesOpen] = useState(false);
  const [deleteFinesError, setDeleteFinesError] = useState('');
  const [deletingFines, setDeletingFines] = useState(false);
  const allVisibleFinesSelected = fines.length > 0
    && fines.every((fine) => selectedFineIds.has(String(fine.id)));
  const fineColumnCount = 8 + (canDelete ? 1 : 0);

  useEffect(() => {
    setSelectedFineIds(new Set());
  }, [page, search, statusFilter, refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchFines({ page, limit: pageSize, search, status: statusFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setFines(result.fines || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        if (result.pagination?.totalPages && page > result.pagination.totalPages) {
          setPage(result.pagination.totalPages);
        }
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, search, statusFilter, refreshKey]);

  async function confirmPayment(note) {
    setBusyLoanId(paymentFine.id);
    setError('');
    setNotice('');
    try {
      const result = await updateLoanFineStatus(paymentFine.id, 'paid', note);
      setNotice(result.message);
      setPaymentFine(null);
      setRefreshKey((current) => current + 1);
    } catch (paymentError) {
      throw paymentError;
    } finally {
      setBusyLoanId('');
    }
  }

  async function confirmDeleteFines() {
    if (!selectedFineIds.size) return;
    setDeletingFines(true);
    setDeleteFinesError('');
    try {
      const result = await deleteFineLoans([...selectedFineIds]);
      setNotice(result.message);
      setSelectedFineIds(new Set());
      setDeleteFinesOpen(false);
      setRefreshKey((current) => current + 1);
    } catch (deleteError) {
      setDeleteFinesError(deleteError.message);
    } finally {
      setDeletingFines(false);
    }
  }

  function toggleVisibleFines(checked) {
    setSelectedFineIds((current) => {
      const next = new Set(current);
      fines.forEach((fine) => {
        const id = String(fine.id);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  return (
    <div className="library-module-page fines-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">SIRKULASI BUKU</span>
        <h1>Denda</h1>
        <p>Pantau keterlambatan, catat pembayaran tunai, dan lihat riwayat penerimaan kas.</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button></div>}

      <section className="catalog-toolbar-panel fine-toolbar">
        <label className="master-search fine-table-search">
          <Search size={16} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari nama, NIS, ID transaksi, atau judul..." aria-label="Cari data denda" />
        </label>
        <label className="loan-status-filter">Status Pembayaran
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">Semua status</option>
            <option value="unpaid">Belum lunas</option>
            <option value="paid">Lunas</option>
            <option value="waived">Dibebaskan</option>
          </select>
        </label>
        {canDelete && <button type="button" className="master-button master-button-danger" disabled={!selectedFineIds.size || deletingFines} onClick={() => { setDeleteFinesError(''); setDeleteFinesOpen(true); }}><Trash2 size={15} />Hapus Terpilih ({selectedFineIds.size})</button>}
      </section>

      <section className="library-panel loan-table-panel">
        <div className="catalog-table-heading">
          <div><span className="library-eyebrow">DAFTAR PEMBAYARAN</span><h2>Denda Keterlambatan</h2></div>
          <span>{numberFormat.format(pagination.total)} transaksi{selectedFineIds.size ? ` · ${selectedFineIds.size} dipilih` : ''}</span>
        </div>
        <div className="loan-table-scroll">
          <table className="loan-table fine-table">
            <thead>
              <tr>
                {canDelete && <th className="loan-select-checkbox"><input type="checkbox" checked={allVisibleFinesSelected} onChange={(event) => toggleVisibleFines(event.target.checked)} disabled={loading || !fines.length || deletingFines} aria-label="Pilih semua denda di halaman ini" /></th>}
                <th>No</th><th>ID Transaksi</th><th>Nama Anggota / NIS</th><th>Judul Buku</th>
                <th>Keterlambatan</th><th>Jumlah Denda</th><th>Status Pembayaran</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="loan-table-empty" colSpan={fineColumnCount}><LoaderCircle size={17} className="book-stock-spinner" />Memuat data denda...</td></tr>
              ) : fines.length ? fines.map((fine, index) => (
                <tr key={fine.id}>
                  {canDelete && <td className="loan-select-checkbox"><input type="checkbox" checked={selectedFineIds.has(String(fine.id))} onChange={(event) => setSelectedFineIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(String(fine.id));
                    else next.delete(String(fine.id));
                    return next;
                  })} aria-label={`Pilih denda transaksi ${fine.id}`} /></td>}
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td><span className="loan-id-badge">PJM-{String(fine.id).padStart(5, '0')}</span></td>
                  <td><div className="loan-member-cell"><b>{fine.member_name}</b><small>{fine.nis_nisn ? `NIS/NISN ${fine.nis_nisn}` : 'NIS belum diisi'}</small></div></td>
                  <td><div className="loan-book-cell"><b>{fine.book_title}</b><small>Kembali {formatDate(fine.return_date)}</small></div></td>
                  <td><span className="fine-late-days"><CalendarClock size={14} />{numberFormat.format(fine.days_late)} hari</span></td>
                  <td><b className="fine-amount">{currencyFormat.format(fine.fine_amount)}</b></td>
                  <td>
                    <div className="fine-status-cell">
                      <span className={`fine-status-badge is-${fine.fine_status}`}>{fineStatusLabel(fine.fine_status)}</span>
                      {fine.payment && <small>{formatDateTime(fine.payment.paid_at)}</small>}
                    </div>
                  </td>
                  <td>
                    <div className="loan-row-actions">
                      {fine.fine_status === 'unpaid' && canEdit && (
                        <button type="button" className="loan-action-button is-paid" title="Catat pembayaran tunai" aria-label={`Catat pembayaran denda ${fine.id}`} disabled={busyLoanId === fine.id} onClick={() => setPaymentFine(fine)}><CircleDollarSign size={15} /></button>
                      )}
                      {fine.fine_status === 'paid' && fine.payment && (
                        <button type="button" className="loan-action-button is-history" title="Lihat riwayat pembayaran" aria-label={`Lihat riwayat pembayaran ${fine.id}`} onClick={() => setHistoryFine(fine)}><History size={15} /></button>
                      )}
                      {fine.fine_status === 'waived' && <span className="fine-no-action"><BadgeCheck size={15} />—</span>}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="loan-table-empty" colSpan={fineColumnCount}>{search || statusFilter ? 'Tidak ada denda yang sesuai dengan pencarian atau filter.' : 'Belum ada denda keterlambatan.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pagination.totalPages} · {numberFormat.format(pagination.total)} transaksi</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
          </div>
        </footer>
      </section>

      {paymentFine && <FinePaymentModal
        fine={paymentFine}
        saving={busyLoanId === paymentFine.id}
        onClose={() => setPaymentFine(null)}
        onConfirm={confirmPayment}
      />}
      {historyFine && <FinePaymentHistoryModal fine={historyFine} onClose={() => setHistoryFine(null)} />}
      {deleteFinesOpen && <SchoolConfirmDialog
        title="Hapus denda terpilih?"
        message="Transaksi peminjaman, data denda, dan riwayat pembayaran terkait akan dihapus permanen."
        itemName={`${selectedFineIds.size} transaksi denda terpilih`}
        confirmLabel="Hapus Denda"
        loading={deletingFines}
        error={deleteFinesError}
        onClose={() => { if (!deletingFines) { setDeleteFinesOpen(false); setDeleteFinesError(''); } }}
        onConfirm={confirmDeleteFines}
      />}
    </div>
  );
}
