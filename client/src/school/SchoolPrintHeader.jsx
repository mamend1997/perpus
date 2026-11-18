export default function SchoolPrintHeader({ identity, title, subtitle }) {
  const school = identity || {};
  const letterhead = school.letterhead;
  const logo = letterhead?.logo || school.logo;
  const manualLines = letterhead?.mode === 'manual' && Array.isArray(letterhead.lines);

  return (
    <header className="school-print-header">
      {logo && <img src={logo} alt="" />}
      <div className={`school-print-header-content ${manualLines ? 'is-manual' : ''}`}>
        {manualLines ? letterhead.lines.map((line, index) => <span key={index} style={{
          fontSize: `${line.fontSize}px`,
          fontWeight: line.bold ? 700 : 400,
          fontStyle: line.italic ? 'italic' : 'normal',
          textAlign: line.align === 'left' ? 'left' : 'center'
        }}>{line.text || '\u00a0'}</span>) : <>
          <strong>{school.name || 'Sekolah'}</strong>
          {school.npsn && <span>NPSN {school.npsn}</span>}
          {school.address && <span>{school.address}</span>}
          {[school.phone, school.email, school.website].filter(Boolean).length > 0
            && <span>{[school.phone, school.email, school.website].filter(Boolean).join(' · ')}</span>}
        </>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
