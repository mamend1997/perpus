import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import {
  Check, ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Filter, FilterX,
  Pencil, Plus, Printer, Search, Star,
  Trash2, Upload, X
} from 'lucide-react';
import {
  deleteBooks, fetchBook, fetchBookCatalog, fetchBookCatalogMeta, saveBook, importBooks
} from './schoolBookApi.js';
import { downloadBookTemplate, parseBookImport } from './bookCatalogExcel.js';
import SchoolConfirmDialog from './SchoolConfirmDialog.jsx';
import { createReview, fetchEligibleReviewBooks, fetchReviews } from './schoolReviewsApi.js';

const formFields = [
  'nomor_induk', 'title',
  'physical_description', 'author_id', 'publisher_id', 'agent_id', 'topic_id',
  'collection_id', 'type_id', 'language_id', 'rack_id', 'gmd', 'isbn',
  'year', 'pages', 'price', 'city', 'description', 'synopsis'
];

const formCategories = [
  ['author_id', 'Pengarang', 'pengarang'],
  ['publisher_id', 'Penerbit', 'penerbit'],
  ['agent_id', 'Agen', 'agen'],
  ['topic_id', 'Topik', 'topik'],
  ['collection_id', 'Koleksi', 'koleksi'],
  ['type_id', 'Jenis', 'jenis'],
  ['language_id', 'Bahasa', 'bahasa'],
  ['rack_id', 'Lokasi Rak', 'rak']
];

const filterCategories = [
  ['authorId', 'Pengarang', 'pengarang'],
  ['publisherId', 'Penerbit', 'penerbit'],
  ['agentId', 'Agen', 'agen'],
  ['topicId', 'Topik', 'topik'],
  ['collectionId', 'Koleksi', 'koleksi'],
  ['typeId', 'Jenis', 'jenis'],
  ['languageId', 'Bahasa', 'bahasa'],
  ['rackId', 'Rak', 'rak']
];

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function barcodeValue(book) {
  return String(book.kode_buku || book.nomor_induk || `B${book.id}`)
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, 80) || `B${book.id}`;
}

function initialForm(book) {
  return Object.fromEntries(formFields.map((field) => {
    let value = book?.[field] ?? '';
    if (formCategories.some(([key]) => key === field) && value) value = String(value);
    return [field, value];
  }));
}

function MasterSelect({
  name, label, options, value, onValueChange, required = false,
  allowManual = false, manualValue = '', onManualChange
}) {
  const selected = options.find((option) => String(option.id) === String(value));
  const displayValue = selected?.name || (allowManual ? manualValue : '');
  const [query, setQuery] = useState(displayValue);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(displayValue), [displayValue]);

  const matches = options
    .filter((option) => !query.trim() || option.name.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID')))
    .slice(0, 20);

  return (
    <label className="catalog-combobox-field">
      {label}{required ? ' *' : ''}
      <div className="catalog-combobox">
        <input
          name={`${name}_search`}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            onValueChange(name, '');
            if (allowManual) onManualChange(nextQuery);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          required={required}
          placeholder={`Cari ${label.toLocaleLowerCase('id-ID')}...`}
        />
        {open && matches.length > 0 && (
          <div className="catalog-combobox-options" role="listbox">
            {matches.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={String(option.id) === String(value)}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(option.name);
                  onValueChange(name, String(option.id));
                  if (allowManual) onManualChange('');
                  setOpen(false);
                }}
              >
                {option.name}{option.status === 'inactive' ? ' (Nonaktif)' : ''}
              </button>
            ))}
          </div>
        )}
        {allowManual && query.trim() && !options.some((option) => option.name.toLocaleLowerCase('id-ID') === query.trim().toLocaleLowerCase('id-ID')) && (
          <small>Nama {label.toLocaleLowerCase('id-ID')} baru akan ditambahkan ke Master Data jika belum tersedia.</small>
        )}
      </div>
    </label>
  );
}

