import { useEffect, useState } from 'react';
import { CreditCard, ImagePlus, Save, ShieldCheck, Trash2 } from 'lucide-react';

const defaultSettings = {
  qrisEnabled: false,
  merchantName: '',
  instructions: '',
  qrisImage: '',
  kaseraEnabled: false,
  kaseraApiKey: '',
  kaseraWebhookSecret: ''
};

async function requestPaymentSettings(path, options = {}) {
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
  if (!response.ok) throw new Error(body.message || 'Pengaturan pembayaran gagal dimuat.');
  return body;
}

export default function PlatformPaymentSettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    requestPaymentSettings('/api/super-admin/payment-settings')
      .then(({ settings: saved }) => {
        if (active) setSettings({
          ...defaultSettings,
          ...saved
        });
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function chooseQrisImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setError('Gambar QRIS harus JPG, PNG, atau WebP dengan ukuran maksimal 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Gambar QRIS gagal dibaca.');
        return;
      }
      setSettings((current) => ({ ...current, qrisImage: reader.result }));
      setError('');
    };
    reader.onerror = () => setError('Gambar QRIS gagal dibaca.');
    reader.readAsDataURL(file);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestPaymentSettings('/api/super-admin/payment-settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings(result.settings);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="platform-payment-settings">
      <header className="management-heading">
        <div><h1>QRIS & Harga</h1><p>Atur QRIS manual dan instruksi pembayaran untuk sekolah; harga paket tersedia di menu Paket Langganan.</p></div>
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      <form onSubmit={save}>
        <section className="panel platform-payment-card">
          <div className="platform-payment-card-heading">
            <div><h2>Pembayaran QRIS Manual</h2><p>Sekolah membayar dengan memindai QRIS dan mengikuti instruksi yang ditampilkan.</p></div>
            <label className="platform-payment-toggle">
              <input type="checkbox" checked={settings.qrisEnabled} onChange={(event) => setSettings((current) => ({ ...current, qrisEnabled: event.target.checked }))} />
              <span>{settings.qrisEnabled ? 'Aktif' : 'Nonaktif'}</span>
            </label>
          </div>
          <div className="platform-payment-qris-layout">
            <div className="platform-payment-qris-preview">
              {settings.qrisImage ? <img src={settings.qrisImage} alt="Pratinjau QRIS pembayaran" /> : <div><ImagePlus size={24} /><span>QRIS belum diunggah</span></div>}
            </div>
            <div className="platform-payment-qris-fields">
              <label>Nama merchant<input maxLength={120} value={settings.merchantName} onChange={(event) => setSettings((current) => ({ ...current, merchantName: event.target.value }))} placeholder="Contoh: MACA" /></label>
              <label>Instruksi pembayaran<textarea maxLength={2000} rows={4} value={settings.instructions} onChange={(event) => setSettings((current) => ({ ...current, instructions: event.target.value }))} placeholder="Jelaskan cara membayar dan mengirim bukti pembayaran." /></label>
              <div className="platform-payment-qris-actions">
                {settings.qrisImage && <button type="button" className="subtle-button" onClick={() => setSettings((current) => ({ ...current, qrisImage: '' }))}><Trash2 size={14} />Hapus QRIS</button>}
                <label className="subtle-button"><ImagePlus size={14} />Unggah QRIS<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseQrisImage} /></label>
                <small>JPG, PNG, atau WebP; maksimal 1 MB.</small>
              </div>
            </div>
          </div>
        </section>

        <section className="panel platform-payment-card platform-kasera-card">
          <div className="platform-payment-card-heading">
            <div><h2><CreditCard size={18} />Kasera Pay · QRIS Otomatis</h2><p>Buat checkout QRIS untuk tagihan dan perpanjangan akun sekolah. Konfirmasi pembayaran diproses melalui webhook Kasera.</p></div>
            <label className="platform-payment-toggle">
              <input
                type="checkbox"
                checked={settings.kaseraEnabled}
                disabled={!settings.kaseraConfigured && !(settings.kaseraApiKey.trim() && settings.kaseraWebhookSecret.trim())}
                onChange={(event) => setSettings((current) => ({ ...current, kaseraEnabled: event.target.checked }))}
              />
              <span>{settings.kaseraEnabled ? 'Aktif' : 'Nonaktif'}</span>
            </label>
          </div>
          <div className="platform-kasera-status">
            <div className={`platform-kasera-indicator ${settings.kaseraConfigured ? 'ready' : 'missing'}`}>
              <ShieldCheck size={17} />
              <span>{settings.kaseraConfigured ? `Kredensial server terpasang · ${settings.kaseraMode === 'sandbox' ? 'Sandbox' : 'Live'}` : 'Kredensial Kasera belum lengkap di server'}</span>
            </div>
            <label>API Key Kasera
              <input type="password" autoComplete="new-password" value={settings.kaseraApiKey} onChange={(event) => setSettings((current) => ({ ...current, kaseraApiKey: event.target.value }))} placeholder="kp_test_... atau kp_live_..." disabled={loading || busy} />
            </label>
            <label>Webhook Secret Kasera
              <input type="password" autoComplete="new-password" value={settings.kaseraWebhookSecret} onChange={(event) => setSettings((current) => ({ ...current, kaseraWebhookSecret: event.target.value }))} placeholder="Masukkan webhook secret" disabled={loading || busy} />
            </label>
            <p>Kredensial disimpan terenkripsi di server dan tidak ditampilkan kembali. Isi untuk menambah atau mengganti; kosongkan untuk mempertahankan kredensial tersimpan. Gunakan key <code>kp_test_</code> untuk uji coba dan <code>kp_live_</code> untuk transaksi sungguhan.</p>
            {settings.webhookUrl && <label>URL webhook Kasera<input readOnly value={settings.webhookUrl} onFocus={(event) => event.target.select()} /></label>}
            <small>Tambahkan URL tersebut pada Developer → Webhook di mode Kasera yang sama dengan API key. Tarif/biaya mengikuti pengaturan akun Kasera dan dipotong dari penerimaan merchant; masa berlaku checkout 60 menit.</small>
          </div>
        </section>

        <div className="platform-payment-save-row"><span>{loading ? 'Memuat pengaturan…' : 'Harga dan masa langganan dikelola melalui menu Paket Langganan.'}</span><button type="submit" className="primary-button" disabled={loading || busy}><Save size={15} />{busy ? 'Menyimpan…' : 'Simpan Pengaturan'}</button></div>
      </form>
    </section>
  );
}
