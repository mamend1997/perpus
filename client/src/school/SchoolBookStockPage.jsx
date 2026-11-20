import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, LoaderCircle, PackagePlus, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  addBookStock, deleteBookStockMovements, fetchBookStockHistory,
  findStockBookByBarcode, searchStockBooks, updateBookStockMovement
} from './schoolBookApi.js';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';

const maximumBookQuantity = 10000;
const stockHistoryPageSize = 25;

function StockMovementForm({ movement, onClose, onSave }) {
  const [form, setForm] = useState({
    stockDate: String(movement.stock_date).slice(0, 10),
    quantity: String(movement.quantity_added),
    note: movement.note || ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximumBookQuantity) {
      setError(`Jumlah harus berupa bilangan bulat antara 1 dan ${maximumBookQuantity}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, quantity });
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
      <section className="master-modal stock-history-edit-modal" role="dialog" aria-modal="true" aria-labelledby="stock-history-edit-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">RIWAYAT STOK</span><h2 id="stock-history-edit-title">Edit Penambahan Stok</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={17} /></button>
        </header>
        <p className="stock-history-edit-book">{movement.book_title}</p>
        <form className="master-form-grid" onSubmit={submit}>
          <label>Tanggal
            <input type="date" value={form.stockDate} onChange={(event) => setForm((value) => ({ ...value, stockDate: event.target.value }))} required />
          </label>
          <label>Jumlah eksemplar
            <input type="number" min="1" max={maximumBookQuantity} step="1" value={form.quantity} onChange={(event) => setForm((value) => ({ ...value, quantity: event.target.value }))} required />
          </label>
          <label className="stock-history-edit-wide">Keterangan
            <textarea rows={4} maxLength={1000} value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} />
          </label>
          {error && <div className="library-error stock-history-edit-wide" role="alert">{error}</div>}
          <footer className="master-modal-actions stock-history-edit-wide">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Check size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function stockDateLabel(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function todayDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function SchoolBookStockPage({ rights }) {
  const [barcode, setBarcode] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [barcodeMatches, setBarcodeMatches] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [stockDate, setStockDate] = useState(todayDate);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [barcodeLookupOpen, setBarcodeLookupOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [barcodeLookupError, setBarcodeLookupError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState({});
  const [editingMovement, setEditingMovement] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [deleteHistoryError, setDeleteHistoryError] = useState('');
  const searchRef = useRef(null);
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const currentQuantity = Number(selectedBook?.qty || 0);
  const addedQuantity = Number(quantity);
  const projectedQuantity = currentQuantity + (Number.isInteger(addedQuantity) ? addedQuantity : 0);
  const remainingCapacity = maximumBookQuantity - currentQuantity;
  const selectedHistoryIds = Object.keys(selectedHistory);
  const deletableHistory = history.filter((movement) => Number(movement.quantity_removed || 0) === 0);
  const allVisibleHistorySelected = deletableHistory.length > 0 && deletableHistory.every((movement) => Boolean(selectedHistory[String(movement.id)]));

  useEffect(() => {
    function closeSearch(event) {
      if (!searchRef.current?.contains(event.target)) {
        setLookupOpen(false);
        setBarcodeLookupOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeSearch);
    return () => document.removeEventListener('pointerdown', closeSearch);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError('');
    fetchBookStockHistory({ page: historyPage, limit: stockHistoryPageSize, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setHistory(result.history || []);
        setHistoryPagination(result.pagination || { page: 1, total: 0, totalPages: 0 });
        if (result.pagination?.totalPages && historyPage > result.pagination.totalPages) {
          setHistoryPage(result.pagination.totalPages);
        }
      })
      .catch((error) => { if (!controller.signal.aborted) setHistoryError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyPage, historyRefresh]);

  useEffect(() => {
    setSelectedHistory({});
  }, [historyPage, historyRefresh]);

  useEffect(() => {
    const search = query.trim();
    if (!lookupOpen || search.length < 3) {
      setMatches([]);
      setSearching(false);
      setLookupError('');
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setLookupError('');
      try {
        const result = await searchStockBooks(search, controller.signal);
        if (!controller.signal.aborted) setMatches(result.books || []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMatches([]);
          setLookupError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [lookupOpen, query]);

  useEffect(() => {
    const code = barcode.trim();
    if (code.length < 2) {
      setBarcodeMatches([]);
      setBarcodeSearching(false);
      setBarcodeLookupError('');
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setBarcodeSearching(true);
      setBarcodeLookupError('');
      try {
        const result = await findStockBookByBarcode(code, controller.signal);
        if (controller.signal.aborted) return;
        const books = result.books || [];
        setBarcodeMatches(books);
        if (books.length === 1) {
          chooseBook(books[0]);
        } else if (books.length > 1) {
          setBarcodeLookupOpen(true);
        } else {
          setBarcodeLookupOpen(false);
          setBarcodeLookupError('Buku dengan kode barcode tersebut tidak ditemukan.');
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setBarcodeMatches([]);
          setBarcodeLookupError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setBarcodeSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [barcode]);

  function chooseBook(book) {
    setSelectedBook(book);
    setQuery(book.title);
    setBarcode('');
    setQuantity('');
    setLookupOpen(false);
    setBarcodeLookupOpen(false);
    setMatches([]);
    setBarcodeMatches([]);
    setLookupError('');
    setBarcodeLookupError('');
    setSubmitError('');
    setSuccess('');
  }

  function clearForm() {
    setBarcode('');
    setSelectedBook(null);
    setQuery('');
    setStockDate(todayDate());
    setQuantity('');
    setNote('');
    setLookupOpen(false);
    setBarcodeLookupOpen(false);
    setMatches([]);
    setBarcodeMatches([]);
    setLookupError('');
    setBarcodeLookupError('');
    setSubmitError('');
    setSuccess('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSubmitError('');
    setSuccess('');

    if (!stockDate) {
      setSubmitError('Tanggal penambahan stok wajib diisi.');
      return;
    }
    if (!selectedBook) {
      setSubmitError('Scan barcode atau pilih nama buku dari hasil pencarian.');
      return;
    }
    if (!Number.isInteger(addedQuantity) || addedQuantity < 1 || addedQuantity > remainingCapacity) {
      setSubmitError(`Jumlah tambahan harus antara 1 dan ${Math.max(remainingCapacity, 0)} eksemplar.`);
      return;
    }

    setSaving(true);
    try {
      const result = await addBookStock(selectedBook.id, addedQuantity, note, stockDate);
      const updatedBook = { ...selectedBook, ...result.book };
      setSelectedBook(updatedBook);
      setQuery(updatedBook.title);
      setBarcode('');
      setQuantity('');
      setNote('');
      setSuccess(`Stok ${addedQuantity} eksemplar berhasil ditambahkan. Total kini ${Number(updatedBook.qty).toLocaleString('id-ID')}.`);
      setHistoryPage(1);
      setHistoryRefresh((value) => value + 1);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement(data) {
    const result = await updateBookStockMovement(editingMovement.id, data);
    setEditingMovement(null);
    setSuccess(result.message);
    setHistoryPage(1);
    setHistoryRefresh((value) => value + 1);
    if (selectedBook && String(selectedBook.id) === String(editingMovement.book_id)) {
      setSelectedBook((book) => ({ ...book, qty: result.book.qty }));
    }
  }

  async function deleteSelectedHistory() {
    if (!deleteTarget?.length) return;
    setDeletingHistory(true);
    setDeleteHistoryError('');
    try {
      const result = await deleteBookStockMovements(deleteTarget);
      setDeleteTarget(null);
      setSelectedHistory({});
      setSuccess(result.message);
      setHistoryPage(1);
      setHistoryRefresh((value) => value + 1);
      if (selectedBook && history.some((movement) => deleteTarget.includes(String(movement.id))
        && String(movement.book_id) === String(selectedBook.id))) {
        setSelectedBook(null);
        setBarcode('');
        setQuery('');
      }
    } catch (error) {
      setDeleteHistoryError(error.message);
    } finally {
      setDeletingHistory(false);
    }
  }

  function toggleVisibleHistory(checked) {
    setSelectedHistory((current) => {
      const next = { ...current };
      deletableHistory.forEach((movement) => {
        const id = String(movement.id);
        if (checked) next[id] = true;
        else delete next[id];
      });
      return next;
    });
  }

  return (
    <div className="library-module-page catalog-page book-stock-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">PENGELOLAAN KOLEKSI</span>
        <h1>Tambah Stok Buku</h1>
        <p>Tambahkan eksemplar pada judul yang sudah terdaftar di katalog perpustakaan.</p>
      </header>

      {submitError && <div className="library-error" role="alert">{submitError}</div>}
      {success && <div className="book-stock-success" role="status"><Check size={17} />{success}</div>}
      {!canEdit && <div className="book-stock-readonly" role="note">Akun Anda hanya dapat melihat data. Minta admin memberikan izin edit untuk menambahkan stok.</div>}

      <div className="book-stock-layout">
        <form className="library-panel book-stock-form" onSubmit={submit}>
          <div className="library-panel-heading">
            <div><span className="library-eyebrow">FORM STOK MASUK</span><h2>Data penambahan stok</h2></div>
            <PackagePlus size={19} />
          </div>

          <div className="book-stock-fields">
            <div className="book-stock-field" ref={searchRef}>
              <label htmlFor="book-stock-search">Cari nama, kode, nomor induk, atau scan barcode</label>
              <CameraBarcodeScanner label="Scan barcode" onScan={(value) => {
                setBarcode(value);
                setSelectedBook(null);
                setQuery('');
                setQuantity('');
                setLookupOpen(false);
                setBarcodeLookupOpen(true);
                setSubmitError('');
                setSuccess('');
              }} />
              <div className="book-stock-search-box">
                <div className={`master-search book-stock-search ${lookupOpen || barcodeLookupOpen ? 'is-open' : ''}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    id="book-stock-search"
                    type="search"
                    value={barcode || query}
                    placeholder="Nama buku, kode, nomor induk, atau barcode"
                    autoComplete="off"
                    maxLength={100}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={lookupOpen && query.trim().length >= 3 || barcodeLookupOpen && barcodeMatches.length > 1}
                    aria-controls="book-stock-results"
                    onFocus={() => {
                      if (barcode) setBarcodeLookupOpen(true);
                      else setLookupOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      const value = event.currentTarget.value.trim();
                      const matchingBook = matches.find((book) => book.title.toLocaleLowerCase('id-ID') === value.toLocaleLowerCase('id-ID'));
                      if (matchingBook) {
                        chooseBook(matchingBook);
                        return;
                      }
                      if (!value) return;
                      setBarcode(value);
                      setQuery('');
                      setLookupOpen(false);
                      setBarcodeLookupOpen(true);
                    }}
                    onChange={(event) => {
                      setBarcode('');
                      setQuery(event.target.value);
                      setSelectedBook(null);
                      setQuantity('');
                      setLookupOpen(true);
                      setBarcodeLookupOpen(false);
                      setSubmitError('');
                      setSuccess('');
                    }}
                  />
                </div>
                {barcodeSearching && <small className="book-stock-barcode-status"><LoaderCircle size={13} className="book-stock-spinner" />Mencari barcode...</small>}
                {barcodeLookupError && <small className="book-stock-barcode-status is-error" role="status">{barcodeLookupError}</small>}
                {barcodeLookupOpen && barcodeMatches.length > 1 && (
                  <div className="book-stock-results" id="book-stock-results" role="listbox" aria-label="Buku dengan barcode yang cocok">
                    {barcodeMatches.map((book) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedBook?.id === book.id}
                        className="book-stock-result"
                        key={book.id}
                        onClick={() => chooseBook(book)}
                      >
                        <span className="book-stock-result-icon"><BookOpen size={16} /></span>
                        <span className="book-stock-result-copy">
                          <b>{book.title}</b>
                          <small>{book.kode_buku || book.nomor_induk || 'Kode belum tersedia'}</small>
                        </span>
                        <span className="book-stock-result-qty">{Number(book.qty).toLocaleString('id-ID')} stok</span>
                      </button>
                    ))}
                  </div>
                )}
                {lookupOpen && query.trim().length >= 3 && (
                  <div className="book-stock-results" id="book-stock-results" role="listbox" aria-label="Hasil pencarian buku">
                    {searching ? (
                      <div className="book-stock-result-message"><LoaderCircle size={15} className="book-stock-spinner" />Mencari buku...</div>
                    ) : lookupError ? (
                      <div className="book-stock-result-message is-error">{lookupError}</div>
                    ) : matches.length ? matches.map((book) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedBook?.id === book.id}
                        className="book-stock-result"
                        key={book.id}
                        onClick={() => chooseBook(book)}
                      >
                        <span className="book-stock-result-icon"><BookOpen size={16} /></span>
                        <span className="book-stock-result-copy">
                          <b>{book.title}</b>
                          <small>{book.kode_buku || book.nomor_induk || 'Kode belum tersedia'}</small>
                        </span>
                        <span className="book-stock-result-qty">{Number(book.qty).toLocaleString('id-ID')} stok</span>
                      </button>
                    )) : (
                      <div className="book-stock-result-message">Tidak ada buku yang cocok.</div>
                    )}
                  </div>
                )}
              </div>
              <small>Gunakan tombol scan atau cari berdasarkan nama, kode, maupun nomor induk.</small>
            </div>

            {selectedBook && (
              <div className="book-stock-selected">
                <div className="book-stock-result-icon"><BookOpen size={17} /></div>
                <div><small>Buku dipilih</small><b>{selectedBook.title}</b><span>{selectedBook.kode_buku || selectedBook.nomor_induk || 'Kode belum tersedia'}</span></div>
                <span className="book-stock-current-badge">{currentQuantity.toLocaleString('id-ID')} stok</span>
              </div>
            )}

            <label className="book-stock-field">
              <span>Tanggal</span>
              <input
                type="date"
                value={stockDate}
                onChange={(event) => setStockDate(event.target.value)}
                required
                disabled={!canEdit}
              />
            </label>

            <label className="book-stock-field">
              <span>Jumlah</span>
              <input
                type="number"
                min="1"
                max={Math.max(remainingCapacity, 1)}
                step="1"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setSubmitError('');
                  setSuccess('');
                }}
                placeholder="Masukkan jumlah eksemplar"
                required
                disabled={!canEdit || !selectedBook || remainingCapacity < 1}
              />
              {selectedBook && <small>{remainingCapacity > 0
                ? `Stok setelah ditambahkan: ${projectedQuantity.toLocaleString('id-ID')} dari maksimal ${maximumBookQuantity.toLocaleString('id-ID')}.`
                : 'Jumlah buku sudah mencapai batas maksimal.'}</small>}
            </label>

            <label className="book-stock-field">
              <span>Keterangan <small>(opsional)</small></span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Sumber pengadaan, hibah, pembelian, donatur, atau catatan lainnya"
                disabled={!canEdit}
              />
              <small>{note.length}/1000 karakter</small>
            </label>
          </div>

          <div className="book-stock-actions">
            <button type="button" className="master-button master-button-light" onClick={clearForm} disabled={saving}>
              <RotateCcw size={15} />Batal
            </button>
            {canEdit && <button
              type="submit"
              className="master-button master-button-primary"
              disabled={saving || !selectedBook || !quantity || remainingCapacity < 1}
            >
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <PackagePlus size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>}
          </div>
        </form>

        <aside className="library-panel book-stock-summary">
          <span className="library-eyebrow">RINGKASAN STOK</span>
          {selectedBook ? (
            <>
              <div className="book-stock-summary-icon"><BookOpen size={21} /></div>
              <h2>{selectedBook.title}</h2>
              <div className="book-stock-summary-row"><span>Stok saat ini</span><b>{currentQuantity.toLocaleString('id-ID')}</b></div>
              <div className="book-stock-summary-row"><span>Tambahan</span><b className="is-added">{Number.isInteger(addedQuantity) && addedQuantity > 0 ? `+${addedQuantity.toLocaleString('id-ID')}` : '—'}</b></div>
              <div className="book-stock-summary-total"><span>Total setelah disimpan</span><b>{projectedQuantity.toLocaleString('id-ID')}</b></div>
              <p>Setiap eksemplar baru akan dibuat otomatis dengan nomor serial dan status tersedia.</p>
            </>
          ) : (
            <div className="book-stock-empty">
              <div className="book-stock-summary-icon"><PackagePlus size={21} /></div>
              <b>Belum ada buku dipilih</b>
              <span>Cari judul buku untuk melihat jumlah stok dan ringkasan penambahan.</span>
            </div>
          )}
        </aside>
      </div>

      <section className="library-panel book-stock-history">
        <div className="library-panel-heading book-stock-history-heading">
          <div><span className="library-eyebrow">RIWAYAT TRANSAKSI</span><h2>Riwayat Stok</h2><p>{Number(historyPagination.total || 0).toLocaleString('id-ID')} transaksi</p></div>
          {canDelete && <button
            type="button"
            className="master-button procurement-delete-selected"
            disabled={!selectedHistoryIds.length || deletingHistory}
            onClick={() => { setDeleteHistoryError(''); setDeleteTarget(selectedHistoryIds); }}
          >
            <Trash2 size={15} />Hapus Terpilih{selectedHistoryIds.length ? ` (${selectedHistoryIds.length})` : ''}
          </button>}
        </div>
        {historyError && <div className="library-error" role="alert">{historyError}<button type="button" onClick={() => setHistoryRefresh((value) => value + 1)}>Coba lagi</button></div>}
        <div className="master-table-scroll">
          <table className="master-table book-stock-history-table">
            <thead><tr>
              {canDelete && <th className="book-stock-history-checkbox"><input type="checkbox" checked={allVisibleHistorySelected} onChange={(event) => toggleVisibleHistory(event.target.checked)} aria-label="Pilih semua riwayat penambahan di halaman ini" /></th>}
              <th>No</th><th>Tanggal</th><th>Nama Buku</th><th>Jumlah Tambahan</th><th>Pengurangan Stok</th><th>Stok Sebelumnya</th><th>Stok Setelah</th><th>Keterangan</th><th>Petugas</th>
              {(canEdit || canDelete) && <th>Aksi</th>}
            </tr></thead>
            <tbody>
              {historyLoading ? <tr><td className="master-empty-cell" colSpan={9 + (canDelete ? 1 : 0) + (canEdit || canDelete ? 1 : 0)}>Memuat riwayat stok...</td></tr>
                : history.length === 0 ? <tr><td className="master-empty-cell" colSpan={9 + (canDelete ? 1 : 0) + (canEdit || canDelete ? 1 : 0)}>Belum ada riwayat stok.</td></tr>
                  : history.map((movement, index) => <tr key={movement.id}>
                    {canDelete && <td className="book-stock-history-checkbox"><input type="checkbox" checked={Boolean(selectedHistory[String(movement.id)])} disabled={Number(movement.quantity_removed || 0) > 0} onChange={(event) => setSelectedHistory((current) => {
                      const next = { ...current };
                      if (event.target.checked) next[String(movement.id)] = true;
                      else delete next[String(movement.id)];
                      return next;
                    })} aria-label={`Pilih riwayat stok ${movement.book_title}`} /></td>}
                    <td>{(historyPage - 1) * stockHistoryPageSize + index + 1}</td>
                    <td>{stockDateLabel(movement.stock_date)}</td>
                    <td><b>{movement.book_title}</b></td>
                    <td>{Number(movement.quantity_added || 0) ? <span className="book-stock-history-added">+{Number(movement.quantity_added).toLocaleString('id-ID')}</span> : '—'}</td>
                    <td>{Number(movement.quantity_removed || 0) ? <span className="book-stock-history-removed">−{Number(movement.quantity_removed).toLocaleString('id-ID')}</span> : '—'}</td>
                    <td>{Number(movement.previous_qty || 0).toLocaleString('id-ID')}</td>
                    <td>{Number(movement.resulting_qty || 0).toLocaleString('id-ID')}</td>
                    <td className="book-stock-history-note">{movement.note || '—'}</td>
                    <td>{movement.actor_name || '—'}</td>
                    {(canEdit || canDelete) && <td><div className="student-row-actions">
                      {canEdit && Number(movement.quantity_removed || 0) === 0 && <button type="button" className="master-icon-button" title="Edit riwayat stok" aria-label={`Edit riwayat ${movement.book_title}`} onClick={() => setEditingMovement(movement)}><Pencil size={15} /></button>}
                      {canDelete && Number(movement.quantity_removed || 0) === 0 && <button type="button" className="master-icon-button" title="Hapus riwayat stok" aria-label={`Hapus riwayat ${movement.book_title}`} onClick={() => { setDeleteHistoryError(''); setDeleteTarget([String(movement.id)]); }}><Trash2 size={15} /></button>}
                    </div></td>}
                  </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Halaman {historyPagination.totalPages ? historyPage : 0} dari {Math.max(1, historyPagination.totalPages || 0)}</span>
          <div>
            <button type="button" className="master-icon-button" disabled={historyLoading || historyPage <= 1} onClick={() => setHistoryPage((value) => Math.max(1, value - 1))} aria-label="Riwayat halaman sebelumnya">‹</button>
            <button type="button" className="master-icon-button" disabled={historyLoading || historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage((value) => value + 1)} aria-label="Riwayat halaman berikutnya">›</button>
          </div>
        </footer>
      </section>
      {editingMovement && <StockMovementForm movement={editingMovement} onClose={() => setEditingMovement(null)} onSave={saveMovement} />}
      {deleteTarget && <SchoolConfirmDialog
        title={deleteTarget.length > 1 ? 'Hapus riwayat stok terpilih?' : 'Hapus riwayat penambahan stok?'}
        message={`${deleteTarget.length} riwayat akan dihapus dan jumlah stok buku akan disesuaikan.`}
        itemName={`${deleteTarget.length} riwayat stok`}
        loading={deletingHistory}
        error={deleteHistoryError}
        onClose={() => { if (!deletingHistory) { setDeleteTarget(null); setDeleteHistoryError(''); } }}
        onConfirm={deleteSelectedHistory}
      />}
    </div>
  );
}
