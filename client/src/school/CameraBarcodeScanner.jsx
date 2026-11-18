import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, X } from 'lucide-react';

export default function CameraBarcodeScanner({ onScan, label = 'Scan barcode dengan kamera' }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const activeRef = useRef(false);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    activeRef.current = true;
    setError('');

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera tidak tersedia. Gunakan koneksi aman (HTTPS) atau masukkan kode secara manual.');
        return;
      }
      if (!('BarcodeDetector' in window)) {
        setError('Pemindaian barcode kamera tidak didukung browser ini. Gunakan scanner barcode atau masukkan kode secara manual.');
        return;
      }
      try {
        const detector = new window.BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'] });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const scanFrame = async () => {
          if (!activeRef.current || disposed || !videoRef.current || videoRef.current.readyState < 2) {
            frameRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.find((code) => code.rawValue)?.rawValue;
            if (value) {
              activeRef.current = false;
              onScanRef.current(value);
              setOpen(false);
              return;
            }
          } catch (scanError) {
            setError(`Pemindaian gagal: ${scanError.message || 'kamera tidak dapat membaca barcode.'}`);
            activeRef.current = false;
            return;
          }
          frameRef.current = requestAnimationFrame(scanFrame);
        };
        frameRef.current = requestAnimationFrame(scanFrame);
      } catch (cameraError) {
        setError(cameraError.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Aktifkan izin kamera pada browser untuk melanjutkan.'
          : `Kamera tidak dapat dibuka: ${cameraError.message || 'periksa perangkat kamera Anda.'}`);
      }
    }

    startCamera();
    return () => {
      disposed = true;
      activeRef.current = false;
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  return (
    <>
      <button type="button" className="master-button master-button-light camera-scan-trigger" onClick={() => setOpen(true)}>
        <Camera size={15} />{label}
      </button>
      {open && <div className="master-modal-backdrop camera-scan-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <section className="master-modal camera-scan-modal" role="dialog" aria-modal="true" aria-labelledby="camera-scan-title">
          <header className="master-modal-heading">
            <div><span className="library-eyebrow">PEMINDAIAN BARCODE</span><h2 id="camera-scan-title">Arahkan kamera ke barcode</h2></div>
            <button type="button" className="master-icon-button" onClick={() => setOpen(false)} aria-label="Tutup kamera"><X size={18} /></button>
          </header>
          <div className="camera-scan-preview">
            <video ref={videoRef} autoPlay muted playsInline aria-label="Pratinjau kamera untuk scan barcode" />
            {!error && <span className="camera-scan-frame" aria-hidden="true" />}
            {!error && <span className="camera-scan-hint"><LoaderCircle size={15} className="book-stock-spinner" />Mencari barcode...</span>}
          </div>
          {error && <p className="master-form-error" role="alert">{error}</p>}
          <footer className="master-modal-actions"><button type="button" className="master-button master-button-muted" onClick={() => setOpen(false)}>Tutup kamera</button></footer>
        </section>
      </div>}
    </>
  );
}
