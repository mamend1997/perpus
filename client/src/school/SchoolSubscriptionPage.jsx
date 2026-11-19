import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, ExternalLink, History, RefreshCw, ShieldCheck } from 'lucide-react';
import { createSchoolRenewal, fetchSchoolSubscription } from './schoolAccountApi.js';

const periodLabels = {
  monthly: 'Bulanan',
  semester: 'Semester',
  yearly: 'Tahunan',
  once: 'Sekali bayar'
};
const packageLabels = { trial: 'Uji Coba', basic: 'Basic', premium: 'Premium', lifetime: 'Lifetime' };
const statusLabels = {
  unpaid: ['Menunggu pembayaran', 'pending'],
  pending_verification: ['Menunggu verifikasi', 'pending'],
  paid: ['Lunas', 'paid'],
  failed: ['Gagal', 'failed'],
  expired: ['Kedaluwarsa', 'expired'],
  rejected: ['Ditolak', 'failed']
};
const rupiah = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
}).format(Number(value) || 0);
const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
  : '—';

export default function SchoolSubscriptionPage({ mode, onNavigate }) {
  const [data, setData] = useState(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadSubscription() {
    setError('');
    const result = await fetchSchoolSubscription();
    setData(result);
    setSelectedPackageId((current) => current || result.subscription.package?.id || result.packages[0]?.id || '');
  }

  useEffect(() => {
    let active = true;
    fetchSchoolSubscription()
      .then((result) => {
        if (active) {
          setData(result);
          setSelectedPackageId(result.subscription.package?.id || result.packages[0]?.id || '');
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedPackage = useMemo(
    () => data?.packages.find((item) => item.id === selectedPackageId),
    [data, selectedPackageId]
  );
  const availablePeriods = selectedPackage
    ? Object.keys(selectedPackage.prices || {}).filter((period) => Number(selectedPackage.prices[period]) > 0)
    : [];
  const period = availablePeriods.includes(selectedPeriod) ? selectedPeriod : availablePeriods[0] || '';

  function choosePackage(packageId) {
    setSelectedPackageId(packageId);
    setSelectedPeriod('');
  }

  async function submitRenewal(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await createSchoolRenewal({ packageId: selectedPackageId, period });
      setNotice(result.message);
      await loadSubscription();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="library-empty-state">Memuat informasi layanan...</div>;

  const currentPackage = data?.subscription.package;
  const isLifetime = data?.subscription.packageType === 'lifetime';
  return (
    <section className="school-subscription-page">
      <header className="management-heading">
        <div>
          <h1>{mode === 'services' ? 'Layanan Sekolah' : 'Perpanjangan Layanan'}</h1>
          <p>{mode === 'services'
            ? 'Lihat paket langganan dan masa aktif layanan perpustakaan sekolah.'
            : 'Pilih paket dan periode, lalu selesaikan pembayaran QRIS melalui Kasera Pay.'}</p>
        </div>
        <button type="button" className="subtle-button" onClick={() => {
          setLoading(true);
          loadSubscription().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false));
        }}><RefreshCw size={15} />Perbarui</button>
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      {!data ? null : (
        <>
          <article className="panel school-subscription-current">
            <div className="school-subscription-current-icon"><ShieldCheck size={21} /></div>
            <div className="school-subscription-current-copy">
              <span>PAKET SAAT INI</span>
              <h2>{currentPackage?.name || packageLabels[data.subscription.packageType] || data.subscription.packageType}</h2>
              <p>{currentPackage?.description || 'Layanan perpustakaan digital sekolah.'}</p>
            </div>
            <div className="school-subscription-expiry">
              <span><Clock3 size={14} />{isLifetime ? 'Masa aktif' : 'Berlaku sampai'}</span>
              <b>{isLifetime ? 'Selamanya' : data.subscription.expiresAt ? dateLabel(data.subscription.expiresAt) : 'Belum ada tanggal kedaluwarsa'}</b>
            </div>
          </article>

          {mode === 'services' ? (
            <section className="school-subscription-services">
              <article className="panel school-subscription-info">
                <h3>Informasi layanan</h3>
                <p>Paket aktif: <b>{currentPackage?.name || packageLabels[data.subscription.packageType] || data.subscription.packageType}</b></p>
                <p>Status akun: <b>{data.subscription.schoolStatus === 'active' ? 'Aktif' : data.subscription.schoolStatus}</b></p>
                <button type="button" className="primary-button" disabled={isLifetime} onClick={() => onNavigate?.('Perpanjangan')}>
                  {isLifetime ? 'Paket Lifetime aktif' : 'Lihat paket & perpanjang'}<ArrowRight size={15} />
                </button>
              </article>
              <article className="panel school-subscription-info">
                <h3>Paket yang tersedia</h3>
                {data.packages.length ? data.packages.map((item) => (
                  <div className="school-subscription-plan-row" key={item.id}>
                    <b>{item.name}</b><span>{item.description || 'Paket layanan perpustakaan sekolah'}</span>
                  </div>
                )) : <p>Belum ada paket langganan yang tersedia.</p>}
              </article>
            </section>
          ) : (
            <>
              {isLifetime ? (
                <div className="success-box">Paket Lifetime tidak memerlukan perpanjangan.</div>
              ) : (
                <form className="panel school-renewal-form" onSubmit={submitRenewal}>
                  <div className="school-renewal-form-heading">
                    <div><h3>Pilih paket langganan</h3><p>Harga mengikuti daftar Paket Langganan dari Super Admin.</p></div>
                    <span className={`school-kasera-status ${data.kaseraEnabled ? 'ready' : 'unavailable'}`}>
                      <CreditCard size={14} />{data.kaseraEnabled ? 'Kasera Pay tersedia' : 'Pembayaran Kasera belum aktif'}
                    </span>
                  </div>
                  {data.packages.length ? (
                    <>
                      <div className="school-renewal-package-grid">
                        {data.packages.map((item) => (
                          <label key={item.id} className={`school-renewal-package ${selectedPackageId === item.id ? 'selected' : ''}`}>
                            <input type="radio" name="renewal-package" value={item.id} checked={selectedPackageId === item.id} onChange={() => choosePackage(item.id)} />
                            <span><b>{item.name}</b><small>{item.description || packageLabels[item.id] || 'Paket langganan'}</small></span>
                          </label>
                        ))}
                      </div>
                      {selectedPackage && (
                        <div className="school-renewal-price-grid">
                          {availablePeriods.map((availablePeriod) => (
                            <label key={availablePeriod} className={`school-renewal-price-option ${period === availablePeriod ? 'selected' : ''}`}>
                              <input type="radio" name="renewal-period" value={availablePeriod} checked={period === availablePeriod} onChange={() => setSelectedPeriod(availablePeriod)} />
                              <span>{periodLabels[availablePeriod] || availablePeriod}</span>
                              <b>{rupiah(selectedPackage.prices[availablePeriod])}</b>
                            </label>
                          ))}
                        </div>
                      )}
                      {!availablePeriods.length && <p className="school-subscription-empty">Belum ada harga aktif untuk paket ini.</p>}
                      <div className="school-renewal-submit-row">
                        <span>Layanan diperpanjang setelah pembayaran terkonfirmasi oleh Kasera.</span>
                        <button type="submit" className="primary-button" disabled={busy || !data.kaseraEnabled || !selectedPackage || !period}>
                          <CreditCard size={15} />{busy ? 'Membuat tagihan...' : 'Buat pembayaran QRIS'}
                        </button>
                      </div>
                    </>
                  ) : <p className="school-subscription-empty">Belum ada paket langganan yang tersedia.</p>}
                </form>
              )}
              {data.invoices.length > 0 && (
                <section className="panel school-renewal-history">
                  <div className="school-renewal-history-heading"><h3><History size={17} />Riwayat perpanjangan</h3><span>{data.invoices.length} tagihan</span></div>
                  <div className="school-renewal-history-list">
                    {data.invoices.map((invoice) => {
                      const [label, statusClass] = statusLabels[invoice.status] || [invoice.status, ''];
                      const canPay = invoice.status === 'unpaid' && invoice.checkout_url
                        && (!invoice.expires_at || new Date(invoice.expires_at).getTime() > Date.now());
                      return (
                        <div className="school-renewal-history-row" key={invoice.id}>
                          <div><b>{packageLabels[invoice.package_type] || invoice.package_type || 'Tagihan layanan'} · {periodLabels[invoice.billing_period] || invoice.billing_period || '—'}</b><span>{dateLabel(invoice.created_at)} · {rupiah(invoice.amount)}</span></div>
                          <span className={`school-invoice-status ${statusClass}`}>{label}</span>
                          {canPay && <a className="school-renewal-checkout-link" href={invoice.checkout_url} target="_blank" rel="noreferrer">Bayar <ExternalLink size={13} /></a>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
