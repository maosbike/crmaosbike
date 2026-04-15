import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Bdg, ROLES, hasRole, ROLE_ADMIN_WRITE } from '../ui.jsx';

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

function useBP() {
  const calc = () => { const w=window.innerWidth; return w<640?'sm':w<1080?'md':'lg'; };
  const [bp,setBp] = useState(calc);
  useEffect(()=>{ const fn=()=>setBp(calc); window.addEventListener('resize',fn); return ()=>window.removeEventListener('resize',fn); },[]);
  return bp;
}

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
const COLOR_HEX = {negro:'#18181B',blanco:'#F9FAFB',rojo:'#EF4444',azul:'#3B82F6',gris:'#6B7280',plata:'#9CA3AF',plateado:'#9CA3AF',verde:'#10B981',amarillo:'#F59E0B',naranja:'#F97316',celeste:'#38BDF8',violeta:'#8B5CF6',morado:'#8B5CF6',rosa:'#EC4899',marron:'#92400E',cafe:'#92400E'};
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

/* ── Catalog model picker — devuelve el modelo completo (con colores y fotos) ─ */
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

/* ── Color picker constreñido a los colores del modelo de catálogo ──────── */
// Si el modelo existe en catálogo, listamos la unión de `colors` + `color_photos[].color`
// y dejamos solo esos valores como opciones. Si el registro tiene un color "viejo"
// que no matchea, se preserva pero marcado como "fuera de catálogo" hasta que
// el usuario elija uno válido.
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
          Color actual "{cur}" no está en el catálogo — elegí uno válido.
        </div>
      )}
    </div>
  );
}

/* ── Shared inline style tokens (matching CRM palette) ─────────────────── */
const lbl9 = { display:'block', fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:5 };
const secTitle = (color='#374151') => ({ fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.14em', paddingBottom:7, marginBottom:10, borderBottom:`2px solid ${color}22` });
const secCard = { background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden', marginBottom:12 };

/* ── Form field (uses S.inp / S.lbl from ui.jsx) ──────────────────────── */
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

/* ── File upload zone ──────────────────────────────────────────────────── */
function FileZone({ label, file, onFile, url, onUrl, accent='#F28100' }) {
  const [mode, setMode] = useState(url?'url':'upload');
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ ...S.card, border:`1.5px solid ${drag?accent:'#E5E7EB'}`, padding:14 }}>
      <div style={lbl9}>{label}</div>
      <div style={{ display:'flex',gap:6,marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ fontFamily:'inherit',fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:20,cursor:'pointer',border:`1.5px solid ${mode===m?accent:'#D1D5DB'}`,background:mode===m?accent:'#fff',color:mode===m?'#fff':'#6B7280' }}>{l}</button>
        ))}
      </div>
      {mode==='upload' ? (
        <label onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0])}}
          style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'16px 12px',border:`2px dashed ${drag?accent:'#D1D5DB'}`,borderRadius:8,cursor:'pointer' }}>
          <Ic.file size={16} color={drag?accent:'#9CA3AF'}/>
          <span style={{ fontFamily:'inherit',fontSize:12,color:'#6B7280' }}>{file?<strong style={{color:'#0F172A'}}>{file.name}</strong>:'Arrastra o haz click'}</span>
          <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0])}}/>
        </label>
      ) : (
        <input value={url} onChange={e=>onUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..."
          style={{ ...S.inp, width:'100%' }}/>
      )}
    </div>
  );
}

/* ── Section wrapper ───────────────────────────────────────────────────── */
function Sec({ title, color, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={secTitle(color)}>{title}</div>
      {children}
    </div>
  );
}

/* ── Detail row ────────────────────────────────────────────────────────── */
function DR({ label, value, bold, span }) {
  if (!value && value!==0) return null;
  return (
    <div style={{ gridColumn:span?'1/-1':'auto', padding:'6px 0', borderBottom:'1px solid #F3F4F6' }}>
      <div style={lbl9}>{label}</div>
      <div style={{ fontFamily:'inherit', fontSize:13, fontWeight:bold?700:400, color:'#0F172A' }}>{value}</div>
    </div>
  );
}

