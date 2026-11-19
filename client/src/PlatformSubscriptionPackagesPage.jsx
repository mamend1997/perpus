import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';

const defaultPackages = [
  { id: 'basic', name: 'Basic', description: '', enabled: true, prices: { monthly: 0, semester: 0, yearly: 0 } },
  { id: 'premium', name: 'Premium', description: '', enabled: true, prices: { monthly: 0, semester: 0, yearly: 0 } },
  { id: 'lifetime', name: 'Lifetime', description: '', enabled: true, prices: { once: 0 } }
];
const periods = {
  basic: [['monthly', 'Bulanan'], ['semester', 'Semester'], ['yearly', 'Tahunan']],
  premium: [['monthly', 'Bulanan'], ['semester', 'Semester'], ['yearly', 'Tahunan']],
  lifetime: [['once', 'Sekali bayar']]
};

async function requestPackages(path, options = {}) {
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
  if (!response.ok) throw new Error(body.message || 'Paket langganan gagal dimuat.');
  return body;
}

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export default function PlatformSubscriptionPackagesPage() {
  const [packages, setPackages] = useState(defaultPackages);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    requestPackages('/api/super-admin/subscription-packages')
      .then(({ packages: saved }) => {
        if (active && Array.isArray(saved)) {
          setPackages(defaultPackages.map((defaults) => {
            const current = saved.find((item) => item.id === defaults.id);
            return current ? {
              ...defaults,
              ...current,
              prices: { ...defaults.prices, ...current.prices }
            } : defaults;
          }));
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updatePackage(id, updates) {
    setPackages((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item));
  }

  function updatePrice(item, period, value) {
    updatePackage(item.id, { prices: { ...item.prices, [period]: value } });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = packages.map((item) => ({
        ...item,
        prices: Object.fromEntries(Object.entries(item.prices).map(([period, value]) => [period, Number(value)]))
      }));
      const result = await requestPackages('/api/super-admin/subscription-packages', {
        method: 'PUT',
        body: JSON.stringify({ packages: payload })
      });
      setPackages(result.packages);
      setNotice(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="platform-packages-page">
      <header className="management-heading">
        <div><h1>Paket Langganan</h1><p>Atur nama, keterangan, ketersediaan, dan harga paket sekolah.</p></div>
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      {loading ? <div className="loading-state"><div className="spinner" />Memuat paket langganan...</div> : (
        <form className="platform-package-list" onSubmit={save}>
          {packages.map((item) => (
            <article className="panel platform-package-card" key={item.id}>
              <div className="platform-package-card-heading">
                <div><span className={`platform-package-badge ${item.id}`}>{item.id === 'lifetime' ? 'Sekali bayar' : 'Berlangganan'}</span><h2>{item.name}</h2></div>
                <label className="platform-payment-toggle">
                  <input type="checkbox" checked={item.enabled} onChange={(event) => updatePackage(item.id, { enabled: event.target.checked })} />
                  <span>{item.enabled ? 'Tersedia' : 'Disembunyikan'}</span>
                </label>
              </div>
              <div className="platform-package-fields">
                <label>Nama paket<input required minLength={2} maxLength={40} value={item.name} onChange={(event) => updatePackage(item.id, { name: event.target.value })} /></label>
                <label>Keterangan<textarea rows={2} maxLength={500} value={item.description} onChange={(event) => updatePackage(item.id, { description: event.target.value })} placeholder="Jelaskan fasilitas yang termasuk dalam paket." /></label>
              </div>
              <div className="platform-package-prices">
                {periods[item.id].map(([period, label]) => (
                  <label key={period}><span>{label}</span><div className="platform-price-input"><b>Rp</b><input type="number" min="0" max="1000000000" step="1000" inputMode="numeric" value={item.prices[period]} onChange={(event) => updatePrice(item, period, event.target.value)} aria-label={`Harga ${item.name} ${label}`} /></div></label>
                ))}
              </div>
              <p className="platform-package-price-summary">{periods[item.id].map(([period, label]) => `${label}: ${rupiah(item.prices[period])}`).join(' · ')}</p>
            </article>
          ))}
          <div className="platform-payment-save-row"><span>Harga diatur dalam Rupiah. Isi 0 untuk menandai periode belum ditawarkan.</span><button type="submit" className="primary-button" disabled={busy}><Save size={15} />{busy ? 'Menyimpan…' : 'Simpan Paket'}</button></div>
        </form>
      )}
    </section>
  );
}
