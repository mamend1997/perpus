import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { AlertCircle, Check, Save, ScanLine, Tags } from 'lucide-react';
import { fetchBarcodeLabelSettings, saveBarcodeLabelSettings } from './schoolSettingsApi.js';

const defaultSettings = {
  barcodeFormat: 'CODE128',
  serialPrefix: 'S',
  scanBehavior: 'focus',
  labelSize: 'A4',
  columns: 3,
  showLibraryName: true,
  showBarcodeValue: true,
  showSerialNumber: true,
  showBookTitle: true,
  showRackCode: true
};

function BarcodeLabelPreview({ settings }) {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, '1234567890128', {
        format: settings.barcodeFormat,
        displayValue: false,
        height: 38,
        margin: 0
      });
    }
  }, [settings.barcodeFormat]);

  return (
    <div className={`barcode-label-preview is-${settings.labelSize}`}>
      {settings.showLibraryName && <b>Nama Perpustakaan</b>}
      {settings.showBookTitle && <span>Contoh Judul Buku</span>}
      <svg ref={barcodeRef} aria-label={`Pratinjau barcode ${settings.barcodeFormat}`} />
      {settings.showBarcodeValue && <small>Kode Barcode: 1234567890128</small>}
      {settings.showSerialNumber && <small>Serial: {settings.serialPrefix}01</small>}
      {settings.showRackCode && <small>Rak: RAK-01</small>}
    </div>
  );
}

export default function BarcodeLabelSettingsPanel() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchBarcodeLabelSettings(controller.signal)
      .then(({ settings: result }) => {
        if (controller.signal.aborted) return;
        setSettings({ ...defaultSettings, ...result });
        setLoaded(true);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setSettings((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await saveBarcodeLabelSettings({
        ...settings,
        columns: Number(settings.columns)
      });
      setSettings({ ...defaultSettings, ...result.settings });
      setLoaded(true);
      setNotice(result.message || 'Pengaturan barcode dan label berhasil disimpan.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="master-data-panel barcode-label-settings-panel" onSubmit={submit}>
      <div className="school-settings-panel-heading">
        <div><h2>Barcode &amp; Label</h2><p>Atur barcode, serial eksemplar, perilaku scan, dan tampilan cetak untuk sekolah ini.</p></div>
      </div>
      {error && <div className="master-message master-message-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="master-message master-message-success" role="status"><Check size={16} />{notice}</div>}

      <div className="barcode-label-settings-layout">
        <div className="barcode-label-settings-fields">
          <section className="school-library-settings-section">
            <h3><ScanLine size={17} />Format &amp; Pemindaian</h3>
            <div className="school-library-settings-grid">
              <label>Format barcode
                <select name="barcodeFormat" value={settings.barcodeFormat} onChange={update} disabled={loading || saving} required>
                  <option value="CODE128">CODE128</option>
                  <option value="CODE39">CODE39</option>
                  <option value="EAN13">EAN13</option>
                </select>
                <small>Nilai barcode setiap eksemplar tetap unik saat format tampilan diubah.</small>
              </label>
              <label>Prefix serial number otomatis
                <input name="serialPrefix" value={settings.serialPrefix} onChange={update} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,19}" disabled={loading || saving} />
                <small>Hanya berlaku untuk serial eksemplar yang dibuat berikutnya. Contoh: S menghasilkan S01, S02, dan seterusnya untuk seluruh judul di sekolah.</small>
              </label>
              <label>Setelah barcode dipindai
                <select name="scanBehavior" value={settings.scanBehavior} onChange={update} disabled={loading || saving} required>
                  <option value="focus">Fokus ulang input</option>
                  <option value="auto-submit">Kirim otomatis jika data lengkap</option>
                </select>
                <small>Kirim otomatis hanya berjalan setelah eksemplar dan anggota terpilih.</small>
              </label>
            </div>
          </section>

          <section className="school-library-settings-section">
            <h3><Tags size={17} />Desain Label Cetak</h3>
            <div className="school-library-settings-grid">
              <label>Ukuran label
                <select name="labelSize" value={settings.labelSize} onChange={update} disabled={loading || saving} required>
                  <option value="thermal">Thermal 50 × 30 mm</option>
                  <option value="A4">Kertas A4</option>
                  <option value="F4">Kertas F4</option>
                </select>
              </label>
              <label>Jumlah kolom
                <input name="columns" type="number" min="1" max="6" step="1" value={settings.columns} onChange={update} disabled={loading || saving || settings.labelSize === 'thermal'} required />
                <small>Digunakan untuk label pada kertas A4 atau F4.</small>
              </label>
            </div>
            <div className="barcode-label-element-options">
              <span>Elemen yang ditampilkan</span>
              <div>
                <label><input type="checkbox" name="showLibraryName" checked={settings.showLibraryName} onChange={update} disabled={loading || saving} />Nama Perpustakaan</label>
                <label><input type="checkbox" name="showBarcodeValue" checked={settings.showBarcodeValue} onChange={update} disabled={loading || saving} />Kode Barcode</label>
                <label><input type="checkbox" name="showSerialNumber" checked={settings.showSerialNumber} onChange={update} disabled={loading || saving} />Serial Number</label>
                <label><input type="checkbox" name="showBookTitle" checked={settings.showBookTitle} onChange={update} disabled={loading || saving} />Judul Singkat</label>
                <label><input type="checkbox" name="showRackCode" checked={settings.showRackCode} onChange={update} disabled={loading || saving} />Kode Rak</label>
              </div>
            </div>
          </section>
        </div>

        <section className="barcode-label-preview-panel" aria-live="polite">
          <div><h3>Pratinjau Langsung</h3><small>{settings.labelSize === 'thermal' ? 'Thermal 50 × 30 mm' : `${settings.labelSize} · ${settings.columns} kolom`}</small></div>
          <BarcodeLabelPreview settings={settings} />
        </section>
      </div>

      <div className="school-library-settings-savebar">
        <span>{loading ? 'Memuat konfigurasi...' : 'Pengaturan berlaku untuk semua eksemplar dan scan sekolah ini.'}</span>
        <button type="submit" className="master-button master-button-primary" disabled={loading || saving || !loaded}>
          <Save size={15} />{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>
    </form>
  );
}
