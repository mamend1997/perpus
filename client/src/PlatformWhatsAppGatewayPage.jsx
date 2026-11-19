import { useEffect, useState } from 'react';
import { MessageSquare, Save, Send } from 'lucide-react';

const initialSettings = {
  enabled: false,
  registrationOtpEnabled: false,
  paymentRemindersEnabled: false,
  reminderDaysBefore: 3,
  reminderDaysAfter: 7,
  tokenConfigured: false
};

async function requestGateway(path, options = {}) {
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
  if (!response.ok) throw new Error(body.message || 'Permintaan WhatsApp Gateway gagal.');
  return body;
}

export default function PlatformWhatsAppGatewayPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [apiToken, setApiToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [testTarget, setTestTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    requestGateway('/api/super-admin/whatsapp-gateway')
      .then(({ settings: saved }) => { if (active) setSettings({ ...initialSettings, ...saved }); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await requestGateway('/api/super-admin/whatsapp-gateway', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: settings.enabled,
          registrationOtpEnabled: settings.registrationOtpEnabled,
          paymentRemindersEnabled: settings.paymentRemindersEnabled,
          reminderDaysBefore: Number(settings.reminderDaysBefore),
          reminderDaysAfter: Number(settings.reminderDaysAfter),
          token: apiToken,
          clearToken
        })
      });
      setSettings((current) => ({ ...current, ...result.settings }));
      setApiToken('');
      setClearToken(false);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event) {
    event.preventDefault();
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const result = await requestGateway('/api/super-admin/whatsapp-gateway/test', {
        method: 'POST',
        body: JSON.stringify({ target: testTarget })
      });
      setNotice(result.message);
    } catch (testError) {
      setError(testError.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="platform-whatsapp-page">
      <header className="management-heading"><div><h1>WhatsApp Gateway</h1><p>Hubungkan Fonnte untuk OTP pendaftaran dan pengingat tagihan sekolah.</p></div></header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      <form className="panel platform-whatsapp-card" onSubmit={save}>
        <div className="platform-whatsapp-heading"><span><MessageSquare size={19} /></span><div><h2>Koneksi Fonnte</h2><p>Token dienkripsi sebelum disimpan dan tidak pernah ditampilkan kembali.</p></div></div>
        <div className="platform-whatsapp-fields">
          <label>Token API Fonnte<input type="password" autoComplete="new-password" maxLength={500} value={apiToken} onChange={(event) => { setApiToken(event.target.value); setClearToken(false); }} placeholder={settings.tokenConfigured ? 'Token sudah tersimpan; isi hanya jika ingin mengganti' : 'Tempel token dari dashboard Fonnte'} /></label>
          {settings.tokenConfigured && <label className="platform-whatsapp-clear-token"><input type="checkbox" checked={clearToken} onChange={(event) => { setClearToken(event.target.checked); if (event.target.checked) setApiToken(''); }} />Hapus token tersimpan</label>}
        </div>
        <label className="platform-whatsapp-toggle"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked, registrationOtpEnabled: event.target.checked ? current.registrationOtpEnabled : false, paymentRemindersEnabled: event.target.checked ? current.paymentRemindersEnabled : false }))} /><span><b>Aktifkan gateway</b><small>Gunakan perangkat WhatsApp Fonnte yang terhubung.</small></span></label>
        <div className="platform-whatsapp-options">
          <label className="platform-whatsapp-toggle"><input type="checkbox" checked={settings.registrationOtpEnabled} disabled={!settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, registrationOtpEnabled: event.target.checked }))} /><span><b>OTP pendaftaran sekolah</b><small>Kirim kode verifikasi ke WhatsApp saat mendaftar.</small></span></label>
          <label className="platform-whatsapp-toggle"><input type="checkbox" checked={settings.paymentRemindersEnabled} disabled={!settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, paymentRemindersEnabled: event.target.checked }))} /><span><b>Pengingat pembayaran</b><small>Kirim satu pengingat sebelum jatuh tempo dan satu setelah lewat jatuh tempo.</small></span></label>
        </div>
        <div className="platform-whatsapp-reminder-days">
          <label>Hari sebelum jatuh tempo<input type="number" min="1" max="30" value={settings.reminderDaysBefore} onChange={(event) => setSettings((current) => ({ ...current, reminderDaysBefore: event.target.value }))} /></label>
          <label>Hari setelah jatuh tempo<input type="number" min="1" max="30" value={settings.reminderDaysAfter} onChange={(event) => setSettings((current) => ({ ...current, reminderDaysAfter: event.target.value }))} /></label>
        </div>
        <div className="platform-whatsapp-footer"><span>{loading ? 'Memuat pengaturan…' : settings.tokenConfigured ? 'Token Fonnte sudah tersimpan.' : 'Token Fonnte belum diatur.'}</span><button type="submit" className="primary-button" disabled={loading || saving}><Save size={15} />{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</button></div>
      </form>
      <form className="panel platform-whatsapp-test" onSubmit={sendTest}>
        <div><h2>Tes Pengiriman</h2><p>Kirim pesan tes ke nomor yang Anda kontrol untuk memastikan koneksi WhatsApp aktif.</p></div>
        <label>Nomor tujuan<input type="tel" required pattern="\+?[1-9]\d{7,14}" value={testTarget} onChange={(event) => setTestTarget(event.target.value)} placeholder="+6281234567890" /></label>
        <button type="submit" className="subtle-button" disabled={testing || !settings.tokenConfigured || !settings.enabled}><Send size={14} />{testing ? 'Mengirim…' : 'Kirim Tes'}</button>
      </form>
    </section>
  );
}
