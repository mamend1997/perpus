import { useEffect, useState } from 'react';
import {
  Building2, Camera, Check, Globe2, LoaderCircle, Mail, MapPin,
  Phone, RefreshCw, Upload, UserRound
} from 'lucide-react';
import { fetchSchoolIdentity, updateSchoolIdentity } from './schoolAccountApi.js';
import { resizeSchoolImage } from './schoolImageUtils.js';

const emptyIdentity = {
  name: '',
  npsn: '',
  education_level: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  principal_name: '',
  principal_nip: '',
  librarian_name: '',
  librarian_nip: '',
  logo: null
};
const identityTextFields = Object.keys(emptyIdentity).filter((field) => field !== 'logo');
const defaultLetterhead = {
  mode: 'identity',
  logo: null,
  signaturePlace: '',
  lines: Array.from({ length: 5 }, () => ({
    text: '',
    fontSize: 14,
    bold: false,
    italic: false,
    align: 'center'
  }))
};
const letterheadFontSizes = [10, 12, 14, 16, 18, 20, 24, 28, 32];

function normalizeLetterhead(value) {
  if (!value || !['identity', 'manual'].includes(value.mode) || !Array.isArray(value.lines) || value.lines.length !== 5) {
    return defaultLetterhead;
  }
  return {
    mode: value.mode,
    logo: typeof value.logo === 'string' ? value.logo : null,
    signaturePlace: typeof value.signaturePlace === 'string' ? value.signaturePlace : '',
    lines: value.lines.map((line) => ({
      text: typeof line.text === 'string' ? line.text : '',
      fontSize: letterheadFontSizes.includes(Number(line.fontSize)) ? Number(line.fontSize) : 14,
      bold: line.bold === true,
      italic: line.italic === true,
      align: line.align === 'left' ? 'left' : 'center'
    }))
  };
}

