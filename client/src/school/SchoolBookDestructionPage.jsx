import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, PackageX, Plus, Search, X } from 'lucide-react';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import {
  createBookDestruction, fetchBookDestructionHistory, fetchBookDestructionRacks,
  searchDestructibleBooks
} from './schoolBookApi.js';

const pageSize = 25;

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function DestructionModal({ onClose, onSaved }) {
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [racks, setRacks] = useState([]);
  const [rackId, setRackId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (search.length < 2) {
      setBooks([]);
      setLoadingBooks(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoadingBooks(true);
    searchDestructibleBooks(search, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setBooks(result.books || []); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingBooks(false); });
    return () => controller.abort();
  }, [search]);

  useEffect(() => {
    if (!selectedBook) {
      setRacks([]);
      setRackId('');
      return undefined;
    }
    const controller = new AbortController();
    setLoadingRacks(true);
    setError('');
    fetchBookDestructionRacks(selectedBook.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        const options = result.racks || [];
        setRacks(options);
        setRackId(options.length === 1 ? options[0].id : '');
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRacks(false); });
    return () => controller.abort();
  }, [selectedBook]);

  const selectedRack = racks.find((rack) => rack.id === rackId);
  const maximumQuantity = selectedRack?.damaged_qty || 0;

  function chooseBook(book) {
    setSelectedBook(book);
    setQueryInput(book.title);
    setQuantity('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedBook || !selectedRack || !Number.isSafeInteger(Number(quantity))
        || Number(quantity) < 1 || Number(quantity) > maximumQuantity || !reason.trim()) {
      setError('Pilih buku dan rak, masukkan jumlah sesuai stok rusak, serta isi alasan pemusnahan.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await createBookDestruction({
        bookId: selectedBook.id,
        rackId,
        quantity: Number(quantity),
        destructionDate: todayDate(),
        reason: reason.trim()
      });
      onSaved(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal book-destruction-modal" role="dialog" aria-modal="true" aria-labelledby="book-destruction-title">
        <header className="master-modal-heading">
          <div className="book-destruction-heading-copy">
            <span className="library-eyebrow">KOLEKSI RUSAK</span>
            <h2 id="book-destruction-title">Tambah Pemusnahan</h2>
            <p>Pilih buku berkondisi rusak, tentukan rak dan jumlah, lalu catat alasannya.</p>
          </div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={17} /></button>
        </header>
        {error && <div className="library-error" role="alert">{error}</div>}
        <form className="book-destruction-form" onSubmit={submit}>
          <label className="book-destruction-search-field">Scan barang atau cari nama buku
            <CameraBarcodeScanner label="Scan barang" onScan={(value) => {
              setQueryInput(value);
              setSelectedBook(null);
              setRackId('');
              setQuantity('');
              setError('');
            }} />
            <span className="master-search"><Search size={15} /><input value={queryInput} onChange={(event) => {
              setQueryInput(event.target.value);
              setSelectedBook(null);
              setRackId('');
              setQuantity('');
              setError('');
            }} placeholder="Barcode, serial, judul, atau kode buku" autoComplete="off" maxLength={100} /></span>
            {!selectedBook && queryInput.trim().length >= 2 && <div className="book-destruction-book-options">
              {loadingBooks ? <span><LoaderCircle size={14} className="book-stock-spinner" />Mencari buku rusak...</span>
                : books.map((book) => <button type="button" key={book.id} onClick={() => chooseBook(book)}>
                  <b>{book.title}</b><small>{book.kode_buku || book.nomor_induk || 'Kode belum tersedia'} · {book.damaged_qty} eksemplar rusak</small>
                </button>)}
              {!loadingBooks && !books.length && <span>Tidak ada buku rusak yang cocok.</span>}
            </div>}
          </label>
          {selectedBook && <div className="book-destruction-selected">
            <PackageX size={18} /><div><b>{selectedBook.title}</b><small>{selectedBook.kode_buku || selectedBook.nomor_induk || 'Kode belum tersedia'}</small></div>
          </div>}
          {selectedBook ? (
            <>
              <label className="book-destruction-date">Tanggal Pemusnahan
                <input type="date" value={todayDate()} readOnly />
              </label>
              <label className="book-destruction-rack">Lokasi Rak
                <select value={rackId} onChange={(event) => { setRackId(event.target.value); setQuantity(''); }} required disabled={loadingRacks || !racks.length || saving}>
                  <option value="">{loadingRacks ? 'Memuat rak...' : racks.length ? 'Pilih lokasi rak' : 'Tidak ada stok rusak'}</option>
                  {racks.map((rack) => <option key={rack.id} value={rack.id}>{rack.name} · {rack.damaged_qty} rusak</option>)}
                </select>
                {loadingRacks && <small>Memuat lokasi stok buku...</small>}
                {!loadingRacks && !racks.length && <small className="book-destruction-field-note">Buku ini tidak memiliki stok rusak pada rak yang tersedia.</small>}
              </label>
              {!loadingRacks && racks.length > 0 && !selectedRack && (
                <div className="book-destruction-step-hint">Pilih rak untuk mengisi jumlah barang dan alasan pemusnahan.</div>
              )}
              {selectedRack && (
                <>
                  <label className="book-destruction-quantity">Jumlah Barang
                    <input type="number" min="1" max={maximumQuantity} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={saving} placeholder={`1–${maximumQuantity}`} />
                    <small>Maksimal {maximumQuantity} eksemplar rusak tersedia di rak ini.</small>
                  </label>
                  <label className="book-destruction-reason">Alasan Pemusnahan
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} required placeholder="Jelaskan alasan buku dimusnahkan" disabled={saving} />
                    <small>{reason.length}/1000 karakter</small>
                  </label>
                </>
              )}
            </>
          ) : (
            <div className="book-destruction-step-hint book-destruction-book-hint">
              <PackageX size={17} />
              <span>Pilih buku rusak dari hasil pencarian untuk menampilkan tanggal, lokasi rak, jumlah barang, dan alasan pemusnahan.</span>
            </div>
          )}
          <footer className="master-modal-actions book-destruction-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedBook || !selectedRack || !quantity || maximumQuantity < 1}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan Pemusnahan'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

export default function SchoolBookDestructionPage({ rights }) {
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchBookDestructionHistory({ page, limit: pageSize, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setHistory(result.history || []);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, refreshKey]);

  function handleSaved(message) {
    setModalOpen(false);
    setSuccess(message);
    setPage(1);
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="library-module-page book-destruction-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">PENGELOLAAN KOLEKSI</span>
        <h1>Pemusnahan Buku</h1>
        <p>Catat buku rusak yang dimusnahkan dan perbarui stok katalog secara otomatis.</p>
      </header>
      {success && <div className="book-stock-success" role="status"><Check size={16} />{success}</div>}
      {error && <div className="library-error" role="alert">{error}</div>}
      <section className="library-panel book-destruction-history">
        <div className="library-panel-heading">
          <div><span className="library-eyebrow">RIWAYAT PEMUSNAHAN</span><h2>Data Pemusnahan</h2><p>{Number(pagination.total || 0).toLocaleString('id-ID')} transaksi</p></div>
          {rights?.edit && <button type="button" className="master-button master-button-primary" onClick={() => { setSuccess(''); setModalOpen(true); }}><Plus size={15} />Tambah Pemusnahan</button>}
        </div>
        <div className="master-table-scroll">
          <table className="master-table">
            <thead><tr><th>No</th><th>Tanggal Pemusnahan</th><th>Nama Buku</th><th>Jumlah Buku</th><th>Lokasi Rak</th><th>Keterangan</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="master-empty-cell" colSpan={6}>Memuat data pemusnahan...</td></tr>
                : !history.length ? <tr><td className="master-empty-cell" colSpan={6}>Belum ada data pemusnahan.</td></tr>
                  : history.map((entry, index) => <tr key={entry.id}>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{dateLabel(entry.destruction_date)}</td>
                    <td><b>{entry.book_title}</b></td>
                    <td>{Number(entry.quantity).toLocaleString('id-ID')}</td>
                    <td>{entry.rack_name}</td>
                    <td>{entry.reason}</td>
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
      {modalOpen && <DestructionModal onClose={() => setModalOpen(false)} onSaved={handleSaved} />}
    </div>
  );
}