/* ── New payment modal ─────────────────────────────────────────────────── */
function NewModal({ onClose, onCreated }) {
  const [step,setStep]=useState(1);
  const [invFile,setInvFile]=useState(null);
  const [recFile,setRecFile]=useState(null);
  const [invUrl,setInvUrl]=useState('');
  const [recUrl,setRecUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState(EMPTY());
  const [modelRow,setModelRow]=useState(null);  // modelo completo del catálogo
  const [hl,setHl]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const s=k=>v=>setForm(f=>({...f,[k]:v}));
  const pickModel = (m) => {
    setModelRow(m);
    if (m) {
      setForm(f=>({...f, model_id: m.id, brand: m.brand, model: m.commercial_name||m.model,
        // Si el color actual no está en el catálogo del nuevo modelo, lo limpiamos.
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
        <div style={{fontFamily:'inherit',fontSize:15,fontWeight:700,color:'#0F172A',marginBottom:12}}>Pago registrado</div>
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
          {err&&<div style={{color:'#EF4444',fontSize:12,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'6px 10px',fontFamily:'inherit'}}>{err}</div>}
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
          <Sec title="Vehiculo" color="#374151">
            <div style={{marginBottom:10}}>
              <CatalogModelPicker brand={form.brand} model={form.model_id} onSelect={pickModel}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <div>
                <label style={{...S.lbl, fontSize:10, fontWeight:600, color:hl.color?'#92400E':'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color{hl.color?' *':''}</label>
                <CatalogColorPicker modelRow={modelRow} value={form.color} onChange={s('color')}/>
              </div>
              <F label="Ano" value={form.commercial_year} onChange={s('commercial_year')} type="number" half hl={!!hl.commercial_year}/>
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
          {err&&<div style={{color:'#EF4444',fontSize:12,marginTop:6,fontFamily:'inherit'}}>{err}</div>}
          <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
            <button onClick={()=>setStep(1)} style={{...S.btn2,flex:1,minWidth:80}}>Volver</button>
            <button onClick={save} disabled={saving} style={{...S.btn,flex:2,minWidth:140}}>{saving?'Guardando...':'Guardar registro'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Detail / edit modal ───────────────────────────────────────────────── */
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
  const [cd,setCD]=useState(false);
  const [deleting,setDel]=useState(false);
  // modelRow = modelo del catálogo actualmente asociado (para el ColorPicker).
  // Se hidrata desde los campos catalog_* que vienen del JOIN backend.
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
    setSaving(true);
    try{
      // Enviamos solo los campos editables + model_id explícito (incluso si es '' → null backend).
      // Evitamos enviar catalog_* y metadatos que el backend igual ignora.
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
    }catch(e){alert(e.message);}finally{setSaving(false);}
  };
  const del=async()=>{setDel(true);try{await api.deleteSupplierPayment(p.id);onDeleted(p.id);onClose();}catch(e){alert(e.message);setDel(false);setCD(false);}};

  const dv = due(p);
  const overdue = dv && new Date(dv.slice(0,10)+'T12:00:00') < new Date();

  return (
    <Modal onClose={onClose} title={`Factura ${p.invoice_number||'-'}`} wide>
      <div style={{maxHeight:'78vh',overflowY:'auto',paddingRight:4}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          {overdue&&<Bdg l="Vencido" c="#EF4444" bg="rgba(239,68,68,0.12)"/>}
          {p.paid_amount&&<Bdg l="Pagado" c="#15803D" bg="rgba(21,128,61,0.12)"/>}
          <span style={{flex:1}}/>
          {!editing&&<button onClick={startEdit} style={{...S.btn2,padding:'5px 14px',fontSize:12}}>Editar</button>}
          {canDel&&!editing&&<button onClick={()=>setCD(true)} style={{...S.btn2,padding:'5px 14px',fontSize:12,color:'#EF4444',borderColor:'#FECACA'}}>Eliminar</button>}
        </div>
        {cd&&(
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:12,marginBottom:12}}>
            <div style={{fontFamily:'inherit',fontSize:12,fontWeight:700,color:'#EF4444',marginBottom:8}}>Eliminar este registro?</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={del} disabled={deleting} style={{...S.btn,background:'#EF4444',padding:'5px 14px',fontSize:12}}>{deleting?'Eliminando...':'Confirmar'}</button>
              <button onClick={()=>setCD(false)} style={{...S.btn2,padding:'5px 14px',fontSize:12}}>Cancelar</button>
            </div>
          </div>
        )}
        {editing ? (
          <div>
            <Sec title="Factura" color="#F28100"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Factura" value={form.invoice_number} onChange={st('invoice_number')} half/>
              <F label="Fecha emision" value={form.invoice_date} onChange={st('invoice_date')} type="date" half/>
              <F label="Vencimiento" value={form.due_date} onChange={st('due_date')} type="date" half/>
              <F label="Neto ($)" value={form.neto} onChange={st('neto')} type="number" half/>
              <F label="IVA ($)" value={form.iva} onChange={st('iva')} type="number" half/>
              <F label="Total ($)" value={form.total_amount} onChange={st('total_amount')} type="number" half/>
              <F label="Monto pagado ($)" value={form.paid_amount} onChange={st('paid_amount')} type="number" half/>
            </div></Sec>
            <Sec title="Comprobante" color="#2563EB"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={st('receipt_number')} half/>
              <F label="Fecha pago" value={form.payment_date} onChange={st('payment_date')} type="date" half/>
              <F label="Banco" value={form.banco} onChange={st('banco')}/>
              <F label="Medio pago" value={form.payment_method} onChange={st('payment_method')} half/>
              <F label="Pagador" value={form.payer_name} onChange={st('payer_name')} half/>
            </div></Sec>
            <Sec title="Vehiculo" color="#374151">
              <div style={{marginBottom:10}}>
                <CatalogModelPicker brand={form.brand} model={form.model_id} onSelect={pickModel}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
                <div>
                  <label style={{...S.lbl, fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em'}}>Color</label>
                  <CatalogColorPicker modelRow={modelRow} value={form.color} onChange={st('color')}/>
                </div>
                <F label="Ano" value={form.commercial_year} onChange={st('commercial_year')} type="number" half/>
                <F label="N° Motor" value={form.motor_num} onChange={st('motor_num')} half/>
                <F label="N° Chasis" value={form.chassis} onChange={st('chassis')} half/>
              </div>
            </Sec>
            <Sec title="Archivos / notas" color="#6B7280"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
              <F label="URL Factura" value={form.invoice_url} onChange={st('invoice_url')}/>
              <F label="URL Comprobante" value={form.receipt_url} onChange={st('receipt_url')}/>
              <F label="Notas" value={form.notes} onChange={st('notes')}/>
            </div></Sec>
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
                <div style={secTitle('#374151')}>Vehiculo</div>
                {motoImg(p)&&(
                  <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12,padding:'10px 14px',background:'#F9FAFB',borderRadius:10,border:'1px solid #E5E7EB'}}>
                    <img src={motoImg(p)} alt="" style={{width:80,height:60,objectFit:'contain',borderRadius:8,border:'1px solid #E5E7EB',background:'#fff'}}/>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:'#0F172A'}}>{p.catalog_name||p.model}</div>
                      {p.color&&<div style={{fontSize:11,color:'#6B7280'}}>{p.color} {p.commercial_year?`- ${p.commercial_year}`:''}</div>}
                    </div>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                  <DR label="Marca" value={p.brand}/>
                  <DR label="Modelo" value={p.model} bold/>
                  <DR label="Color" value={p.color}/>
                  <DR label="Ano" value={p.commercial_year}/>
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

/* ── Mobile card (matches S.card from ui.jsx) ──────────────────────────── */
function Card({ p, onClick }) {
  const dv = due(p);
  const ov = dv && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  const img = motoImg(p);
  return (
    <div onClick={onClick} style={{ ...S.card, cursor:'pointer', marginBottom:10 }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
        {img&&<img src={img} alt="" style={{width:48,height:36,objectFit:'contain',borderRadius:6,border:'1px solid #E5E7EB',background:'#F9FAFB',flexShrink:0}}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:'inherit',fontWeight:800,fontSize:13,color:'#0F172A'}}>{p.invoice_number||'-'}</div>
          {p.model&&<div style={{fontSize:11,fontWeight:600,color:'#374151'}}>{p.catalog_name||p.model}</div>}
        </div>
        <span style={{ fontWeight:800,fontSize:14,color:'#0F172A' }}>{$(p.total_amount)}</span>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px',fontSize:12,fontFamily:'inherit' }}>
        <div><span style={lbl9}>Color</span> <span style={{color:'#374151'}}>{p.color||'-'}</span></div>
        <div><span style={lbl9}>Ano</span> <span style={{color:'#374151'}}>{p.commercial_year||'-'}</span></div>
        <div><span style={{...lbl9,color:ov?'#EF4444':undefined}}>Venc.</span> <span style={{fontWeight:ov?700:400,color:ov?'#EF4444':'#374151'}}>{fd(dv)}</span></div>
        {p.paid_amount&&<div><span style={lbl9}>Pagado</span> <strong style={{color:'#15803D'}}>{$(p.paid_amount)}</strong></div>}
        {p.chassis&&<div><span style={lbl9}>Chasis</span> <span style={{fontSize:11,color:'#0F172A'}}>{p.chassis}</span></div>}
        {p.motor_num&&<div><span style={lbl9}>Motor</span> <span style={{fontSize:11,color:'#0F172A'}}>{p.motor_num}</span></div>}
      </div>
      {(ov||p.paid_amount)&&(
        <div style={{display:'flex',gap:6,marginTop:10}}>
          {ov&&<Bdg l="Vencido" c="#EF4444" bg="rgba(239,68,68,0.12)"/>}
          {p.paid_amount&&<Bdg l="Pagado" c="#15803D" bg="rgba(21,128,61,0.12)"/>}
        </div>
      )}
    </div>
  );
}

/* ── Summary card ─────────────────────────────────────────────────────── */
function SumCard({ label, value, sub, color='#0F172A', bg='#FFFFFF' }) {
  return (
    <div style={{ ...S.card, padding:'12px 14px', background:bg, display:'flex', flexDirection:'column', gap:3 }}>
      <div style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</div>
      <div style={{ fontSize:17, fontWeight:900, color, letterSpacing:'-0.3px' }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#94A3B8', fontWeight:500 }}>{sub}</div>}
    </div>
  );
}

/* ── Main view ─────────────────────────────────────────────────────────── */
export function SupplierPaymentsView({ user }) {
  const canDel  = hasRole(user, ROLES.SUPER);
  const canCreate = hasRole(user, ...ROLE_ADMIN_WRITE);
  const canEdit   = canCreate;
  const bp = useBP();

  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);
  const [sel,setSel]=useState(null);
  const [editFromList,setEditFromList]=useState(false); // abrir modal directo en modo edit
  const [syncing,setSyncing]=useState(false);
  const [syncRes,setSyncRes]=useState(null);

  // Filtros locales (se aplican sobre `data` ya cargado)
  const [q,setQ]=useState('');
  const [stF,setStF]=useState('');            // '', 'pagado', 'pendiente'
  const [fromF,setFromF]=useState('');
  const [toF,setToF]=useState('');
  const [payFromF,setPayFromF]=useState('');  // fecha_pago desde
  const [payToF,setPayToF]=useState('');      // fecha_pago hasta
  const [brF,setBrF]=useState('');
  // Por defecto ordenamos por Fecha de pago desc — es el criterio más útil
  // cuando la vista se usa para auditar pagos ya realizados.
  const [sortBy,setSortBy]=useState('payment_date');   // payment_date | invoice_date | due_date | total_amount | paid_amount
  const [sortDir,setSortDir]=useState('desc');

  // Paginado: trae todas las páginas (chunks de 500) — la vista filtra en cliente.
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

  // ── Filtrado + orden (cliente) ──────────────────────────────────────────
  const brands = Array.from(new Set(data.map(p=>p.brand).filter(Boolean))).sort();

  const norm = (s) => (s||'').toString().toLowerCase();
  const qn = norm(q.trim());
  const filtered = data.filter(p=>{
    // Búsqueda amplia — todos los campos relevantes
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
      // Si se pide rango de fecha_pago y el registro no tiene → queda fuera
      if (!pd) return false;
      if (payFromF && pd < payFromF) return false;
      if (payToF   && pd > payToF)   return false;
    }
    return true;
  });
  // Ordena comparando por el tipo de dato real — fechas como timestamp,
  // montos como número. Registros con valor faltante quedan al final
  // en cualquier dirección (no contaminan el orden con un 0 o un '').
  const isDateSort   = ['payment_date','invoice_date','due_date'].includes(sortBy);
  const isNumberSort = ['total_amount','paid_amount'].includes(sortBy);
  const rawVal = (p) => {
    if (sortBy === 'due_date') return due(p);
    return p[sortBy];
  };
  const toCmp = (v) => {
    if (v == null || v === '') return null;
    if (isDateSort) {
      const d = new Date(String(v).slice(0,10) + 'T12:00:00').getTime();
      return isNaN(d) ? null : d;
    }
    if (isNumberSort) {
      const n = parseInt(v);
      return isNaN(n) ? null : n;
    }
    return String(v).toLowerCase();
  };
  const sorted = [...filtered].sort((a,b)=>{
    const na = toCmp(rawVal(a));
    const nb = toCmp(rawVal(b));
    // Nulos siempre al final, independientemente de asc/desc
    if (na == null && nb == null) return 0;
    if (na == null) return 1;
    if (nb == null) return -1;
    if (na < nb) return sortDir==='asc' ? -1 : 1;
    if (na > nb) return sortDir==='asc' ?  1 : -1;
    return 0;
  });

  // ── Resumen (sobre filtrados) ──────────────────────────────────────────
  const sum = sorted.reduce((acc,p)=>{
    const tot = parseInt(p.total_amount)||0;
    const paid= parseInt(p.paid_amount)||0;
    const dv = due(p);
    const ov = dv && !p.paid_amount && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
    acc.total  += tot;
    acc.paid   += paid;
    acc.motos  += (p.chassis || p.motor_num || p.model_id ? 1 : 0);
    if (ov) acc.overdue++;
    return acc;
  }, { total:0, paid:0, motos:0, overdue:0 });
  const saldo = Math.max(0, sum.total - sum.paid);

  const pending = data.filter(p=>!p.paid_amount).length;

  const hasFilters = q || stF || fromF || toF || payFromF || payToF || brF;
  const clearFilters = () => { setQ(''); setStF(''); setFromF(''); setToF(''); setPayFromF(''); setPayToF(''); setBrF(''); };

  const ctrl = { height:32, borderRadius:7, border:'1.5px solid #E5E7EB', background:'#FFFFFF', color:'#374151', fontSize:12, padding:'0 8px', fontFamily:'inherit', outline:'none' };
  const flt  = { fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3, display:'block' };

  return (
    <div style={{ fontFamily:'Inter,system-ui,sans-serif',flex:1,display:'flex',flexDirection:'column',minHeight:0 }}>

      {/* Header — matches Leads/Tickets h1 style */}
      <div style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:16,flexWrap:'wrap' }}>
        <div>
          <h1 style={{ margin:0,fontSize:bp==='sm'?16:20,fontWeight:800,color:'#0F172A',letterSpacing:'-0.4px' }}>Pagos a proveedor</h1>
          {pending>0&&<p style={{ color:'#94A3B8',fontSize:12,margin:'3px 0 0',fontWeight:500 }}>{pending} sin monto pagado registrado</p>}
        </div>
        <div style={{flex:1}}/>
        {canCreate&&(
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={sync} disabled={syncing} style={{...S.btn2,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600}}>
              <Ic.refresh size={14} color={syncing?'#9CA3AF':'#374151'}/>{syncing?'Sincronizando...':'Sync Drive'}
            </button>
            <button onClick={()=>setShowNew(true)} style={{...S.btn,display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:700}}>
              <Ic.plus size={14}/> Nuevo pago
            </button>
          </div>
        )}
      </div>

      {/* Sync banner */}
      {syncRes&&(
        <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,fontSize:12,fontFamily:'inherit',background:syncRes.ok?'#F0FDF4':'#FEF2F2',border:`1px solid ${syncRes.ok?'#BBF7D0':'#FECACA'}`,color:syncRes.ok?'#166534':'#991B1B',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {syncRes.ok?`Sync OK: ${syncRes.created} nuevos, ${syncRes.updated} actualizados`:syncRes.error}
          <button onClick={()=>setSyncRes(null)} style={{...S.gh,marginLeft:'auto',fontSize:18,opacity:.5,lineHeight:1,padding:4}}>x</button>
        </div>
      )}

      {/* ── Resumen (sobre lista filtrada) ── */}
      <div style={{ display:'grid', gridTemplateColumns: bp==='sm' ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap:10, marginBottom:14 }}>
        <SumCard label="Registros" value={sorted.length} sub={sorted.length!==data.length?`de ${data.length}`:null}/>
        <SumCard label="Motos"     value={sum.motos}/>
        <SumCard label="Facturado" value={$(sum.total)}/>
        <SumCard label="Pagado"    value={$(sum.paid)} color="#15803D"/>
        <SumCard label="Saldo"     value={$(saldo)} color={saldo>0?'#C2410C':'#15803D'}/>
        <SumCard label="Vencidas"  value={sum.overdue} color={sum.overdue>0?'#EF4444':'#0F172A'}/>
      </div>

      {/* ── Filtros ── */}
      <div style={{ ...S.card, padding:'12px 14px', marginBottom:14, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:'1 1 240px', minWidth:200 }}>
          <Ic.search size={15} color="#9CA3AF"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Factura, comprobante, proveedor, modelo, color, chasis, motor, banco…"
            style={{...S.inp, border:'none', background:'transparent', flex:1, padding:0, height:30, fontSize:13}}/>
        </div>
        <div>
          <label style={flt}>Estado</label>
          <select value={stF} onChange={e=>setStF(e.target.value)} style={ctrl}>
            <option value="">Todos</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
        <div>
          <label style={flt}>Emisión desde</label>
          <input type="date" value={fromF} onChange={e=>setFromF(e.target.value)} style={{...ctrl, minWidth:130}}/>
        </div>
        <div>
          <label style={flt}>Emisión hasta</label>
          <input type="date" value={toF} onChange={e=>setToF(e.target.value)} style={{...ctrl, minWidth:130}}/>
        </div>
        <div>
          <label style={flt}>Pago desde</label>
          <input type="date" value={payFromF} onChange={e=>setPayFromF(e.target.value)} style={{...ctrl, minWidth:130}}/>
        </div>
        <div>
          <label style={flt}>Pago hasta</label>
          <input type="date" value={payToF} onChange={e=>setPayToF(e.target.value)} style={{...ctrl, minWidth:130}}/>
        </div>
        <div>
          <label style={flt}>Marca</label>
          <select value={brF} onChange={e=>setBrF(e.target.value)} style={ctrl}>
            <option value="">Todas</option>
            {brands.map(b=><option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={flt}>Ordenar por</label>
          <div style={{ display:'flex', gap:6 }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={ctrl}>
              <option value="payment_date">Fecha de pago</option>
              <option value="due_date">Vencimiento</option>
              <option value="invoice_date">Fecha emisión</option>
              <option value="paid_amount">Monto pagado</option>
              <option value="total_amount">Total factura</option>
            </select>
            <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}
              title={sortDir==='asc'?'Ascendente':'Descendente'}
              style={{...ctrl, cursor:'pointer', padding:'0 10px', fontWeight:700, color:'#374151'}}>
              {sortDir==='asc'?'↑':'↓'}
            </button>
          </div>
        </div>
        {hasFilters && <button onClick={clearFilters} style={{ ...ctrl, cursor:'pointer', padding:'0 10px', fontWeight:600, color:'#6B7280', background:'#F9FAFB' }}>Limpiar</button>}
      </div>

      {/* Mobile: cards */}
      {bp==='sm' ? (
        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:'#9CA3AF',fontFamily:'inherit'}}>Cargando...</div>}
          {!loading&&sorted.length===0&&<div style={{padding:48,textAlign:'center',color:'#9CA3AF',fontWeight:500,fontFamily:'inherit'}}>{hasFilters?'Sin resultados con estos filtros':'Sin registros'}</div>}
          {!loading&&sorted.map(p=><Card key={p.id} p={p} onClick={()=>{setEditFromList(false);setSel(p);}}/>)}
        </div>
      ) : (
        /* Desktop / tablet — card-rows, no tabla plana */
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}}>
          {loading&&<div style={{padding:40,textAlign:'center',color:'#9CA3AF'}}>Cargando...</div>}
          {!loading&&sorted.length===0&&<div style={{...S.card,padding:48,textAlign:'center',color:'#9CA3AF'}}><div style={{fontWeight:700,marginBottom:4}}>{hasFilters?'Sin resultados con estos filtros':'Sin registros'}</div><div style={{fontSize:12}}>{hasFilters?<button onClick={clearFilters} style={{background:'none',border:'none',color:'#F28100',fontSize:12,cursor:'pointer',textDecoration:'underline',padding:0,fontFamily:'inherit'}}>Limpiar filtros</button>:'Registra el primer pago con Drive o manualmente'}</div></div>}
          {!loading&&sorted.map(p=>{
            const dv=due(p);
            const ov=dv && !p.paid_amount && new Date(dv.slice(0,10)+'T12:00:00')<new Date();
            const img=motoImg(p);
            const col = { display:'flex',flexDirection:'column',justifyContent:'center' };
            const lbl = { fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:3 };
            // Layout elástico — flex-wrap en lugar de anchos fijos.
            // flex-basis define el "ancho ideal" pero las celdas pueden encoger o
            // envolver según el ancho disponible.
            return (
              <div key={p.id} onClick={()=>{setEditFromList(false);setSel(p);}}
                style={{...S.card,padding:0,display:'flex',alignItems:'stretch',cursor:'pointer',overflow:'hidden',minHeight:0,flexWrap:'wrap'}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.09)';}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow=S.card.boxShadow;}}>

                {/* ── IZQUIERDO: foto grande + factura + fecha ── */}
                <div style={{...col,flex:'1 1 230px',maxWidth:280,alignItems:'center',gap:10,padding:'14px 14px',background:'#F9FAFB',borderRight:'1px solid #F1F5F9'}}>
                  {img
                    ? <img src={img} alt="" style={{width:'100%',height:160,objectFit:'contain',borderRadius:10,border:'1px solid #E5E7EB',background:'#fff'}}/>
                    : <div style={{width:'100%',height:160,borderRadius:10,border:'1px dashed #D1D5DB',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}><Ic.bike size={54} color="#D1D5DB"/></div>
                  }
                  <div style={{textAlign:'center',marginTop:2}}>
                    <div style={{fontWeight:900,fontSize:14,color:'#F28100',letterSpacing:'-0.2px'}}>#{p.invoice_number||'—'}</div>
                    <div style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>{fd(p.invoice_date)}</div>
                  </div>
                </div>

                {/* ── CENTRAL: modelo + chips + chasis/motor ── */}
                <div style={{...col,flex:'2 1 260px',minWidth:0,padding:'16px 22px',gap:8,borderRight:'1px solid #F1F5F9'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{fontWeight:800,fontSize:17,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.3px',lineHeight:1.2,flex:1,minWidth:0}}>
                      {p.catalog_name||p.model||'—'}
                    </div>
                    {!p.model_id && (p.brand||p.model) && (
                      <span title="Sin asociar al catálogo" style={{ flexShrink:0, fontSize:9, fontWeight:700, color:'#B45309', background:'#FEF3C7', border:'1px solid #FDE68A', padding:'2px 7px', borderRadius:20, letterSpacing:'0.04em', textTransform:'uppercase' }}>Sin catálogo</span>
                    )}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginTop:2}}>
                    <ColorChip color={p.color}/>
                    {p.commercial_year&&<span style={{fontSize:11,fontWeight:700,color:'#4F46E5',background:'#EEF2FF',padding:'2px 9px',borderRadius:20,border:'1px solid #C7D2FE'}}>{p.commercial_year}</span>}
                  </div>
                  {(p.chassis||p.motor_num)&&(
                    <div style={{display:'flex',gap:28,paddingTop:8,borderTop:'1px solid #F1F5F9',marginTop:4,flexWrap:'wrap'}}>
                      {p.chassis&&<div style={{minWidth:0}}>
                        <div style={lbl}>Chasis</div>
                        <div style={{fontSize:12,fontWeight:600,color:'#1E293B',letterSpacing:'0.01em',wordBreak:'break-all'}}>{p.chassis}</div>
                      </div>}
                      {p.motor_num&&<div style={{minWidth:0}}>
                        <div style={lbl}>Motor</div>
                        <div style={{fontSize:12,fontWeight:600,color:'#1E293B',letterSpacing:'0.01em',wordBreak:'break-all'}}>{p.motor_num}</div>
                      </div>}
                    </div>
                  )}
                </div>

                {/* ── DERECHO: grilla horizontal equilibrada, elástica ── */}
                <div style={{...col,flex:'3 1 340px',minWidth:260,padding:'16px 20px',gap:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(90px, 1fr))',gap:'10px 14px',alignItems:'start'}}>
                    <div style={{minWidth:0}}>
                      <div style={lbl}>Total factura</div>
                      <div style={{fontSize:15,fontWeight:900,color:'#0F172A',letterSpacing:'-0.3px',overflow:'hidden',textOverflow:'ellipsis'}}>{$(p.total_amount)}</div>
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={lbl}>Monto pagado</div>
                      <div style={{fontSize:14,fontWeight:700,color:p.paid_amount?'#15803D':'#CBD5E1',overflow:'hidden',textOverflow:'ellipsis'}}>{$(p.paid_amount)}</div>
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{...lbl,color:ov?'#EF4444':'#9CA3AF'}}>Vencimiento</div>
                      <div style={{fontSize:12,fontWeight:ov?700:500,color:ov?'#EF4444':'#374151'}}>{fd(dv)}</div>
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={lbl}>Fecha pago</div>
                      <div style={{fontSize:12,color:p.payment_date?'#374151':'#CBD5E1'}}>{p.payment_date?fd(p.payment_date):'—'}</div>
                    </div>
                  </div>
                  {/* Documentos — siempre abajo a la derecha del bloque de acciones.
                      Espaciador superior mantiene la posición estable aunque no haya docs. */}
                  <div style={{flex:1,minHeight:0}}/>
                  <div style={{display:'flex',gap:6,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap',minHeight:26}}>
                    {p.invoice_url&&<a href={p.invoice_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                      style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'5px 10px',borderRadius:6,background:'#FFF7ED',border:'1px solid #FED7AA',color:'#C2410C',textDecoration:'none',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                      <Ic.file size={11}/> Factura
                    </a>}
                    {p.receipt_url&&<a href={p.receipt_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                      style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'5px 10px',borderRadius:6,background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#1D4ED8',textDecoration:'none',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                      <Ic.file size={11}/> Comprobante
                    </a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!loading&&sorted.length>0&&(
        <div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:11,color:'#9CA3AF',fontFamily:'inherit'}}>
          <span>{sorted.length} de {data.length} registro{data.length!==1?'s':''}</span>
          <span>Facturado: <strong style={{color:'#0F172A'}}>{$(sum.total)}</strong> · Pagado: <strong style={{color:'#15803D'}}>{$(sum.paid)}</strong> · Saldo: <strong style={{color:saldo>0?'#C2410C':'#0F172A'}}>{$(saldo)}</strong></span>
        </div>
      )}

      {showNew&&<NewModal onClose={()=>setShowNew(false)} onCreated={p=>{setData(d=>[p,...d]);setShowNew(false);}}/>}
      {sel&&<DetailModal payment={sel} canDel={canDel} startInEdit={editFromList} onClose={()=>{setSel(null);setEditFromList(false);}}
        onUpdated={p=>{setData(d=>d.map(x=>x.id===p.id?p:x));setSel(p);}}
        onDeleted={id=>{setData(d=>d.filter(x=>x.id!==id));setSel(null);}}/>}
    </div>
  );
}
