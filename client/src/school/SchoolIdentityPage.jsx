import { useEffect, useState } from 'react';
import {
  Building2, Camera, Check, Globe2, LoaderCircle, Mail, MapPin,
  Phone, RefreshCw, Upload, UserRound
} from 'lucide-react';
import { fetchSchoolIdentity, updateSchoolIdentity } from './schoolAccountApi.js';

const emptyIdentity = {
  name: '',
  npsn: '',
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

function normalizeIdentity(value) {
  return {
    ...emptyIdentity,
    ...Object.fromEntries(identityTextFields.map((field) => [field, value[field] || ''])),
    logo: value.logo || null
  };
}

function resizeSchoolLogo(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Gunakan logo JPG, PNG, atau WebP.'));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('Ukuran file logo maksimal 5 MB.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Logo tidak dapat diproses di browser ini.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Logo gagal diproses.'));
          return;
        }
        if (blob.size > 500 * 1024) {
          reject(new Error('Ukuran logo hasil kompresi masih terlalu besar.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Logo gagal dibaca.'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File yang dipilih bukan logo yang valid.'));
    };
    image.src = objectUrl;
  });
}

export default function SchoolIdentityPage({ rights, onSaved }) {
  const canEdit = Boolean(rights?.edit);
  const [identity, setIdentity] = useState(emptyIdentity);
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
    setIdentity((current) => ({ ...current, [name]: value }));
    setError('');
  }

  async function selectLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoError('');
    setLogoLoading(true);
    try {
      const logo = await resizeSchoolLogo(file);
      setIdentity((current) => ({ ...current, logo }));
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
      const result = await updateSchoolIdentity(identity);
      setIdentity(normalizeIdentity(result.identity));
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
        <h1>Identitas Sekolah</h1>
        <p>Kelola informasi resmi sekolah dan logo yang digunakan pada layanan perpustakaan.</p>
      </header>

      {notice && <div className="book-stock-success" role="status"><Check size={16} />{notice}</div>}
      {loadError && <div className="library-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} />Coba lagi</button></div>}

      <form className="library-panel school-identity-panel" onSubmit={saveIdentity}>
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
          <label><span><Phone size={13} />No. Telepon Sekolah</span>
            <input type="tel" name="phone" value={identity.phone} onChange={updateField} maxLength={30} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><Mail size={13} />Email Sekolah</span>
            <input type="email" name="email" value={identity.email} onChange={updateField} maxLength={190} disabled={!canEdit || saving || loading || !loaded} />
          </label>
          <label><span><Globe2 size={13} />Website</span>
            <input type="url" name="website" value={identity.website} onChange={updateField} maxLength={255} placeholder="https://sekolah.sch.id" disabled={!canEdit || saving || loading || !loaded} />
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

        <section className="school-identity-logo-section">
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
        </section>

        {error && <p className="master-form-error" role="alert">{error}</p>}
        {canEdit && <footer className="school-identity-savebar">
          <span>Pastikan data identitas sekolah sudah benar sebelum disimpan.</span>
          <button type="submit" className="master-button master-button-primary" disabled={saving || loading || logoLoading || !loaded}>
            {saving ? 'Menyimpan...' : <><Check size={15} />Simpan Identitas Sekolah</>}
          </button>
        </footer>}
      </form>
    </div>
  );
}
