import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Bdg, ROLES, hasRole, ROLE_ADMIN_WRITE, ViewHeader, Loader, Empty, ErrorMsg, useIsMobile } from '../ui.jsx';

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
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px 3px 6px',borderRadius:20,border:'1px solid #E5E7EB',background:'#F9FAFB',fontSize:11,fontWeight:600,color:'#374151',whiteSpace:'nowrap'}}>
    <span style={{width:10,height:10,borderRadius:'50%',background:hex,border:light?'1px solid #D1D5DB':'none',flexShrink:0}}/>
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
  const sel = {height:36,borderRadius:8,border:'1px solid #D1D5DB',background:'#F9FAFB',color:'#374151',fontSize:12,padding:'0 10px',cursor:'pointer',fontFamily:'inherit',outline:'none',width:'100%'};
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
  const sel = {height:36,borderRadius:8,border:'1px solid #D1D5DB',background:'#F9FAFB',color:'#374151',fontSize:12,padding:'0 10px',cursor:'pointer',fontFamily:'inherit',outline:'none',width:'100%'};
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
const lbl9 = { display:'block', fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:5 };
const secTitle = (color='#374151') => ({ fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.14em', paddingBottom:7, marginBottom:10, borderBottom:`2px solid ${color}22` });
const secCard = S.secCard;

/* ── Form field ─────────────────────────────────────────────────────────── */
function F({ label, value, onChange, type='text', half, hl }) {
  return (
    <div style={{ gridColumn: half?'auto':'1/-1' }}>
      <label style={{ ...S.lbl, fontSize:10, fontWeight:600, color:hl?'#92400E':'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}{hl?' *':''}
      </label>
      <input type={type} value={value||''} onChange={e=>onChange?.(e.target.value)}
        style={{ ...S.inp, width:'100%', border:'1px solid '+(hl?'#FCD34D':'#D1D5DB') }}/>
    </div>
  );
}

/* ── File upload zone ───────────────────────────────────────────────────── */
function FileZone({ label, file, onFile, url, onUrl, accent='#F28100' }) {
  const [mode, setMode] = useState(url?'url':'upload');
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ ...S.card, border:`1.5px solid ${drag?accent:'#E5E7EB'}`, padding:14 }}>
      <div style={lbl9}>{label}</div>
      <div style={{ display:'flex',gap:6,marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ fontFamily:'inherit',fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:20,cursor:'pointer',border:`1.5px solid ${mode===m?accent:'#D1D5DB'}`,background:mode===m?accent:'#ffffff',color:mode===m?'#ffffff':'#6B7280' }}>{l}</button>
        ))}
      </div>
      {mode==='upload' ? (
        <label onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0])}}
          style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'16px 12px',border:`2px dashed ${drag?accent:'#D1D5DB'}`,borderRadius:8,cursor:'pointer' }}>
          <Ic.file size={16} color={drag?accent:'#9CA3AF'}/>
          <span style={{ fontFamily:'inherit',fontSize:12,color:'#6B7280' }}>{file?<strong style={{color:'#111827'}}>{file.name}</strong>:'Arrastra o haz click'}</span>
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
    <div style={{ gridColumn:span?'1/-1':'auto', padding:'6px 0', borderBottom:'1px solid #F3F4F6' }}>
      <div style={lbl9}>{label}</div>
      <div style={{ fontFamily:'inherit', fontSize:13, fontWeight:bold?700:400, color:'#111827' }}>{value}</div>
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
        <div style={{fontFamily:'inherit',fontSize:15,fontWeight:700,color:'#111827',marginBottom:12}}>Pago registrado</div>
        <button onClick={onClose} style={{...S.btn,padding:'8px 28px'}}>Cerrar</button>
      </div>
    </Modal>
  );

  return(
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos'} wide>
      {step===1&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{fontSize:12,color:'#6B7280',background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:8,padding:'10px 14px',fontFamily:'inherit'}}>Sube los PDF o pega los links de Google Drive.</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            <FileZone label="Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl}/>
            <FileZone label="Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>
          <ErrorMsg msg={err}/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={extract} disabled={busy} style={{...S.btn,flex:2,minWidth:140,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>{busy?'Analizando...':'Analizar y extraer datos'}</button>
            <button onClick={()=>{const nf={...EMPTY()};if(invUrl)nf.invoice_url=invUrl;if(recUrl)nf.receipt_url=recUrl;setForm(f=>({...f,...nf}));setHl({});setStep(2);}} style={{...S.btn2,flex:1,minWidth:100}}>Manual</button>
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
                <label style={{...S.lbl, fontSize:10, fontWeight:600, color:hl.color?'#92400E':'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color{hl.color?' *':''}</label>
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
            <button onClick={()=>setStep(1)} style={{...S.btn2,flex:1,minWidth:80}}>Volver</button>
            <button onClick={save} disabled={saving} style={{...S.btn,flex:2,minWidth:140}}>{saving?'Guardando...':'Guardar registro'}</button>
          </div>
        </div>
      )}
    </Modal>
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
    <div style={{padding:'18px 20px 14px',borderBottom:'1px solid #F3F4F6',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
      <div style={{minWidth:0}}>
        <h2 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>
          Factura {p.invoice_number||'—'}
        </h2>
        {(p.catalog_name||p.model) && (
          <div style={{fontSize:12,color:'#6B7280',marginTop:2}}>{p.catalog_name||p.model}</div>
        )}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <Bdg l={st_badge.l} c={st_badge.c} bg={st_badge.bg}/>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4,color:'#9CA3AF',fontSize:20,lineHeight:1,borderRadius:6}}><Ic.x size={18}/></button>
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
            <button onClick={startEdit} style={{...S.btn2,padding:'6px 14px',fontSize:12}}>
              <Ic.file size={13}/> Editar
            </button>
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
              <button onClick={del} disabled={deleting} style={{...S.btn,background:'#DC2626',padding:'6px 14px',fontSize:12}}>{deleting?'Eliminando...':'Eliminar'}</button>
              <button onClick={()=>setCD(false)} style={{...S.btn2,padding:'6px 14px',fontSize:12}}>Cancelar</button>
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
                  <label style={{...S.lbl, fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color</label>
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
              <button onClick={save} disabled={saving} style={{...S.btn,flex:2,minWidth:120}}>{saving?'Guardando...':'Guardar'}</button>
              <button onClick={()=>setEditing(false)} style={{...S.btn2,flex:1,minWidth:80}}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={secCard}>
              <div style={{padding:'14px 16px'}}>
                <div style={secTitle('#F28100')}>Factura</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                  <DR label="N° Factura" value={p.invoice_number} bold/>
                  <DR label="Fecha emision" value={fd(p.invoice_date)}/>
                  <DR label="Vencimiento" value={fd(dv)} bold={overdue}/>
                  <DR label="Neto" value={$(p.neto)}/>
                  <DR label="IVA" value={$(p.iva)}/>
                  <DR label="Total factura" value={$(p.total_amount)} bold/>
                  <DR label="Monto pagado" value={$(p.paid_amount)} bold/>
                </div>
              </div>
            </div>
            <div style={secCard}>
              <div style={{padding:'14px 16px'}}>
                <div style={secTitle('#2563EB')}>Comprobante</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                  <DR label="N° Comprobante" value={p.receipt_number} bold/>
                  <DR label="Fecha pago" value={fd(p.payment_date)}/>
                  <DR label="Banco" value={p.banco} span/>
                  <DR label="Medio pago" value={p.payment_method}/>
                  <DR label="Pagador" value={p.payer_name} span/>
                </div>
              </div>
            </div>
            <div style={secCard}>
              <div style={{padding:'14px 16px'}}>
                <div style={secTitle('#374151')}>Vehículo</div>
                {motoImg(p)&&(
                  <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12,padding:'10px 14px',background:'#F9FAFB',borderRadius:10,border:'1px solid #E5E7EB'}}>
                    <img src={motoImg(p)} alt="" style={{width:80,height:60,objectFit:'contain',borderRadius:8,border:'1px solid #E5E7EB',background:'#ffffff'}}/>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:'#111827'}}>{p.catalog_name||p.model}</div>
                      {p.color&&<div style={{fontSize:11,color:'#6B7280'}}>{p.color} {p.commercial_year?`- ${p.commercial_year}`:''}</div>}
                    </div>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                  <DR label="Marca" value={p.brand}/>
                  <DR label="Modelo" value={p.model} bold/>
                  <DR label="Color" value={p.color}/>
                  <DR label="Año" value={p.commercial_year}/>
                  <DR label="N° Motor" value={p.motor_num}/>
                  <DR label="N° Chasis" value={p.chassis}/>
                </div>
              </div>
            </div>
            {p.notes&&<div style={{...S.card,fontSize:12,color:'#374151',marginBottom:12}}>{p.notes}</div>}
            {(p.invoice_url||p.receipt_url)&&(
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {p.invoice_url&&<a href={p.invoice_url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:8,textDecoration:'none',fontSize:12,fontWeight:600,color:'#C2410C',fontFamily:'inherit'}}><Ic.file size={13}/> Factura</a>}
                {p.receipt_url&&<a href={p.receipt_url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,textDecoration:'none',fontSize:12,fontWeight:600,color:'#1D4ED8',fontFamily:'inherit'}}><Ic.file size={13}/> Comprobante</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Mobile card ────────────────────────────────────────────────────────── */
function MobileCard({ p, onClick }) {
  const dv = due(p);
  const st = pagoStatus(p);
  const img = motoImg(p);
  return (
    <div onClick={onClick} style={{
      ...S.card,
      cursor:'pointer',
      marginBottom:10,
      borderLeft:`3px solid ${st.c}`,
      paddingLeft:13,
    }}>
      <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
        {img&&<img src={img} alt="" style={{width:44,height:34,objectFit:'contain',borderRadius:6,border:'1px solid #E5E7EB',background:'#F9FAFB',flexShrink:0}}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:13,color:'#111827',letterSpacing:'-0.2px'}}>{p.invoice_number||'—'}</div>
          {(p.catalog_name||p.model)&&<div style={{fontSize:11,fontWeight:600,color:'#374151',marginTop:1}}>{p.catalog_name||p.model}</div>}
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontWeight:800,fontSize:14,color:'#111827'}}>{$(p.total_amount)}</div>
          <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px 12px',fontSize:12}}>
        {p.color&&<div><span style={lbl9}>Color</span><span style={{color:'#374151'}}>{p.color}</span></div>}
        {p.commercial_year&&<div><span style={lbl9}>Año</span><span style={{color:'#374151'}}>{p.commercial_year}</span></div>}
        {dv&&<div><span style={{...lbl9,color:pagoStatus(p).l==='Vencido'?'#DC2626':'#9CA3AF'}}>Venc.</span><span style={{fontWeight:pagoStatus(p).l==='Vencido'?700:400,color:pagoStatus(p).l==='Vencido'?'#DC2626':'#374151'}}>{fd(dv)}</span></div>}
        {p.paid_amount&&<div><span style={lbl9}>Pagado</span><strong style={{color:'#15803D'}}>{$(p.paid_amount)}</strong></div>}
        {p.chassis&&<div><span style={lbl9}>Chasis</span><span style={{fontSize:11,color:'#111827'}}>{p.chassis}</span></div>}
        {p.motor_num&&<div><span style={lbl9}>Motor</span><span style={{fontSize:11,color:'#111827'}}>{p.motor_num}</span></div>}
      </div>
    </div>
  );
}

/* ── Desktop table row ──────────────────────────────────────────────────── */
const TABLE_COLS = '230px minmax(200px,1fr) 130px 130px 110px 110px 110px';

function TableHeader() {
  const cols = ['Factura / Fecha','Modelo / Vehículo','Total','Pagado','Venc.','Pago','Estado'];
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: TABLE_COLS,
      padding:'8px 16px',
      background:'#F9FAFB',
      borderBottom:'2px solid #E5E7EB',
      borderRadius:'12px 12px 0 0',
    }}>
      {cols.map(col=>(
        <div key={col} style={{
          fontSize:10, fontWeight:700, color:'#9CA3AF',
          textTransform:'uppercase', letterSpacing:'0.08em',
        }}>{col}</div>
      ))}
    </div>
  );
}

