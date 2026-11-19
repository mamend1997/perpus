import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Search, Ticket } from 'lucide-react';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import { createReservation } from './schoolReservationApi.js';
import { fetchPublicSchool, loginPublicMember, searchPublicBooks } from './publicLibraryApi.js';
import useSchoolFavicon from './useSchoolFavicon.js';

const portalSections = [
  { key: 'check', label: 'Cek Buku', suffix: '', icon: BookOpen },
  { key: 'booking', label: 'Booking Buku', suffix: '/booking', icon: Ticket }
];

function formatPublicDate(value) {
  if (!value) return '—';
  const dateValue = value instanceof Date ? value : null;
  const [year, month, day] = dateValue
    ? [dateValue.getFullYear(), dateValue.getMonth() + 1, dateValue.getDate()]
    : String(value).slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
    : '—';
}

function bookDetailRows(book) {
  return [
    ['Nomor Induk', book.nomor_induk],
    ['Kode Buku', book.kode_buku],
    ['Nomor Penerimaan', book.no_terima],
    ['Tanggal Terima', book.received_date ? formatPublicDate(book.received_date) : ''],
    ['ISBN', book.isbn],
    ['Pengarang', book.author_name],
    ['Penerbit', book.publisher_name],
    ['Agen', book.agent_name],
    ['Topik', book.topic_name],
    ['Koleksi', book.collection_name],
    ['Jenis', book.type_name],
    ['Bahasa', book.language_name],
    ['GMD', book.gmd],
    ['Tahun Terbit', book.year],
    ['Kota Terbit', book.city],
    ['Deskripsi Fisik', book.physical_description],
    ['Jumlah Halaman', book.pages],
    ['Jumlah di Daftar Pustaka', book.qty],
    ['Sumber', book.source],
    ['Harga', book.price == null ? '' : formatCurrency(book.price)]
  ].filter(([, value]) => value != null && value !== '');
}

