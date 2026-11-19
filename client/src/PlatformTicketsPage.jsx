import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, MessageSquare, RefreshCw, Send, Ticket, XCircle } from 'lucide-react';

async function requestTickets(path, options = {}) {
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
  if (!response.ok) throw new Error(body.message || 'Permintaan tiket gagal.');
  return body;
}

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const statusLabels = {
  open: 'Baru',
  responded: 'Dibalas',
  closed: 'Ditutup'
};

export default function PlatformTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadTickets(requestedPage = page) {
    const query = new URLSearchParams({ status: filter, limit: '20', page: String(requestedPage) });
    const result = await requestTickets(`/api/super-admin/tickets?${query}`);
    setTickets(result.tickets || []);
    setPagination(result.pagination || { page: requestedPage, totalPages: 1 });
  }

  async function openTicket(id) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestTickets(`/api/super-admin/tickets/${encodeURIComponent(id)}`);
      setSelected(result.ticket);
      setMessages(result.messages || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestTickets(`/api/super-admin/tickets?${new URLSearchParams({ status: filter, limit: '20', page: String(page) })}`)
      .then((result) => {
        if (!active) return;
        setTickets(result.tickets || []);
        setPagination(result.pagination || { page, totalPages: 1 });
      })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [filter, page]);

  async function submitReply(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await requestTickets(`/api/super-admin/tickets/${encodeURIComponent(selected.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: reply })
      });
      setReply('');
      await openTicket(selected.id);
      await loadTickets();
      setNotice('Balasan berhasil dikirim ke sekolah.');
    } catch (replyError) {
      setError(replyError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestTickets(`/api/super-admin/tickets/${encodeURIComponent(selected.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await openTicket(selected.id);
      await loadTickets();
      setNotice(result.message);
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="platform-tickets-page">
      <header className="management-heading">
        <div><h1>Pusat Tiket</h1><p>Tanggapi kendala yang dikirim sekolah dan pantau status penanganannya.</p></div>
        <button type="button" className="subtle-button" onClick={() => loadTickets().catch((loadError) => setError(loadError.message))} aria-label="Muat ulang tiket"><RefreshCw size={15} /></button>
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
      {selected ? (
        <section className="panel platform-ticket-detail">
          <div className="platform-ticket-detail-heading">
            <button type="button" className="subtle-button" onClick={() => { setSelected(null); setMessages([]); setError(''); }}><ArrowLeft size={15} />Semua tiket</button>
            <span className={`billing-status ${selected.status}`}>{statusLabels[selected.status] || selected.status}</span>
          </div>
          <div className="platform-ticket-title"><small>{selected.school_name} · TIKET #{selected.id}</small><h2>{selected.subject}</h2><span>Dibuat {dateLabel(selected.created_at)}</span></div>
          <div className="platform-ticket-thread">
            {messages.map((item) => (
              <article className={`platform-ticket-message ${item.sender_type}`} key={item.id}>
                <div><b>{item.sender_name}</b><time>{dateLabel(item.created_at)}</time></div>
                <p>{item.message}</p>
              </article>
            ))}
          </div>
          {selected.status !== 'closed' ? (
            <form className="platform-ticket-reply" onSubmit={submitReply}>
              <label htmlFor="platform-ticket-reply">Balasan</label>
              <textarea id="platform-ticket-reply" value={reply} onChange={(event) => setReply(event.target.value)} minLength={10} maxLength={5000} required placeholder="Tulis petunjuk atau solusi untuk sekolah..." />
              <div><button type="submit" className="primary-button" disabled={busy || reply.trim().length < 10}><Send size={15} />{busy ? 'Mengirim...' : 'Kirim Balasan'}</button><button type="button" className="subtle-button" disabled={busy} onClick={() => changeStatus('closed')}><CheckCircle2 size={15} />Tutup Tiket</button></div>
            </form>
          ) : <button type="button" className="subtle-button" disabled={busy} onClick={() => changeStatus('open')}><XCircle size={15} />Buka Kembali</button>}
        </section>
      ) : (
        <section className="panel platform-ticket-list">
          <div className="platform-ticket-list-heading">
            <div className="billing-tabs" role="tablist" aria-label="Filter tiket">
              {[['all', 'Semua'], ['open', 'Baru'], ['responded', 'Dibalas'], ['closed', 'Ditutup']].map(([value, label]) => (
                <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>
              ))}
            </div>
            <span>{tickets.length} tiket</span>
          </div>
          {busy ? <div className="loading-state"><div className="spinner" />Memuat tiket...</div> : tickets.length ? (
            <div className="platform-ticket-rows">
              {tickets.map((ticket) => (
                <button type="button" className="platform-ticket-row" key={ticket.id} onClick={() => openTicket(ticket.id)}>
                  <span className="platform-ticket-icon"><Ticket size={17} /></span>
                  <span className="platform-ticket-row-copy"><b>{ticket.subject}</b><small>{ticket.school_name} · {ticket.last_message || 'Belum ada pesan'} · {dateLabel(ticket.created_at)}</small></span>
                  <span className={`billing-status ${ticket.status}`}>{statusLabels[ticket.status] || ticket.status}</span>
                </button>
              ))}
            </div>
          ) : <div className="empty-state"><MessageSquare size={25} /><b>Tidak ada tiket</b><span>Belum ada tiket dengan filter status ini.</span></div>}
          {tickets.length > 0 && <div className="platform-ticket-pagination"><span>Halaman {pagination.page} dari {Math.max(pagination.totalPages, 1)}</span><div><button type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div></div>}
        </section>
      )}
    </section>
  );
}
