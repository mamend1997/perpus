import { useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Search, Star, Trash2, X
} from 'lucide-react';
import {
  createReview, deleteReview, fetchEligibleReviewBooks, fetchReviews
} from './schoolReviewsApi.js';

const pageSize = 25;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function RatingStars({ rating, interactive = false, onChange }) {
  return (
    <span className="review-stars" role={interactive ? 'group' : undefined} aria-label={`Rating ${rating} dari 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        interactive
          ? <button type="button" key={value} aria-label={`${value} bintang`} aria-pressed={rating === value} onClick={() => onChange(value)}><Star size={18} fill={value <= rating ? 'currentColor' : 'none'} /></button>
          : <Star size={15} key={value} fill={value <= rating ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

export default function SchoolReviewsPage({ rights, role }) {
  const isMember = role === 'member';
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete) && !isMember;
  const canView = Boolean(rights?.view);
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [eligibleBooks, setEligibleBooks] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleSearch, setEligibleSearch] = useState('');
  const [eligibleOpen, setEligibleOpen] = useState(false);
  const [eligibleActiveIndex, setEligibleActiveIndex] = useState(0);
  const [bookId, setBookId] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
    fetchReviews({ page, limit: pageSize, search, rating: ratingFilter, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setReviews(result.reviews || []);
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
  }, [canView, page, search, ratingFilter, refreshKey]);

  useEffect(() => {
    if (!isMember || !canEdit) {
      setEligibleLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setEligibleLoading(true);
    const timer = window.setTimeout(() => {
      fetchEligibleReviewBooks(eligibleSearch.trim(), controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setEligibleBooks(result.books || []);
            setEligibleActiveIndex(0);
          }
        })
        .catch((fetchError) => {
          if (!controller.signal.aborted) setError(fetchError.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setEligibleLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isMember, canEdit, eligibleSearch, refreshKey]);

  async function submitReview(event) {
    event.preventDefault();
    if (!bookId || rating < 1 || rating > 5) {
      setError('Pilih buku dan rating antara 1 sampai 5 bintang.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await createReview({ bookId, rating, review: comment });
      setNotice(result.message);
      setBookId('');
      setEligibleSearch('');
      setEligibleOpen(false);
      setRating(0);
      setComment('');
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  function chooseEligibleBook(book) {
    setBookId(String(book.id));
    setEligibleSearch(book.title);
    setEligibleOpen(false);
  }

  function handleEligibleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!eligibleOpen) setEligibleActiveIndex(0);
      else setEligibleActiveIndex((index) => Math.min(index + 1, Math.max(eligibleBooks.length - 1, 0)));
      setEligibleOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setEligibleOpen(true);
      setEligibleActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && eligibleOpen && eligibleBooks[eligibleActiveIndex]) {
      event.preventDefault();
      chooseEligibleBook(eligibleBooks[eligibleActiveIndex]);
    } else if (event.key === 'Escape') {
      setEligibleOpen(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const result = await deleteReview(deleteTarget.id);
      setNotice(result.message);
      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  }

  const pageCount = Math.max(1, pagination.totalPages || 1);

  return (
    <div className="library-module-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">LAYANAN PERPUSTAKAAN</span>
        <h1>Ulasan &amp; Rating</h1>
        <p>Bagikan pengalaman membaca dan lihat ulasan buku dari anggota sekolah.</p>
      </header>

      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}
      {error && <div className="master-form-error" role="alert">{error}</div>}

      {isMember && canEdit && (
        <section className="library-panel review-composer">
          <div className="review-composer-heading"><div><span className="library-eyebrow">BAGIKAN PENGALAMAN</span><h2>Tulis Ulasan</h2><p>Hanya buku yang sudah dipinjam dan dikembalikan yang dapat diulas.</p></div></div>
          <form onSubmit={submitReview} className="review-form">
            <div className="review-form-field">
              <label htmlFor="review-book-search">Judul buku</label>
              <div className="review-book-picker">
                <div className="master-search" onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setEligibleOpen(false);
                }}>
                  <Search size={16} />
                  <input
                    id="review-book-search"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-autocomplete="list"
                    aria-expanded={eligibleOpen}
                    aria-controls="review-book-options"
                    aria-activedescendant={eligibleOpen && eligibleBooks[eligibleActiveIndex] ? `review-book-option-${eligibleBooks[eligibleActiveIndex].id}` : undefined}
                    value={eligibleSearch}
                    onFocus={() => setEligibleOpen(true)}
                    onChange={(event) => {
                      setEligibleSearch(event.target.value);
                      setEligibleBooks([]);
                      setBookId('');
                      setEligibleActiveIndex(0);
                      setEligibleOpen(true);
                    }}
                    onKeyDown={handleEligibleKeyDown}
                    placeholder="Cari judul buku yang sudah dikembalikan..."
                    autoComplete="off"
                    required={!bookId}
                  />
                  {eligibleLoading ? <LoaderCircle size={15} className="book-stock-spinner" /> : <ChevronDown size={16} />}
                </div>
                {eligibleOpen && (
                  <div className="review-book-options" id="review-book-options" role="listbox" aria-label="Buku yang dapat diulas">
                    {eligibleLoading && <div className="review-book-option-message">Memuat daftar buku...</div>}
                    {!eligibleLoading && eligibleBooks.length === 0 && (
                      <div className="review-book-option-message">
                        {eligibleSearch ? 'Tidak ada judul yang cocok dari buku yang sudah dikembalikan.' : 'Belum ada buku yang dapat diulas. Buku muncul setelah peminjaman dikembalikan.'}
                      </div>
                    )}
                    {eligibleBooks.map((book, index) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={bookId === String(book.id)}
                        id={`review-book-option-${book.id}`}
                        className={index === eligibleActiveIndex ? 'active' : ''}
                        key={book.id}
                        onMouseEnter={() => setEligibleActiveIndex(index)}
                        onClick={() => chooseEligibleBook(book)}
                      >
                        <b>{book.title}</b><small>Dikembalikan {formatDate(book.last_returned_at)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {bookId && <small className="review-selected-book">Buku terpilih: {eligibleSearch}</small>}
            </div>
            <div className="review-form-field">
              <span className="review-form-label">Rating</span>
              <div className="review-rating-control">
                <RatingStars rating={rating} interactive onChange={setRating} />
                <span>{rating ? `${rating} dari 5` : 'Pilih rating'}</span>
              </div>
            </div>
            <label className="review-form-field">
              <span className="review-form-label">Ulasan <small>(opsional)</small></span>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={4} placeholder="Ceritakan kesan Anda tentang buku ini..." />
              <small className="review-character-count">{comment.length.toLocaleString('id-ID')}/2.000 karakter</small>
            </label>
            <div className="review-form-footer">
              <span>Ulasan akan tampil di katalog buku setelah dikirim.</span>
              <button type="submit" className="master-button master-button-primary" disabled={saving || !bookId || !rating}>
                {saving ? <><LoaderCircle size={16} className="book-stock-spinner" />Mengirim...</> : <><Star size={16} />Kirim ulasan</>}
              </button>
            </div>
          </form>
        </section>
      )}
      {isMember && !canEdit && <div className="library-module-notice">Akun Anda belum diberi izin untuk mengirim ulasan.</div>}

      <section className="catalog-toolbar-panel loan-toolbar">
        <div className="loan-toolbar-top">
          <label className="master-search loan-table-search">
            <Search size={16} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={isMember ? 'Cari judul buku atau ulasan...' : 'Cari judul, nama anggota, atau ulasan...'} aria-label="Cari ulasan" />
          </label>
          <div className="loan-toolbar-actions">
            <label className="loan-status-filter">Rating
              <select value={ratingFilter} onChange={(event) => { setRatingFilter(event.target.value); setPage(1); }}>
                <option value="">Semua rating</option>
                {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} bintang</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="library-panel loan-table-panel">
        <div className="catalog-table-heading">
          <div><h2>{isMember ? 'Ulasan Anggota' : 'Moderasi Ulasan'}</h2><p>{pagination.total} ulasan ditemukan</p></div>
        </div>
        <div className="loan-table-scroll">
          <table className="loan-table">
            <thead><tr><th>Buku</th><th>Rating</th><th>Ulasan</th><th>{isMember ? 'Anggota' : 'Penulis'}</th><th>Tanggal</th>{canDelete && <th>Aksi</th>}</tr></thead>
            <tbody>
              {loading ? <tr><td className="loan-table-empty" colSpan={canDelete ? 6 : 5}><LoaderCircle size={17} className="book-stock-spinner" />Memuat ulasan...</td></tr>
                : reviews.length === 0 ? <tr><td className="loan-table-empty" colSpan={canDelete ? 6 : 5}>{search || ratingFilter ? 'Tidak ada ulasan yang sesuai dengan pencarian atau filter.' : 'Belum ada ulasan buku.'}</td></tr>
                  : reviews.map((review) => (
                    <tr key={review.id}>
                      <td><b>{review.book_title}</b></td>
                      <td><RatingStars rating={review.rating} /></td>
                      <td>{review.review || '—'}{review.verified && <small className="review-verified"><Check size={13} />Pernah Meminjam</small>}</td>
                      <td>{review.reviewer_name}<small>{review.rombel || 'Anggota perpustakaan'}</small></td>
                      <td>{formatDate(review.created_at)}</td>
                      {canDelete && <td><button type="button" className="master-button master-button-muted" onClick={() => setDeleteTarget(review)}><Trash2 size={14} />Hapus</button></td>}
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

      {deleteTarget && (
        <div className="master-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}>
          <section className="master-modal" role="dialog" aria-modal="true" aria-labelledby="review-delete-title">
            <header className="master-modal-heading">
              <div><span className="library-eyebrow">KONFIRMASI MODERASI</span><h2 id="review-delete-title">Hapus ulasan?</h2></div>
              <button type="button" className="master-icon-button" onClick={() => setDeleteTarget(null)} disabled={deleting} aria-label="Tutup konfirmasi"><X size={18} /></button>
            </header>
            <p>Ulasan untuk <b>{deleteTarget.book_title}</b> oleh {deleteTarget.reviewer_name} akan dihapus permanen.</p>
            <footer className="master-modal-actions">
              <button type="button" className="master-button master-button-muted" onClick={() => setDeleteTarget(null)} disabled={deleting}>Batal</button>
              <button type="button" className="master-button master-button-primary" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Trash2 size={15} />}Hapus ulasan
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
