import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Bdg, ROLES, hasRole, ROLE_ADMIN_WRITE, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile, Btn } from '../ui.jsx';

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const EMPTY = () => ({
  invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', neto:'', iva:'', paid_amount:'',
  receipt_number:'', payer_name:'', banco:'', payment_method:'',
  brand:'', model:'', model_id:'', color:'', commercial_year:'',
  motor_num:'', chassis:'', internal_code:'',
  invoice_url:'', receipt_url:'', notes:'',
});

function $(n) {
  if (!n && n !== 0) return '-';
  return '$\u2009' + parseInt(n).toLocaleString('es-CL');
}
function $short(n) {
  if (!n && n !== 0) return '$0';
  const num = parseInt(n);
  if (num >= 1_000_000) return '$' + (num/1_000_000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
  if (num >= 1_000)     return '$' + Math.round(num/1_000).toLocaleString('es-CL') + 'K';
  return '$' + num.toLocaleString('es-CL');
}
function fd(s) {
  if (!s) return '-';
  const [y,m,d] = String(s).slice(0,10).split('-');
  return (!y||!m||!d) ? '-' : `${d}-${m}-${y}`;
}
function due(p) {
  if (p.due_date) return p.due_date;
  if (!p.invoice_date) return null;
  const d = new Date(String(p.invoice_date).slice(0,10)+'T12:00:00');
  d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,10);
}

/* ── Status helpers ─────────────────────────────────────────────────────── */
function pagoStatus(p) {
  const dv = due(p);
  const overdue = dv && !p.paid_amount && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  if (p.paid_amount) return { l:'Pagado',    c:'#15803D', bg:'rgba(21,128,61,0.10)'   };
  if (overdue)       return { l:'Vencido',   c:'#DC2626', bg:'rgba(220,38,38,0.10)'   };
  return               { l:'Pendiente',  c:'#D97706', bg:'rgba(217,119,6,0.10)'    };
}
const statusBorderColor = (p) => {
  const s = pagoStatus(p);
  return s.c;
};

/* ── Catalog image helper ───────────────────────────────────────────────── */
function motoImg(p) {
  if (p.catalog_color_photos && p.color) {
    const cp = (typeof p.catalog_color_photos === 'string' ? JSON.parse(p.catalog_color_photos) : p.catalog_color_photos) || [];
    const match = cp.find(c => c.color && p.color && c.color.toLowerCase() === p.color.toLowerCase());
    if (match?.url) return match.url;
  }
  return p.catalog_image || null;
}

/* ── Color chip helper ──────────────────────────────────────────────────── */
const COLOR_HEX = {negro:'#111827',blanco:'#F9FAFB',rojo:'#EF4444',azul:'#3B82F6',gris:'#6B7280',plata:'#9CA3AF',plateado:'#9CA3AF',verde:'#10B981',amarillo:'#F59E0B',naranja:'#F97316',celeste:'#38BDF8',violeta:'#8B5CF6',morado:'#8B5CF6',rosa:'#EC4899',marron:'#92400E',cafe:'#92400E'};
function colorHex(name) { const k=(name||'').toLowerCase().split(/[\s\/]/)[0]; return COLOR_HEX[k]||'#9CA3AF'; }
function ColorChip({color}) {
  if(!color) return null;
  const hex=colorHex(color);
  const light = ['blanco','plata','plateado','celeste','amarillo'].includes(color.toLowerCase().split(' ')[0]);
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px 3px 6px',borderRadius:20,border:'1px solid var(--border)',background:'var(--surface-muted)',fontSize:11,fontWeight:600,color:'var(--text-body)',whiteSpace:'nowrap'}}>
    <span style={{width:10,height:10,borderRadius:'50%',background:hex,border:light?'1px solid var(--border-strong)':'none',flexShrink:0}}/>
    {color}
  </span>;
}

/* ── Catalog model picker ───────────────────────────────────────────────── */
function CatalogModelPicker({ brand, model, onSelect }) {
  const [brands,setBrands] = useState([]);
  const [models,setModels] = useState([]);
  const [selBrand,setSelBrand] = useState(brand||'');
  useEffect(()=>{ api.getBrands().then(r=>setBrands(Array.isArray(r)?r:r.brands||[])).catch(()=>{}); },[]);
  useEffect(()=>{
    if(!selBrand){setModels([]);return;}
    api.getModels({brand:selBrand}).then(r=>setModels(Array.isArray(r)?r:r.data||[])).catch(()=>{});
  },[selBrand]);
  const sel = {height:36,borderRadius:8,border:'1px solid var(--border-strong)',background:'var(--surface-muted)',color:'var(--text-body)',fontSize:12,padding:'0 10px',cursor:'pointer',fontFamily:'inherit',outline:'none',width:'100%'};
  return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
    <div>
      <label style={{...S.lbl,fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Marca</label>
      <select value={selBrand} onChange={e=>{setSelBrand(e.target.value);onSelect(null);}} style={sel}>
        <option value="">— Seleccionar —</option>
        {brands.map(b=><option key={b} value={b}>{b}</option>)}
      </select>
    </div>
    <div>
      <label style={{...S.lbl,fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Modelo del catálogo</label>
      <select value={model||''} onChange={e=>{const m=models.find(x=>x.id===e.target.value);onSelect(m||null);}} style={sel} disabled={!selBrand}>
        <option value="">— Seleccionar —</option>
        {models.map(m=><option key={m.id} value={m.id}>{m.commercial_name||m.model} {m.year?`(${m.year})`:''}</option>)}
      </select>
    </div>
  </div>;
}

/* ── Catalog color picker ───────────────────────────────────────────────── */
function catalogColors(modelRow) {
  if (!modelRow) return [];
  const out = new Set();
  const norm = (s) => String(s||'').trim();
  const parseJson = (v) => typeof v === 'string' ? (()=>{ try{return JSON.parse(v);}catch{return [];}})() : (v||[]);
  const colors = parseJson(modelRow.colors);
  const photos = parseJson(modelRow.color_photos);
  colors.forEach(c => { const v = norm(typeof c==='string'?c:c?.name||c?.color); if (v) out.add(v); });
  photos.forEach(c => { const v = norm(c?.color); if (v) out.add(v); });
  return Array.from(out);
}
function CatalogColorPicker({ modelRow, value, onChange }) {
  const opts = catalogColors(modelRow);
  const sel = {height:36,borderRadius:8,border:'1px solid var(--border-strong)',background:'var(--surface-muted)',color:'var(--text-body)',fontSize:12,padding:'0 10px',cursor:'pointer',fontFamily:'inherit',outline:'none',width:'100%'};
  if (opts.length === 0) {
    return (
      <input value={value||''} onChange={e=>onChange(e.target.value)}
        placeholder="Color libre (modelo sin colores cargados en catálogo)"
        style={{...S.inp, width:'100%'}}/>
    );
  }
  const cur = value || '';
  const match = opts.find(o => o.toLowerCase() === cur.toLowerCase());
  return (
    <div>
      <select value={match || ''} onChange={e=>onChange(e.target.value)} style={sel}>
        <option value="">— Seleccionar color del catálogo —</option>
        {opts.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      {cur && !match && (
        <div style={{fontSize:10,color:'#B45309',marginTop:4,fontFamily:'inherit'}}>
          Color actual "{cur}" no está en el catálogo — elige uno válido.
        </div>
      )}
    </div>
  );
}

/* ── Shared inline tokens ───────────────────────────────────────────────── */
const lbl9 = { display:'block', fontSize:9, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:5 };
const lblField = { display:'block', fontSize:11, fontWeight:600, color:'var(--text-subtle)', marginBottom:3 };
const secTitle = (color='var(--text-body)') => ({ fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.14em', paddingBottom:7, marginBottom:10, borderBottom:`2px solid ${color}22` });
const secCard = S.secCard;

/* ── Form field ─────────────────────────────────────────────────────────── */
function F({ label, value, onChange, type='text', half, hl }) {
  return (
    <div style={{ gridColumn: half?'auto':'1/-1' }}>
      <label style={{ ...S.lbl, fontSize:10, fontWeight:600, color:hl?'#92400E':'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}{hl?' *':''}
      </label>
      <input type={type} value={value||''} onChange={e=>onChange?.(e.target.value)}
        style={{ ...S.inp, width:'100%', border:'1px solid '+(hl?'#FCD34D':'var(--border-strong)') }}/>
    </div>
  );
}

/* ── File upload zone ───────────────────────────────────────────────────── */
function FileZone({ label, file, onFile, url, onUrl, accent='var(--brand)' }) {
  const [mode, setMode] = useState(url?'url':'upload');
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ ...S.card, border:`1.5px solid ${drag?accent:'var(--border)'}`, padding:14 }}>
      <div style={lbl9}>{label}</div>
      <div style={{ display:'flex',gap:6,marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ fontFamily:'inherit',fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:20,cursor:'pointer',border:`1.5px solid ${mode===m?accent:'var(--border-strong)'}`,background:mode===m?accent:'var(--surface)',color:mode===m?'var(--text-on-dark)':'var(--text-subtle)' }}>{l}</button>
        ))}
      </div>
      {mode==='upload' ? (
        <label onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0])}}
          style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'16px 12px',border:`2px dashed ${drag?accent:'var(--border-strong)'}`,borderRadius:8,cursor:'pointer' }}>
          <Ic.file size={16} color={drag?accent:'var(--text-disabled)'}/>
          <span style={{ fontFamily:'inherit',fontSize:12,color:'var(--text-subtle)' }}>{file?<strong style={{color:'var(--text)'}}>{file.name}</strong>:'Arrastra o haz click'}</span>
          <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0])}}/>
        </label>
      ) : (
        <input value={url} onChange={e=>onUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..."
          style={{ ...S.inp, width:'100%' }}/>
      )}
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────────────────────── */
function Sec({ title, color, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={secTitle(color)}>{title}</div>
      {children}
    </div>
  );
}

