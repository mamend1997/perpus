import { useEffect, useState } from 'react';
import { Palette, Save, Upload } from 'lucide-react';
import { fetchSchoolAppearance, saveSchoolAppearance } from './schoolSettingsApi.js';

const defaultAppearance = {
  primaryColor: '#f97316',
  title: 'PerpusKita',
  subtitle: 'PORTAL SEKOLAH'
};
const themeColors = [
  ['#f97316', 'Jingga'],
  ['#2563eb', 'Biru'],
  ['#16a34a', 'Hijau'],
  ['#7c3aed', 'Ungu'],
  ['#0f766e', 'Teal'],
  ['#dc2626', 'Merah']
];

export default function SchoolAppearancePage({ schoolLogo, onEditIdentity, onSaved }) {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    fetchSchoolAppearance()
      .then(({ appearance: saved }) => { if (active) setAppearance({ ...defaultAppearance, ...saved }); })
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
      const result = await saveSchoolAppearance(appearance);
      setAppearance(result.appearance);
      onSaved?.(result.appearance);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="school-appearance-page">
      <header className="management-heading"><div><h1>Tema & Branding</h1><p>Sesuaikan warna dan identitas aplikasi untuk portal sekolah ini.</p></div></header>
      {error && <div className="library-error" role="alert">{error}</div>}
      {notice && <div className="school-support-notice" role="status">{notice}</div>}
      <form className="panel school-appearance-panel" onSubmit={save}>
        <div className="school-appearance-preview" style={{ '--school-accent-preview': appearance.primaryColor }}>
          <div className="school-appearance-preview-logo">{schoolLogo ? <img src={schoolLogo} alt="Logo sekolah" /> : <Palette size={19} />}</div>
          <div><b>{appearance.title}</b><small>{appearance.subtitle}</small></div>
          <span />
        </div>
        <div className="school-appearance-fields">
          <label>Judul aplikasi<input value={appearance.title} onChange={(event) => setAppearance((current) => ({ ...current, title: event.target.value }))} maxLength={60} minLength={2} required /></label>
          <label>Subjudul aplikasi<input value={appearance.subtitle} onChange={(event) => setAppearance((current) => ({ ...current, subtitle: event.target.value }))} maxLength={100} minLength={2} required /></label>
          <label className="school-appearance-color">Warna dasar
            <select value={appearance.primaryColor} onChange={(event) => setAppearance((current) => ({ ...current, primaryColor: event.target.value }))}>
              {themeColors.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="school-appearance-logo">
          <div><b>Logo sekolah</b><small>Logo mengikuti Identitas Sekolah yang digunakan pada kop dan cetak laporan.</small></div>
          <button type="button" className="subtle-button" onClick={onEditIdentity}><Upload size={15} />Ubah Logo</button>
        </div>
        <div className="school-appearance-footer"><span>Warna diterapkan pada navigasi dan tombol utama portal.</span><button type="submit" className="primary-button" disabled={loading || busy}><Save size={15} />{busy ? 'Menyimpan...' : 'Simpan Tema'}</button></div>
      </form>
    </section>
  );
}