export default function PublicLibraryPortal({
  schoolCode, section = 'check', account, onAccountUpdated, onLogout, onNavigate
}) {
  const [school, setSchool] = useState(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searching, setSearching] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const normalizedCode = schoolCode.toUpperCase();
  const accountMatchesSchool = String(account?.school?.code || '').toUpperCase() === normalizedCode;
  const isMember = account?.role === 'member' && accountMatchesSchool;
  const activeSection = section === 'booking' ? 'booking' : 'check';
  const title = activeSection === 'booking' ? 'Booking Buku' : 'Cek Buku';
  const description = activeSection === 'booking'
    ? 'Ajukan booking buku yang sedang tidak tersedia. Nama anggota diisi dari akun Anda.'
    : 'Cari judul, kode, nomor induk, atau scan barcode untuk melihat detail dan ketersediaan koleksi.';

  const appLinks = useMemo(() => portalSections.map((item) => ({
    ...item,
    href: `/public/${encodeURIComponent(normalizedCode)}${item.suffix}`
  })), [normalizedCode]);

  useSchoolFavicon(school?.logo);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingSchool(true);
    setError('');
    fetchPublicSchool(normalizedCode, controller.signal)
      .then(({ school: result }) => {
        if (!controller.signal.aborted) setSchool(result);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSchool(false);
      });
    return () => controller.abort();
  }, [normalizedCode]);

  useEffect(() => {
    if (!query.trim()) {
      setBooks([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchPublicBooks(normalizedCode, { search: query.trim() }, controller.signal)
        .then(({ books: results }) => {
          if (!controller.signal.aborted) setBooks(results || []);
        })
        .catch((searchError) => {
          if (!controller.signal.aborted) setError(searchError.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedCode, query]);

  async function lookupBarcode(value) {
    const code = String(value || '').trim();
    if (!code) {
      setError('Pindai barcode buku terlebih dahulu.');
      return;
    }
    setError('');
    setNotice('');
    setQuery('');
    setBooks([]);
    setSelectedBook(null);
    setSearching(true);
    try {
      const { books: results } = await searchPublicBooks(normalizedCode, { barcode: code });
      setBooks(results || []);
      if (!results?.length) {
        setSelectedBook(null);
        setError('Buku dengan barcode tersebut tidak ditemukan.');
        return;
      }
      setSelectedBook(results[0]);
      setQuery(results[0].title);
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setSearching(false);
    }
  }

  function chooseBook(book) {
    setSelectedBook(book);
    setQuery(book.title);
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    if (activeSection === 'check') return;
    if (!isMember) {
      setError('Masuk dengan akun member sekolah untuk melanjutkan.');
      return;
    }
    if (!selectedBook) {
      setError('Pilih buku dari hasil pencarian terlebih dahulu.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (activeSection === 'booking') {
        if (Number(selectedBook.available_count) > 0) {
          throw new Error('Booking hanya dapat dibuat saat tidak ada eksemplar yang tersedia.');
        }
        const result = await createReservation({
          bookId: selectedBook.id,
          quantity: Number(quantity),
          notes
        });
        setNotice(result.message || 'Booking buku berhasil dikirim.');
        setQuantity('1');
        setNotes('');
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const result = await loginPublicMember(normalizedCode, email, password);
      if (result.account?.role !== 'member' || String(result.account?.school?.code || '').toUpperCase() !== normalizedCode) {
        throw new Error('Gunakan akun member dari sekolah pada portal ini.');
      }
      localStorage.setItem('school-token', result.token);
      onAccountUpdated(result.account);
      setPassword('');
    } catch (loginRequestError) {
      setLoginError(loginRequestError.message);
    } finally {
      setLoggingIn(false);
    }
  }

  if (loadingSchool) {
    return <main className="public-library-page"><div className="public-library-loading"><LoaderCircle size={18} className="book-stock-spinner" />Memuat portal perpustakaan...</div></main>;
  }

  return (
    <main className="public-library-page">
      <header className="public-library-header">
        <div className="public-library-school">
          {school?.logo && <img src={school.logo} alt="" />}
          <div><span>PORTAL PERPUSTAKAAN</span><h1>{school?.name || 'Perpustakaan Sekolah'}</h1></div>
        </div>
        <div className="public-library-nav">
          {appLinks.map(({ key, label, href, icon: Icon }) => (
            <a key={key} href={href} className={activeSection === key ? 'active' : ''}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !onNavigate) return;
                event.preventDefault();
                onNavigate(href);
              }}>
              <Icon size={15} />{label}
            </a>
          ))}
        </div>
      </header>

      <section className="public-library-content">
        <div className="public-library-title">
          <span className="library-eyebrow">LAYANAN ANGGOTA</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        {error && <div className="public-library-message is-error" role="alert">{error}</div>}
        {notice && <div className="public-library-message is-success" role="status"><Check size={16} />{notice}</div>}

        <section className="public-library-card">
          <div className="public-book-search-tools">
            <div className="public-book-search-field">
              <label htmlFor="public-book-search">Cari nama, kode, nomor induk, atau scan barcode</label>
              <CameraBarcodeScanner label="Scan barcode" onScan={(value) => { void lookupBarcode(value); }} />
              <div className={`master-search public-book-search ${query ? 'is-open' : ''}`}>
                <Search size={16} aria-hidden="true" />
                <input
                  id="public-book-search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={Boolean(query && books.length)}
                  aria-controls="public-book-results"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setBooks([]);
                    setSelectedBook(null);
                    setError('');
                    setNotice('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && books.length === 1) {
                      event.preventDefault();
                      chooseBook(books[0]);
                    }
                  }}
                  placeholder="Nama buku, kode, nomor induk, atau barcode"
                  autoComplete="off"
                  maxLength={100}
                />
                {searching && <LoaderCircle size={15} className="book-stock-spinner" />}
              </div>
              <small>Gunakan tombol scan atau cari berdasarkan nama, kode, nomor induk, maupun barcode.</small>
            </div>
          </div>

          {searching && <p className="public-library-searching"><LoaderCircle size={15} className="book-stock-spinner" />Mencari buku...</p>}
          {books.length > 0 && (
            <div className="public-book-results" id="public-book-results" role="listbox" aria-label="Hasil pencarian buku">
              {books.map((book) => (
                <button type="button" role="option" aria-selected={selectedBook?.id === book.id} key={book.id} className={`public-book-result ${selectedBook?.id === book.id ? 'selected' : ''}`} onClick={() => chooseBook(book)}>
                  <span><b>{book.title}</b><small>{[book.author_name, book.kode_buku || book.nomor_induk].filter(Boolean).join(' · ') || `Kode ${book.id}`}</small></span>
                  <span className={`public-book-availability ${Number(book.available_count) > 0 ? 'available' : 'unavailable'}`}>
                    {Number(book.available_count) > 0 ? `${book.available_count} bisa dipinjam` : 'Tidak tersedia'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedBook && (
            <article className="public-book-selected">
              <div className="public-book-detail-heading">
                <div><span>DETAIL DAFTAR PUSTAKA</span><h3>{selectedBook.title}</h3></div>
                <div className="public-book-count-summary">
                  <div><small>Total eksemplar</small><b>{Number(selectedBook.total_count).toLocaleString('id-ID')}</b></div>
                  <div><small>Bisa dipinjam</small><b>{Number(selectedBook.available_count).toLocaleString('id-ID')}</b></div>
                </div>
              </div>
              <dl className="public-book-detail-grid">
                {bookDetailRows(selectedBook).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              {selectedBook.description && <div className="public-book-long-description"><b>Deskripsi</b><p>{selectedBook.description}</p></div>}
              {selectedBook.synopsis && <div className="public-book-long-description"><b>Sinopsis</b><p>{selectedBook.synopsis}</p></div>}
              <section className="public-book-rack-info">
                <div><b>Jumlah dan ketersediaan per rak</b><span>Eksemplar tersedia dapat dipinjam.</span></div>
                {selectedBook.rack_distribution?.length ? (
                  <div className="public-book-rack-list">
                    {selectedBook.rack_distribution.map((rack, index) => (
                      <article key={`${rack.rack_id || rack.rack_name}-${index}`}>
                        <b>{rack.rack_code ? `${rack.rack_code} · ` : ''}{rack.rack_name}</b>
                        <span>{Number(rack.total_count).toLocaleString('id-ID')} eksemplar</span>
                        <small>{Number(rack.available_count).toLocaleString('id-ID')} bisa dipinjam · {Number(rack.borrowed_count).toLocaleString('id-ID')} dipinjam · {Number(rack.damaged_count).toLocaleString('id-ID')} rusak</small>
                      </article>
                    ))}
                  </div>
                ) : <p className="public-book-rack-empty">Belum ada data eksemplar fisik pada rak.</p>}
              </section>
            </article>
          )}

          {query && !searching && !books.length && !error && (
            <p className="public-library-empty">Buku tidak ditemukan. Periksa nama, kode, nomor induk, atau barcode.</p>
          )}
        </section>

        {activeSection !== 'check' && (
          <>
            <section className="public-library-card public-member-card">
              <div className="public-member-card-heading"><h3>Akun Anggota</h3><p>Nama diambil otomatis dari akun member aktif.</p></div>
              {isMember ? (
                <div className="public-member-signed-in">
                  <label>Nama anggota<input value={account.name} readOnly aria-readonly="true" /></label>
                  <button type="button" className="master-button master-button-muted" onClick={onLogout}>Keluar</button>
                </div>
              ) : (
                <>
                  {account && <div className="public-library-message is-error" role="status">Sesi saat ini bukan akun member pada sekolah ini. Keluar, lalu masuk dengan akun member.</div>}
                  {account && <button type="button" className="master-button master-button-muted public-member-logout" onClick={onLogout}>Keluar dari sesi saat ini</button>}
                  <form className="public-member-login" onSubmit={submitLogin}>
                    <label>Username atau email<input type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                    <label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                    <div className="public-login-submit">
                      {loginError && <p className="public-library-message is-error" role="alert">{loginError}</p>}
                      <button type="submit" className="master-button master-button-primary" disabled={loggingIn}>
                        {loggingIn ? <><LoaderCircle size={15} className="book-stock-spinner" />Memeriksa...</> : 'Masuk sebagai anggota'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>

            {isMember && (
              <form className="public-library-card public-request-form" onSubmit={submit}>
                <div className="public-member-card-heading"><h3>Detail Booking</h3><p>Booking hanya diproses ketika tidak ada eksemplar yang tersedia.</p></div>
                <label>Jumlah eksemplar
                  <input type="number" min="1" max="100" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </label>
                <label>Keterangan (opsional)
                  <textarea rows="3" maxLength="1000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan untuk petugas perpustakaan" />
                  <small>{notes.length}/1.000 karakter</small>
                </label>
                {selectedBook && Number(selectedBook.available_count) > 0 && <p className="public-library-message is-error">Buku masih tersedia dan belum dapat di-booking.</p>}
                <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedBook || Number(selectedBook.available_count) > 0}>
                  {saving ? <><LoaderCircle size={15} className="book-stock-spinner" />Mengirim...</> : <><Ticket size={15} />Kirim booking</>}
                </button>
              </form>
            )}
          </>
        )}
      </section>
      <footer className="public-library-footer">© {new Date().getFullYear()} {school?.name || 'Perpustakaan Sekolah'}</footer>
    </main>
  );
}