/* ── Detail row ─────────────────────────────────────────────────────────── */
function DR({ label, value, bold, span }) {
  if (!value && value!==0) return null;
  return (
    <div style={{ gridColumn:span?'1/-1':'auto', padding:'6px 0', borderBottom:'1px solid var(--surface-sunken)' }}>
      <div style={lbl9}>{label}</div>
      <div style={{ fontFamily:'inherit', fontSize:13, fontWeight:bold?700:400, color:'var(--text)' }}>{value}</div>
    </div>
  );
}

/* ── New payment modal ──────────────────────────────────────────────────── */
function NewModal({ onClose, onCreated }) {
  const [step,setStep]=useState(1);
  const [invFile,setInvFile]=useState(null);
  const [recFile,setRecFile]=useState(null);
  const [invUrl,setInvUrl]=useState('');
  const [recUrl,setRecUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState(EMPTY());
  const [modelRow,setModelRow]=useState(null);
  const [hl,setHl]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const s=k=>v=>setForm(f=>({...f,[k]:v}));
  const pickModel = (m) => {
    setModelRow(m);
    if (m) {
      setForm(f=>({...f, model_id: m.id, brand: m.brand, model: m.commercial_name||m.model,
        color: (catalogColors(m).some(c => c.toLowerCase() === (f.color||'').toLowerCase())) ? f.color : ''}));
    } else {
      setForm(f=>({...f, model_id:''}));
    }
  };

  const extract=async()=>{
    if(!invFile&&!recFile){setErr('Sube al menos un archivo');return;}
    setBusy(true);setErr('');
    try{const r=await api.extractSupplierPayment(invFile,recFile);const m=r.merged||{};const nf={...EMPTY()};const h={};
    for(const[k,v]of Object.entries(m)){if(v!=null&&String(v).trim()){nf[k]=String(v);h[k]=true;}}
    if(invUrl)nf.invoice_url=invUrl;if(recUrl)nf.receipt_url=recUrl;
    setForm(f=>({...f,...nf}));setHl(h);setStep(2);}catch(e){setErr(e.message||'Error');}finally{setBusy(false);}
  };

  const save=async()=>{
    if(!form.invoice_number){setErr('N° Factura obligatorio');return;}
    setSaving(true);setErr('');
    try{const r=await api.createSupplierPayment(form);onCreated(r);setStep(3);}catch(e){setErr(e.message||'Error');setSaving(false);}
  };

  if(step===3) return(
    <Modal onClose={onClose} title="Registro creado">
      <div style={{textAlign:'center',padding:'30px 0'}}>
        <div style={{width:44,height:44,borderRadius:'50%',background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Ic.check size={22} color="#15803D"/></div>
        <div style={{fontFamily:'inherit',fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:12}}>Pago registrado</div>
        <Btn variant='primary' onClick={onClose} style={{padding:'8px 28px'}}>Cerrar</Btn>
      </div>
    </Modal>
  );

  return(
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos'} wide>
      {step===1&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{fontSize:12,color:'var(--text-subtle)',background:'var(--surface-muted)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',fontFamily:'inherit'}}>Sube los PDF o pega los links de Google Drive.</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            <FileZone label="Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl}/>
            <FileZone label="Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>
          <ErrorMsg msg={err}/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn variant='primary' onClick={extract} disabled={busy} style={{flex:2,minWidth:140}}>{busy?'Analizando...':'Analizar y extraer datos'}</Btn>
            <Btn variant='secondary' onClick={()=>{const nf={...EMPTY()};if(invUrl)nf.invoice_url=invUrl;if(recUrl)nf.receipt_url=recUrl;setForm(f=>({...f,...nf}));setHl({});setStep(2);}} style={{flex:1,minWidth:100}}>Manual</Btn>
          </div>
        </div>
      )}
      {step===2&&(
        <div style={{maxHeight:'74vh',overflowY:'auto',paddingRight:4}}>
          {Object.keys(hl).length>0&&<div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'8px 14px',marginBottom:14,fontSize:11,color:'#92400E',fontFamily:'inherit'}}>Campos con * fueron extraidos. Revisa antes de guardar.</div>}
          <Sec title="Factura" color="#F28100">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Factura" value={form.invoice_number} onChange={s('invoice_number')} half hl={!!hl.invoice_number}/>
              <F label="Fecha emision" value={form.invoice_date} onChange={s('invoice_date')} type="date" half hl={!!hl.invoice_date}/>
              <F label="Fecha vencimiento" value={form.due_date} onChange={s('due_date')} type="date" half hl={!!hl.due_date}/>
              <F label="Neto ($)" value={form.neto} onChange={s('neto')} type="number" half hl={!!hl.neto}/>
              <F label="IVA ($)" value={form.iva} onChange={s('iva')} type="number" half hl={!!hl.iva}/>
              <F label="Total factura ($)" value={form.total_amount} onChange={s('total_amount')} type="number" half hl={!!hl.total_amount}/>
              <F label="Monto pagado ($)" value={form.paid_amount} onChange={s('paid_amount')} type="number" half hl={!!hl.paid_amount}/>
            </div>
          </Sec>
          <Sec title="Comprobante" color="#2563EB">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={s('receipt_number')} half hl={!!hl.receipt_number}/>
              <F label="Fecha pago" value={form.payment_date} onChange={s('payment_date')} type="date" half hl={!!hl.payment_date}/>
              <F label="Banco" value={form.banco} onChange={s('banco')} hl={!!hl.banco}/>
              <F label="Medio de pago" value={form.payment_method} onChange={s('payment_method')} half hl={!!hl.payment_method}/>
              <F label="Pagador" value={form.payer_name} onChange={s('payer_name')} half hl={!!hl.payer_name}/>
            </div>
          </Sec>
          <Sec title="Vehículo" color="#374151">
            <div style={{marginBottom:10}}>
              <CatalogModelPicker brand={form.brand} model={form.model_id} onSelect={pickModel}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <div>
                <label style={{...S.lbl, fontSize:10, fontWeight:600, color:hl.color?'#92400E':'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color{hl.color?' *':''}</label>
                <CatalogColorPicker modelRow={modelRow} value={form.color} onChange={s('color')}/>
              </div>
              <F label="Año" value={form.commercial_year} onChange={s('commercial_year')} type="number" half hl={!!hl.commercial_year}/>
              <F label="N° Motor" value={form.motor_num} onChange={s('motor_num')} half hl={!!hl.motor_num}/>
              <F label="N° Chasis" value={form.chassis} onChange={s('chassis')} half hl={!!hl.chassis}/>
            </div>
          </Sec>
          <Sec title="Archivos" color="#6B7280">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
              <F label="URL Factura" value={form.invoice_url} onChange={s('invoice_url')} hl={!!hl.invoice_url}/>
              <F label="URL Comprobante" value={form.receipt_url} onChange={s('receipt_url')} hl={!!hl.receipt_url}/>
              <F label="Notas" value={form.notes} onChange={s('notes')}/>
            </div>
          </Sec>
          <ErrorMsg msg={err}/>
          <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
            <Btn variant='secondary' onClick={()=>setStep(1)} style={{flex:1,minWidth:80}}>Volver</Btn>
            <Btn variant='primary' onClick={save} disabled={saving} style={{flex:2,minWidth:140}}>{saving?'Guardando...':'Guardar registro'}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Detail view (lectura) ──────────────────────────────────────────────── */
function DetailView({ p, dv, overdue, onUpdated }) {
  const img = motoImg(p);
  const st  = pagoStatus(p);
  const saldo = Math.max(0, (parseInt(p.total_amount)||0) - (parseInt(p.paid_amount)||0));
  // Notas editables inline — para pagos sin moto (arriendo, servicios) este
  // es el único texto que describe el gasto. Obligar a abrir Editar para
  // poner "Arriendo Marzo" es un paso extra innecesario.
  const [notes, setNotes]         = useState(p.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesErr, setNotesErr]   = useState('');
  const notesDirty = (notes || '') !== (p.notes || '');
  async function saveNotes() {
    setSavingNotes(true); setNotesErr('');
    try {
      const u = await api.updateSupplierPayment(p.id, { notes });
      onUpdated?.(u);
    } catch (e) { setNotesErr(e.message); }
    finally { setSavingNotes(false); }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Hero: foto + factura + estado + totales */}
      <div style={{
        display:'flex', alignItems:'stretch', minHeight:120,
        background:'var(--surface)', border:'1px solid var(--border)',
        borderLeft:`4px solid ${st.c}`,
        borderRadius:12, overflow:'hidden',
        boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          width:150, flexShrink:0,
          background: STATUS_BG[st.l] || 'var(--surface-sunken)',
          display:'flex', alignItems:'center', justifyContent:'center',
          overflow:'hidden',
        }}>
          {img
            ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <Ic.bike size={48} color={STATUS_ICON[st.l] || 'var(--text-disabled)'}/>}
        </div>
        <div style={{ flex:1, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-disabled)', marginBottom:2 }}>Factura</div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text)', letterSpacing:'-0.4px', marginBottom:4 }}>
              #{p.invoice_number || '—'}
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
              {p.catalog_name || p.model || '—'}
            </div>
            {(p.color || p.commercial_year) && (
              <div style={{ fontSize:11, color:'var(--text-subtle)', marginTop:2 }}>
                {[p.color, p.commercial_year].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <div style={{ textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
            <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', letterSpacing:'-0.5px' }}>
              {$(p.total_amount)}
            </div>
            {p.paid_amount ? (
              <div style={{ fontSize:12, fontWeight:700, color:'#15803D' }}>
                ✓ Pagado {$(p.paid_amount)}
              </div>
            ) : saldo > 0 ? (
              <div style={{ fontSize:12, fontWeight:700, color: overdue?'#DC2626':'#D97706' }}>
                Saldo {$(saldo)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Factura */}
      <DetailCard title="Factura" accent="var(--brand)">
        <DetailRow label="Fecha emisión" value={fd(p.invoice_date)}/>
        <DetailRow label="Vencimiento" value={fd(dv)} danger={overdue}/>
        <DetailRow label="Neto" value={$(p.neto)}/>
        <DetailRow label="IVA" value={$(p.iva)}/>
      </DetailCard>

      {/* Comprobante */}
      {(p.receipt_number || p.payment_date || p.banco || p.payment_method || p.payer_name) && (
        <DetailCard title="Comprobante" accent="#2563EB">
          <DetailRow label="N° Comprobante" value={p.receipt_number} bold/>
          <DetailRow label="Fecha pago" value={fd(p.payment_date)}/>
          <DetailRow label="Medio pago" value={p.payment_method}/>
          <DetailRow label="Banco" value={p.banco} span/>
          <DetailRow label="Pagador" value={p.payer_name} span/>
        </DetailCard>
      )}

      {/* Vehículo */}
      <DetailCard title="Vehículo" accent="var(--text-body)">
        <DetailRow label="Marca" value={p.brand}/>
        <DetailRow label="Modelo" value={p.model} bold/>
        <DetailRow label="Color" value={p.color}/>
        <DetailRow label="Año" value={p.commercial_year}/>
        <DetailRow label="N° Motor" value={p.motor_num}/>
        <DetailRow label="N° Chasis" value={p.chassis}/>
      </DetailCard>

      {/* Notas / Detalle — edición inline */}
      <div style={{
        padding:'12px 14px', borderRadius:10,
        background:'#FFFBEB', border:'1px solid #FDE68A', borderLeft:'3px solid #D97706',
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom:6, gap:8,
        }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Notas / Detalle del pago
          </div>
          <span style={{ fontSize:10, color:'#92400E', fontStyle:'italic' }}>
            aparece en la card
          </span>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder='Ej: "Arriendo Marzo", "Cuenta de luz", "Honorarios contador"…'
          style={{
            width:'100%', resize:'vertical', fontSize:13, fontFamily:'inherit',
            padding:'8px 10px', borderRadius:8, border:'1px solid #FDE68A',
            background:'var(--surface)', color:'var(--text-body)', outline:'none',
          }}
        />
        {notesErr && (
          <div style={{ fontSize:11, color:'#DC2626', marginTop:6 }}>{notesErr}</div>
        )}
        {notesDirty && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={saveNotes} disabled={savingNotes}
              style={{ ...S.btn, flex:1, fontSize:12, padding:'8px 12px' }}>
              {savingNotes ? 'Guardando...' : 'Guardar detalle'}
            </button>
            <button onClick={() => { setNotes(p.notes || ''); setNotesErr(''); }}
              disabled={savingNotes}
              style={{ ...S.btn2, fontSize:12, padding:'8px 12px' }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {(p.invoice_url || p.receipt_url) && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {p.invoice_url && (
            <a href={p.invoice_url} target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
                       background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8,
                       textDecoration:'none', fontSize:12, fontWeight:600, color:'#C2410C', fontFamily:'inherit' }}>
              <Ic.file size={13}/> Ver factura
            </a>
          )}
          {p.receipt_url && (
            <a href={p.receipt_url} target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
                       background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8,
                       textDecoration:'none', fontSize:12, fontWeight:600, color:'#1D4ED8', fontFamily:'inherit' }}>
              <Ic.file size={13}/> Ver comprobante
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function DetailCard({ title, accent='var(--text-body)', children }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:12, overflow:'hidden',
    }}>
      <div style={{
        padding:'10px 16px', background:'var(--surface-muted)',
        borderBottom:`1px solid var(--surface-sunken)`,
        display:'flex', alignItems:'center', gap:8,
      }}>
        <span style={{ width:3, height:14, background:accent, borderRadius:2 }}/>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', letterSpacing:'0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, bold, danger, span }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ gridColumn: span ? '1/-1' : 'auto' }}>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text-subtle)', marginBottom:2 }}>
        {label}
      </div>
      <div style={{
        fontSize:14, fontWeight: bold ? 700 : 500,
        color: danger ? '#DC2626' : 'var(--text)',
        fontFamily:'inherit', letterSpacing:'-0.1px',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ── Detail / edit modal ────────────────────────────────────────────────── */
function DetailModal({ payment:p0, onClose, onUpdated, onDeleted, canDel, startInEdit }) {
  const [p,setP]=useState(p0);
  const [editing,setEditing]=useState(!!startInEdit);
  const [form,setForm]=useState(()=> startInEdit ? {
    ...p0,
    invoice_date: p0.invoice_date?.slice(0,10)||'',
    due_date:     p0.due_date?.slice(0,10)||'',
    payment_date: p0.payment_date?.slice(0,10)||'',
  } : {});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const [cd,setCD]=useState(false);
  const [deleting,setDel]=useState(false);
  const hydrateModelRow = (src) => src?.model_id ? ({
    id: src.model_id,
    brand: src.brand,
    model: src.catalog_name || src.model,
    commercial_name: src.catalog_name,
    colors: src.catalog_colors,
    color_photos: src.catalog_color_photos,
    image_url: src.catalog_image,
  }) : null;
  const [modelRow,setModelRow]=useState(()=> hydrateModelRow(p0));
  const st=k=>v=>setForm(f=>({...f,[k]:v}));
  const pickModel = (m) => {
    setModelRow(m);
    if (m) {
      setForm(f=>({...f, model_id: m.id, brand: m.brand, model: m.commercial_name||m.model,
        color: (catalogColors(m).some(c => c.toLowerCase() === (f.color||'').toLowerCase())) ? f.color : ''}));
    } else {
      setForm(f=>({...f, model_id:''}));
    }
  };

  const startEdit=()=>{setForm({...p,invoice_date:p.invoice_date?.slice(0,10)||'',due_date:p.due_date?.slice(0,10)||'',payment_date:p.payment_date?.slice(0,10)||''});setModelRow(hydrateModelRow(p));setEditing(true);};
  const save=async()=>{
    setSaving(true);setErr('');
    try{
      const payload = {
        invoice_number: form.invoice_number, invoice_date: form.invoice_date,
        due_date: form.due_date, payment_date: form.payment_date,
        total_amount: form.total_amount, neto: form.neto, iva: form.iva,
        paid_amount: form.paid_amount,
        receipt_number: form.receipt_number, payer_name: form.payer_name,
        banco: form.banco, payment_method: form.payment_method,
        brand: form.brand, model: form.model, model_id: form.model_id || '',
        color: form.color, commercial_year: form.commercial_year,
        motor_num: form.motor_num, chassis: form.chassis,
        invoice_url: form.invoice_url, receipt_url: form.receipt_url,
        notes: form.notes, provider: form.provider,
      };
      const u=await api.updateSupplierPayment(p.id,payload);
      setP(u);onUpdated(u);setEditing(false);
    }catch(e){setErr(e.message);}finally{setSaving(false);}
  };
  const del=async()=>{setDel(true);try{await api.deleteSupplierPayment(p.id);onDeleted(p.id);onClose();}catch(e){setErr(e.message);setDel(false);setCD(false);}};

  const dv = due(p);
  const overdue = dv && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  const st_badge = pagoStatus(p);

  /* Modal header personalizado con badge de estado */
  const headerContent = (
    <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--surface-sunken)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
      <div style={{minWidth:0}}>
        <h2 style={{fontSize:15,fontWeight:700,color:'var(--text)',margin:0}}>
          Factura {p.invoice_number||'—'}
        </h2>
        {(p.catalog_name||p.model) && (
          <div style={{fontSize:12,color:'var(--text-subtle)',marginTop:2}}>{p.catalog_name||p.model}</div>
        )}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <Bdg l={st_badge.l} c={st_badge.c} bg={st_badge.bg}/>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'var(--text-disabled)',fontSize:20,lineHeight:1,borderRadius:6}}><Ic.x size={18}/></button>
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} wide headerContent={headerContent}>
      <div style={{maxHeight:'78vh',overflowY:'auto',paddingRight:4}}>
        <ErrorMsg msg={err}/>

        {/* Acciones */}
        {!editing && (
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
            <Btn variant='secondary' size='sm' onClick={startEdit}>
              <Ic.file size={13}/> Editar
            </Btn>
            {canDel && (
              <button onClick={()=>setCD(true)} style={{...S.btn2,padding:'6px 14px',fontSize:12,color:'#DC2626',borderColor:'#FECACA'}}>
                Eliminar
              </button>
            )}
          </div>
        )}

        {/* Confirmacion eliminar */}
        {cd&&(
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:12,marginBottom:14}}>
            <div style={{fontFamily:'inherit',fontSize:12,fontWeight:700,color:'#DC2626',marginBottom:8}}>¿Eliminar este registro?</div>
            <div style={{display:'flex',gap:8}}>
              <Btn variant='danger' size='sm' onClick={del} disabled={deleting}>{deleting?'Eliminando...':'Eliminar'}</Btn>
              <Btn variant='secondary' size='sm' onClick={()=>setCD(false)}>Cancelar</Btn>
            </div>
          </div>
        )}

        {editing ? (
          <div>
            <Sec title="Factura" color="#F28100">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
                <F label="N° Factura" value={form.invoice_number} onChange={st('invoice_number')} half/>
                <F label="Fecha emision" value={form.invoice_date} onChange={st('invoice_date')} type="date" half/>
                <F label="Vencimiento" value={form.due_date} onChange={st('due_date')} type="date" half/>
                <F label="Neto ($)" value={form.neto} onChange={st('neto')} type="number" half/>
                <F label="IVA ($)" value={form.iva} onChange={st('iva')} type="number" half/>
                <F label="Total ($)" value={form.total_amount} onChange={st('total_amount')} type="number" half/>
                <F label="Monto pagado ($)" value={form.paid_amount} onChange={st('paid_amount')} type="number" half/>
              </div>
            </Sec>
            <Sec title="Comprobante" color="#2563EB">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
                <F label="N° Comprobante" value={form.receipt_number} onChange={st('receipt_number')} half/>
                <F label="Fecha pago" value={form.payment_date} onChange={st('payment_date')} type="date" half/>
                <F label="Banco" value={form.banco} onChange={st('banco')}/>
                <F label="Medio pago" value={form.payment_method} onChange={st('payment_method')} half/>
                <F label="Pagador" value={form.payer_name} onChange={st('payer_name')} half/>
              </div>
            </Sec>
            <Sec title="Vehículo" color="#374151">
              <div style={{marginBottom:10}}>
                <CatalogModelPicker brand={form.brand} model={form.model_id} onSelect={pickModel}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
                <div>
                  <label style={{...S.lbl, fontSize:10, fontWeight:600, color:'var(--text-subtle)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color</label>
                  <CatalogColorPicker modelRow={modelRow} value={form.color} onChange={st('color')}/>
                </div>
                <F label="Año" value={form.commercial_year} onChange={st('commercial_year')} type="number" half/>
                <F label="N° Motor" value={form.motor_num} onChange={st('motor_num')} half/>
                <F label="N° Chasis" value={form.chassis} onChange={st('chassis')} half/>
              </div>
            </Sec>
            <Sec title="Archivos / notas" color="#6B7280">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                <F label="URL Factura" value={form.invoice_url} onChange={st('invoice_url')}/>
                <F label="URL Comprobante" value={form.receipt_url} onChange={st('receipt_url')}/>
                <F label="Notas" value={form.notes} onChange={st('notes')}/>
              </div>
            </Sec>
            <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
              <Btn variant='primary' onClick={save} disabled={saving} style={{flex:2,minWidth:120}}>{saving?'Guardando...':'Guardar'}</Btn>
              <Btn variant='secondary' onClick={()=>setEditing(false)} style={{flex:1,minWidth:80}}>Cancelar</Btn>
            </div>
          </div>
        ) : (
          <DetailView p={p} dv={dv} overdue={overdue} onUpdated={u=>{setP(u);onUpdated(u);}}/>
        )}
      </div>
    </Modal>
  );
}

/* ── Mobile card ────────────────────────────────────────────────────────── */
function MobileCard({ p, onClick }) {
  const st   = pagoStatus(p);
  const img  = motoImg(p);
  const paid = parseFloat(p.paid_amount || 0) > 0;
  const saldo = Math.max(0, parseFloat(p.total_amount || 0) - parseFloat(p.paid_amount || 0));
  const amount = paid ? p.paid_amount : (saldo || p.total_amount);
  const amountColor = paid ? '#059669' : st.l === 'Vencido' ? '#DC2626' : 'var(--text)';
  return (
    <div onClick={onClick} style={{
      background:'var(--surface)',
      borderRadius:14,
      border:'1px solid var(--border)',
      borderLeft:`4px solid ${st.c}`,
      padding:12,
      marginBottom:12,
      cursor:'pointer',
      display:'flex',
      gap:12,
      alignItems:'stretch',
      boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {/* Large photo */}
      <div style={{
        width:104, height:104,
        flexShrink:0,
        borderRadius:10,
        background:'var(--surface-muted)',
        border:'1px solid var(--surface-sunken)',
        display:'flex',alignItems:'center',justifyContent:'center',
        overflow:'hidden',
      }}>
        {img
          ? <img src={img} alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}/>
          : <Ic.bike size={30} color="var(--border-strong)"/>}
      </div>

      {/* Info */}
      <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:2}}>
            <div style={{fontSize:11, fontWeight:700, color:'var(--text-disabled)', letterSpacing:'0.02em'}}>
              #{p.invoice_number || '—'}
            </div>
            <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
          </div>
          <div style={{fontSize:15, fontWeight:800, color:'var(--text)', lineHeight:1.2, letterSpacing:'-0.2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
            {p.catalog_name || p.model || '—'}
          </div>
        </div>

        <div>
          <div style={{fontSize:19, fontWeight:800, color:amountColor, letterSpacing:'-0.4px', lineHeight:1.1}}>
            {$(amount)}
          </div>
          {p.chassis && (
            <div style={{
              fontSize:11, color:'var(--text-subtle)', marginTop:4,
              fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            }}>
              {p.chassis}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Desktop row card (estilo Leads/Sales) ───────────────────────────────── */
const STATUS_BG = {
  Pagado:    'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
  Vencido:   'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
  Pendiente: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
};
const STATUS_ICON = {
  Pagado:    '#059669',
  Vencido:   '#DC2626',
  Pendiente: '#D97706',
};

function RowCard({ p, onClick }) {
  const [hov,setHov] = useState(false);
  const dv = due(p);
  const ov = dv && !p.paid_amount && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  const st = pagoStatus(p);
  const img = motoImg(p);
  const saldo = Math.max(0, (parseInt(p.total_amount)||0) - (parseInt(p.paid_amount)||0));

  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        display:'flex', alignItems:'stretch',
        minHeight:148, marginBottom:10,
        background:'var(--surface)',
        border:'1px solid var(--border)',
        borderLeft:`4px solid ${st.c}`,
        borderRadius:14, overflow:'hidden',
        cursor:'pointer',
        boxShadow: hov ? '0 6px 16px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
      }}>

      {/* Foto */}
      <div style={{
        width:220, flexShrink:0,
        background: STATUS_BG[st.l] || 'var(--surface-sunken)',
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', position:'relative',
      }}>
        {img
          ? <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <Ic.bike size={56} color={STATUS_ICON[st.l] || 'var(--text-disabled)'}/>
        }
        {!p.model_id && (p.brand||p.model) && (
          <span style={{
            position:'absolute', top:8, left:8,
            fontSize:9, fontWeight:800, color:'#92400E',
            background:'rgba(254,243,199,0.95)', borderRadius:4, padding:'2px 7px',
            letterSpacing:'0.06em', border:'1px solid #FDE68A',
          }}>
            SIN CATÁLOGO
          </span>
        )}
      </div>

      {/* Contenido */}
      <div style={{
        flex:1, minWidth:0,
        padding:'14px 18px',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        gap:8,
      }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#4F46E5', letterSpacing:'-0.2px',
                          background:'#EEF2FF', border:'1px solid #C7D2FE',
                          padding:'2px 10px', borderRadius:8 }}>
              #{p.invoice_number||'—'}
            </div>
            <span style={{
              fontSize:10, fontWeight:700, color:'var(--text-subtle)',
              background:'var(--surface-muted)', padding:'2px 8px', borderRadius:20, border:'1px solid var(--border)',
            }}>
              {fd(p.invoice_date)}
            </span>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6,
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {p.catalog_name || p.model || p.notes || '—'}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            {p.color && <ColorChip color={p.color}/>}
            {p.commercial_year && (
              <span style={{ fontSize:10, fontWeight:700, color:'#4F46E5',
                             background:'#EEF2FF', padding:'2px 8px', borderRadius:20, border:'1px solid #C7D2FE' }}>
                {p.commercial_year}
              </span>
            )}
            {p.chassis && (
              <span style={{ fontSize:10, fontWeight:600, color:'var(--text-subtle)',
                             background:'var(--surface-sunken)', padding:'2px 8px', borderRadius:20 }}>
                {p.chassis}
              </span>
            )}
            {p.motor_num && (
              <span style={{ fontSize:10, fontWeight:600, color:'var(--text-subtle)',
                             background:'var(--surface-sunken)', padding:'2px 8px', borderRadius:20 }}>
                {p.motor_num}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zona derecha: estado + montos + fechas */}
      <div style={{
        width:200, flexShrink:0,
        padding:'14px 18px',
        borderLeft:'1px dashed var(--border)',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        alignItems:'flex-end', textAlign:'right', gap:6,
      }}>
        <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', letterSpacing:'-0.5px', lineHeight:1 }}>
            {$(p.total_amount)}
          </div>
          {p.paid_amount ? (
            <div style={{ fontSize:11, fontWeight:700, color:'#15803D', marginTop:3 }}>
              ✓ Pagado {$(p.paid_amount)}
            </div>
          ) : saldo > 0 ? (
            <div style={{ fontSize:11, fontWeight:700, color: ov?'#DC2626':'#D97706', marginTop:3 }}>
              Saldo {$(saldo)}
            </div>
          ) : null}
        </div>
        <div style={{ fontSize:10, color:'var(--text-disabled)', lineHeight:1.4 }}>
          {p.payment_date
            ? <>Pagado: <strong style={{color:'var(--text-body)'}}>{fd(p.payment_date)}</strong></>
            : dv ? <>Vence: <strong style={{color: ov?'#DC2626':'var(--text-body)'}}>{fd(dv)}</strong></> : null}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers de filtro (labels legibles) ─────────────────────────────────── */
const FILT_LBL = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)',
  marginBottom: 5, letterSpacing: '0.01em',
};

function FiltCol({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      <label style={FILT_LBL}>{label}</label>
      {children}
    </div>
  );
}

function FiltGroup({ title, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      <label style={FILT_LBL}>{title}</label>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {children}
      </div>
    </div>
  );
}

/* ── Main view ──────────────────────────────────────────────────────────── */
export function SupplierPaymentsView({ user }) {
  const canDel    = hasRole(user, ROLES.SUPER);
  const canCreate = hasRole(user, ...ROLE_ADMIN_WRITE);
  const isMobile  = useIsMobile();

  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);
  const [sel,setSel]=useState(null);
  const [editFromList,setEditFromList]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [syncRes,setSyncRes]=useState(null);

  // Filtros
  const [q,setQ]=useState('');
  const [stF,setStF]=useState('');
  const [fromF,setFromF]=useState('');
  const [toF,setToF]=useState('');
  const [payFromF,setPayFromF]=useState('');
  const [payToF,setPayToF]=useState('');
  const [brF,setBrF]=useState('');
  const [sortBy,setSortBy]=useState('payment_date');
  const [sortDir,setSortDir]=useState('desc');

  // Mobile: expandir/contraer filtros
  const [filtersOpen,setFiltersOpen]=useState(false);

  const load = useCallback(async()=>{
    setLoading(true);
    const PAGE_SIZE=500, MAX_PAGES=40;
    const acc=[];
    try{
      for(let page=1; page<=MAX_PAGES; page++){
        const r=await api.getSupplierPayments({page,limit:PAGE_SIZE});
        const batch=r?.data||[];
        acc.push(...batch);
        const total=typeof r?.total==='number'?r.total:acc.length;
        if(acc.length>=total||batch.length<PAGE_SIZE)break;
      }
      setData(acc);
    }catch(e){ console.error(e); }
    finally{ setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);

  const sync=async()=>{
    setSyncing(true);setSyncRes(null);
    try{const r=await api.syncSupplierPaymentsFromDrive();setSyncRes({ok:true,...r});load();}
    catch(e){setSyncRes({ok:false,error:e.message});}
    finally{setSyncing(false);}
  };

  const brands = Array.from(new Set(data.map(p=>p.brand).filter(Boolean))).sort();
  const norm = (s) => (s||'').toString().toLowerCase();
  const qn = norm(q.trim());
  const filtered = data.filter(p=>{
    if (qn) {
      const hay = [p.invoice_number, p.receipt_number, p.provider, p.brand, p.model,
                   p.catalog_name, p.color, p.chassis, p.motor_num, p.banco]
        .map(norm).join(' ');
      if (!hay.includes(qn)) return false;
    }
    if (stF==='pagado'    && !p.paid_amount) return false;
    if (stF==='pendiente' &&  p.paid_amount) return false;
    if (brF && p.brand !== brF) return false;
    if (fromF || toF) {
      const d = (p.invoice_date||'').slice(0,10);
      if (fromF && d && d < fromF) return false;
      if (toF   && d && d > toF)   return false;
    }
    if (payFromF || payToF) {
      const pd = (p.payment_date||'').slice(0,10);
      if (!pd) return false;
      if (payFromF && pd < payFromF) return false;
      if (payToF   && pd > payToF)   return false;
    }
    return true;
  });

  const isDateSort   = ['payment_date','invoice_date','due_date'].includes(sortBy);
  const isNumberSort = ['total_amount','paid_amount'].includes(sortBy);
  const rawVal = (p) => { if (sortBy === 'due_date') return due(p); return p[sortBy]; };
  const toCmp = (v) => {
    if (v == null || v === '') return null;
    if (isDateSort) { const d = new Date(String(v).slice(0,10)+'T12:00:00').getTime(); return isNaN(d)?null:d; }
    if (isNumberSort) { const n = parseInt(v); return isNaN(n)?null:n; }
    return String(v).toLowerCase();
  };
  const sorted = [...filtered].sort((a,b)=>{
    const na=toCmp(rawVal(a)), nb=toCmp(rawVal(b));
    if(na==null&&nb==null)return 0; if(na==null)return 1; if(nb==null)return -1;
    if(na<nb)return sortDir==='asc'?-1:1; if(na>nb)return sortDir==='asc'?1:-1; return 0;
  });

  const sum = sorted.reduce((acc,p)=>{
    const tot=parseInt(p.total_amount)||0, paid=parseInt(p.paid_amount)||0;
    const dv=due(p), ov=dv&&!p.paid_amount&&new Date(dv.slice(0,10)+'T12:00:00')<new Date();
    acc.total+=tot; acc.paid+=paid;
    acc.motos+=(p.chassis||p.motor_num||p.model_id?1:0);
    if(ov)acc.overdue++;
    return acc;
  },{ total:0, paid:0, motos:0, overdue:0 });
  const saldo = Math.max(0, sum.total - sum.paid);
  const pending = data.filter(p=>!p.paid_amount).length;
  const hasFilters = q||stF||fromF||toF||payFromF||payToF||brF;
  const clearFilters = ()=>{ setQ('');setStF('');setFromF('');setToF('');setPayFromF('');setPayToF('');setBrF(''); };

  // Estilo compartido para controles de filtro
  const fc = {
    height:36,
    padding:'0 12px',
    fontSize:13,
    fontWeight:500,
    color:'var(--text)',
    background:'var(--surface)',
    border:'1px solid var(--border)',
    borderRadius:8,
    fontFamily:'inherit',
    outline:'none',
    cursor:'pointer',
  };

  return (
    <div style={{ fontFamily:'Inter,system-ui,sans-serif', flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>

      {/* Header */}
      <ViewHeader
        preheader="Operaciones · Tesorería"
        title="Pagos a proveedor"
        subtitle={pending > 0 ? `${pending} sin monto pagado registrado` : null}
        actions={canCreate && (
          <>
            <Btn variant='secondary' onClick={sync} disabled={syncing}>
              <Ic.refresh size={14} color={syncing?'var(--text-disabled)':'var(--text-body)'}/>{syncing?'Sincronizando...':'Sincronizar con Drive'}
            </Btn>
            <Btn variant='primary' onClick={()=>setShowNew(true)}>
              <Ic.plus size={14}/> Nuevo pago
            </Btn>
          </>
        )}
      />

      {/* Sync banner */}
      {syncRes&&(
        <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,fontSize:12,fontFamily:'inherit',background:syncRes.ok?'#F0FDF4':'#FEF2F2',border:`1px solid ${syncRes.ok?'#BBF7D0':'#FECACA'}`,color:syncRes.ok?'#166534':'#991B1B',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {syncRes.ok?`Sincronización exitosa: ${syncRes.created} nuevos, ${syncRes.updated} actualizados`:syncRes.error}
          <Btn variant='ghost' onClick={()=>setSyncRes(null)} style={{marginLeft:'auto',padding:4,lineHeight:1}}><Ic.x size={14}/></Btn>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div style={{
        display:'flex', gap:10, flexWrap:'wrap', marginBottom:16,
      }}>
        {[
          { label:'Registros', val:sorted.length,    color:'var(--text-body)', isMoney:false, sub: sorted.length!==data.length?`de ${data.length} total`:null },
          { label:'Motos',     val:sum.motos,        color:'var(--text-body)', isMoney:false },
          { label:'Facturado', val:sum.total,        color:'var(--text-body)', isMoney:true  },
          { label:'Pagado',    val:sum.paid,         color:'#15803D', isMoney:true  },
          { label:'Saldo',     val:saldo,            color:saldo>0?'#DC2626':'#15803D', isMoney:true },
          { label:'Vencidas',  val:sum.overdue,      color:sum.overdue>0?'#DC2626':'var(--text-body)', isMoney:false },
        ].map(k=>(
          <div key={k.label} style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:10, padding:'10px 16px',
            flex: isMobile ? '1 1 calc(50% - 5px)' : '1 1 100px',
          }}>
            <div style={{fontSize:18, fontWeight:800, color:k.color, lineHeight:1, marginBottom:3}}>
              {k.isMoney ? $short(k.val) : k.val}
            </div>
            <div style={{fontSize:10, fontWeight:700, color:'var(--text-disabled)', textTransform:'uppercase', letterSpacing:'0.07em'}}>
              {k.label}
            </div>
            {k.sub&&<div style={{fontSize:10,color:'var(--text-disabled)',marginTop:2}}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      {isMobile ? (
        /* Mobile: botón expandible */
        <div style={{marginBottom:14}}>
          <button onClick={()=>setFiltersOpen(o=>!o)} style={{
            ...S.btn2, width:'100%', justifyContent:'space-between',
            padding:'9px 14px', fontSize:13,
          }}>
            <span style={{display:'flex',alignItems:'center',gap:7}}>
              <Ic.search size={14}/>
              {hasFilters ? 'Filtros activos' : 'Filtrar / buscar'}
            </span>
            <span style={{fontSize:12,color:'var(--text-disabled)'}}>{filtersOpen?'▲':'▼'}</span>
          </button>
          {filtersOpen&&(
            <div style={{
              background:'var(--surface-muted)', border:'1px solid var(--border)',
              borderRadius:'0 0 10px 10px', padding:'12px 14px',
              display:'flex', flexDirection:'column', gap:10,
            }}>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Factura, modelo, color, chasis…"
                style={{...S.inp}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div>
                  <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Estado</label>
                  <select value={stF} onChange={e=>setStF(e.target.value)} style={{...S.inp,height:34,padding:'0 10px',fontSize:12}}>
                    <option value="">Todos</option>
                    <option value="pagado">Pagado</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                </div>
                <div>
                  <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Marca</label>
                  <select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp,height:34,padding:'0 10px',fontSize:12}}>
                    <option value="">Todas</option>
                    {brands.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              {hasFilters&&(
                <Btn variant='ghost' size='sm' onClick={clearFilters} style={{justifyContent:'center',width:'100%'}}>
                  <Ic.x size={13}/> Limpiar filtros
                </Btn>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Desktop: barra de filtros */
        <div style={{
          display:'flex', flexDirection:'column', gap:10,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:12, padding:'12px 14px', marginBottom:14,
        }}>
          {/* Fila 1: buscador + limpiar */}
          <div style={{
            display:'flex', alignItems:'center', gap:10,
            background:'var(--surface-muted)', border:'1px solid var(--border)',
            borderRadius:10, padding:'8px 12px',
          }}>
            <Ic.search size={15} color="var(--text-disabled)"/>
            <input value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Buscar factura, modelo, color, chasis, motor…"
              style={{
                border:'none', background:'transparent', outline:'none',
                flex:1, padding:0, height:26, fontSize:13,
                fontFamily:'inherit', color:'var(--text)',
              }}/>
            {hasFilters && (
              <button onClick={clearFilters}
                style={{
                  height:28, padding:'0 12px', fontSize:12, fontWeight:600,
                  color:'var(--text-subtle)', background:'var(--surface)', border:'1px solid var(--border)',
                  borderRadius:8, cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', gap:4,
                }}>
                <Ic.x size={12}/> Limpiar filtros
              </button>
            )}
          </div>

          {/* Fila 2: selects y fechas con labels legibles */}
          <div style={{
            display:'flex', alignItems:'flex-end', gap:12, flexWrap:'wrap',
          }}>
            <FiltCol label="Estado">
              <select value={stF} onChange={e=>setStF(e.target.value)} style={fc}>
                <option value="">Todos</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </FiltCol>

            <FiltGroup title="Emisión">
              <input type="date" value={fromF} onChange={e=>setFromF(e.target.value)}
                style={{...fc, minWidth:138}} placeholder="desde"/>
              <span style={{ color:'var(--text-disabled)', fontSize:12, fontWeight:600 }}>→</span>
              <input type="date" value={toF} onChange={e=>setToF(e.target.value)}
                style={{...fc, minWidth:138}} placeholder="hasta"/>
            </FiltGroup>

            <FiltGroup title="Pago">
              <input type="date" value={payFromF} onChange={e=>setPayFromF(e.target.value)}
                style={{...fc, minWidth:138}} placeholder="desde"/>
              <span style={{ color:'var(--text-disabled)', fontSize:12, fontWeight:600 }}>→</span>
              <input type="date" value={payToF} onChange={e=>setPayToF(e.target.value)}
                style={{...fc, minWidth:138}} placeholder="hasta"/>
            </FiltGroup>

            <FiltCol label="Marca">
              <select value={brF} onChange={e=>setBrF(e.target.value)} style={fc}>
                <option value="">Todas</option>
                {brands.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </FiltCol>

            <FiltCol label="Ordenar por">
              <div style={{ display:'flex', gap:5 }}>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={fc}>
                  <option value="payment_date">Fecha pago</option>
                  <option value="due_date">Vencimiento</option>
                  <option value="invoice_date">Emisión</option>
                  <option value="paid_amount">Monto pagado</option>
                  <option value="total_amount">Total</option>
                </select>
                <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}
                  title={sortDir==='asc'?'Ascendente':'Descendente'}
                  style={{
                    padding:'0 12px', height:36, fontSize:14, fontWeight:700,
                    color:'var(--text-body)', background:'var(--surface)', border:'1px solid var(--border)',
                    borderRadius:8, cursor:'pointer', fontFamily:'inherit',
                  }}>
                  {sortDir==='asc'?'↑':'↓'}
                </button>
              </div>
            </FiltCol>
          </div>
        </div>
      )}

      {/* ── Lista ── */}
      {isMobile ? (
        <div style={{flex:1,overflowY:'auto'}}>
          {loading && <Loader label="Cargando pagos…"/>}
          {!loading && sorted.length===0 && (
            <Empty
              icon={Ic.invoice}
              title={hasFilters?'Sin resultados':'Sin registros'}
              hint={hasFilters?'Prueba ajustando los filtros':'Registra el primer pago con Drive o manualmente.'}
              action={hasFilters&&<Btn variant='secondary' onClick={clearFilters}>Limpiar filtros</Btn>}
            />
          )}
          {!loading && sorted.map(p=>(
            <MobileCard key={p.id} p={p} onClick={()=>{setEditFromList(false);setSel(p);}}/>
          ))}
        </div>
      ) : (
        /* Desktop: tabla */
        <div style={{flex:1,overflowY:'auto'}}>
          {loading && <Loader label="Cargando pagos…"/>}
          {!loading && sorted.length===0 && (
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <Empty
                icon={Ic.invoice}
                title={hasFilters?'Sin resultados con estos filtros':'Sin registros de pagos'}
                hint={hasFilters?'Prueba ajustando los filtros o limpiando la búsqueda.':'Registra el primer pago con Drive o manualmente.'}
                action={hasFilters&&<Btn variant='secondary' onClick={clearFilters}>Limpiar filtros</Btn>}
              />
            </div>
          )}
          {!loading && sorted.length>0 && (
            <div>
              {sorted.map(p=>(
                <RowCard key={p.id} p={p} onClick={()=>{setEditFromList(false);setSel(p);}}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer — conteo + resumen */}
      {!loading && sorted.length>0 && (
        <div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:11,color:'var(--text-disabled)',fontFamily:'inherit',flexWrap:'wrap',gap:6}}>
          <span>{sorted.length} de {data.length} registro{data.length!==1?'s':''}</span>
          <span>
            Facturado: <strong style={{color:'var(--text)'}}>{$(sum.total)}</strong>
            {' · '}Pagado: <strong style={{color:'#15803D'}}>{$(sum.paid)}</strong>
            {' · '}Saldo: <strong style={{color:saldo>0?'#C2410C':'var(--text)'}}>{$(saldo)}</strong>
          </span>
        </div>
      )}

      {showNew&&<NewModal onClose={()=>setShowNew(false)} onCreated={p=>{setData(d=>[p,...d]);setShowNew(false);}}/>}
      {sel&&<DetailModal payment={sel} canDel={canDel} startInEdit={editFromList}
        onClose={()=>{setSel(null);setEditFromList(false);}}
        onUpdated={p=>{setData(d=>d.map(x=>x.id===p.id?p:x));setSel(p);}}
        onDeleted={id=>{setData(d=>d.filter(x=>x.id!==id));setSel(null);}}/>}
    </div>
  );
}
