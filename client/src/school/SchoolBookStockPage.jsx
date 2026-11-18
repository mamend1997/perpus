import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, LoaderCircle, PackagePlus, RotateCcw, Search } from 'lucide-react';
import { addBookStock, searchStockBooks } from './schoolBookApi.js';

const maximumBookQuantity = 10000;

export default function SchoolBookStockPage({ rights }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);
  const canEdit = Boolean(rights?.edit);
  const currentQuantity = Number(selectedBook?.qty || 0);
  const addedQuantity = Number(quantity);
  const projectedQuantity = currentQuantity + (Number.isInteger(addedQuantity) ? addedQuantity : 0);
  const remainingCapacity = maximumBookQuantity - currentQuantity;

  useEffect(() => {
    function closeSearch(event) {
      if (!searchRef.current?.contains(event.target)) setLookupOpen(false);
    }
    document.addEventListener('pointerdown', closeSearch);
    return () => document.removeEventListener('pointerdown', closeSearch);
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (!lookupOpen || search.length < 2) {
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

  function chooseBook(book) {
    setSelectedBook(book);
    setQuery(book.title);
    setQuantity('');
    setLookupOpen(false);
    setMatches([]);
    setLookupError('');
    setSubmitError('');
    setSuccess('');
  }

  function clearForm() {
    setSelectedBook(null);
    setQuery('');
    setQuantity('');
    setNote('');
    setLookupOpen(false);
    setMatches([]);
    setLookupError('');
    setSubmitError('');
    setSuccess('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSubmitError('');
    setSuccess('');

    if (!selectedBook) {
      setSubmitError('Pilih buku dari daftar hasil pencarian terlebih dahulu.');
      return;
    }
    if (!Number.isInteger(addedQuantity) || addedQuantity < 1 || addedQuantity > remainingCapacity) {
      setSubmitError(`Jumlah tambahan harus antara 1 dan ${Math.max(remainingCapacity, 0)} eksemplar.`);
      return;
    }

    setSaving(true);
    try {
      const result = await addBookStock(selectedBook.id, addedQuantity, note);
      const updatedBook = { ...selectedBook, ...result.book };
      setSelectedBook(updatedBook);
      setQuery(updatedBook.title);
      setQuantity('');
      setNote('');
      setSuccess(`Stok ${addedQuantity} eksemplar berhasil ditambahkan. Total kini ${Number(updatedBook.qty).toLocaleString('id-ID')}.`);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSaving(false);
    }
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
              <label htmlFor="book-stock-search">Cari Judul Buku</label>
              <div className="book-stock-search-box">
                <div className={`master-search book-stock-search ${lookupOpen ? 'is-open' : ''}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    id="book-stock-search"
                    type="search"
                    value={query}
                    placeholder="Ketik minimal 2 karakter..."
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={lookupOpen && query.trim().length >= 2}
                    aria-controls="book-stock-results"
                    onFocus={() => setLookupOpen(true)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelectedBook(null);
                      setQuantity('');
                      setLookupOpen(true);
                      setSubmitError('');
                      setSuccess('');
                    }}
                  />
                </div>
                {lookupOpen && query.trim().length >= 2 && (
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
                      <div className="book-stock-result-message">Tidak ada judul yang cocok.</div>
                    )}
                  </div>
                )}
              </div>
              <small>Pilih salah satu buku dari hasil pencarian agar stok ditambahkan ke judul yang benar.</small>
            </div>

            {selectedBook && (
              <div className="book-stock-selected">
                <div className="book-stock-result-icon"><BookOpen size={17} /></div>
                <div><small>Buku dipilih</small><b>{selectedBook.title}</b><span>{selectedBook.kode_buku || selectedBook.nomor_induk || 'Kode belum tersedia'}</span></div>
                <span className="book-stock-current-badge">{currentQuantity.toLocaleString('id-ID')} stok</span>
              </div>
            )}

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
    </div>
  );
}