function normalizeIdentity(value) {
  return {
    ...emptyIdentity,
    ...Object.fromEntries(identityTextFields.map((field) => [
      field,
      field === 'website'
      ? String(value[field] || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
        : value[field] || ''
    ])),
    logo: value.logo || null
  };
}

export default function SchoolIdentityPage({ rights, onSaved, mode = 'identity' }) {
  const isLetterhead = mode === 'letterhead';
  const canEdit = Boolean(rights?.edit);
  const [identity, setIdentity] = useState(emptyIdentity);
  const [letterhead, setLetterhead] = useState(defaultLetterhead);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoaded(false);
    setLoadError('');
    fetchSchoolIdentity()
      .then(({ identity: result }) => {
        if (active) {
          setIdentity(normalizeIdentity(result));
          setLetterhead(normalizeLetterhead(result.letterhead));
          setLoaded(true);
        }
      })
      .catch((loadError) => {
        if (active) setLoadError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refreshKey]);

  function updateField(event) {
    const { name, value } = event.target;
    const nextValue = name === 'website'
      ? value.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
      : value;
    setIdentity((current) => ({ ...current, [name]: nextValue }));
    setError('');
  }

  async function selectLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoLoading(true);
    try {
      const logo = await resizeSchoolImage(file);
      setIdentity((current) => ({ ...current, logo }));
    } catch (logoProcessingError) {
      setLogoError(logoProcessingError.message);
    } finally {
      setLogoLoading(false);
    }
  }

  async function selectLetterheadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoLoading(true);
    try {
      const logo = await resizeSchoolImage(file);
      setLetterhead((current) => ({ ...current, logo }));
    } catch (logoProcessingError) {
      setLogoError(logoProcessingError.message);
    } finally {
      setLogoLoading(false);
    }
  }

  async function saveIdentity(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await updateSchoolIdentity(isLetterhead ? { ...identity, letterhead } : identity);
      setIdentity(normalizeIdentity(result.identity));
      setLetterhead(normalizeLetterhead(result.identity.letterhead));
      setNotice(result.message);
      onSaved?.(result.identity);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="library-module-page school-identity-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MASTER DATA</span>
        <h1>{isLetterhead ? 'Kop Sekolah' : 'Identitas Sekolah'}</h1>
        <p>{isLetterhead
          ? 'Atur identitas dan pratinjau kop yang digunakan pada cetak laporan perpustakaan.'
          : 'Kelola informasi resmi sekolah dan logo yang digunakan pada layanan perpustakaan.'}</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {loadError && <div className="library-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button></div>}

      <form className="library-panel school-identity-panel" onSubmit={saveIdentity}>
        {isLetterhead && <label className="school-letterhead-mode-select">Format kop sekolah
          <select
            value={letterhead.mode}
            onChange={(event) => setLetterhead((current) => ({ ...current, mode: event.target.value }))}
            disabled={!canEdit || saving || loading || !loaded}
          >
            <option value="identity">Gunakan data identitas sekolah</option>
            <option value="manual">Isi kop secara manual</option>
          </select>
        </label>}
        {isLetterhead && <label className="school-letterhead-signature-place">Tempat pada tanda tangan laporan
          <input
            value={letterhead.signaturePlace}
            onChange={(event) => setLetterhead((current) => ({ ...current, signaturePlace: event.target.value }))}
            maxLength={120}
            placeholder="Contoh: Cikoneng"
            disabled={!canEdit || saving || loading || !loaded}
          />
          <small>Dicetak otomatis bersama tanggal, bulan, dan tahun pada tanda tangan kepala perpustakaan.</small>
        </label>}
        {!isLetterhead && <>
        <div className="school-identity-section-heading">
          <span className="school-identity-section-icon"><Building2 size={18} /></span>
          <div><h2>Informasi Sekolah</h2><p>Data ini akan digunakan sebagai identitas perpustakaan sekolah.</p></div>
        </div>
        <div className="school-identity-grid">
          <label>Nama Sekolah
            <input name="name" value={identity.name} onChange={updateField} maxLength={180} required disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label>NPSN
            <input name="npsn" value={identity.npsn} onChange={updateField} maxLength={8} inputMode="numeric" placeholder="8 digit" disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label>Jenjang Pendidikan
            <select name="education_level" value={identity.education_level} onChange={updateField} disabled={!canEdit || saving || loading || !loaded}>
              <option value="">Pilih jenjang pendidikan</option>
              <option value="SD">SD</option><option value="MI">MI</option>
              <option value="SMP">SMP</option><option value="MTs">MTs</option>
              <option value="SMA">SMA</option><option value="MA">MA</option><option value="SMK">SMK</option>
            </select>
            <small>Jenjang ini menentukan urutan kelas dan tingkat akhir saat kenaikan kelas.</small>
          </label>
          <label><span><Phone size={13} />No. Telepon Sekolah</span>
            <input type="tel" name="phone" value={identity.phone} onChange={updateField} maxLength={30} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><Mail size={13} />Email Sekolah</span>
            <input type="email" name="email" value={identity.email} onChange={updateField} maxLength={190} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><Globe2 size={13} />Website</span>
            <input type="text" inputMode="url" name="website" value={identity.website} onChange={updateField} maxLength={255} placeholder="sekolah.sch.id" disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label className="school-identity-wide"><span><MapPin size={13} />Alamat</span>
            <textarea name="address" value={identity.address} onChange={updateField} maxLength={2000} rows={3} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><UserRound size={13} />Nama Kepala Sekolah</span>
            <input name="principal_name" value={identity.principal_name} onChange={updateField} maxLength={180} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label>NIP Kepala Sekolah
            <input name="principal_nip" value={identity.principal_nip} onChange={updateField} maxLength={30} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><UserRound size={13} />Nama Kepala Perpustakaan</span>
            <input name="librarian_name" value={identity.librarian_name} onChange={updateField} maxLength={180} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label>NIP Kepala Perpustakaan
            <input name="librarian_nip" value={identity.librarian_nip} onChange={updateField} maxLength={30} disabled={!canEdit || saving || loading || !loaded} />
          </label>
        </div>
        </>}

        {isLetterhead && letterhead.mode === 'identity' && (
          <p className="school-letterhead-identity-note">
            Kop surat otomatis menggunakan nama, NPSN, alamat, kontak, dan logo dari menu Identitas Sekolah.
          </p>
        )}

        {isLetterhead && letterhead.mode === 'manual' && <section className="school-letterhead-manual-editor">
          <div className="school-identity-section-heading">
            <span className="school-identity-section-icon"><Building2 size={18} /></span>
            <div><h2>Isi Kop Manual</h2><p>Atur lima baris teks. Setiap baris dapat memiliki ukuran dan gaya sendiri.</p></div>
          </div>
          <div className="school-letterhead-lines">
            {letterhead.lines.map((line, index) => (
              <div className="school-letterhead-line-editor" key={`line-${index + 1}`}>
                <label>Baris {index + 1}
                  <input value={line.text} maxLength={180} onChange={(event) => setLetterhead((current) => ({
                    ...current,
                    lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, text: event.target.value } : item)
                  }))} disabled={!canEdit || saving || loading || !loaded} />
                </label>
                <label>Ukuran
                  <select value={line.fontSize} onChange={(event) => setLetterhead((current) => ({
                    ...current,
                    lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, fontSize: Number(event.target.value) } : item)
                  }))} disabled={!canEdit || saving || loading || !loaded}>
                    {letterheadFontSizes.map((size) => <option value={size} key={size}>{size} px</option>)}
                  </select>
                </label>
                <label className="school-letterhead-style-option"><input type="checkbox" checked={line.bold} onChange={(event) => setLetterhead((current) => ({
                  ...current,
                  lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, bold: event.target.checked } : item)
                }))} disabled={!canEdit || saving || loading || !loaded} />Bold</label>
                <label className="school-letterhead-style-option"><input type="checkbox" checked={line.italic} onChange={(event) => setLetterhead((current) => ({
                  ...current,
                  lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, italic: event.target.checked } : item)
                }))} disabled={!canEdit || saving || loading || !loaded} />Italic</label>
                <label>Perataan
                  <select value={line.align} onChange={(event) => setLetterhead((current) => ({
                    ...current,
                    lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, align: event.target.value } : item)
                  }))} disabled={!canEdit || saving || loading || !loaded}>
                    <option value="center">Tengah</option>
                    <option value="left">Kiri</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>}

        {isLetterhead && <section className="school-letterhead-logo-section">
          <div className="school-identity-section-heading">
            <span className="school-identity-section-icon"><Camera size={18} /></span>
            <div><h2>Logo Kop Sekolah (Opsional)</h2><p>Gunakan logo khusus untuk kop. Jika dikosongkan, logo dari Identitas Sekolah yang dipakai.</p></div>
          </div>
          <div className="school-letterhead-logo-control">
            <div className="school-identity-logo-preview">
              {logoLoading ? <LoaderCircle size={22} className="book-stock-spinner" />
                : letterhead.logo || identity.logo
                  ? <img src={letterhead.logo || identity.logo} alt="Pratinjau logo kop sekolah" />
                  : <Building2 size={28} />}
            </div>
            {canEdit && <div className="school-identity-logo-actions">
              <label className="master-button master-button-light">
                <Upload size={15} />{logoLoading ? 'Memproses...' : 'Pilih Logo Kop'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectLetterheadLogo} disabled={saving || loading || logoLoading || !loaded} />
              </label>
              {letterhead.logo && <button type="button" className="master-button master-button-muted" onClick={() => setLetterhead((current) => ({ ...current, logo: null }))} disabled={saving || loading || logoLoading || !loaded}>Gunakan Logo Utama</button>}
              {logoError && <p className="school-identity-logo-error" role="alert">{logoError}</p>}
            </div>}
          </div>
        </section>}

        {isLetterhead && <section className={`school-letterhead-preview ${letterhead.mode === 'manual' ? 'is-manual' : ''}`} aria-label="Pratinjau kop sekolah">
          {(letterhead.logo || identity.logo) && <img src={letterhead.logo || identity.logo} alt="" />}
          {letterhead.mode === 'manual' ? <div className="school-letterhead-preview-lines">
            {letterhead.lines.map((line, index) => <span key={`preview-${index + 1}`} style={{
              fontSize: `${line.fontSize}px`,
              fontWeight: line.bold ? 700 : 400,
              fontStyle: line.italic ? 'italic' : 'normal',
              textAlign: line.align
            }}>{line.text || '\u00a0'}</span>)}
          </div> : <div>
            <b>{identity.name || 'NAMA SEKOLAH'}</b>
            {identity.npsn && <span>NPSN {identity.npsn}</span>}
            <span>{identity.address || 'Alamat sekolah'}</span>
            <span>{[identity.phone, identity.email, identity.website].filter(Boolean).join(' · ') || 'Telepon · Email · Website'}</span>
          </div>}
        </section>}
        {isLetterhead && <p className="school-letterhead-signature-preview">
          Pratinjau tanggal laporan: {[letterhead.signaturePlace.trim(), new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())].filter(Boolean).join(', ')}
        </p>}

        {!isLetterhead && <section className="school-identity-logo-section">
          <div className="school-identity-section-heading">
            <span className="school-identity-section-icon"><Camera size={18} /></span>
            <div><h2>Logo Sekolah</h2><p>Format JPG, PNG, atau WebP. File akan diperkecil otomatis.</p></div>
          </div>
          <div className="school-identity-logo-control">
            <div className="school-identity-logo-preview">
              {logoLoading ? <LoaderCircle size={22} className="book-stock-spinner" />
                : identity.logo ? <img src={identity.logo} alt="Pratinjau logo sekolah" />
                  : <Building2 size={28} />}
            </div>
            {canEdit && <div className="school-identity-logo-actions">
              <label className="master-button master-button-light">
                <Upload size={15} />{logoLoading ? 'Memproses...' : 'Pilih Logo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectLogo} disabled={saving || loading || logoLoading || !loaded} />
              </label>
              {identity.logo && <button type="button" className="master-button master-button-muted" onClick={() => setIdentity((current) => ({ ...current, logo: null }))} disabled={saving || loading || logoLoading || !loaded}>Hapus Logo</button>}
              {logoError && <p className="school-identity-logo-error" role="alert">{logoError}</p>}
            </div>}
          </div>
        </section>}

        {error && <p className="master-form-error" role="alert">{error}</p>}
        {canEdit && <footer className="school-identity-savebar">
          <span>{isLetterhead ? 'Pratinjau kop dan perubahan akan digunakan pada cetak laporan.' : 'Pastikan data identitas sekolah sudah benar sebelum disimpan.'}</span>
          <button type="submit" className="master-button master-button-primary" disabled={saving || loading || logoLoading || !loaded}>
            {saving ? 'Menyimpan...' : <><Check size={15} />{isLetterhead ? 'Simpan Kop Sekolah' : 'Simpan Identitas Sekolah'}</>}
          </button>
        </footer>}
      </form>
    </div>
  );
}
