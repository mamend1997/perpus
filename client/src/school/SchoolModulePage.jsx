import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { schoolModuleDetails } from './schoolNavigation.js';

export default function SchoolModulePage({ active }) {
  const module = schoolModuleDetails[active] || {
    description: 'Kelola data dan aktivitas perpustakaan sekolah.',
    features: ['Pencarian data', 'Pencatatan aktivitas', 'Riwayat perubahan']
  };

  return (
    <div className="library-module-page">
      <header className="library-module-heading">
        <span className="library-eyebrow">MODUL PERPUSTAKAAN</span>
        <h1>{active}</h1>
        <p>{module.description}</p>
      </header>

      <section className="library-panel">
        <div className="library-panel-heading">
          <div><span className="library-eyebrow">CAKUPAN MODUL</span><h2>Fitur yang disiapkan</h2></div>
          <ArrowUpRight size={18} />
        </div>
        <div className="library-feature-list">
          {module.features.map((feature) => (
            <div key={feature}><CheckCircle2 size={16} /><span>{feature}</span></div>
          ))}
        </div>
      </section>

      <aside className="library-module-notice">
        <b>Kerangka implementasi awal</b>
        <p>Tampilan dan navigasi modul sudah disiapkan. Form transaksi, validasi, dan penyimpanan akan dihubungkan ke API sekolah pada tahap implementasi berikutnya.</p>
      </aside>
    </div>
  );
}
