import { useEffect, useState } from 'react';
import { ArrowLeft, LifeBuoy, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
import {
  createSchoolSupportTicket, fetchSchoolSupportTicket, fetchSchoolSupportTickets,
  replyToSchoolSupportTicket
} from './schoolSupportApi.js';

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const statusLabels = {
  open: 'Menunggu balasan',
  responded: 'Ada balasan',
  closed: 'Ditutup'
};

export default function SchoolSupportPage({ rights }) {
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadTickets(page = pagination.page) {
    const result = await fetchSchoolSupportTickets({ page });
    setTickets(result.tickets || []);
    setPagination(result.pagination || { page, totalPages: 1 });
    return result.tickets || [];
  }

  async function openTicket(ticketId) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fetchSchoolSupportTicket(ticketId);
      setSelected(result.ticket);
      setMessages(result.messages || []);
      setIsCreating(false);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchSchoolSupportTickets({ page: 1 })
      .then((result) => {
        if (!active) return;
        setTickets(result.tickets || []);
        setPagination(result.pagination || { page: 1, totalPages: 1 });
      })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  async function submitTicket(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await createSchoolSupportTicket({ subject, message });
      setSubject('');
      setMessage('');
      setNotice(result.message || 'Tiket berhasil dikirim.');
      await loadTickets(1);
      await openTicket(result.ticket.id);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await replyToSchoolSupportTicket(selected.id, reply);
      setReply('');
      await openTicket(selected.id);
      await loadTickets();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="school-support-page">
      <header className="management-heading">
        <div><h1>Bantuan & Tiket Kendala</h1><p>Kirim kendala ke Super Admin dan pantau balasannya di sini.</p></div>
        {!selected && !isCreating && rights?.edit !== false && <button type="button" className="primary-button" onClick={() => { setIsCreating(true); setError(''); setNotice(''); }}><Plus size={16} />Buat Tiket</button>}
      </header>
      {error && <div className="library-error" role="alert">{error}</div>}
      {notice && <div className="school-support-notice" role="status">{notice}</div>}
      {selected ? (
        <section className="panel school-support-detail">
          <div className="school-support-detail-heading">
            <button type="button" className="school-support-back" onClick={() => { setSelected(null); setMessages([]); setError(''); }}><ArrowLeft size={16} />Semua tiket</button>
            <span className={`school-support-status ${selected.status}`}>{statusLabels[selected.status] || selected.status}</span>
          </div>
          <div className="school-support-ticket-title"><small>TIKET #{selected.id}</small><h2>{selected.subject}</h2><span>Dibuat {dateLabel(selected.created_at)}</span></div>
          <div className="school-support-thread">
            {messages.map((item) => (
              <article className={`school-support-message ${item.sender_type}`} key={item.id}>
                <div><b>{item.sender_type === 'admin' ? 'Tim PerpusKita' : 'Sekolah'}</b><time>{dateLabel(item.created_at)}</time></div>
                <p>{item.message}</p>
              </article>
            ))}
            {messages.length === 0 && <p className="school-support-muted">Belum ada pesan pada tiket ini.</p>}
          </div>
          {selected.status !== 'closed' && rights?.edit !== false && (
            <form className="school-support-reply" onSubmit={submitReply}>
              <label htmlFor="school-support-reply">Balas tiket</label>
              <textarea id="school-support-reply" value={reply} onChange={(event) => setReply(event.target.value)} minLength={10} maxLength={5000} required placeholder="Jelaskan tindak lanjut atau tambahkan informasi..." />
              <button type="submit" className="primary-button" disabled={busy || reply.trim().length < 10}><Send size={15} />{busy ? 'Mengirim...' : 'Kirim Balasan'}</button>
            </form>
          )}
        </section>
      ) : isCreating ? (
        <form className="panel school-support-create" onSubmit={submitTicket}>
          <div className="school-support-detail-heading">
            <button type="button" className="school-support-back" onClick={() => { setIsCreating(false); setError(''); }}><ArrowLeft size={16} />Kembali</button>
            <LifeBuoy size={20} />
          </div>
          <label htmlFor="school-ticket-subject">Subjek kendala</label>
          <input id="school-ticket-subject" value={subject} onChange={(event) => setSubject(event.target.value)} minLength={4} maxLength={180} required placeholder="Contoh: Tidak dapat menyimpan data buku" />
          <label htmlFor="school-ticket-message">Jelaskan kendala</label>
          <textarea id="school-ticket-message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={5000} required placeholder="Sertakan langkah yang dilakukan dan pesan kesalahan yang muncul." />
          <button type="submit" className="primary-button" disabled={busy || subject.trim().length < 4 || message.trim().length < 10}><Send size={15} />{busy ? 'Mengirim...' : 'Kirim Tiket'}</button>
        </form>
      ) : (
        <section className="panel school-support-list">
          <div className="school-support-list-heading"><div><MessageCircle size={18} /><h2>Riwayat Tiket</h2></div><button type="button" className="subtle-button" onClick={() => loadTickets().catch((loadError) => setError(loadError.message))} aria-label="Muat ulang tiket"><RefreshCw size={15} /></button></div>
          {busy ? <div className="library-empty-state">Memuat tiket...</div> : tickets.length ? (
            <>
              <div className="school-support-ticket-list">
                {tickets.map((ticket) => (
                  <button type="button" className="school-support-ticket-row" key={ticket.id} onClick={() => openTicket(ticket.id)}>
                    <span><b>{ticket.subject}</b><small>{ticket.last_message || 'Belum ada pesan'} · {dateLabel(ticket.created_at)}</small></span>
                    <span className={`school-support-status ${ticket.status}`}>{statusLabels[ticket.status] || ticket.status}</span>
                  </button>
                ))}
              </div>
              <div className="school-support-pagination"><span>Halaman {pagination.page} dari {Math.max(pagination.totalPages, 1)}</span><div><button type="button" disabled={pagination.page <= 1} onClick={() => loadTickets(pagination.page - 1).catch((loadError) => setError(loadError.message))}>Sebelumnya</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => loadTickets(pagination.page + 1).catch((loadError) => setError(loadError.message))}>Berikutnya</button></div></div>
            </>
          ) : <div className="school-support-empty"><LifeBuoy size={24} /><b>Belum ada tiket bantuan</b><span>Buat tiket untuk menghubungi Super Admin.</span></div>}
        </section>
      )}
    </section>
  );
}
