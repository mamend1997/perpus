import { useEffect, useState } from 'react';
import {
  Bell, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Search, Ticket, X
} from 'lucide-react';
import {
  cancelReservation, createReservation, fetchReservationNotifications, fetchReservations,
  fulfillReservation, markReservationNotificationRead, notifyReservationReady, searchReservationBooks
} from './schoolReservationApi.js';

const pageSize = 25;

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', withTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }).format(date);
}

function statusLabel(status) {
  return ({ Active: 'Aktif', Fulfilled: 'Dipenuhi', Cancelled: 'Dibatalkan' })[status] || status;
}

export default function SchoolReservationsPage({ rights, role, account }) {
  const isMember = role === 'member';
  const canEdit = Boolean(rights?.edit);
  const canView = Boolean(rights?.view);
  const canManage = canEdit && !isMember;
  const [reservations, setReservations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookSearch, setBookSearch] = useState('');
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookLoading, setBookLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [actionId, setActionId] = useState('');
  const selectedBook = books.find((book) => String(book.id) === String(selectedBookId));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!canView) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchReservations({ page, limit: pageSize, search, status: statusFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setReservations(result.reservations || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        if (result.pagination?.totalPages && page > result.pagination.totalPages) setPage(result.pagination.totalPages);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canView, page, search, statusFilter, refreshKey]);

  useEffect(() => {
    if (!isMember || !canView) return undefined;
    const controller = new AbortController();
    fetchReservationNotifications(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setNotifications(result.notifications || []);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError.message);
      });
    return () => controller.abort();
  }, [isMember, canView, refreshKey]);

  useEffect(() => {
    if (!isMember || !canEdit) {
      setBooks([]);
      setBookLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBookLoading(true);
      searchReservationBooks(bookSearch.trim(), controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setBooks(result.books || []);
        })
        .catch((fetchError) => {
          if (!controller.signal.aborted) setError(fetchError.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBookLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isMember, canEdit, bookSearch, refreshKey]);

  async function runAction(id, action) {
    setActionId(id);
    setError('');
    setNotice('');
    try {
      const result = await action(id);
      setNotice(result.message || 'Perubahan berhasil disimpan.');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionId('');
    }
  }

  async function submitReservation(event) {
    event.preventDefault();
    if (!selectedBookId) {
      setError('Pilih buku yang ingin di-booking.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await createReservation({
        bookId: selectedBookId,
        quantity: Number(quantity),
        notes: bookingNotes
      });
      setNotice(result.message);
      setSelectedBookId('');
      setBookSearch('');
      setQuantity('1');
      setBookingNotes('');
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  }

  async function markRead(id) {
    try {
      await markReservationNotificationRead(id);
      setNotifications((current) => current.map((item) => String(item.id) === String(id)
        ? { ...item, read_at: new Date().toISOString() }
        : item));
    } catch (readError) {
      setError(readError.message);
    }
  }

  const pageCount = Math.max(1, pagination.totalPages || 1);

  return (
    <div className="library-module-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">LAYANAN PERPUSTAKAAN</span>
        <h1>Booking Buku</h1>
        <p>Pesan buku yang sedang tidak tersedia dan pantau status antrean booking Anda.</p>
      </header>

      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}
      {error && <div className="master-form-error" role="alert">{error}</div>}

      {isMember && canEdit && (
        <section className="library-panel" style={{ padding: 20, marginBottom: 18 }}>
          <div className="catalog-table-heading">
            <div><h2>Buat Booking</h2><p>Buku hanya dapat dipesan ketika tidak ada eksemplar tersedia.</p></div>
          </div>
          <form onSubmit={submitReservation} className="reservation-create-form">
            <label style={{ flex: '1 1 280px' }}>
              <span className="loan-form-label">Cari buku</span>
              <span className="master-search" style={{ display: 'flex' }}>
                <Search size={16} />
                <input value={bookSearch} onChange={(event) => { setBookSearch(event.target.value); setSelectedBookId(''); }} placeholder="Judul, kode, atau nomor induk" aria-label="Cari buku untuk booking" />
                {bookLoading && <LoaderCircle size={15} className="book-stock-spinner" />}
              </span>
              {books.length > 0 && (
                <select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)} style={{ width: '100%', marginTop: 8 }} required>
                  <option value="">Pilih judul buku</option>
                  {books.map((book) => {
                    const availableCount = Number(book.available_count || 0);
                    return <option value={book.id} key={book.id} disabled={availableCount > 0}>
                      {book.title} · {availableCount > 0 ? `${availableCount} tersedia` : 'Tidak tersedia — dapat di-booking'}
                    </option>;
                  })}
                </select>
              )}
              {selectedBook && Number(selectedBook.available_count) > 0 && <small>Buku masih tersedia dan belum dapat di-booking.</small>}
              {!bookLoading && books.length === 0 && <small>{bookSearch ? 'Tidak ada judul buku yang cocok.' : 'Belum ada data buku di katalog sekolah.'}</small>}
            </label>
            <label>
              <span className="loan-form-label">Jumlah eksemplar</span>
              <input type="number" min="1" max="100" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </label>
            <label className="reservation-notes-field">
              <span className="loan-form-label">Keterangan (opsional)</span>
              <input value={bookingNotes} onChange={(event) => setBookingNotes(event.target.value)} maxLength={1000} placeholder="Catatan untuk petugas" />
            </label>
            {isMember && <label className="reservation-account-name">
              <span className="loan-form-label">Nama anggota</span>
              <input value={account?.name || ''} readOnly aria-readonly="true" />
            </label>}
            <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedBookId || Number(selectedBook?.available_count) > 0}>
              {saving ? <><LoaderCircle size={16} className="book-stock-spinner" />Menyimpan...</> : <><Ticket size={16} />Booking buku</>}
            </button>
          </form>
        </section>
      )}
      {isMember && !canEdit && <div className="library-module-notice">Akun Anda belum diberi izin untuk membuat booking.</div>}

      {isMember && notifications.length > 0 && (
        <section className="library-panel" style={{ padding: 18, marginBottom: 18 }}>
          <div className="catalog-table-heading"><div><h2>Notifikasi Booking</h2><p>Pemberitahuan saat buku yang Anda pesan tersedia.</p></div></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {notifications.slice(0, 5).map((notification) => (
              <div key={notification.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <Bell size={17} />
                <div style={{ flex: 1 }}><b>{notification.title}</b><div>{notification.message}</div><small>{formatDate(notification.created_at, true)}</small></div>
                {!notification.read_at && <button type="button" className="master-button master-button-muted" onClick={() => markRead(notification.id)}>Tandai dibaca</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="catalog-toolbar-panel loan-toolbar">
        <div className="loan-toolbar-top">
          <label className="master-search loan-table-search">
            <Search size={16} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari judul, anggota, atau ID booking..." aria-label="Cari booking" />
          </label>
          <div className="loan-toolbar-actions">
            <label className="loan-status-filter">Status
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="">Semua status</option>
                <option value="Active">Aktif</option>
                <option value="Fulfilled">Dipenuhi</option>
                <option value="Cancelled">Dibatalkan</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="library-panel loan-table-panel">
        <div className="catalog-table-heading">
          <div><h2>Daftar Booking</h2><p>{pagination.total} booking tercatat</p></div>
        </div>
        <div className="loan-table-scroll">
          <table className="loan-table">
            <thead><tr><th>No</th><th>ID Booking</th><th>Buku</th>{!isMember && <th>Anggota</th>}<th>Tanggal Booking</th><th>Status</th><th>Batas Pengambilan</th><th>Aksi</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="loan-table-empty" colSpan={isMember ? 7 : 8}><LoaderCircle size={17} className="book-stock-spinner" />Memuat booking...</td></tr>
                : reservations.length === 0 ? <tr><td className="loan-table-empty" colSpan={isMember ? 7 : 8}>{search || statusFilter ? 'Tidak ada booking yang sesuai dengan filter.' : 'Belum ada booking buku.'}</td></tr>
                  : reservations.map((reservation, index) => (
                    <tr key={reservation.id}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>#{reservation.id}</td>
                      <td><b>{reservation.book_title}</b><small>{Number(reservation.quantity || 1)} eksemplar · Booking #{reservation.id}</small>{reservation.notes && <small>{reservation.notes}</small>}</td>
                      {!isMember && <td>{reservation.member_name}<small>{reservation.nis_nisn || 'Anggota perpustakaan'}</small></td>}
                      <td>{formatDate(reservation.reservation_date, true)}</td>
                      <td><span className={`loan-status-badge ${reservation.status.toLowerCase()}`}>{statusLabel(reservation.status)}</span>
                        {reservation.ready_notified_at && <small>Siap sejak {formatDate(reservation.ready_notified_at, true)}</small>}
                      </td>
                      <td>{reservation.expired_date ? formatDate(reservation.expired_date, true) : 'Belum diberitahukan'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {reservation.status === 'Active' && (isMember || canManage) && (
                            <button type="button" className="master-button master-button-muted" disabled={actionId === reservation.id} onClick={() => runAction(reservation.id, cancelReservation)}>
                              {actionId === reservation.id ? <LoaderCircle size={14} className="book-stock-spinner" /> : <X size={14} />}Batalkan
                            </button>
                          )}
                          {canManage && reservation.status === 'Active' && !reservation.ready_notified_at && (
                            <button type="button" className="master-button master-button-muted" disabled={actionId === reservation.id} onClick={() => runAction(reservation.id, notifyReservationReady)}>
                              <Bell size={14} />Beri tahu siap
                            </button>
                          )}
                          {canManage && reservation.status === 'Active' && reservation.ready_notified_at && reservation.expired_date && new Date(reservation.expired_date).getTime() > Date.now() && (
                            <button type="button" className="master-button master-button-primary" disabled={actionId === reservation.id} onClick={() => runAction(reservation.id, fulfillReservation)}>
                              <Check size={14} />Penuhi
                            </button>
                          )}
                          {reservation.status === 'Active' && !reservation.ready_notified_at && <small><Clock3 size={13} />Menunggu buku tersedia</small>}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {pagination.totalPages ? page : 0} dari {pageCount}</span>
          <div>
            <button type="button" className="master-icon-button" aria-label="Halaman sebelumnya" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button>
            <button type="button" className="master-icon-button" aria-label="Halaman berikutnya" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}
