import { useEffect, useState } from 'react';
import { ImagePlus, Palette, Save, Trash2 } from 'lucide-react';

async function requestBranding(path, options = {}) {
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
  if (!response.ok) throw new Error(body.message || 'Permintaan branding gagal.');
  return body;
}

const defaultBranding = {
  title: 'PerpusKita',
  subtitle: 'PLATFORM ADMIN',
  primaryColor: '#f97316',
  logo: ''
};
const themeColors = [
  ['#f97316', 'Jingga'],
  ['#2563eb', 'Biru'],
  ['#16a34a', 'Hijau'],
  ['#7c3aed', 'Ungu'],
  ['#0f766e', 'Teal'],
  ['#dc2626', 'Merah']
];

export default function PlatformAppearancePage({ mode = 'branding', onSaved }) {
  const [branding, setBranding] = useState(defaultBranding);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    requestBranding('/api/super-admin/branding')
      .then(({ branding: saved }) => { if (active) setBranding({ ...defaultBranding, ...saved }); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function chooseLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setError('Logo harus JPG, PNG, atau WebP dengan ukuran maksimal 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Logo gagal dibaca.');
        return;
      }
      setBranding((current) => ({ ...current, logo: reader.result }));
      setError('');
    };
    reader.onerror = () => setError('Logo gagal dibaca.');
    reader.readAsDataURL(file);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestBranding('/api/super-admin/branding', {
        method: 'PUT',
        body: JSON.stringify(branding)
      });
      setBranding(result.branding);
      onSaved?.(result.branding);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  const editingTheme = mode === 'theme';
  return (
    <section className="platform-appearance-page">
      <header className="management-heading"><div><h1>{editingTheme ? 'Tema Platform' : 'Branding Sistem'}</h1><p>{editingTheme ? 'Pilih warna dasar untuk navigasi dan tombol platform.' : 'Atur judul, subjudul, logo, dan warna aplikasi platform.'}</p></div></header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      <form className="panel platform-appearance-panel" onSubmit={save}>
        <div className="platform-appearance-preview" style={{ '--platform-accent-preview': branding.primaryColor }}>
          <div className="platform-appearance-logo">{branding.logo ? <img src={branding.logo} alt="Logo aplikasi" /> : <Palette size={20} />}</div>
          <div><b>{branding.title}</b><small>{branding.subtitle}</small></div>
          <span />
        </div>
        {!editingTheme && <>
          <div className="platform-appearance-fields">
            <label>Judul aplikasi<input value={branding.title} onChange={(event) => setBranding((current) => ({ ...current, title: event.target.value }))} maxLength={60} minLength={2} required /></label>
            <label>Subjudul aplikasi<input value={branding.subtitle} onChange={(event) => setBranding((current) => ({ ...current, subtitle: event.target.value }))} maxLength={100} minLength={2} required /></label>
          </div>
          <div className="platform-appearance-logo-control">
            <div><b>Logo aplikasi</b><small>JPG, PNG, atau WebP; maksimal 1 MB.</small></div>
            <div>{branding.logo && <button type="button" className="subtle-button" onClick={() => setBranding((current) => ({ ...current, logo: '' }))}><Trash2 size={14} />Hapus Logo</button>}<label className="subtle-button"><ImagePlus size={14} />Pilih Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label></div>
          </div>
        </>}
        <label className="platform-appearance-color">Warna dasar
          <select value={branding.primaryColor} onChange={(event) => setBranding((current) => ({ ...current, primaryColor: event.target.value }))}>
            {themeColors.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <div className="platform-appearance-footer"><span>Pratinjau ini menunjukkan warna navigasi dan merek aplikasi.</span><button type="submit" className="primary-button" disabled={loading || busy}><Save size={15} />{busy ? 'Menyimpan...' : 'Simpan Perubahan'}</button></div>
      </form>
    </section>
  );
}