function BookFormModal({ book, categories, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(book));
  const [manualCategoryNames, setManualCategoryNames] = useState({});
  const [coverFile, setCoverFile] = useState(null);
  const [digitalFile, setDigitalFile] = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [removeDigital, setRemoveDigital] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateCategory(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateYear(event) {
    const value = event.target.value.replace(/\D/g, '').slice(0, 4);
    setForm((current) => ({ ...current, year: value }));
  }

  function updatePrice(event) {
    const digits = event.target.value.replace(/\D/g, '');
    setForm((current) => ({ ...current, price: digits }));
  }

  function chooseFile(event, kind) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const isCover = kind === 'cover';
    const validType = isCover
      ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      : file.type === 'application/pdf';
    const maxSize = isCover ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!validType) {
      setError(isCover ? 'Sampul harus berupa file JPG, PNG, atau WebP.' : 'Lampiran harus berupa file PDF.');
      return;
    }
    if (file.size > maxSize) {
      setError(isCover ? 'Ukuran sampul maksimal 5 MB.' : 'Ukuran lampiran maksimal 20 MB.');
      return;
    }
    setError('');
    if (isCover) {
      setCoverFile(file);
      setRemoveCover(false);
    } else {
      setDigitalFile(file);
      setRemoveDigital(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const invalidCategory = formCategories.find(([name]) => (
      !form[name] && (name === 'rack_id' || !manualCategoryNames[name]?.trim())
    ));
    if (invalidCategory) {
      setError(invalidCategory[1] === 'Lokasi Rak'
        ? 'Pilih lokasi rak dari daftar yang tersedia.'
        : `Pilih atau masukkan nama ${invalidCategory[1].toLocaleLowerCase('id-ID')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      formFields.forEach((field) => payload.append(field, form[field] ?? ''));
      payload.append('category_names', JSON.stringify(Object.fromEntries(
        formCategories.filter(([name]) => !form[name] && manualCategoryNames[name]?.trim())
          .map(([name]) => [name, manualCategoryNames[name].trim()])
      )));
      if (coverFile) payload.append('cover', coverFile);
      if (digitalFile) payload.append('digitalAttachment', digitalFile);
      if (removeCover) payload.append('remove_cover', 'true');
      if (removeDigital) payload.append('remove_digital', 'true');
      await onSave(payload);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal catalog-book-modal" role="dialog" aria-modal="true" aria-labelledby="book-form-title">
        <header className="master-modal-heading">
          <div>
            <span className="library-eyebrow">KATALOG PERPUSTAKAAN</span>
            <h2 id="book-form-title">{book ? 'Edit Buku' : 'Tambah Buku'}</h2>
          </div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="catalog-book-form-grid">
            <label className="catalog-form-wide">Judul Buku *
              <input name="title" value={form.title} onChange={update} maxLength={255} required autoFocus />
            </label>
            <label>Nomor Induk *
              <input name="nomor_induk" value={form.nomor_induk} onChange={update} maxLength={60} required />
            </label>
            <label className="catalog-form-wide">Deskripsi Fisik
              <input name="physical_description" value={form.physical_description} onChange={update} maxLength={16000} placeholder="Contoh: xii, 240 halaman : ilustrasi ; 21 cm" />
            </label>
            {formCategories.map(([name, label, type]) => (
              <MasterSelect
                key={name}
                name={name}
                label={label}
                value={form[name]}
                options={categories[type] || []}
                onValueChange={updateCategory}
                allowManual={name !== 'rack_id'}
                manualValue={manualCategoryNames[name] || ''}
                onManualChange={(nextName) => setManualCategoryNames((current) => ({ ...current, [name]: nextName }))}
                required
              />
            ))}
            <label>GMD
              <input name="gmd" value={form.gmd} onChange={update} maxLength={100} />
            </label>
            <label>ISBN
              <input name="isbn" value={form.isbn} onChange={update} maxLength={20} />
            </label>
            <label>Tahun Terbit *
              <input name="year" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.year} onChange={updateYear} required />
            </label>
            <label>Jumlah Halaman *
              <input name="pages" type="number" min="1" max="65535" value={form.pages} onChange={update} required />
            </label>
            <label>Harga
              <span className="catalog-price-input"><span>Rp</span><input name="price" type="text" inputMode="numeric" value={form.price ? new Intl.NumberFormat('id-ID').format(Number(form.price)) : ''} onChange={updatePrice} placeholder="0" /></span>
            </label>
            <label>Kota Terbit
              <input name="city" value={form.city} onChange={update} maxLength={120} />
            </label>
            <div className="catalog-form-wide catalog-file-field"><span>Foto Sampul</span>
              <label className="catalog-file-upload-button catalog-file-upload-cover"><Upload size={15} />Upload Sampul
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event, 'cover')} />
              </label>
              <small>{coverFile?.name || (book?.has_cover ? 'Foto sampul sudah tersimpan.' : 'JPG, PNG, atau WebP; maksimal 5 MB.')}</small>
              {book?.has_cover && <span className="catalog-file-remove"><input type="checkbox" checked={removeCover} onChange={(event) => setRemoveCover(event.target.checked)} /> Hapus foto sampul</span>}
            </div>
            <div className="catalog-form-wide catalog-file-field"><span>Lampiran Digital (PDF)</span>
              <label className="catalog-file-upload-button catalog-file-upload-pdf"><Upload size={15} />Upload PDF
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event, 'digital')} />
              </label>
              <small>{digitalFile?.name || (book?.has_digital_attachment ? 'Lampiran PDF sudah tersimpan.' : 'PDF; maksimal 20 MB.')}</small>
              {book?.has_digital_attachment && <span className="catalog-file-remove"><input type="checkbox" checked={removeDigital} onChange={(event) => setRemoveDigital(event.target.checked)} /> Hapus lampiran PDF</span>}
            </div>
            <label className="catalog-form-wide">Deskripsi Buku
              <textarea name="description" rows={3} value={form.description} onChange={update} maxLength={16000} />
            </label>
            <label className="catalog-form-wide">Sinopsis
              <textarea name="synopsis" rows={5} value={form.synopsis} onChange={update} maxLength={16000} placeholder="Tulis ringkasan isi buku..." />
            </label>
          </div>
          {error && <p className="master-form-error" role="alert">{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={saving}>{saving ? 'Menyimpan...' : book ? 'Simpan Perubahan' : 'Simpan Buku'}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

function BookImportModal({ onClose, onImport }) {
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setRows([]);
    try {
      setRows(await parseBookImport(file));
      setFilename(file.name);
    } catch (parseError) {
      setError(parseError.message);
      setFilename('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onImport(rows);
      onClose();
    } catch (importError) {
      setError(importError.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="master-modal catalog-import-modal" role="dialog" aria-modal="true" aria-labelledby="book-import-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">IMPOR DATA</span><h2 id="book-import-title">Impor Katalog Excel</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup impor"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <label className="catalog-upload-drop">
            <Upload size={23} />
            <b>Pilih file Excel (.xlsx)</b>
            <span>{filename || 'Maksimal 10 MB dan 500 baris buku.'}</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} />
          </label>
          {rows.length > 0 && (
            <div className="catalog-import-preview">
              <b>{rows.length} baris siap diimpor</b>
              <span>{rows.slice(0, 4).map((row) => row.title).filter(Boolean).join(' · ')}</span>
              <small>Pastikan nama kategori di Excel sesuai Master Data sekolah.</small>
            </div>
          )}
          {error && <p className="master-form-error" role="alert">{error}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="master-button master-button-primary" disabled={!rows.length || saving}>{saving ? 'Mengimpor...' : 'Impor Buku'}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}

async function fetchAssetUrl(bookId, kind, signal) {
  const token = localStorage.getItem('school-token');
  const response = await fetch(`/api/school/books/${encodeURIComponent(bookId)}/assets/${kind}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'File buku gagal dimuat.');
  }
  return URL.createObjectURL(await response.blob());
}

function BookDetailModal({ bookId, onClose, role }) {
  const [book, setBook] = useState(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [digitalUrl, setDigitalUrl] = useState('');
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState([]);
  const [reviewAggregate, setReviewAggregate] = useState({ total: 0, averageRating: 0 });
  const [canReview, setCanReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewRefresh, setReviewRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const objectUrls = [];
    fetchBook(bookId, controller.signal)
      .then(async ({ book: result }) => {
        if (!active) return;
        setBook(result);
        const [coverResult, digitalResult] = await Promise.allSettled([
          result.has_cover ? fetchAssetUrl(bookId, 'cover', controller.signal) : '',
          result.has_digital_attachment ? fetchAssetUrl(bookId, 'digital', controller.signal) : ''
        ]);
        const cover = coverResult.status === 'fulfilled' ? coverResult.value : '';
        const digital = digitalResult.status === 'fulfilled' ? digitalResult.value : '';
        if (!active) {
          [cover, digital].filter(Boolean).forEach(URL.revokeObjectURL);
          return;
        }
        if (cover) objectUrls.push(cover);
        if (digital) objectUrls.push(digital);
        setCoverUrl(cover);
        setDigitalUrl(digital);
        const assetError = [coverResult, digitalResult].find((resultItem) => resultItem.status === 'rejected');
        if (assetError && assetError.reason?.name !== 'AbortError') setError(assetError.reason?.message || 'Lampiran buku gagal dimuat.');
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      });
    return () => {
      active = false;
      controller.abort();
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [bookId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchReviews({ bookId, page: 1, limit: 10, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setReviews(result.reviews || []);
        setReviewAggregate(result.aggregate || { total: 0, averageRating: 0 });
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setReviewError(loadError.message);
      });
    if (role === 'member') {
      fetchEligibleReviewBooks('', controller.signal)
        .then(({ books }) => {
          if (!controller.signal.aborted) setCanReview((books || []).some((item) => String(item.id) === String(bookId)));
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) setReviewError(loadError.message);
        });
    }
    return () => controller.abort();
  }, [bookId, role, reviewRefresh]);

  async function submitReview(event) {
    event.preventDefault();
    if (!reviewRating) {
      setReviewError('Pilih rating bintang terlebih dahulu.');
      return;
    }
    setSavingReview(true);
    setReviewError('');
    setReviewNotice('');
    try {
      const result = await createReview({ bookId, rating: reviewRating, review: reviewComment });
      setReviewNotice(result.message);
      setReviewRating(0);
      setReviewComment('');
      setCanReview(false);
      setReviewRefresh((value) => value + 1);
    } catch (submitError) {
      setReviewError(submitError.message);
    } finally {
      setSavingReview(false);
    }
  }

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="master-modal-backdrop catalog-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="master-modal catalog-detail-modal" role="dialog" aria-modal="true" aria-labelledby="book-detail-title">
        <header className="master-modal-heading">
          <div><span className="library-eyebrow">DETAIL KATALOG</span><h2 id="book-detail-title">{book?.title || 'Memuat buku...'}</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup detail"><X size={18} /></button>
        </header>
        {error && <p className="master-form-error" role="alert">{error}</p>}
        {book && (
          <div className="catalog-book-detail">
            {coverUrl && <img className="catalog-detail-cover" src={coverUrl} alt={`Sampul ${book.title}`} />}
            <dl>
              {[
                ['Tanggal Terima', formatDate(book.received_date)],
                ['Nomor Induk', book.nomor_induk],
                ['Kode/Nomor Panggil', book.kode_buku],
                ['Deskripsi Fisik', book.physical_description],
                ['Pengarang', book.author_name],
                ['Penerbit', book.publisher_name],
                ['Agen', book.agent_name],
                ['Topik', book.topic_name],
                ['Koleksi', book.collection_name],
                ['Jenis', book.type_name],
                ['Bahasa', book.language_name],
                ['Lokasi Rak', book.rack_name],
                ['GMD / ISBN', [book.gmd, book.isbn].filter(Boolean).join(' · ')],
                ['Tahun / Kota Terbit', [book.year, book.city].filter(Boolean).join(' · ')],
                ['Asal Barang', book.source],
                ['Halaman / Jumlah', [book.pages, book.qty].filter((value) => value != null && value !== '').join(' / ')],
                ['Harga', formatCurrency(book.price)],
                ['Eksemplar Tersedia', book.available_qty],
                ['Deskripsi', book.description],
                ['Sinopsis', book.synopsis]
              ].map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '—' : value}</dd></div>
              ))}
            </dl>
            {digitalUrl && <a className="catalog-file-link" href={digitalUrl} download={`${book.title || 'lampiran'}.pdf`}><Download size={15} />Unduh Lampiran PDF</a>}
            <section className="book-detail-reviews">
              <div className="book-detail-reviews-heading">
                <div><h3>Ulasan &amp; Rating</h3><span>{Number(reviewAggregate.averageRating || 0).toFixed(1)} / 5 · {reviewAggregate.total} ulasan</span></div>
                <div className="book-detail-rating-stars" aria-label={`Rata-rata ${reviewAggregate.averageRating} dari 5`}>
                  {[1, 2, 3, 4, 5].map((value) => <Star key={value} size={16} fill={value <= Math.round(reviewAggregate.averageRating || 0) ? 'currentColor' : 'none'} />)}
                </div>
              </div>
              {reviewNotice && <div className="master-message master-message-success" role="status">{reviewNotice}</div>}
              {reviewError && <p className="master-form-error" role="alert">{reviewError}</p>}
              {role === 'member' && canReview && (
                <form className="book-detail-review-form" onSubmit={submitReview}>
                  <label>Beri rating
                    <span className="book-detail-rating-input">
                      {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`${value} bintang`} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)}><Star size={19} fill={value <= reviewRating ? 'currentColor' : 'none'} /></button>)}
                    </span>
                  </label>
                  <label>Ulasan
                    <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={2000} rows={3} placeholder="Tulis pengalaman Anda membaca buku ini..." />
                  </label>
                  <button type="submit" className="master-button master-button-primary" disabled={savingReview || !reviewRating}>{savingReview ? 'Mengirim...' : 'Kirim Ulasan'}</button>
                </form>
              )}
              {role === 'member' && !canReview && <p className="book-detail-review-note">Ulasan hanya dapat dikirim setelah buku dikembalikan, dan satu ulasan untuk setiap judul.</p>}
              <div className="book-detail-review-list">
                {reviews.length ? reviews.map((review) => (
                  <article key={review.id}>
                    <div><b>{review.reviewer_name}</b><small>{review.rombel || 'Anggota perpustakaan'} · {formatDate(review.created_at)}</small></div>
                    <span className="book-detail-rating-stars">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={13} fill={value <= review.rating ? 'currentColor' : 'none'} />)}</span>
                    <p>{review.review || '—'}</p>
                    {review.verified && <small className="review-verified">✓ Pernah Meminjam</small>}
                  </article>
                )) : <p className="book-detail-review-note">Belum ada ulasan untuk buku ini.</p>}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

