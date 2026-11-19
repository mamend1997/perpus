import { useEffect, useState } from 'react';
import { isValidGuideUrl } from './documentEmbeds.js';

async function request(path, options = {}) {
  const token = localStorage.getItem('super-admin-token');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Permintaan gagal.');
  return body;
}

export default function PlatformUserGuidePage() {
  const [guide, setGuide] = useState({
    title: 'Buku Petunjuk Pengguna',
    content: '',
    pdfUrl: '',
    videoUrl: '',
    updatedAt: null
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/super-admin/user-guide')
      .then(({ guide: saved }) => {
        if (active) setGuide((current) => ({ ...current, ...saved }));
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/super-admin/user-guide', {
        method: 'PUT',
        body: JSON.stringify(guide)
      });
      setGuide(result.guide);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  const updatedDate = guide.updatedAt
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(guide.updatedAt))
    : 'Belum pernah disimpan';
  const pdfUrlValid = isValidGuideUrl(guide.pdfUrl, 'pdf');
  const videoUrlValid = isValidGuideUrl(guide.videoUrl, 'video');

  return (
    <section className="legal-page">
      <header className="management-heading"><div><h1>Petunjuk Pengguna</h1><p>Susun panduan yang dapat dibaca pengguna pada portal sekolah.</p></div></header>
      <form className="panel legal-document-panel" onSubmit={save}>
        <div className="panel-heading profile-panel-heading"><div><h3>Konten Panduan</h3><p>Terakhir diperbarui {updatedDate}</p></div></div>
        <div className="legal-document-fields">
          <label>Judul Panduan<input required minLength={2} maxLength={200} value={guide.title} onChange={(event) => setGuide((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Isi Panduan<textarea rows={16} maxLength={30000} value={guide.content} onChange={(event) => setGuide((current) => ({ ...current, content: event.target.value }))} placeholder="Tulis satu langkah atau paragraf pada setiap baris." /></label>
          <small>Gunakan satu paragraf per baris. Isi ditampilkan sebagai teks biasa pada portal sekolah.</small>
          <label>Tautan PDF<input type="url" maxLength={2048} value={guide.pdfUrl} onChange={(event) => setGuide((current) => ({ ...current, pdfUrl: event.target.value }))} placeholder="https://.../panduan.pdf atau tautan pratinjau Google Drive" aria-invalid={!pdfUrlValid} /></label>
          <small>Tautan HTTPS akan ditampilkan di halaman sekolah. Untuk Google Drive, pastikan akses file mengizinkan pengguna melihat.</small>
          {!pdfUrlValid && <small className="document-link-error">Masukkan tautan HTTPS PDF yang valid.</small>}
          <label>Tautan Video<input type="url" maxLength={2048} value={guide.videoUrl} onChange={(event) => setGuide((current) => ({ ...current, videoUrl: event.target.value }))} placeholder="YouTube, Vimeo, atau tautan file MP4/WebM/OGG" aria-invalid={!videoUrlValid} /></label>
          <small>Video YouTube, Vimeo, atau file HTTPS MP4, WebM, dan OGG dapat diputar langsung di halaman sekolah.</small>
          {!videoUrlValid && <small className="document-link-error">Gunakan tautan HTTPS YouTube, Vimeo, atau file video yang didukung.</small>}
          {error && <div className="error-box" role="alert">{error}</div>}
          {notice && <div className="success-box" role="status">{notice}</div>}
          <button className="primary-button legal-save-button" disabled={loading || busy || !pdfUrlValid || !videoUrlValid}>{busy ? 'Menyimpan...' : 'Simpan Panduan'}</button>
        </div>
      </form>
    </section>
  );
}
