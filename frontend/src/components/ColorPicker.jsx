import { useState, useEffect } from 'react';

// Paleta de colores comunes para motos
const PRESET = [
  '#111111','#1F2937','#374151','#6B7280','#9CA3AF','#FFFFFF',
  '#EF4444','#991B1B','#C2410C','#F97316','#D97706','#EAB308',
  '#84CC16','#15803D','#14532D','#0EA5E9','#2563EB','#1E3A8A',
  '#7C3AED','#DB2777','#9F1239','#92400E','#78350F','#D4B896',
];

export function ColorPicker({ value = '#111111', onChange }) {
  const norm = (v) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#111111';
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
        <div style={{ width:28, height:28, borderRadius:6, background:hex, border:'1.5px solid #E2E8F0', flexShrink:0 }} />
        <input type="color" value={hex} onChange={e=>emit(e.target.value)}
          style={{ width:28, height:28, padding:2, border:'1px solid #E5E7EB', borderRadius:6, cursor:'pointer', background:'#fff' }} />
        <input value={hex} onChange={e=>handleText(e.target.value)}
          placeholder="#000000" maxLength={7}
          style={{ width:82, padding:'3px 7px', border:'1px solid #E5E7EB', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#0F172A' }} />
        {'EyeDropper' in window && (
          <button type="button" onClick={pickScreen}
            title="Cuentagotas — tomá un color de cualquier parte de la pantalla"
            style={{ border:'1px solid #E5E7EB', borderRadius:6, background:'#F9FAFB', cursor:'pointer', fontSize:13, lineHeight:1, padding:'5px 7px' }}>
            🎯
          </button>
        )}
      </div>
      {/* Paleta */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
        {PRESET.map(c => (
          <button key={c} type="button" onClick={() => emit(c)} title={c}
            style={{ width:20, height:20, borderRadius:4, background:c,
              border: hex===c ? '2.5px solid #F28100' : '1.5px solid rgba(0,0,0,0.13)',
              cursor:'pointer', padding:0, flexShrink:0 }} />
        ))}
      </div>
    </div>
  );
}
