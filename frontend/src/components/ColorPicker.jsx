import { useState, useEffect } from 'react';

// Paleta de colores comunes para motos
const PRESET = [
  'var(--text)','var(--text-strong)','var(--text-body)','var(--text-subtle)','var(--text-disabled)','#FFFFFF',
  '#EF4444','#991B1B','#C2410C','#F97316','#D97706','#EAB308',
  '#84CC16','#15803D','#14532D','#0EA5E9','#2563EB','#1E3A8A',
  '#7C3AED','#DB2777','#9F1239','#92400E','#78350F','#D4B896',
];

export function ColorPicker({ value = 'var(--text)', onChange }) {
  const norm = (v) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : 'var(--text)';
  const [hex, setHex] = useState(norm(value));

  useEffect(() => { setHex(norm(value)); }, [value]);

  const emit = (h) => { const v = norm(h); setHex(v); onChange?.(v); };

  const handleText = (v) => {
    setHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange?.(v);
  };

  const pickScreen = async () => {
    if (!('EyeDropper' in window)) return;
    try { const { sRGBHex } = await new window.EyeDropper().open(); emit(sRGBHex); } catch {}
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {/* Fila de controles */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:28, height:28, borderRadius:'var(--radius-sm)', background:hex, border:'1.5px solid var(--border)', flexShrink:0 }} />
        <input type="color" value={hex} onChange={e=>emit(e.target.value)}
          style={{ width:28, height:28, padding:2, border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', cursor:'pointer', background:'var(--surface)' }} />
        <input value={hex} onChange={e=>handleText(e.target.value)}
          placeholder="#000000" maxLength={7}
          style={{ width:82, padding:'3px 7px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:12, fontFamily:'inherit', color:'var(--text)' }} />
        {'EyeDropper' in window && (
          <button type="button" onClick={pickScreen}
            title="Cuentagotas — toma un color de cualquier parte de la pantalla"
            style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', background:'var(--surface-muted)', cursor:'pointer', lineHeight:1, padding:'5px 7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L3 14.67V20h5.33l10.06-10.06a5.5 5.5 0 0 0 0-7.78z"/>
              <line x1="3" y1="20" x2="7.33" y2="20"/>
            </svg>
          </button>
        )}
      </div>
      {/* Paleta */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
        {PRESET.map(c => (
          <button key={c} type="button" onClick={() => emit(c)} title={c}
            style={{ width:20, height:20, borderRadius:'var(--radius-xs)', background:c,
              border: hex===c ? '2.5px solid var(--brand)' : '1.5px solid rgba(0,0,0,0.13)',
              cursor:'pointer', padding:0, flexShrink:0 }} />
        ))}
      </div>
    </div>
  );
}
