import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, LockKeyhole, X } from 'lucide-react';
import {
  changeSchoolPassword, updateSchoolProfile
} from './schoolAccountApi.js';

function resizeAvatar(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Gunakan foto JPG, PNG, atau WebP.'));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('Ukuran foto maksimal 5 MB.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const startX = (image.naturalWidth - side) / 2;
      const startY = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Foto tidak dapat diproses di browser ini.'));
        return;
      }
      context.drawImage(image, startX, startY, side, side, 0, 0, 256, 256);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Foto gagal diproses.'));
          return;
        }
        if (blob.size > 500 * 1024) {
          reject(new Error('Foto hasil kompresi masih terlalu besar.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File yang dipilih bukan foto yang valid.'));
    };
    image.src = objectUrl;
  });
}

export default function SchoolProfileEditor({ profile, onClose, onProfileUpdated }) {
  const [name, setName] = useState(profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !savingProfile && !savingPassword) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, savingProfile, savingPassword]);

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      setAvatar(await resizeAvatar(file));
    } catch (error) {
      setPhotoError(error.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setMessage('');
    try {
      const result = await updateSchoolProfile({ name, email, avatar });
      onProfileUpdated(result.profile);
      setMessage('Profil berhasil disimpan.');
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi baru tidak sama.');
      setSavingPassword(false);
      return;
    }
    try {
      const result = await changeSchoolPassword({ currentPassword, newPassword });
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setSavingPassword(false);
    }
  }

  return createPortal(
    <div className="school-profile-modal-backdrop">
      <section className="school-profile-modal" role="dialog" aria-modal="true" aria-labelledby="school-profile-modal-title">
        <header className="school-profile-modal-heading">
          <div><span className="library-eyebrow">AKUN SEKOLAH</span><h2 id="school-profile-modal-title">Edit Profil</h2></div>
          <button type="button" className="master-icon-button" onClick={onClose} aria-label="Tutup edit profil"><X size={18} /></button>
        </header>

        <form onSubmit={saveProfile}>
          <div className="school-avatar-editor">
            {avatar
              ? <img src={avatar} alt="Pratinjau avatar" />
              : <span>{name.slice(0, 1).toUpperCase() || 'U'}</span>}
            <label className="school-avatar-upload">
              <Camera size={15} />Tambah Foto Avatar
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} />
            </label>
          </div>
          {photoError && <p className="school-profile-error" role="alert"><AlertCircle size={14} />{photoError}</p>}
          <div className="master-form-grid">
            <label className="master-form-wide">Nama
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} required />
            </label>
            <label className="master-form-wide">Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={190} required />
            </label>
          </div>
          {profileError && <p className="school-profile-error" role="alert"><AlertCircle size={14} />{profileError}</p>}
          {message && <p className="school-profile-success">{message}</p>}
          <footer className="master-modal-actions">
            <button type="button" className="master-button master-button-muted" onClick={onClose}>Tutup</button>
            <button type="submit" className="master-button master-button-primary" disabled={savingProfile}>
              {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </footer>
        </form>

        <form className="school-password-form" onSubmit={savePassword}>
          <h3><LockKeyhole size={16} />Ubah Kata Sandi</h3>
          <div className="master-form-grid">
            <label className="master-form-wide">Kata sandi saat ini
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </label>
            <label>Kata sandi baru
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
            </label>
            <label>Ulangi kata sandi baru
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
            </label>
          </div>
          <small className="school-password-hint">Minimal 8 karakter, huruf besar, angka, dan simbol.</small>
          {passwordError && <p className="school-profile-error" role="alert"><AlertCircle size={14} />{passwordError}</p>}
          <footer className="master-modal-actions">
            <button type="submit" className="master-button master-button-violet" disabled={savingPassword}>
              {savingPassword ? 'Memproses...' : 'Ubah Kata Sandi'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}
