import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Search, Star, Ticket } from 'lucide-react';
import CameraBarcodeScanner from './CameraBarcodeScanner.jsx';
import { createReservation } from './schoolReservationApi.js';
import { createReview } from './schoolReviewsApi.js';
import { fetchPublicSchool, loginPublicMember, searchPublicBooks } from './publicLibraryApi.js';

const portalSections = [
  { key: 'check', label: 'Cek Buku', suffix: '', icon: BookOpen },
  { key: 'booking', label: 'Booking Buku', suffix: '/booking', icon: Ticket },
  { key: 'rating', label: 'Rating Buku', suffix: '/rating', icon: Star }
];

export default function PublicLibraryPortal({
  schoolCode, section = 'check', account, onAccountUpdated, onLogout
}) {
  const [school, setSchool] = useState(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searching, setSearching] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
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
  const activeSection = portalSections.find((item) => item.key === section) ? section : 'check';
  const title = activeSection === 'booking' ? 'Booking Buku'
    : activeSection === 'rating' ? 'Rating Buku'
      : 'Cek Buku';
  const description = activeSection === 'booking'
    ? 'Ajukan booking buku yang sedang tidak tersedia. Nama anggota diisi dari akun Anda.'
    : activeSection === 'rating'
      ? 'Pindai barcode atau cari judul buku untuk memberi rating dan ulasan.'
      : 'Pindai barcode atau masukkan nama buku untuk melihat ketersediaan koleksi.';

  const appLinks = useMemo(() => portalSections.map((item) => ({
    ...item,
    href: `/public/${encodeURIComponent(normalizedCode)}${item.suffix}`
  })), [normalizedCode]);

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

  async function lookupBarcode(value = barcode) {
    const code = String(value || '').trim();
    if (!code) {
      setError('Masukkan atau pindai barcode buku terlebih dahulu.');
      return;
    }
    setError('');
    setNotice('');
    setBarcode(code);
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
      } else {
        if (!rating) throw new Error('Pilih rating bintang terlebih dahulu.');
        const result = await createReview({ bookId: selectedBook.id, rating, review });
        setNotice(result.message || 'Ulasan berhasil dikirim.');
        setRating(0);
        setReview('');
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
            <a key={key} href={href} className={activeSection === key ? 'active' : ''}><Icon size={15} />{label}</a>
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
            <label className="public-barcode-input">Barcode Buku
              <span><input value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void lookupBarcode();
                }
              }} placeholder="Pindai atau ketik kode barcode" />
                <button type="button" className="master-button master-button-primary" onClick={() => void lookupBarcode()} disabled={searching}><Search size={15} />Cek</button>
              </span>
            </label>
            <CameraBarcodeScanner label="Buka kamera barcode" onScan={(value) => { void lookupBarcode(value); }} />
            <label className="public-book-name-search">Nama buku
              <span className="master-search"><Search size={15} /><input value={query} onChange={(event) => {
                setQuery(event.target.value);
                setSelectedBook(null);
                setError('');
              }} placeholder="Ketik judul buku..." /></span>
            </label>
          </div>

          {searching && <p className="public-library-searching"><LoaderCircle size={15} className="book-stock-spinner" />Mencari buku...</p>}
          {books.length > 0 && (
            <div className="public-book-results" aria-label="Hasil pencarian buku">
              {books.map((book) => (
                <button type="button" key={book.id} className={`public-book-result ${selectedBook?.id === book.id ? 'selected' : ''}`} onClick={() => chooseBook(book)}>
                  <span><b>{book.title}</b><small>{book.kode_buku || book.nomor_induk || `Kode ${book.id}`}</small></span>
                  <span className={`public-book-availability ${Number(book.available_count) > 0 ? 'available' : 'unavailable'}`}>
                    {Number(book.available_count) > 0 ? `${book.available_count} tersedia` : 'Tidak tersedia'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedBook && (
            <article className="public-book-selected">
              <div><span>BUKU DIPILIH</span><h3>{selectedBook.title}</h3><p>{selectedBook.total_count} eksemplar tercatat · {selectedBook.available_count} tersedia</p></div>
            </article>
          )}

          {activeSection === 'check' && query && !searching && !books.length && !error && (
            <p className="public-library-empty">Judul tersebut belum ditemukan di katalog sekolah.</p>
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
                    <label>Email anggota<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
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
                {activeSection === 'booking' ? (
                  <>
                    <div className="public-member-card-heading"><h3>Detail Booking</h3><p>Booking hanya diproses ketika tidak ada eksemplar yang tersedia.</p></div>
                    <label>Jumlah eksemplar
                      <input type="number" min="1" max="100" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                    </label>
                    <label>Keterangan (opsional)
                      <textarea rows="3" maxLength="1000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan untuk petugas perpustakaan" />
                      <small>{notes.length}/1.000 karakter</small>
                    </label>
                    {selectedBook && Number(selectedBook.available_count) > 0 && <p className="public-library-message is-error">Buku masih tersedia dan belum dapat di-booking.</p>}
                  </>
                ) : (
                  <>
                    <div className="public-member-card-heading"><h3>Ulasan Buku</h3><p>Ulasan hanya dapat dikirim setelah buku dipinjam dan dikembalikan.</p></div>
                    <div className="public-rating-input"><span>Rating</span><div role="group" aria-label="Pilih rating bintang">
                      {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value} bintang`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={25} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}
                    </div></div>
                    <label>Ulasan
                      <textarea rows="4" maxLength="2000" value={review} onChange={(event) => setReview(event.target.value)} placeholder="Ceritakan kesan Anda tentang buku ini..." />
                      <small>{review.length}/2.000 karakter</small>
                    </label>
                  </>
                )}
                <button type="submit" className="master-button master-button-primary" disabled={saving || !selectedBook || (activeSection === 'booking' && Number(selectedBook.available_count) > 0) || (activeSection === 'rating' && !rating)}>
                  {saving ? <><LoaderCircle size={15} className="book-stock-spinner" />Mengirim...</> : activeSection === 'booking' ? <><Ticket size={15} />Kirim booking</> : <><Star size={15} />Kirim rating</>}
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