function BookBarcodePrint({ books, schoolName, onClose }) {
  const svgRefs = useRef({});
  useEffect(() => {
    document.body.classList.add('is-printing-barcode');
    books.forEach((book) => {
      const svg = svgRefs.current[String(book.id)];
      if (svg) JsBarcode(svg, barcodeValue(book), { format: 'CODE128', displayValue: false, height: 42, width: 2, margin: 0 });
    });
    const printTimer = window.setTimeout(() => window.print(), 250);
    const afterPrint = () => onClose();
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener('afterprint', afterPrint);
      document.body.classList.remove('is-printing-barcode');
    };
  }, [books, onClose]);

  return createPortal(
    <div className="barcode-print-layout">
      <div className="barcode-print-controls"><button type="button" onClick={onClose}>Tutup</button></div>
      <div className="barcode-print-grid">
        {books.map((book) => (
          <article className="barcode-print-label" key={book.id}>
            <small className="barcode-print-kicker">PERPUSTAKAAN SEKOLAH</small>
            <b>{schoolName}</b>
            <span>{book.title}</span>
            <svg ref={(element) => { if (element) svgRefs.current[String(book.id)] = element; }} aria-label={`Barcode ${book.title}`} />
            <small>{barcodeValue(book)}</small>
          </article>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function SchoolBookCatalogPage({ rights, role }) {
  const canEdit = Boolean(rights?.edit);
  const canDelete = Boolean(rights?.delete);
  const [meta, setMeta] = useState({ school: {}, categories: {} });
  const [metaError, setMetaError] = useState('');
  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    authorId: '', publisherId: '', agentId: '', topicId: '',
    collectionId: '', typeId: '', languageId: '', rackId: ''
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState({});
  const [editingBook, setEditingBook] = useState(null);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [detailBookId, setDetailBookId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [printBooks, setPrintBooks] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchBookCatalogMeta(controller.signal)
      .then(setMeta)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setMetaError(loadError.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(queryInput.trim());
      setPagination((current) => ({ ...current, page: 1 }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchBookCatalog({ ...filters, search, page: pagination.page, limit: pagination.limit, signal: controller.signal })
      .then((result) => {
        setBooks(result.books);
        setPagination(result.pagination);
        const lastPage = Math.max(1, result.pagination.totalPages);
        if (result.pagination.page > lastPage) {
          setPagination((current) => ({ ...current, page: lastPage }));
        }
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, pagination.page, pagination.limit, refreshKey, search]);

  const selectedIds = Object.keys(selectedBooks);
  const allVisibleSelected = books.length > 0 && books.every((book) => Boolean(selectedBooks[String(book.id)]));
  const selectedRows = useMemo(() => Object.values(selectedBooks), [selectedBooks]);

  function toggleBookSelection(book, checked) {
    const id = String(book.id);
    setSelectedBooks((current) => {
      const next = { ...current };
      if (checked) next[id] = book;
      else delete next[id];
      return next;
    });
  }

  function toggleVisibleSelection(checked) {
    setSelectedBooks((current) => {
      const next = { ...current };
      books.forEach((book) => {
        const id = String(book.id);
        if (checked) next[id] = book;
        else delete next[id];
      });
      return next;
    });
  }

  async function handleSave(payload) {
    const result = await saveBook(payload, editingBook?.id);
    setFormOpen(false);
    setEditingBook(null);
    setSelectedBooks({});
    setError(result.warning || '');
    setNotice(result.warning ? '' : editingBook ? 'Perubahan buku berhasil disimpan.' : 'Buku berhasil ditambahkan.');
    setRefreshKey((key) => key + 1);
  }

  async function handleImport(rows) {
    setBusyAction('import');
    try {
      const result = await importBooks(rows);
      setSelectedBooks({});
      setNotice(`${result.imported} buku berhasil diimpor.`);
      setRefreshKey((key) => key + 1);
    } finally {
      setBusyAction('');
    }
  }

  function handleDelete(ids, title = '') {
    if (!ids.length) return;
    setError('');
    setDeleteRequest({
      ids,
      itemName: ids.length === 1 ? title || selectedBooks[String(ids[0])]?.title : `${ids.length} buku terpilih`
    });
  }

  async function confirmDeleteBooks() {
    if (!deleteRequest) return;
    setBusyAction('delete');
    setError('');
    setNotice('');
    try {
      const result = await deleteBooks(deleteRequest.ids);
      setDeleteRequest(null);
      setSelectedBooks({});
      setNotice(`${result.deleted} buku berhasil dihapus.`);
      setRefreshKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyAction('');
    }
  }

  async function handleTemplate() {
    setBusyAction('template');
    setError('');
    try {
      await downloadBookTemplate();
    } catch (downloadError) {
      setError(`Template gagal dibuat: ${downloadError.message}`);
    } finally {
      setBusyAction('');
    }
  }

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function resetFilters() {
    setQueryInput('');
    setSearch('');
    setFilters({
      authorId: '', publisherId: '', agentId: '', topicId: '',
      collectionId: '', typeId: '', languageId: '', rackId: ''
    });
    setPagination((current) => ({ ...current, page: 1 }));
  }

  return (
    <div className="library-module-page catalog-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">DATA BUKU</span>
        <h1>Daftar Pustaka</h1>
        <p>Kelola bibliografi, stok, berkas digital, dan barcode koleksi perpustakaan.</p>
      </header>

      {metaError && <div className="library-error" role="alert">{metaError}</div>}
      {error && <div className="library-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Coba lagi</button></div>}
      {notice && <div className="master-message master-message-success catalog-notice"><Check size={15} />{notice}</div>}

      <section className="catalog-toolbar-panel">
        <div className="catalog-search-row">
          <label className="master-search catalog-search">
            <Search size={16} />
            <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Cari judul, pengarang, nomor induk..." aria-label="Cari katalog buku" />
          </label>
          <div className="catalog-search-actions">
            <div className="catalog-filter-menu">
              <button
                type="button"
                className={`master-button master-button-light catalog-filter-toggle ${filtersOpen ? 'is-open' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls="catalog-filter-panel"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Filter size={15} />Filter
                {Object.values(filters).filter(Boolean).length > 0 && <span>{Object.values(filters).filter(Boolean).length}</span>}
              </button>
              {filtersOpen && <div className="catalog-filters" id="catalog-filter-panel">
                {filterCategories.map(([name, label, type]) => (
                  <label key={name}>{label}
                    <select name={name} value={filters[name]} onChange={updateFilter}>
                      <option value="">Semua {label}</option>
                      {(meta.categories[type] || []).map((option) => (
                        <option key={option.id} value={option.id}>{option.name}{option.status === 'inactive' ? ' (Nonaktif)' : ''}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <button type="button" className="catalog-reset-filters" onClick={resetFilters}><FilterX size={14} />Reset Filter</button>
              </div>}
            </div>
            {canEdit && <button type="button" className="master-button master-button-primary" onClick={() => { setEditingBook(null); setFormOpen(true); }}><Plus size={16} />Tambah Buku</button>}
          </div>
        </div>
        <div className="catalog-toolbar-actions">
          {canEdit && <button type="button" className="master-button master-button-teal" disabled={Boolean(busyAction)} onClick={() => setImportOpen(true)}><Upload size={15} />Impor Excel</button>}
          <button type="button" className="master-button master-button-light" disabled={Boolean(busyAction)} onClick={handleTemplate}><FileSpreadsheet size={15} />Template Excel</button>
          <button type="button" className="master-button master-button-violet" disabled={!selectedIds.length} onClick={() => setPrintBooks(selectedRows)}><Printer size={15} />Cetak Barcode{selectedIds.length ? ` (${selectedIds.length})` : ''}</button>
          {canDelete && <button type="button" className="master-button master-button-danger" disabled={!selectedIds.length || Boolean(busyAction)} onClick={() => handleDelete(selectedIds)}><Trash2 size={15} />Hapus Terpilih{selectedIds.length ? ` (${selectedIds.length})` : ''}</button>}
        </div>
      </section>

      <section className="master-data-panel catalog-table-panel">
        <div className="catalog-table-heading">
          <div><span className="library-eyebrow">KOLEKSI SEKOLAH</span><h2>Katalog Buku</h2></div>
          <span>{pagination.total} judul</span>
        </div>
        <div className="master-table-scroll catalog-table-scroll">
          <table className="master-table catalog-table">
            <thead>
              <tr>
                <th className="master-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisibleSelection(event.target.checked)} aria-label="Pilih semua buku pada halaman ini" /></th>
                <th>No</th><th>Nomor Induk</th><th>Judul Buku</th><th>Pengarang</th><th>Penerbit</th>
                <th>Agen</th><th>Topik</th><th>Koleksi</th><th>Jenis</th><th>Bahasa</th><th>Lokasi Rak</th>
                <th>Tahun Terbit</th><th>Kota Terbit</th><th>Jumlah Halaman</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="master-empty-cell" colSpan={16}>Memuat katalog buku...</td></tr>
              ) : books.length === 0 ? (
                <tr><td className="master-empty-cell" colSpan={16}>{search || Object.values(filters).some(Boolean) ? 'Tidak ada buku yang sesuai dengan pencarian.' : 'Belum ada buku. Tambahkan buku pertama Anda.'}</td></tr>
              ) : books.map((book, index) => (
                <tr key={book.id}>
                  <td className="master-check-cell"><input type="checkbox" checked={Boolean(selectedBooks[String(book.id)])} onChange={(event) => toggleBookSelection(book, event.target.checked)} aria-label={`Pilih ${book.title}`} /></td>
                  <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  <td>{book.nomor_induk || '—'}</td>
                  <td><b className="master-primary-text">{book.title}</b>{book.isbn && <small className="master-secondary-text">ISBN {book.isbn}</small>}</td>
                  <td>{book.author_name || '—'}</td>
                  <td>{book.publisher_name || '—'}</td>
                  <td>{book.agent_name || '—'}</td>
                  <td>{book.topic_name || '—'}</td>
                  <td>{book.collection_name || '—'}</td>
                  <td>{book.type_name || '—'}</td>
                  <td>{book.language_name || '—'}</td>
                  <td>{book.rack_name || '—'}</td>
                  <td>{book.year || '—'}</td>
                  <td>{book.city || '—'}</td>
                  <td>{book.pages || '—'}</td>
                  <td className="catalog-action-cell">
                    <div className="catalog-row-actions">
                      <button type="button" className="master-row-icon" aria-label={`Detail ${book.title}`} title="Detail" onClick={() => setDetailBookId(book.id)}><Eye size={15} /></button>
                      {canEdit && <button type="button" className="master-row-icon is-edit" aria-label={`Edit ${book.title}`} title="Edit" onClick={() => { setEditingBook(book); setFormOpen(true); }}><Pencil size={14} /></button>}
                      {canDelete && <button type="button" className="master-row-icon is-delete" aria-label={`Hapus ${book.title}`} title="Hapus" onClick={() => handleDelete([String(book.id)], book.title)}><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="catalog-pagination">
          <span>Menampilkan {books.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–{Math.min(pagination.page * pagination.limit, pagination.total)} dari {pagination.total} buku</span>
          <div>
            <button type="button" aria-label="Halaman sebelumnya" disabled={pagination.page <= 1 || loading} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={16} /></button>
            <span>Halaman {pagination.page} dari {Math.max(1, pagination.totalPages)}</span>
            <button type="button" aria-label="Halaman berikutnya" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}><ChevronRight size={16} /></button>
          </div>
        </footer>
      </section>

      {formOpen && <BookFormModal
        book={editingBook}
        categories={meta.categories}
        onClose={() => { setFormOpen(false); setEditingBook(null); }}
        onSave={handleSave}
      />}
      {importOpen && <BookImportModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
      {detailBookId && <BookDetailModal bookId={detailBookId} role={role} onClose={() => setDetailBookId(null)} />}
      {printBooks && <BookBarcodePrint books={printBooks} schoolName={meta.school?.name || 'Perpustakaan Sekolah'} onClose={() => setPrintBooks(null)} />}
      {deleteRequest && <SchoolConfirmDialog
        title={deleteRequest.ids.length === 1 ? 'Hapus Buku?' : 'Hapus Buku Terpilih?'}
        message={deleteRequest.ids.length === 1
          ? 'Apakah Anda yakin ingin menghapus buku ini dari katalog?'
          : `Anda akan menghapus ${deleteRequest.ids.length} buku dari katalog.`}
        itemName={deleteRequest.itemName}
        confirmLabel="Hapus Buku"
        loading={busyAction === 'delete'}
        error={error}
        onClose={() => { setDeleteRequest(null); setError(''); }}
        onConfirm={confirmDeleteBooks}
      />}
    </div>
  );
}
