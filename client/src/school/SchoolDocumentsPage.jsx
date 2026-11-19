import { useEffect, useState } from 'react';
import { BookOpen, FileText } from 'lucide-react';

async function fetchPlatformDocuments(signal) {
  const token = localStorage.getItem('school-token');
  if (!token) throw new Error('Sesi sekolah tidak ditemukan. Silakan masuk kembali.');
  const response = await fetch('/api/school/platform-documents', {
    signal,
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Dokumen platform gagal dimuat.');
  return body;
}

export default function SchoolDocumentsPage({ type = 'guide' }) {
  const [documents, setDocuments] = useState(null);
  const [legalType, setLegalType] = useState('terms');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlatformDocuments(controller.signal)
      .then(setDocuments)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const documentType = type === 'legal' ? legalType : type;
  const document = documentType === 'guide'
    ? documents?.userGuide
    : documents?.legalDocuments?.[documentType === 'sla' ? 'sla' : 'terms'];
  const Icon = documentType === 'guide' ? BookOpen : FileText;
  const pageTitle = type === 'guide' ? 'Petunjuk Pengguna' : 'Syarat & SLA';
  const updatedDate = document?.updatedAt
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(document.updatedAt))
    : null;

  return (
    <section className="school-documents-page">
      <header className="management-heading"><div><h1>{pageTitle}</h1><p>Dokumen informasi layanan yang ditetapkan Super Admin.</p></div></header>
      {error && <div className="library-error" role="alert">{error}</div>}
      {loading ? <div className="library-empty-state">Memuat dokumen...</div> : document && (
        <>
        {type === 'legal' && <div className="visitor-tabs" role="tablist" aria-label="Dokumen legal">
          <button type="button" role="tab" aria-selected={legalType === 'terms'} className={legalType === 'terms' ? 'selected' : ''} onClick={() => setLegalType('terms')}>Syarat & Ketentuan</button>
          <button type="button" role="tab" aria-selected={legalType === 'sla'} className={legalType === 'sla' ? 'selected' : ''} onClick={() => setLegalType('sla')}>Service Level Agreement</button>
        </div>}
        <article className="panel school-document-panel">
          <div className="school-document-heading"><span><Icon size={20} /></span><div><h2>{document.title}</h2><small>{updatedDate ? `Diperbarui ${updatedDate}` : 'Belum ada tanggal pembaruan'}</small></div></div>
          {document.content?.trim() ? (
            <div className="school-document-content">
              {document.content.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => <p key={`${index}-${line.slice(0, 20)}`}>{line}</p>)}
            </div>
          ) : <div className="school-document-empty">Dokumen belum diisi oleh Super Admin.</div>}
        </article>
        </>
      )}
    </section>
  );
}
