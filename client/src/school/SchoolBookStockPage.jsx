import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, LoaderCircle, PackagePlus, RotateCcw, Search } from 'lucide-react';
import { addBookStock, findStockBookByBarcode, searchStockBooks } from './schoolBookApi.js';

const maximumBookQuantity = 10000;

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
  const searchRef = useRef(null);
  const barcodeRef = useRef(null);
  const canEdit = Boolean(rights?.edit);
  const currentQuantity = Number(selectedBook?.qty || 0);
  const addedQuantity = Number(quantity);
  const projectedQuantity = currentQuantity + (Number.isInteger(addedQuantity) ? addedQuantity : 0);
  const remainingCapacity = maximumBookQuantity - currentQuantity;

  useEffect(() => {
    function closeSearch(event) {
      if (!searchRef.current?.contains(event.target) && !barcodeRef.current?.contains(event.target)) {
        setLookupOpen(false);
        setBarcodeLookupOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeSearch);
    return () => document.removeEventListener('pointerdown', closeSearch);
  }, []);

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
          chooseBook(books[0], 'barcode');
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

  function chooseBook(book, selectedBy = 'name') {
    setSelectedBook(book);
    setQuery(book.title);
    if (selectedBy === 'name') setBarcode(book.kode_buku || book.nomor_induk || '');
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
            <div className="book-stock-field" ref={barcodeRef}>
              <label htmlFor="book-stock-barcode">Scan Barcode Buku / Isi Kode Barcode</label>
              <div className="book-stock-search-box">
                <div className={`master-search book-stock-search ${barcodeLookupOpen ? 'is-open' : ''}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    id="book-stock-barcode"
                    type="text"
                    value={barcode}
                    placeholder="Scan barcode atau ketik kode..."
                    autoComplete="off"
                    maxLength={100}
                    onFocus={() => setBarcodeLookupOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault();
                    }}
                    onChange={(event) => {
                      setBarcode(event.target.value);
                      setSelectedBook(null);
                      setQuery('');
                      setQuantity('');
                      setLookupOpen(false);
                      setBarcodeLookupOpen(true);
                      setSubmitError('');
                      setSuccess('');
                    }}
                  />
                </div>
                {barcodeSearching && <small className="book-stock-barcode-status"><LoaderCircle size={13} className="book-stock-spinner" />Mencari barcode...</small>}
                {barcodeLookupError && <small className="book-stock-barcode-status is-error" role="status">{barcodeLookupError}</small>}
                {barcodeLookupOpen && barcodeMatches.length > 1 && (
                  <div className="book-stock-results" role="listbox" aria-label="Buku dengan barcode yang cocok">
                    {barcodeMatches.map((book) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedBook?.id === book.id}
                        className="book-stock-result"
                        key={book.id}
                        onClick={() => chooseBook(book, 'barcode')}
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
              </div>
              <small>Barcode yang dipindai atau dimasukkan akan memilih buku secara otomatis.</small>
            </div>

            <div className="book-stock-field" ref={searchRef}>
              <label htmlFor="book-stock-search">Nama Barang</label>
              <div className="book-stock-search-box">
                <div className={`master-search book-stock-search ${lookupOpen ? 'is-open' : ''}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    id="book-stock-search"
                    type="search"
                    value={query}
                    placeholder="Ketik minimal 3 huruf..."
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={lookupOpen && query.trim().length >= 3}
                    aria-controls="book-stock-results"
                    onFocus={() => setLookupOpen(true)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setBarcode('');
                      setSelectedBook(null);
                      setQuantity('');
                      setLookupOpen(true);
                      setSubmitError('');
                      setSuccess('');
                    }}
                  />
                </div>
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
                        onClick={() => chooseBook(book, 'name')}
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
              <small>Daftar buku yang sesuai muncul setelah mengetik minimal 3 huruf.</small>
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
    </div>
  );
}
