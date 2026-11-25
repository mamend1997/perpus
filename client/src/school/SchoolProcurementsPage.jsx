import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, ChevronLeft, ChevronRight, ClipboardList, LoaderCircle, Plus, Search, Trash2, X
} from 'lucide-react';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import { createProcurement, deleteProcurements, fetchProcurements, searchProcurementBooks, updateProcurement } from './schoolProcurementApi.js';

const pageSize = 10;

function formatRequestDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function formatCurrency(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatGroupedNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';
}

function todayDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function RequestFormModal({ type, requester, onClose, onSave }) {
  const isExistingBook = type === 'existing';
  const [form, setForm] = useState(() => ({
    title: '',
    author: '',
    publisher: '',
    year: '',
    quantityNeeded: '1',
    estimatedPrice: '',
    requesterName: requester || '',
    requestDate: todayDate(),
    notes: ''
  }));
  const [bookSearch, setBookSearch] = useState('');
  const [bookMatches, setBookMatches] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchingBooks, setSearchingBooks] = useState(false);
  const [bookSearchError, setBookSearchError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  useEffect(() => {
    const search = bookSearch.trim();
    if (!isExistingBook || search.length < 2 || selectedBook?.title === search) {
      setBookMatches([]);
      setSearchingBooks(false);
      setBookSearchError('');
      return undefined;
    }

    setBookMatches([]);
    setSearchingBooks(false);
    setBookSearchError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingBooks(true);
      setBookSearchError('');
      try {
        const result = await searchProcurementBooks(search, controller.signal);
        if (!controller.signal.aborted) setBookMatches(result.books || []);
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setBookMatches([]);
          setBookSearchError(searchError.message);
        }
      } finally {
        if (!controller.signal.aborted) setSearchingBooks(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [bookSearch, isExistingBook, selectedBook]);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateYear(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    setForm((current) => ({ ...current, year: digits }));
  }

  function updateEstimatedPrice(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((current) => ({ ...current, estimatedPrice: digits }));
  }

  async function submit(event) {
    event.preventDefault();
    if (isExistingBook && !selectedBook) {
      setError('Cari dan pilih buku yang sudah terdaftar di katalog.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        requestType: type,
        bookId: isExistingBook ? selectedBook.id : null
      });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop">
      <section className="master-modal procurement-modal" role="dialog" aria-modal="true" aria-labelledby="procurement-create-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">USULAN KOLEKSI</span><h2 id="procurement-create-title">{isExistingBook ? 'Usulkan Buku' : 'Usulkan Buku Baru'}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="procurement-modal-form" onSubmit={submit}>
          {isExistingBook ? (
            <div className="procurement-book-picker">
              <label>Cari nama buku atau masukkan barcode
                <input
                  type="search"
                  value={bookSearch}
                  onChange={(event) => {
                    setBookSearch(event.target.value);
                    setSelectedBook(null);
                  }}
                  autoComplete="off"
                  autoFocus
                  placeholder="Nama buku atau kode barcode"
                />
              </label>
              <CameraBarcodeScanner label="Scan barcode" onScan={(value) => {
                setBookSearch(value);
                setSelectedBook(null);
              }} />
              {searchingBooks && <small className="procurement-book-search-message">Mencari buku...</small>}
              {bookSearchError && <small className="procurement-book-search-error" role="alert">{bookSearchError}</small>}
              {!searchingBooks && !bookSearchError && bookSearch.trim().length >= 2 && !selectedBook && bookMatches.length === 0 && (
                <small className="procurement-book-search-message">Buku tidak ditemukan.</small>
              )}
              {bookMatches.length > 0 && (
                <div className="procurement-book-search-results" role="listbox" aria-label="Hasil pencarian buku">
                  {bookMatches.map((book) => (
                    <button
                      type="button"
                      role="option"
                      key={book.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedBook(book);
                        setBookSearch(book.title);
                        setBookMatches([]);
                        setError('');
                      }}
                    >
                      <b>{book.title}</b>
                      <small>{book.kode_buku || book.nomor_induk || 'Kode belum tersedia'} · Stok: {Number(book.qty || 0).toLocaleString('id-ID')}</small>
                    </button>
                  ))}
                </div>
              )}
              {selectedBook && <div className="procurement-selected-book">
                <b>{selectedBook.title}</b>
                <span>Stok saat ini: {Number(selectedBook.qty || 0).toLocaleString('id-ID')} eksemplar</span>
              </div>}
            </div>
          ) : (
            <>
              <label>Judul Buku
                <input name="title" value={form.title} onChange={update} maxLength={255} required autoFocus placeholder="Masukkan judul buku yang diusulkan" />
              </label>
              <label>Pengarang / Penulis
                <input name="author" value={form.author} onChange={update} maxLength={180} placeholder="Nama pengarang (opsional)" />
              </label>
              <label>Penerbit
                <input name="publisher" value={form.publisher} onChange={update} maxLength={180} placeholder="Nama penerbit (opsional)" />
              </label>
              <label>Tahun Terbit
                <input name="year" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.year} onChange={updateYear} placeholder="Contoh: 2026" />
              </label>
            </>
          )}
          <label>Jumlah Kebutuhan (Eksemplar)
            <input name="quantityNeeded" type="number" min="1" max="10000" step="1" value={form.quantityNeeded} onChange={update} required />
          </label>
          <label>Estimasi Harga (Rp)
            <input name="estimatedPrice" type="text" inputMode="numeric" pattern="[0-9.]*" maxLength={13} value={formatGroupedNumber(form.estimatedPrice)} onChange={updateEstimatedPrice} placeholder="0" required />
          </label>
          <label>Tanggal Pengajuan
            <input name="requestDate" type="date" value={form.requestDate} onChange={update} required />
          </label>
          <label>Nama Pemohon
            <input name="requesterName" value={form.requesterName} onChange={update} maxLength={180} required />
          </label>
          <label>Alasan Pengajuan / Catatan Pengajuan
            <textarea name="notes" value={form.notes} onChange={update} maxLength={5000} rows={4} placeholder={isExistingBook ? 'Misalnya stok menipis atau kebutuhan tambahan (opsional)' : 'Jelaskan kebutuhan atau alasan pengajuan (opsional)'} />
            <small>{form.notes.length}/5000 karakter</small>
          </label>
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
  const [reviewNotes, setReviewNotes] = useState(request.review_notes || '');
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
      await onSave({ status, reviewNotes, addToCatalog: status === 'Diterima' && addToCatalog });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop">
      <section className="master-modal procurement-modal" role="dialog" aria-modal="true" aria-labelledby="procurement-review-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">TINJAUAN PENGADAAN</span><h2 id="procurement-review-title">Validasi Usulan</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <div className="procurement-review-details">
          <b>{request.title}</b>
          <span>Pengarang: {request.author || '—'} · Penerbit: {request.publisher || '—'} · Tahun: {request.year || '—'}</span>
          <span>Kebutuhan: {Number(request.quantity_needed || 1).toLocaleString('id-ID')} eksemplar · Estimasi: {formatCurrency(request.estimated_price)}</span>
          <small>Diajukan oleh {request.requester || 'Member'} pada {formatRequestDate(request.request_date)}</small>
          {request.notes && <p><b>Alasan pengajuan:</b> {request.notes}</p>}
        </div>
        <form className="procurement-modal-form" onSubmit={submit}>
          <label>Pilih Tindakan
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="Pending">Pending</option>
              <option value="Diterima">Diterima</option>
              <option value="Ditolak">Ditolak</option>
            </select>
          </label>
          <label>Catatan Peninjau
            <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} maxLength={5000} rows={4} placeholder="Tulis catatan keputusan untuk pemohon (opsional)" />
            <small>{reviewNotes.length}/5000 karakter</small>
          </label>
          {status === 'Diterima' && request.request_type !== 'existing' && <label className="procurement-add-catalog">
            <input type="checkbox" checked={addToCatalog} onChange={(event) => setAddToCatalog(event.target.checked)} />
            <span><b>Langsung masukkan judul ini ke Daftar Pustaka?</b><small>Data judul, pengarang, penerbit, dan tahun akan disalin ke katalog dengan stok awal 0.</small></span>
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

export default function SchoolProcurementsPage({ rights, role, requester }) {
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
  const [createType, setCreateType] = useState('');
  const [reviewing, setReviewing] = useState(null);
  const [selectedRequests, setSelectedRequests] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canEdit = Boolean(rights?.edit);
  const canReview = canEdit && ['admin', 'kapus'].includes(role);
  const canDelete = Boolean(rights?.delete);
  const selectedIds = Object.keys(selectedRequests);
  const allVisibleSelected = requests.length > 0 && requests.every((request) => Boolean(selectedRequests[String(request.id)]));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    setSelectedRequests({});
  }, [page, search, statusFilter]);

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
    setCreateType('');
    setNotice('Usulan buku berhasil dikirim.');
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

  function toggleRequestSelection(request, checked) {
    setSelectedRequests((current) => {
      const next = { ...current };
      if (checked) next[String(request.id)] = request;
      else delete next[String(request.id)];
      return next;
    });
  }

  async function confirmBulkDelete() {
    if (!selectedIds.length) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await deleteProcurements(selectedIds);
      setSelectedRequests({});
      setDeleteConfirmOpen(false);
      setNotice(result.message || 'Usulan terpilih berhasil dihapus.');
      setRefreshKey((key) => key + 1);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message);
    } finally {
      setDeleting(false);
    }
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
            {canEdit && <>
              <button type="button" className="master-button master-button-primary" onClick={() => setCreateType('existing')}>
                <Plus size={15} />Usulan Buku
              </button>
              <button type="button" className="master-button master-button-primary" onClick={() => setCreateType('new')}>
                <Plus size={15} />Usulan Buku Baru
              </button>
            </>}
            {canDelete && selectedIds.length > 0 && <button type="button" className="master-button procurement-delete-selected" onClick={() => { setDeleteError(''); setDeleteConfirmOpen(true); }}>
              <Trash2 size={15} />Hapus Terpilih ({selectedIds.length})
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
                {canDelete && <th className="procurement-checkbox-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedRequests((current) => ({ ...current, ...Object.fromEntries(requests.map((request) => [String(request.id), request])) }));
                  } else {
                    setSelectedRequests((current) => {
                      const next = { ...current };
                      requests.forEach((request) => delete next[String(request.id)]);
                      return next;
                    });
                  }
                }} aria-label="Pilih semua usulan di halaman ini" /></th>}
                <th>No</th><th>Judul Buku</th><th>Jenis Usulan</th><th>Pengarang / Penulis</th><th>Penerbit</th><th>Tahun Terbit</th>
                <th>Kebutuhan</th><th>Estimasi Harga</th><th>Tanggal Pengajuan</th><th>Status</th><th>Alasan Pengajuan</th><th>Pemohon</th>
                {canReview && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12 + Number(canReview) + Number(canDelete)} className="procurement-table-empty"><LoaderCircle size={17} className="book-stock-spinner" />Memuat usulan...</td></tr>
              ) : requests.length ? requests.map((request, index) => (
                <tr key={request.id}>
                  {canDelete && <td className="procurement-checkbox-cell"><input type="checkbox" checked={Boolean(selectedRequests[String(request.id)])} onChange={(event) => toggleRequestSelection(request, event.target.checked)} aria-label={`Pilih usulan ${request.title}`} /></td>}
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td><b className="procurement-book-title">{request.title}</b></td>
                  <td>{request.request_type === 'existing' ? 'Buku yang Sudah Ada' : 'Buku Baru'}</td>
                  <td>{request.author || '—'}</td>
                  <td>{request.publisher || '—'}</td>
                  <td>{request.year || '—'}</td>
                  <td>{Number(request.quantity_needed || 1).toLocaleString('id-ID')} eksemplar</td>
                  <td>{formatCurrency(request.estimated_price)}</td>
                  <td>{formatRequestDate(request.request_date)}</td>
                  <td><ProcurementStatus status={request.status} /></td>
                  <td><span className="procurement-notes" title={request.notes || ''}>{request.notes || '—'}</span></td>
                  <td><div className="procurement-requester"><b>{request.requester}</b><small>{request.requester_role === 'member' ? 'Member' : request.requester_role === 'kepsek' ? 'Kepala Sekolah' : request.requester_role === 'kapus' ? 'Kepala Perpustakaan' : 'Admin'}</small></div></td>
                  {canReview && <td><button type="button" className="master-button master-button-light procurement-review-button" onClick={() => setReviewing(request)}>Tinjau</button></td>}
                </tr>
              )) : (
                <tr><td colSpan={12 + Number(canReview) + Number(canDelete)} className="procurement-table-empty"><ClipboardList size={20} />{search || statusFilter ? 'Tidak ada usulan yang cocok dengan pencarian atau filter.' : 'Belum ada usulan pengadaan buku.'}</td></tr>
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

      {createType && <RequestFormModal type={createType} requester={requester} onClose={() => setCreateType('')} onSave={submitRequest} />}
      {reviewing && <ReviewRequestModal request={reviewing} onClose={() => setReviewing(null)} onSave={saveReview} />}
      {deleteConfirmOpen && <SchoolConfirmDialog
        title="Hapus usulan terpilih?"
        message={`${selectedIds.length} usulan akan dihapus permanen dari sekolah ini.`}
        itemName={selectedIds.length === 1 ? selectedRequests[selectedIds[0]]?.title : `${selectedIds.length} usulan`}
        loading={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) { setDeleteConfirmOpen(false); setDeleteError(''); } }}
        onConfirm={confirmBulkDelete}
      />}
    </div>
  );
}
