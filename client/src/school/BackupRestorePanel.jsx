import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Database, Download, LoaderCircle, Save, Send, Upload } from 'lucide-react';

const defaultSettings = {
  enabled: false,
  frequency: 'daily',
  dayOfWeek: 1,
  time: '02:00',
  chatId: '',
  telegramConfigured: false,
  lastRunAt: null,
  lastRunStatus: ''
};

const weekdays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

async function request(path, mode, options = {}) {
  const isSchool = mode === 'school';
  const token = localStorage.getItem(isSchool ? 'school-token' : 'super-admin-token');
  if (!token) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch(`${isSchool ? '/api/school/settings' : '/api/super-admin'}/backups${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Permintaan backup gagal.');
  }
  return response;
}

function formatRunDate(value) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Belum pernah'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date);
}

export default function BackupRestorePanel({ scope }) {
  const isSchool = scope === 'school';
  const [settings, setSettings] = useState(defaultSettings);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [file, setFile] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    let active = true;
    request('/settings', scope)
      .then((response) => response.json())
      .then((result) => { if (active) setSettings({ ...defaultSettings, ...result.settings }); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = {
        ...settings,
        telegramToken: token,
        clearTelegramToken: clearToken
      };
      const response = await request('/settings', scope, { method: 'PUT', body: JSON.stringify(body) });
      const result = await response.json();
      setSettings({ ...defaultSettings, ...result.settings });
      setToken('');
      setClearToken(false);
      setNotice(result.message || 'Pengaturan backup berhasil disimpan.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadBackup() {
    setBackupBusy('download');
    setError('');
    setNotice('');
    try {
      const response = await request('/download', scope);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
        || `maca-backup-${scope}.json.gz`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('Backup berhasil dibuat dan diunduh.');
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setBackupBusy('');
    }
  }

  async function runTelegram(action) {
    setBackupBusy(action);
    setError('');
    setNotice('');
    try {
      const response = await request(`/telegram/${action}`, scope, { method: 'POST' });
      const result = await response.json();
      setNotice(result.message);
      if (action === 'backup') {
        const settingsResponse = await request('/settings', scope);
        const settingsResult = await settingsResponse.json();
        setSettings((current) => ({ ...current, ...settingsResult.settings }));
      }
    } catch (backupError) {
      setError(backupError.message);
    } finally {
      setBackupBusy('');
    }
  }

  async function restoreBackup() {
    if (!file || !confirmRestore) return;
    setBackupBusy('restore');
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('backup', file);
      const response = await request('/restore', scope, { method: 'POST', body: form });
      const result = await response.json();
      setNotice(result.message || 'Backup berhasil dipulihkan.');
      setFile(null);
      setConfirmRestore(false);
      if (fileInput.current) fileInput.current.value = '';
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setBackupBusy('');
    }
  }

  function updateSetting(event) {
    const { name, value, type, checked } = event.target;
    setSettings((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
    setNotice('');
  }

  return (
    <div className="backup-settings-page">
      <header className="backup-settings-heading">
        <span className="library-eyebrow">PERLINDUNGAN DATA</span>
        <h2>{isSchool ? 'Backup & Restore Sekolah' : 'Backup & Restore Platform'}</h2>
        <p>{isSchool
          ? 'Cadangkan data sekolah dan file buku. Arsip hanya dapat dipulihkan ke sekolah ini.'
          : 'Cadangkan seluruh database platform, termasuk semua sekolah dan pengaturan Super Admin.'}</p>
      </header>
      {error && <div className="master-form-error" role="alert">{error}</div>}
      {notice && <div className="master-message master-message-success" role="status"><Check size={15} />{notice}</div>}

      <section className="master-data-panel backup-action-panel">
        <div><h3><Database size={17} />Backup dan Restore</h3><p>File berformat gzip JSON dan mencakup database serta file sampul/PDF buku.</p></div>
        <div className="backup-action-buttons">
          <button type="button" className="master-button master-button-primary" onClick={downloadBackup} disabled={loading || Boolean(backupBusy)}>
            {backupBusy === 'download' ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Download size={15} />}
            {backupBusy === 'download' ? 'Membuat backup...' : 'Unduh Backup'}
          </button>
          <label className="master-button master-button-light backup-file-picker">
            <Upload size={15} />{file ? file.name : 'Pilih file untuk restore'}
            <input ref={fileInput} type="file" accept=".gz,.json.gz,application/gzip" disabled={Boolean(backupBusy)} onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setConfirmRestore(false);
              setError('');
              setNotice('');
            }} />
          </label>
        </div>
        {file && <div className="backup-restore-confirm">
          <label><input type="checkbox" checked={confirmRestore} onChange={(event) => setConfirmRestore(event.target.checked)} />
            Saya memahami bahwa data pada cakupan ini akan diganti oleh isi arsip.
          </label>
          <button type="button" className="master-button master-button-danger" onClick={restoreBackup} disabled={!confirmRestore || Boolean(backupBusy)}>
            {backupBusy === 'restore' ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Upload size={15} />}
            {backupBusy === 'restore' ? 'Memulihkan...' : 'Pulihkan Backup'}
          </button>
        </div>}
      </section>

      <form className="master-data-panel backup-telegram-panel" onSubmit={saveSettings}>
        <div className="backup-panel-title"><h3><Send size={17} />Autobackup Telegram</h3><p>Jadwal menggunakan waktu Indonesia Barat (WIB). Token bot disimpan terenkripsi.</p></div>
        <div className="backup-settings-grid">
          <label className="backup-settings-toggle"><input type="checkbox" name="enabled" checked={settings.enabled} onChange={updateSetting} disabled={loading || saving} />Aktifkan autobackup</label>
          <label>Frekuensi
            <select name="frequency" value={settings.frequency} onChange={updateSetting} disabled={loading || saving}>
              <option value="daily">Setiap hari</option><option value="weekly">Setiap minggu</option>
            </select>
          </label>
          {settings.frequency === 'weekly' && <label>Hari
            <select name="dayOfWeek" value={settings.dayOfWeek} onChange={updateSetting} disabled={loading || saving}>
              {weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}
            </select>
          </label>}
          <label>Waktu backup (WIB)
            <input type="time" name="time" value={settings.time} onChange={updateSetting} disabled={loading || saving} required />
          </label>
          <label>Telegram Chat ID
            <input value={settings.chatId} onChange={(event) => { setSettings((current) => ({ ...current, chatId: event.target.value })); setError(''); }} maxLength={120} placeholder="Contoh: 123456789" disabled={loading || saving} />
          </label>
          <label>Token Bot Telegram
            <input type="password" value={token} onChange={(event) => { setToken(event.target.value); setClearToken(false); }} autoComplete="new-password" placeholder={settings.telegramConfigured ? 'Tersimpan — isi hanya untuk mengganti' : 'Masukkan token bot'} disabled={loading || saving} />
            <small>{settings.telegramConfigured ? 'Token telah tersimpan dan tidak ditampilkan kembali.' : 'Token akan dienkripsi sebelum disimpan.'}</small>
          </label>
        </div>
        {settings.telegramConfigured && <label className="backup-clear-token"><input type="checkbox" checked={clearToken} onChange={(event) => setClearToken(event.target.checked)} disabled={loading || saving} />Hapus token tersimpan</label>}
        <div className="backup-telegram-status">
          <span><Clock3 size={14} />Terakhir: {formatRunDate(settings.lastRunAt)}{settings.lastRunStatus ? ` · ${settings.lastRunStatus}` : ''}</span>
          <div className="backup-action-buttons">
            <button type="button" className="master-button master-button-light" onClick={() => runTelegram('test')} disabled={loading || saving || Boolean(backupBusy) || !settings.telegramConfigured || !settings.chatId}>
              <Send size={15} />{backupBusy === 'test' ? 'Mengirim tes...' : 'Tes Telegram'}
            </button>
            <button type="button" className="master-button master-button-light" onClick={() => runTelegram('backup')} disabled={loading || saving || Boolean(backupBusy) || !settings.telegramConfigured || !settings.chatId}>
              <Database size={15} />{backupBusy === 'backup' ? 'Mengirim backup...' : 'Backup Telegram Sekarang'}
            </button>
            <button type="submit" className="master-button master-button-primary" disabled={loading || saving || Boolean(backupBusy)}>
              {saving ? <LoaderCircle size={15} className="book-stock-spinner" /> : <Save size={15} />}
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
        <small className="backup-encryption-note">Penyimpanan token memerlukan konfigurasi server <code>SCHOOL_SETTINGS_ENCRYPTION_KEY</code>.</small>
      </form>
    </div>
  );
}
