import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

const portalOptions = [
  {
    key: 'check',
    title: 'Cek Buku Publik',
    description: 'Pengunjung dapat memindai barcode atau mencari judul buku dan melihat ketersediaannya.',
    route: ''
  },
  {
    key: 'booking',
    title: 'Booking Buku',
    description: 'Anggota masuk dengan akun member untuk mengajukan booking dan jumlah eksemplar.',
    route: '/booking'
  },
  {
    key: 'rating',
    title: 'Rating Buku',
    description: 'Anggota masuk untuk memberi rating bintang dan ulasan buku yang telah dikembalikan.',
    route: '/rating'
  }
];

export default function SchoolPublicPortalPage({ schoolCode }) {
  const [qrImages, setQrImages] = useState({});
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const portals = useMemo(() => portalOptions.map((portal) => ({
    ...portal,
    url: new URL(`/public/${encodeURIComponent(schoolCode)}${portal.route}`, window.location.origin).toString()
  })), [schoolCode]);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all(portals.map(async (portal) => [
      portal.key,
      await QRCode.toDataURL(portal.url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
        color: { dark: '#17233b', light: '#ffffff' }
      })
    ]))
      .then((entries) => {
        if (active) setQrImages(Object.fromEntries(entries));
      })
      .catch((qrError) => {
        if (active) setError(`Barcode portal gagal dibuat: ${qrError.message}`);
      });
    return () => { active = false; };
  }, [portals]);

  async function copyLink(portal) {
    setCopied('');
    try {
      await navigator.clipboard.writeText(portal.url);
      setCopied(portal.key);
    } catch (copyError) {
      setError(`Link tidak dapat disalin otomatis: ${copyError.message}. Salin link dari kolom yang tersedia.`);
    }
  }

  function downloadCode(portal) {
    const image = qrImages[portal.key];
    if (!image) return;
    const anchor = document.createElement('a');
    anchor.href = image;
    anchor.download = `barcode-${portal.key}-${schoolCode}.png`;
    anchor.click();
  }

  return (
    <div className="library-module-page public-portal-settings-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">LAYANAN PERPUSTAKAAN</span>
        <h1>Portal Publik</h1>
        <p>Bagikan tautan dan barcode agar pengunjung dapat memeriksa koleksi, membuat booking, atau mengirim ulasan.</p>
      </header>
      {error && <div className="library-error" role="alert">{error}</div>}
      {!schoolCode && <div className="library-error" role="alert">Kode sekolah belum tersedia. Muat ulang profil sekolah lalu coba kembali.</div>}
      <div className="public-portal-share-grid">
        {portals.map((portal) => (
          <article className="library-panel public-portal-share-card" key={portal.key}>
            <div className="public-portal-share-copy">
              <span className="public-portal-share-icon"><QrCode size={20} /></span>
              <div><h2>{portal.title}</h2><p>{portal.description}</p></div>
            </div>
            <div className="public-portal-qr">
              {qrImages[portal.key]
                ? <img src={qrImages[portal.key]} alt={`Barcode ${portal.title}`} />
                : <span>Membuat barcode...</span>}
            </div>
            <label className="public-portal-link-label">Link portal
              <span className="public-portal-link-field">
                <input value={portal.url} readOnly aria-label={`Link ${portal.title}`} />
                <a href={portal.url} target="_blank" rel="noreferrer" aria-label={`Buka ${portal.title}`}><ExternalLink size={16} /></a>
              </span>
            </label>
            <div className="public-portal-actions">
              <button type="button" className="master-button master-button-light" onClick={() => copyLink(portal)}>
                {copied === portal.key ? <Check size={15} /> : <Copy size={15} />}{copied === portal.key ? 'Link disalin' : 'Salin link'}
              </button>
              <button type="button" className="master-button master-button-primary" onClick={() => downloadCode(portal)} disabled={!qrImages[portal.key]}>
                <Download size={15} />Unduh barcode
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="public-portal-settings-note">Booking dan rating hanya dapat dikirim setelah anggota masuk dengan akun member sekolah. Pemindaian kamera memerlukan izin kamera dan browser yang mendukungnya.</p>
    </div>
  );
}
