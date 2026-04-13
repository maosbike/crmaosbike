import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, Bdg } from '../ui.jsx';

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const EMPTY = () => ({
  invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', neto:'', iva:'', paid_amount:'',
  receipt_number:'', payer_name:'', banco:'', payment_method:'',
  brand:'', model:'', color:'', commercial_year:'',
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
  // Try color_photos match first, then catalog main image
  if (p.catalog_color_photos && p.color) {
    const cp = (typeof p.catalog_color_photos === 'string' ? JSON.parse(p.catalog_color_photos) : p.catalog_color_photos) || [];
    const match = cp.find(c => c.color && p.color && c.color.toLowerCase() === p.color.toLowerCase());
    if (match?.url) return match.url;
  }
  return p.catalog_image || null;
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
  const [hl,setHl]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const s=k=>v=>setForm(f=>({...f,[k]:v}));

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
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="Marca" value={form.brand} onChange={s('brand')} half hl={!!hl.brand}/>
              <F label="Modelo" value={form.model} onChange={s('model')} half hl={!!hl.model}/>
              <F label="Color" value={form.color} onChange={s('color')} half hl={!!hl.color}/>
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
function DetailModal({ payment:p0, onClose, onUpdated, onDeleted, canDel }) {
  const [p,setP]=useState(p0);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [cd,setCD]=useState(false);
  const [deleting,setDel]=useState(false);
  const st=k=>v=>setForm(f=>({...f,[k]:v}));

  const startEdit=()=>{setForm({...p,invoice_date:p.invoice_date?.slice(0,10)||'',due_date:p.due_date?.slice(0,10)||'',payment_date:p.payment_date?.slice(0,10)||''});setEditing(true);};
  const save=async()=>{setSaving(true);try{const u=await api.updateSupplierPayment(p.id,form);setP(u);onUpdated(u);setEditing(false);}catch(e){alert(e.message);}finally{setSaving(false);}};
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
            <Sec title="Vehiculo" color="#374151"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="Marca" value={form.brand} onChange={st('brand')} half/>
              <F label="Modelo" value={form.model} onChange={st('model')} half/>
              <F label="Color" value={form.color} onChange={st('color')} half/>
              <F label="Ano" value={form.commercial_year} onChange={st('commercial_year')} type="number" half/>
              <F label="N° Motor" value={form.motor_num} onChange={st('motor_num')} half/>
              <F label="N° Chasis" value={form.chassis} onChange={st('chassis')} half/>
            </div></Sec>
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
        {p.chassis&&<div style={{gridColumn:'1/-1'}}><span style={lbl9}>Chasis</span> <span style={{fontSize:11,color:'#0F172A'}}>{p.chassis}</span></div>}
        {p.motor_num&&<div style={{gridColumn:'1/-1'}}><span style={lbl9}>Motor</span> <span style={{fontSize:11,color:'#0F172A'}}>{p.motor_num}</span></div>}
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

/* ── Main view ─────────────────────────────────────────────────────────── */
export function SupplierPaymentsView({ user }) {
  const canDel  = user.role==='super_admin';
  const canCreate = ['super_admin','admin_comercial','backoffice'].includes(user.role);
  const bp = useBP();

  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);
  const [sel,setSel]=useState(null);
  const [q,setQ]=useState('');
  const [syncing,setSyncing]=useState(false);
  const [syncRes,setSyncRes]=useState(null);

  const load = useCallback(async()=>{
    setLoading(true);
    try{const r=await api.getSupplierPayments(q?{q}:{});setData(r.data||[]);}catch(e){console.error(e);}
    finally{setLoading(false);}
  },[q]);
  useEffect(()=>{load();},[load]);

  const sync=async()=>{
    setSyncing(true);setSyncRes(null);
    try{const r=await api.syncSupplierPaymentsFromDrive();setSyncRes({ok:true,...r});load();}
    catch(e){setSyncRes({ok:false,error:e.message});}
    finally{setSyncing(false);}
  };

  const pending = data.filter(p=>!p.paid_amount).length;

  return (
    <div style={{ fontFamily:'inherit',flex:1,display:'flex',flexDirection:'column',minHeight:0 }}>

      {/* Header — matches Leads/Tickets h1 style */}
      <div style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:20,flexWrap:'wrap' }}>
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

      {/* Search bar — matches CRM filter bar pattern */}
      <div style={{...S.card,padding:'14px 18px',marginBottom:20,display:'flex',alignItems:'center',gap:12}}>
        <Ic.search size={16} color="#9CA3AF"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, chasis, modelo, motor..."
          style={{...S.inp,border:'none',background:'transparent',width:'100%',maxWidth:400,padding:'0'}}/>
        <span style={{marginLeft:'auto',fontSize:11,color:'#9CA3AF',fontWeight:500,whiteSpace:'nowrap'}}>{data.length} registro{data.length!==1?'s':''}</span>
      </div>

      {/* Mobile: cards */}
      {bp==='sm' ? (
        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:'#9CA3AF',fontFamily:'inherit'}}>Cargando...</div>}
          {!loading&&data.length===0&&<div style={{padding:48,textAlign:'center',color:'#9CA3AF',fontWeight:500,fontFamily:'inherit'}}>Sin registros</div>}
          {!loading&&data.map(p=><Card key={p.id} p={p} onClick={()=>setSel(p)}/>)}
        </div>
      ) : (
        /* Desktop / tablet — card-rows, no tabla plana */
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}}>
          {loading&&<div style={{padding:40,textAlign:'center',color:'#9CA3AF'}}>Cargando...</div>}
          {!loading&&data.length===0&&<div style={{...S.card,padding:48,textAlign:'center',color:'#9CA3AF'}}><div style={{fontWeight:700,marginBottom:4}}>Sin registros</div><div style={{fontSize:12}}>Registra el primer pago con Drive o manualmente</div></div>}
          {!loading&&data.map(p=>{
            const dv=due(p);
            const ov=dv&&new Date(dv.slice(0,10)+'T12:00:00')<new Date();
            const img=motoImg(p);
            const zone = { padding:'12px 16px', borderRight:'1px solid #F1F5F9', display:'flex', flexDirection:'column', justifyContent:'center', gap:4 };
            return (
              <div key={p.id} onClick={()=>setSel(p)}
                style={{...S.card,padding:0,display:'flex',alignItems:'stretch',cursor:'pointer',overflow:'hidden',transition:'box-shadow 0.1s'}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.10)';}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow=S.card.boxShadow;}}>

                {/* Foto + factura */}
                <div style={{...zone, flexShrink:0, minWidth:170, maxWidth:210, gap:6}}>
                  {img
                    ? <img src={img} alt="" style={{width:70,height:52,objectFit:'contain',borderRadius:8,border:'1px solid #E5E7EB',background:'#F9FAFB'}}/>
                    : <div style={{width:70,height:52,borderRadius:8,border:'1px dashed #D1D5DB',background:'#F9FAFB',display:'flex',alignItems:'center',justifyContent:'center'}}><Ic.bike size={22} color="#D1D5DB"/></div>
                  }
                  <div style={{fontWeight:800,fontSize:13,color:'#0F172A'}}>{p.invoice_number||'-'}</div>
                  <div style={{fontSize:10,color:'#9CA3AF'}}>{fd(p.invoice_date)}</div>
                </div>

                {/* Vehículo */}
                <div style={{...zone, flex:'1 1 200px', minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.catalog_name||p.model||'-'}</div>
                  {(p.color||p.commercial_year)&&<div style={{fontSize:12,color:'#6B7280'}}>{[p.color,p.commercial_year].filter(Boolean).join(' · ')}</div>}
                  {p.chassis&&<div style={{fontSize:10,color:'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Chasis: {p.chassis}</div>}
                  {p.motor_num&&<div style={{fontSize:10,color:'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Motor: {p.motor_num}</div>}
                </div>

                {/* Montos */}
                <div style={{...zone, flexShrink:0, minWidth:160, alignItems:'flex-end', borderRight:'none'}}>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:10,color:'#9CA3AF',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Total factura</div>
                    <div style={{fontSize:16,fontWeight:800,color:'#0F172A'}}>{$(p.total_amount)}</div>
                  </div>
                  <div style={{textAlign:'right',marginTop:4}}>
                    <div style={{fontSize:10,color:'#9CA3AF',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Monto pagado</div>
                    <div style={{fontSize:14,fontWeight:700,color:p.paid_amount?'#15803D':'#D1D5DB'}}>{$(p.paid_amount)}</div>
                  </div>
                </div>

                {/* Fechas + badges + docs */}
                <div style={{...zone, flexShrink:0, minWidth:170, borderRight:'none', gap:6}}>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {ov&&<Bdg l="Vencido" c="#EF4444" bg="rgba(239,68,68,0.12)"/>}
                    {p.paid_amount&&!ov&&<Bdg l="Pagado" c="#15803D" bg="rgba(21,128,61,0.12)"/>}
                  </div>
                  <div style={{fontSize:11,color:ov?'#EF4444':'#6B7280',fontWeight:ov?700:400}}>Vence: {fd(dv)}</div>
                  {p.payment_date&&<div style={{fontSize:11,color:'#9CA3AF'}}>Pago: {fd(p.payment_date)}</div>}
                  <div style={{display:'flex',gap:6,marginTop:4}}>
                    {p.invoice_url&&<a href={p.invoice_url} target="_blank" rel="noreferrer"
                      onClick={e=>e.stopPropagation()}
                      style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:20,background:'#FFF7ED',border:'1px solid #FED7AA',color:'#C2410C',textDecoration:'none',fontFamily:'inherit'}}>
                      <Ic.file size={11}/> Factura
                    </a>}
                    {p.receipt_url&&<a href={p.receipt_url} target="_blank" rel="noreferrer"
                      onClick={e=>e.stopPropagation()}
                      style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:20,background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#1D4ED8',textDecoration:'none',fontFamily:'inherit'}}>
                      <Ic.file size={11}/> Comp.
                    </a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!loading&&data.length>0&&(
        <div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:11,color:'#9CA3AF',fontFamily:'inherit'}}>
          <span>{data.length} registro{data.length!==1?'s':''}</span>
          <span>Total: <strong style={{color:'#0F172A'}}>{$(data.reduce((s,p)=>s+(parseInt(p.total_amount)||0),0))}</strong></span>
        </div>
      )}

      {showNew&&<NewModal onClose={()=>setShowNew(false)} onCreated={p=>{setData(d=>[p,...d]);setShowNew(false);}}/>}
      {sel&&<DetailModal payment={sel} canDel={canDel} onClose={()=>setSel(null)}
        onUpdated={p=>{setData(d=>d.map(x=>x.id===p.id?p:x));setSel(p);}}
        onDeleted={id=>{setData(d=>d.filter(x=>x.id!==id));setSel(null);}}/>}
    </div>
  );
}
