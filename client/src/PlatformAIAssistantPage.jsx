import { useEffect, useState } from 'react';
import { Bot, Save } from 'lucide-react';

const defaultSettings = {
  enabled: true,
  title: 'Asisten AI Perpustakaan',
  welcomeMessage: 'Halo! Saya bisa membantu menemukan menu yang Anda butuhkan. Apa yang ingin Anda lakukan?',
  suggestions: ['Saya ingin mencari buku', 'Bagaimana mencatat peminjaman?', 'Saya ingin mengelola data siswa']
};

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

export default function PlatformAIAssistantPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/super-admin/ai-assistant')
      .then(({ settings: saved }) => { if (active) setSettings({ ...defaultSettings, ...saved }); })
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
      const result = await request('/api/super-admin/ai-assistant', {
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
    <section className="legal-page">
      <header className="management-heading"><div><h1>Asisten AI</h1><p>Atur asisten panduan yang membantu pengguna menemukan menu perpustakaan.</p></div></header>
      <form className="panel legal-document-panel" onSubmit={save}>
        <div className="panel-heading profile-panel-heading"><div><h3><Bot size={17} /> Widget bantuan</h3><p>Asisten mencocokkan permintaan pengguna dengan menu yang tersedia, lalu menyorot tujuan di navigasi.</p></div></div>
        <div className="legal-document-fields">
          <label className="ai-assistant-enabled"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} /> Tampilkan widget bantuan pada portal sekolah</label>
          <label>Nama Asisten<input required minLength={2} maxLength={60} value={settings.title} onChange={(event) => setSettings((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Pesan Pembuka<textarea required minLength={5} maxLength={300} rows={3} value={settings.welcomeMessage} onChange={(event) => setSettings((current) => ({ ...current, welcomeMessage: event.target.value }))} /></label>
          <label>Saran Pertanyaan<textarea rows={4} maxLength={504} value={settings.suggestions.join('\n')} onChange={(event) => setSettings((current) => ({ ...current, suggestions: event.target.value.split('\n').slice(0, 5) }))} placeholder="Satu saran per baris" /></label>
          <small>Maksimal 5 saran, satu per baris. Asisten mengikuti hak akses dan menu yang tersedia untuk peran pengguna.</small>
          {error && <div className="error-box" role="alert">{error}</div>}
          {notice && <div className="success-box" role="status">{notice}</div>}
          <button className="primary-button legal-save-button" disabled={loading || busy}><Save size={16} />{busy ? 'Menyimpan...' : 'Simpan Pengaturan'}</button>
        </div>
      </form>
    </section>
  );
}