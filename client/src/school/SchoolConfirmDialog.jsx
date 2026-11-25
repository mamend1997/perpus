import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react';

export default function SchoolConfirmDialog({
  title = 'Konfirmasi Hapus',
  message,
  itemName,
  confirmLabel = 'Ya, Hapus',
  confirmIcon = <Trash2 size={15} />,
  warningMessage = 'Data yang sudah dihapus tidak dapat dipulihkan.',
  loading = false,
  error = '',
  onClose,
  onConfirm
}) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [loading, onClose]);

  return createPortal(
    <div className="school-confirm-backdrop">
      <section className="school-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="school-confirm-title">
        <button type="button" className="school-confirm-close" onClick={onClose} disabled={loading} aria-label="Tutup dialog"><X size={17} /></button>
        <span className="school-confirm-icon"><AlertTriangle size={23} /></span>
        <h2 id="school-confirm-title">{title}</h2>
        <p>{message}</p>
        {itemName && <div className="school-confirm-item">{itemName}</div>}
        <p className="school-confirm-warning">{warningMessage}</p>
        {error && <div className="school-confirm-error" role="alert">{error}</div>}
        <footer className="school-confirm-actions">
          <button type="button" className="master-button master-button-muted" onClick={onClose} disabled={loading}>Batal</button>
          <button type="button" className="master-button school-confirm-delete" onClick={onConfirm} disabled={loading}>
            {loading ? <LoaderCircle size={15} className="book-stock-spinner" /> : confirmIcon}
            {loading ? 'Menghapus...' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
