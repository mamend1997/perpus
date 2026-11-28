import { useState } from 'react';
import { ArrowRight, Bot, MessageCircle, Send, X } from 'lucide-react';

const menuAliases = {
  'Daftar Pustaka': ['cari buku', 'mencari buku', 'katalog', 'koleksi buku', 'data buku'],
  'Tambah Stok Buku': ['stok buku', 'tambah buku', 'menambah buku', 'buku baru'],
  'Pindah Rak': ['lokasi buku', 'pindahkan buku', 'pindah buku'],
  'Pemusnahan Buku': ['hapus buku rusak', 'musnahkan buku', 'buku rusak'],
  Eksemplar: ['salinan buku', 'barcode buku', 'item buku'],
  'Analitik Sirkulasi': ['analisis peminjaman', 'statistik sirkulasi', 'grafik peminjaman'],
  Peminjaman: ['pinjam buku', 'peminjaman', 'pengembalian buku', 'sirkulasi'],
  Denda: ['denda keterlambatan', 'bayar denda', 'terlambat'],
  'Data Siswa & Rombel': ['data siswa', 'data kelas', 'rombel', 'murid'],
  Member: ['anggota', 'akun anggota', 'member perpustakaan'],
  'Buku Tamu Digital': ['buku tamu', 'kunjungan', 'pengunjung'],
  'Booking Buku': ['reservasi', 'pesan buku', 'booking'],
  'Ulasan & Rating': ['ulasan buku', 'rating buku', 'review'],
  'Pengadaan Buku': ['usulan buku', 'pengadaan', 'pengadaan koleksi'],
  'Tahun Pelajaran': ['tahun ajaran', 'periode sekolah'],
  Laporan: ['laporan perpustakaan', 'unduh laporan', 'rekap']
};

function normalize(value) {
  return value.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findMenu(query, navigation) {
  const normalizedQuery = normalize(query);
  const menuItems = navigation.flatMap((section) => section.items.flatMap((item) => item.children || [item]));
  return menuItems
    .map((item) => {
      const label = normalize(item.label);
      const aliases = (menuAliases[item.label] || []).map(normalize);
      const score = label === normalizedQuery ? 100
        : normalizedQuery.includes(label) ? 80
          : aliases.reduce((best, alias) => Math.max(best, normalizedQuery.includes(alias) ? 70 : alias.includes(normalizedQuery) && normalizedQuery.length > 3 ? 55 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.item;
}

export default function SchoolAIAssistant({ settings, navigation, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);

  function ask(value) {
    const text = value.trim();
    if (!text) return;
    const destination = findMenu(text, navigation);
    setMessages((current) => [...current,
      { type: 'user', text },
      { type: 'assistant', text: destination
        ? `Saya membuka menu ${destination.label} dan menyorotnya di navigasi.`
        : 'Saya belum menemukan menu yang cocok. Coba sebutkan nama menu, misalnya katalog buku, peminjaman, anggota, atau laporan.' }
    ]);
    if (destination) onNavigate(destination.label);
    setQuery('');
  }

  return (
    <div className="school-ai-assistant">
      {open && <section className="school-ai-panel" aria-label={settings.title}>
        <header className="school-ai-header"><span className="school-ai-avatar"><Bot size={18} /></span><div><b>{settings.title}</b><small>Panduan menu perpustakaan</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Tutup asisten"><X size={17} /></button></header>
        <div className="school-ai-messages" aria-live="polite">
          <p className="school-ai-message">{settings.welcomeMessage}</p>
          {messages.map((message, index) => <p key={`${index}-${message.type}`} className={`school-ai-message ${message.type}`}>{message.text}</p>)}
          {!messages.length && settings.suggestions.length > 0 && <div className="school-ai-suggestions">{settings.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}<ArrowRight size={13} /></button>)}</div>}
        </div>
        <form className="school-ai-form" onSubmit={(event) => { event.preventDefault(); ask(query); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tulis kebutuhan Anda..." aria-label="Tulis pertanyaan bantuan" />
          <button type="submit" disabled={!query.trim()} aria-label="Kirim pertanyaan"><Send size={16} /></button>
        </form>
      </section>}
      <button type="button" className={`school-ai-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? 'Tutup bantuan AI' : 'Buka bantuan AI'}>
        {open ? <X size={20} /> : <><MessageCircle size={19} /><span>Bantuan AI</span></>}
      </button>
    </div>
  );
}