function TableRow({ p, onClick }) {
  const [hov,setHov]=useState(false);
  const dv = due(p);
  const ov = dv && !p.paid_amount && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  const st = pagoStatus(p);
  const img = motoImg(p);
  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        display:'grid',
        gridTemplateColumns: TABLE_COLS,
        padding:'11px 16px',
        borderBottom:'1px solid #F3F4F6',
        alignItems:'center',
        cursor:'pointer',
        background: hov ? '#FAFAFA' : '#FFFFFF',
        transition:'background 120ms',
        gap:0,
      }}>

      {/* Factura / Fecha */}
      <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
        {img
          ? <img src={img} alt="" style={{width:40,height:30,objectFit:'contain',borderRadius:6,border:'1px solid #E5E7EB',background:'#F9FAFB',flexShrink:0}}/>
          : <div style={{width:40,height:30,borderRadius:6,border:'1px dashed #E5E7EB',background:'#F9FAFB',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ic.bike size={14} color="#D1D5DB"/></div>
        }
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:'#F28100',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>#{p.invoice_number||'—'}</div>
          <div style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>{fd(p.invoice_date)}</div>
        </div>
      </div>

      {/* Modelo */}
      <div style={{minWidth:0,paddingRight:12}}>
        <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.catalog_name||p.model||'—'}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3,flexWrap:'wrap'}}>
          {p.color&&<ColorChip color={p.color}/>}
          {p.commercial_year&&<span style={{fontSize:10,fontWeight:700,color:'#4F46E5',background:'#EEF2FF',padding:'1px 7px',borderRadius:20,border:'1px solid #C7D2FE'}}>{p.commercial_year}</span>}
          {!p.model_id&&(p.brand||p.model)&&<span style={{fontSize:9,fontWeight:700,color:'#B45309',background:'#FEF3C7',padding:'1px 6px',borderRadius:20,border:'1px solid #FDE68A',textTransform:'uppercase',letterSpacing:'0.04em'}}>Sin catálogo</span>}
        </div>
      </div>

      {/* Total */}
      <div style={{fontSize:13,fontWeight:700,color:'#111827'}}>{$(p.total_amount)}</div>

      {/* Pagado */}
      <div style={{fontSize:13,fontWeight:600,color:p.paid_amount?'#15803D':'#D1D5DB'}}>{$(p.paid_amount)}</div>

      {/* Vencimiento */}
      <div style={{fontSize:12,fontWeight:ov?700:400,color:ov?'#DC2626':'#374151'}}>{fd(dv)}</div>

      {/* Fecha pago */}
      <div style={{fontSize:12,color:p.payment_date?'#374151':'#D1D5DB'}}>{p.payment_date?fd(p.payment_date):'—'}</div>

      {/* Estado */}
      <div>
        <Bdg l={st.l} c={st.c} bg={st.bg} size="sm"/>
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

  // Estilo compartido para controles de filtro compactos
  const fc = {
    ...S.inp,
    height:34,
    padding:'0 10px',
    fontSize:12,
    width:'auto',
    lineHeight:'34px',
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
            <button onClick={sync} disabled={syncing} style={S.btn2}>
              <Ic.refresh size={14} color={syncing?'#9CA3AF':'#374151'}/>{syncing?'Sincronizando...':'Sincronizar con Drive'}
            </button>
            <button onClick={()=>setShowNew(true)} style={S.btn}>
              <Ic.plus size={14}/> Nuevo pago
            </button>
          </>
        )}
      />

      {/* Sync banner */}
      {syncRes&&(
        <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,fontSize:12,fontFamily:'inherit',background:syncRes.ok?'#F0FDF4':'#FEF2F2',border:`1px solid ${syncRes.ok?'#BBF7D0':'#FECACA'}`,color:syncRes.ok?'#166534':'#991B1B',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {syncRes.ok?`Sincronización exitosa: ${syncRes.created} nuevos, ${syncRes.updated} actualizados`:syncRes.error}
          <button onClick={()=>setSyncRes(null)} style={{...S.gh,marginLeft:'auto',padding:4,lineHeight:1}}><Ic.x size={14}/></button>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div style={{
        display:'flex', gap:10, flexWrap:'wrap', marginBottom:16,
      }}>
        {[
          { label:'Registros', val:sorted.length,    color:'#374151', isMoney:false, sub: sorted.length!==data.length?`de ${data.length} total`:null },
          { label:'Motos',     val:sum.motos,        color:'#374151', isMoney:false },
          { label:'Facturado', val:sum.total,        color:'#374151', isMoney:true  },
          { label:'Pagado',    val:sum.paid,         color:'#15803D', isMoney:true  },
          { label:'Saldo',     val:saldo,            color:saldo>0?'#DC2626':'#15803D', isMoney:true },
          { label:'Vencidas',  val:sum.overdue,      color:sum.overdue>0?'#DC2626':'#374151', isMoney:false },
        ].map(k=>(
          <div key={k.label} style={{
            background:'#FFFFFF', border:'1px solid #E5E7EB',
            borderRadius:10, padding:'10px 16px',
            flex: isMobile ? '1 1 calc(50% - 5px)' : '1 1 100px',
          }}>
            <div style={{fontSize:18, fontWeight:800, color:k.color, lineHeight:1, marginBottom:3}}>
              {k.isMoney ? $(k.val) : k.val}
            </div>
            <div style={{fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.07em'}}>
              {k.label}
            </div>
            {k.sub&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:2}}>{k.sub}</div>}
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
            <span style={{fontSize:12,color:'#9CA3AF'}}>{filtersOpen?'▲':'▼'}</span>
          </button>
          {filtersOpen&&(
            <div style={{
              background:'#F9FAFB', border:'1px solid #E5E7EB',
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
                <button onClick={clearFilters} style={{...S.gh,justifyContent:'center',width:'100%',fontSize:12}}>
                  <Ic.x size={13}/> Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Desktop: barra compacta de una línea */
        <div style={{
          display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
          background:'#F9FAFB', border:'1px solid #E5E7EB',
          borderRadius:10, padding:'8px 14px', marginBottom:14,
        }}>
          {/* Buscador */}
          <div style={{display:'flex',alignItems:'center',gap:7,flex:'1 1 200px',minWidth:160}}>
            <Ic.search size={14} color="#9CA3AF"/>
            <input value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Factura, modelo, color, chasis, motor…"
              style={{...S.inp,border:'none',background:'transparent',flex:1,padding:0,height:30,fontSize:13}}/>
          </div>
          <div style={{width:1,height:22,background:'#E5E7EB',flexShrink:0}}/>
          {/* Estado */}
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Estado</label>
            <select value={stF} onChange={e=>setStF(e.target.value)} style={fc}>
              <option value="">Todos</option>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
          {/* Emisión */}
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Emisión desde</label>
            <input type="date" value={fromF} onChange={e=>setFromF(e.target.value)} style={{...fc,minWidth:128}}/>
          </div>
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>hasta</label>
            <input type="date" value={toF} onChange={e=>setToF(e.target.value)} style={{...fc,minWidth:128}}/>
          </div>
          {/* Pago */}
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Pago desde</label>
            <input type="date" value={payFromF} onChange={e=>setPayFromF(e.target.value)} style={{...fc,minWidth:128}}/>
          </div>
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>hasta</label>
            <input type="date" value={payToF} onChange={e=>setPayToF(e.target.value)} style={{...fc,minWidth:128}}/>
          </div>
          {/* Marca */}
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Marca</label>
            <select value={brF} onChange={e=>setBrF(e.target.value)} style={fc}>
              <option value="">Todas</option>
              {brands.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {/* Ordenar */}
          <div>
            <label style={{...S.lbl,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Ordenar</label>
            <div style={{display:'flex',gap:5}}>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={fc}>
                <option value="payment_date">Fecha pago</option>
                <option value="due_date">Vencimiento</option>
                <option value="invoice_date">Emisión</option>
                <option value="paid_amount">Monto pagado</option>
                <option value="total_amount">Total</option>
              </select>
              <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}
                title={sortDir==='asc'?'Ascendente':'Descendente'}
                style={{...S.btn2,padding:'0 10px',height:34,fontSize:13,fontWeight:700}}>
                {sortDir==='asc'?'↑':'↓'}
              </button>
            </div>
          </div>
          {/* Limpiar */}
          {hasFilters&&(
            <button onClick={clearFilters} style={{...S.gh,height:34,padding:'0 10px',fontSize:12}}>
              <Ic.x size={13}/> Limpiar
            </button>
          )}
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
              action={hasFilters&&<button onClick={clearFilters} style={S.btn2}>Limpiar filtros</button>}
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
                action={hasFilters&&<button onClick={clearFilters} style={S.btn2}>Limpiar filtros</button>}
              />
            </div>
          )}
          {!loading && sorted.length>0 && (
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <TableHeader/>
              {sorted.map(p=>(
                <TableRow key={p.id} p={p} onClick={()=>{setEditFromList(false);setSel(p);}}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer — conteo + resumen */}
      {!loading && sorted.length>0 && (
        <div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:11,color:'#9CA3AF',fontFamily:'inherit',flexWrap:'wrap',gap:6}}>
          <span>{sorted.length} de {data.length} registro{data.length!==1?'s':''}</span>
          <span>
            Facturado: <strong style={{color:'#111827'}}>{$(sum.total)}</strong>
            {' · '}Pagado: <strong style={{color:'#15803D'}}>{$(sum.paid)}</strong>
            {' · '}Saldo: <strong style={{color:saldo>0?'#C2410C':'#111827'}}>{$(saldo)}</strong>
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
