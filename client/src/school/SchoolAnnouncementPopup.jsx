import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { dismissAnnouncement, fetchActiveAnnouncements } from './schoolAnnouncementApi.js';

function formatAnnouncementDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function SchoolAnnouncementPopup() {
  const [announcements, setAnnouncements] = useState([]);
  const [closedIds, setClosedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchActiveAnnouncements(controller.signal)
      .then(({ announcements: rows }) => {
        if (!controller.signal.aborted) setAnnouncements(rows || []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const current = announcements.find((item) => !closedIds.has(String(item.id)));

  function closeForSession() {
    if (!current) return;
    setClosedIds((previous) => new Set(previous).add(String(current.id)));
    setDontShowAgain(false);
    setError('');
  }

  async function closeCurrent() {
    if (!current || saving) return;
    if (!dontShowAgain) {
      closeForSession();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await dismissAnnouncement(current.id);
      closeForSession();
    } catch (dismissError) {
      setError(dismissError.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!current) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) void closeCurrent();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [current?.id, dontShowAgain, saving]);

  if (loading || !current) {
    if (!error) return null;
    return createPortal(
      <div className="announcement-popup-error" role="alert">
        <span>Pengumuman tidak dapat dimuat: {error}</span>
        <button type="button" onClick={() => window.location.reload()} aria-label="Muat ulang halaman"><X size={15} /></button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="announcement-popup-backdrop">
      <section className="announcement-popup" role="dialog" aria-modal="true" aria-labelledby="announcement-popup-title">
        <header className="announcement-popup-heading">
          <span><Bell size={16} />PENGUMUMAN SEKOLAH</span>
          <button type="button" onClick={() => void closeCurrent()} disabled={saving} aria-label="Tutup pengumuman"><X size={18} /></button>
        </header>
        {current.banner && <img className="announcement-popup-banner" src={current.banner} alt={`Banner ${current.title}`} />}
        <div className="announcement-popup-content">
          <div className="announcement-popup-meta">{current.category}{formatAnnouncementDate(current.startDate) && ` · ${formatAnnouncementDate(current.startDate)}`}</div>
          <h2 id="announcement-popup-title">{current.title}</h2>
          <p>{current.content}</p>
          {error && <div className="announcement-popup-error-inline" role="alert">{error}</div>}
          <label className="announcement-popup-dismiss-choice">
            <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} disabled={saving} />
            Jangan tampilkan lagi untuk akun ini
          </label>
          <footer>
            <button type="button" className="master-button master-button-primary" onClick={() => void closeCurrent()} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Tutup'}
            </button>
          </footer>
        </div>
      </section>
    </div>,
    document.body
  );
}
