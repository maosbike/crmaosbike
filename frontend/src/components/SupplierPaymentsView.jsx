import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal } from '../ui.jsx';

/* ── Typography ─────────────────────────────────────────────────────────────── */
const FONT = "Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
/* MONO eliminado de tabla — misma tipografía que Leads/Inventario */
const T = { fontFamily: FONT, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' };

const EMPTY = () => ({
  invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', neto:'', iva:'', paid_amount:'',
  receipt_number:'', payer_name:'', banco:'', payment_method:'',
  brand:'', model:'', color:'', commercial_year:'',
  motor_num:'', chassis:'', internal_code:'',
  invoice_url:'', receipt_url:'', notes:'',
});

function $(n) {
  if (!n && n !== 0) return '—';
  return '$\u2009' + parseInt(n).toLocaleString('es-CL');
}
function fd(s) {
  if (!s) return '—';
  const [y,m,d] = String(s).slice(0,10).split('-');
  return (!y||!m||!d) ? '—' : `${d}-${m}-${y}`;
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

/* ── Form field ─────────────────────────────────────────────────────────────── */
function F({ label, value, onChange, type='text', half, hl }) {
  return (
    <div style={{ gridColumn: half?'auto':'1/-1' }}>
      <label style={{ ...T,fontSize:10,fontWeight:500,color:hl?'#92400E':'#71717A',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4 }}>
        {label}{hl?' *':''}
      </label>
      <input type={type} value={value||''} onChange={e=>onChange?.(e.target.value)}
        style={{ ...T,width:'100%',fontSize:13,padding:'8px 10px',border:'1px solid '+(hl?'#FCD34D':'#E4E4E7'),borderRadius:6,background:'#FAFAFA',color:'#18181B',outline:'none',boxSizing:'border-box' }}/>
    </div>
  );
}

/* ── File upload zone ───────────────────────────────────────────────────────── */
function FileZone({ label, file, onFile, url, onUrl, accent='#F28100' }) {
  const [mode, setMode] = useState(url?'url':'upload');
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ ...T,border:`1.5px solid ${drag?accent:'#E4E4E7'}`,borderRadius:8,padding:14,background:'#FAFAFA' }}>
      <div style={{ fontSize:10,fontWeight:600,color:'#71717A',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex',gap:6,marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ ...T,fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:20,cursor:'pointer',border:`1.5px solid ${mode===m?accent:'#E4E4E7'}`,background:mode===m?accent:'#fff',color:mode===m?'#fff':'#71717A' }}>{l}</button>
        ))}
      </div>
      {mode==='upload' ? (
        <label onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0])}}
          style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'16px 12px',border:`2px dashed ${drag?accent:'#D4D4D8'}`,borderRadius:8,cursor:'pointer' }}>
          <Ic.file size={16} color={drag?accent:'#A1A1AA'}/>
          <span style={{ ...T,fontSize:12,color:'#71717A' }}>{file?<strong style={{color:'#18181B'}}>{file.name}</strong>:'Arrastrá o clickeá'}</span>
          <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0])}}/>
        </label>
      ) : (
        <input value={url} onChange={e=>onUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..."
          style={{ ...T,width:'100%',fontSize:12,padding:'8px 10px',border:'1px solid #E4E4E7',borderRadius:6,background:'#fff',outline:'none',boxSizing:'border-box' }}/>
      )}
    </div>
  );
}

function Sec({ title, children }) {
  return <div style={{ marginBottom:18 }}><div style={{ ...T,fontSize:10,fontWeight:600,color:'#A1A1AA',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8 }}>{title}</div>{children}</div>;
}

function DR({ label, value, bold, span }) {
  if (!value && value!==0) return null;
  return (
    <div style={{ gridColumn:span?'1/-1':'auto',padding:'6px 0',borderBottom:'1px solid #F4F4F5' }}>
      <div style={{ ...T,fontSize:10,color:'#A1A1AA',letterSpacing:'.04em',marginBottom:2 }}>{label}</div>
      <div style={{ ...T,fontSize:13,fontWeight:bold?600:400,color:'#18181B' }}>{value}</div>
    </div>
  );
}

/* ── New payment modal ──────────────────────────────────────────────────────── */
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
    if(!invFile&&!recFile){setErr('Subí al menos un archivo');return;}
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

  if(step===3)return(
    <Modal onClose={onClose} title="Registro creado">
      <div style={{textAlign:'center',padding:'30px 0'}}>
        <div style={{width:44,height:44,borderRadius:'50%',background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Ic.check size={22} color="#15803D"/></div>
        <div style={{...T,fontSize:15,fontWeight:600,color:'#18181B',marginBottom:8}}>Pago registrado</div>
        <button onClick={onClose} style={{...S.btn,...T,padding:'8px 28px'}}>Cerrar</button>
      </div>
    </Modal>
  );

  return(
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos'} wide>
      {step===1&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{...T,fontSize:12,color:'#71717A',background:'#FAFAFA',border:'1px solid #E4E4E7',borderRadius:8,padding:'10px 14px'}}>Subí los PDF o pegá los links de Google Drive.</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            <FileZone label="Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl}/>
            <FileZone label="Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>
          {err&&<div style={{...T,color:'#DC2626',fontSize:12,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'6px 10px'}}>{err}</div>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={extract} disabled={busy} style={{...S.btn,...T,flex:2,minWidth:140}}>{busy?'Analizando...':'Analizar y extraer datos'}</button>
            <button onClick={()=>{const nf={...EMPTY()};if(invUrl)nf.invoice_url=invUrl;if(recUrl)nf.receipt_url=recUrl;setForm(f=>({...f,...nf}));setHl({});setStep(2);}} style={{...S.btn2,...T,flex:1,minWidth:100}}>Manual</button>
          </div>
        </div>
      )}
      {step===2&&(
        <div style={{maxHeight:'74vh',overflowY:'auto',paddingRight:4}}>
          {Object.keys(hl).length>0&&<div style={{...T,background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'8px 14px',marginBottom:14,fontSize:11,color:'#92400E'}}>Campos con * fueron extraídos. Revisá antes de guardar.</div>}
          <Sec title="Factura">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Factura" value={form.invoice_number} onChange={s('invoice_number')} half hl={!!hl.invoice_number}/>
              <F label="Fecha emisión" value={form.invoice_date} onChange={s('invoice_date')} type="date" half hl={!!hl.invoice_date}/>
              <F label="Fecha vencimiento" value={form.due_date} onChange={s('due_date')} type="date" half hl={!!hl.due_date}/>
              <F label="Neto ($)" value={form.neto} onChange={s('neto')} type="number" half hl={!!hl.neto}/>
              <F label="IVA ($)" value={form.iva} onChange={s('iva')} type="number" half hl={!!hl.iva}/>
              <F label="Total factura ($)" value={form.total_amount} onChange={s('total_amount')} type="number" half hl={!!hl.total_amount}/>
              <F label="Monto pagado ($)" value={form.paid_amount} onChange={s('paid_amount')} type="number" half hl={!!hl.paid_amount}/>
            </div>
          </Sec>
          <Sec title="Comprobante">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={s('receipt_number')} half hl={!!hl.receipt_number}/>
              <F label="Fecha pago" value={form.payment_date} onChange={s('payment_date')} type="date" half hl={!!hl.payment_date}/>
              <F label="Banco" value={form.banco} onChange={s('banco')} hl={!!hl.banco}/>
              <F label="Medio de pago" value={form.payment_method} onChange={s('payment_method')} half hl={!!hl.payment_method}/>
              <F label="Pagador" value={form.payer_name} onChange={s('payer_name')} half hl={!!hl.payer_name}/>
            </div>
          </Sec>
          <Sec title="Vehículo">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="Marca" value={form.brand} onChange={s('brand')} half hl={!!hl.brand}/>
              <F label="Modelo" value={form.model} onChange={s('model')} half hl={!!hl.model}/>
              <F label="Color" value={form.color} onChange={s('color')} half hl={!!hl.color}/>
              <F label="Año" value={form.commercial_year} onChange={s('commercial_year')} type="number" half hl={!!hl.commercial_year}/>
              <F label="N° Motor" value={form.motor_num} onChange={s('motor_num')} half hl={!!hl.motor_num}/>
              <F label="N° Chasis" value={form.chassis} onChange={s('chassis')} half hl={!!hl.chassis}/>
            </div>
          </Sec>
          <Sec title="Archivos">
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
              <F label="URL Factura" value={form.invoice_url} onChange={s('invoice_url')} hl={!!hl.invoice_url}/>
              <F label="URL Comprobante" value={form.receipt_url} onChange={s('receipt_url')} hl={!!hl.receipt_url}/>
              <F label="Notas" value={form.notes} onChange={s('notes')}/>
            </div>
          </Sec>
          {err&&<div style={{...T,color:'#DC2626',fontSize:12,marginTop:6}}>{err}</div>}
          <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
            <button onClick={()=>setStep(1)} style={{...S.btn2,...T,flex:1,minWidth:80}}>Volver</button>
            <button onClick={save} disabled={saving} style={{...S.btn,...T,flex:2,minWidth:140}}>{saving?'Guardando...':'Guardar registro'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Detail / edit modal ────────────────────────────────────────────────────── */
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
    <Modal onClose={onClose} title={`Factura ${p.invoice_number||'—'}`} wide>
      <div style={{maxHeight:'78vh',overflowY:'auto',paddingRight:4}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          {overdue&&<span style={{...T,fontSize:11,fontWeight:600,color:'#DC2626',background:'#FEF2F2',padding:'3px 10px',borderRadius:20}}>Vencido</span>}
          <span style={{flex:1}}/>
          {!editing&&<button onClick={startEdit} style={{...S.btn2,...T,padding:'5px 14px',fontSize:12}}>Editar</button>}
          {canDel&&!editing&&<button onClick={()=>setCD(true)} style={{...S.btn2,...T,padding:'5px 14px',fontSize:12,color:'#EF4444',borderColor:'#FECACA'}}>Eliminar</button>}
        </div>
        {cd&&(
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:12,marginBottom:12}}>
            <div style={{...T,fontSize:12,fontWeight:600,color:'#EF4444',marginBottom:8}}>¿Eliminar este registro?</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={del} disabled={deleting} style={{...S.btn,...T,background:'#EF4444',padding:'5px 14px',fontSize:12}}>{deleting?'Eliminando...':'Confirmar'}</button>
              <button onClick={()=>setCD(false)} style={{...S.btn2,...T,padding:'5px 14px',fontSize:12}}>Cancelar</button>
            </div>
          </div>
        )}
        {editing ? (
          <div>
            <Sec title="Factura"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Factura" value={form.invoice_number} onChange={st('invoice_number')} half/>
              <F label="Fecha emisión" value={form.invoice_date} onChange={st('invoice_date')} type="date" half/>
              <F label="Vencimiento" value={form.due_date} onChange={st('due_date')} type="date" half/>
              <F label="Neto ($)" value={form.neto} onChange={st('neto')} type="number" half/>
              <F label="IVA ($)" value={form.iva} onChange={st('iva')} type="number" half/>
              <F label="Total ($)" value={form.total_amount} onChange={st('total_amount')} type="number" half/>
              <F label="Monto pagado ($)" value={form.paid_amount} onChange={st('paid_amount')} type="number" half/>
            </div></Sec>
            <Sec title="Comprobante"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={st('receipt_number')} half/>
              <F label="Fecha pago" value={form.payment_date} onChange={st('payment_date')} type="date" half/>
              <F label="Banco" value={form.banco} onChange={st('banco')}/>
              <F label="Medio pago" value={form.payment_method} onChange={st('payment_method')} half/>
              <F label="Pagador" value={form.payer_name} onChange={st('payer_name')} half/>
            </div></Sec>
            <Sec title="Vehículo"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10}}>
              <F label="Marca" value={form.brand} onChange={st('brand')} half/>
              <F label="Modelo" value={form.model} onChange={st('model')} half/>
              <F label="Color" value={form.color} onChange={st('color')} half/>
              <F label="Año" value={form.commercial_year} onChange={st('commercial_year')} type="number" half/>
              <F label="N° Motor" value={form.motor_num} onChange={st('motor_num')} half/>
              <F label="N° Chasis" value={form.chassis} onChange={st('chassis')} half/>
            </div></Sec>
            <Sec title="Archivos / notas"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
              <F label="URL Factura" value={form.invoice_url} onChange={st('invoice_url')}/>
              <F label="URL Comprobante" value={form.receipt_url} onChange={st('receipt_url')}/>
              <F label="Notas" value={form.notes} onChange={st('notes')}/>
            </div></Sec>
            <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
              <button onClick={save} disabled={saving} style={{...S.btn,...T,flex:2,minWidth:120}}>{saving?'Guardando...':'Guardar'}</button>
              <button onClick={()=>setEditing(false)} style={{...S.btn2,...T,flex:1,minWidth:80}}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <Sec title="Factura"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              <DR label="N° Factura" value={p.invoice_number} bold/>
              <DR label="Fecha emisión" value={fd(p.invoice_date)}/>
              <DR label="Vencimiento" value={fd(dv)} bold={overdue}/>
              <DR label="Neto" value={$(p.neto)}/>
              <DR label="IVA" value={$(p.iva)}/>
              <DR label="Total factura" value={$(p.total_amount)} bold/>
              <DR label="Monto pagado" value={$(p.paid_amount)} bold/>
            </div></Sec>
            <Sec title="Comprobante"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              <DR label="N° Comprobante" value={p.receipt_number} bold/>
              <DR label="Fecha pago" value={fd(p.payment_date)}/>
              <DR label="Banco" value={p.banco} span/>
              <DR label="Medio pago" value={p.payment_method}/>
              <DR label="Pagador" value={p.payer_name} span/>
            </div></Sec>
            <Sec title="Vehículo"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
              <DR label="Marca" value={p.brand}/>
              <DR label="Modelo" value={p.model} bold/>
              <DR label="Color" value={p.color}/>
              <DR label="Año" value={p.commercial_year}/>
              <DR label="N° Motor" value={p.motor_num}/>
              <DR label="N° Chasis" value={p.chassis}/>
            </div></Sec>
            {p.notes&&<div style={{...T,background:'#FAFAFA',border:'1px solid #E4E4E7',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#3F3F46',marginTop:4}}>{p.notes}</div>}
            {(p.invoice_url||p.receipt_url)&&(
              <div style={{marginTop:14,display:'flex',gap:8,flexWrap:'wrap'}}>
                {p.invoice_url&&<a href={p.invoice_url} target="_blank" rel="noreferrer" style={{...T,display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:8,textDecoration:'none',fontSize:12,fontWeight:600,color:'#C2410C'}}><Ic.file size={13}/> Factura</a>}
                {p.receipt_url&&<a href={p.receipt_url} target="_blank" rel="noreferrer" style={{...T,display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,textDecoration:'none',fontSize:12,fontWeight:600,color:'#1D4ED8'}}><Ic.file size={13}/> Comprobante</a>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Mobile card ────────────────────────────────────────────────────────────── */
function Card({ p, onClick }) {
  const dv = due(p);
  const ov = dv && new Date(dv.slice(0,10)+'T12:00:00') < new Date();
  return (
    <div onClick={onClick} style={{ ...T,background:'#fff',border:'1px solid #E4E4E7',borderRadius:10,padding:'14px 16px',cursor:'pointer',marginBottom:10 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
        <span style={{ ...T,fontWeight:700,fontSize:13,color:'#18181B' }}>{p.invoice_number||'—'}</span>
        <span style={{ flex:1 }}/>
        <span style={{ fontWeight:700,fontSize:14,color:'#18181B' }}>{$(p.total_amount)}</span>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px',fontSize:12 }}>
        <div><span style={{color:'#A1A1AA',fontSize:10}}>MODELO</span> <strong style={{color:'#18181B'}}>{p.model||'—'}</strong></div>
        <div><span style={{color:'#A1A1AA',fontSize:10}}>COLOR</span> <span style={{color:'#3F3F46'}}>{p.color||'—'}</span></div>
        <div><span style={{color:'#A1A1AA',fontSize:10}}>AÑO</span> <span style={{color:'#3F3F46'}}>{p.commercial_year||'—'}</span></div>
        <div><span style={{color:'#A1A1AA',fontSize:10,fontWeight:ov?600:400,color:ov?'#DC2626':'#A1A1AA'}}>VENC.</span> <span style={{fontWeight:ov?600:400,color:ov?'#DC2626':'#3F3F46'}}>{fd(dv)}</span></div>
        {p.chassis&&<div style={{gridColumn:'1/-1'}}><span style={{color:'#A1A1AA',fontSize:10}}>CHASIS</span> <span style={{...T,fontSize:11,color:'#18181B'}}>{p.chassis}</span></div>}
        {p.motor_num&&<div style={{gridColumn:'1/-1'}}><span style={{color:'#A1A1AA',fontSize:10}}>MOTOR</span> <span style={{...T,fontSize:11,color:'#18181B'}}>{p.motor_num}</span></div>}
        {p.paid_amount&&<div><span style={{color:'#A1A1AA',fontSize:10}}>PAGADO</span> <strong style={{color:'#15803D'}}>{$(p.paid_amount)}</strong></div>}
      </div>
    </div>
  );
}

/* ── Main view ──────────────────────────────────────────────────────────────── */
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

  /* ── Table cell style helper — NO monospace en tabla, misma fuente que Leads/Inventario ── */
  const c  = (extra) => ({ ...T, padding:'10px 8px', whiteSpace:'nowrap', fontSize:12, ...extra });
  const ca = (extra) => ({ ...c(extra), textAlign:'right' });

  /* Columns definition: [header, width, visibility] */
  /* lg=all, md=subset */
  const showAll = bp==='lg';

  return (
    <div style={{ ...T,flex:1,display:'flex',flexDirection:'column',minHeight:0 }}>

      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:14,flexWrap:'wrap' }}>
        <div>
          <h1 style={{ ...T,margin:0,fontSize:bp==='sm'?16:20,fontWeight:700,color:'#18181B',letterSpacing:'-0.02em' }}>Pagos a proveedor</h1>
          {pending>0&&<div style={{ ...T,fontSize:11,color:'#92400E',marginTop:4 }}>{pending} sin monto pagado registrado</div>}
        </div>
        <div style={{flex:1}}/>
        {canCreate&&(
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={sync} disabled={syncing} style={{...S.btn2,...T,display:'flex',alignItems:'center',gap:6,fontWeight:600,fontSize:12}}>
              <Ic.refresh size={13} color={syncing?'#A1A1AA':'#52525B'}/>{syncing?'Sincronizando...':'Sync Drive'}
            </button>
            <button onClick={()=>setShowNew(true)} style={{...S.btn,...T,display:'flex',alignItems:'center',gap:6}}>
              <Ic.plus size={14}/> Nuevo pago
            </button>
          </div>
        )}
      </div>

      {/* Sync banner */}
      {syncRes&&(
        <div style={{...T,marginBottom:12,padding:'10px 14px',borderRadius:8,fontSize:12,background:syncRes.ok?'#F0FDF4':'#FEF2F2',border:`1px solid ${syncRes.ok?'#BBF7D0':'#FECACA'}`,color:syncRes.ok?'#166534':'#991B1B',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          {syncRes.ok?`Sync OK — ${syncRes.created} nuevos, ${syncRes.updated} actualizados`:syncRes.error}
          <button onClick={()=>setSyncRes(null)} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:.5,lineHeight:1}}>×</button>
        </div>
      )}

      {/* Search */}
      <div style={{marginBottom:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, chasis, modelo, motor..."
          style={{...T,width:'100%',maxWidth:360,fontSize:13,padding:'9px 12px',border:'1px solid #E4E4E7',borderRadius:8,background:'#fff',outline:'none',boxSizing:'border-box',color:'#18181B'}}/>
      </div>

      {/* Mobile: cards */}
      {bp==='sm' ? (
        <div style={{flex:1,overflowY:'auto'}}>
          {loading&&<div style={{...T,padding:32,textAlign:'center',color:'#A1A1AA'}}>Cargando...</div>}
          {!loading&&data.length===0&&<div style={{...T,padding:48,textAlign:'center',color:'#A1A1AA',fontWeight:500}}>Sin registros</div>}
          {!loading&&data.map(p=><Card key={p.id} p={p} onClick={()=>setSel(p)}/>)}
        </div>
      ) : (
        /* Desktop / tablet: table */
        <div style={{flex:1,overflowY:'auto',border:'1px solid #E4E4E7',borderRadius:10,background:'#fff'}}>
          <table style={{...T,width:'100%',borderCollapse:'collapse',tableLayout:'auto'}}>
            <thead>
              <tr style={{background:'#FAFAF8',borderBottom:'1px solid #E4E4E7',position:'sticky',top:0,zIndex:1}}>
                {[
                  ['N° Fact.', true],
                  ['Modelo', true],
                  ['Color', true],
                  ['Año', true],
                  ['N° Chasis', true],
                  ['N° Motor', true],
                  ['Neto', showAll],
                  ['IVA', showAll],
                  ['Total', true],
                  ['F. Factura', showAll],
                  ['Vencimiento', true],
                  ['F. Pago', showAll],
                  ['M. Pagado', true],
                  ['Medio', showAll],
                  ['Banco', showAll],
                  ['N° Comp.', showAll],
                  ['Docs', true],
                ].filter(([,v])=>v).map(([h])=>(
                  <th key={h} style={{...T,padding:'10px 8px',textAlign:['Neto','IVA','Total','M. Pagado'].includes(h)?'right':'left',fontSize:10,fontWeight:600,color:'#71717A',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap',background:'#FAFAF8'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading&&<tr><td colSpan={99} style={{...T,padding:40,textAlign:'center',color:'#A1A1AA'}}>Cargando...</td></tr>}
              {!loading&&data.length===0&&<tr><td colSpan={99} style={{...T,padding:56,textAlign:'center',color:'#A1A1AA'}}><div style={{fontWeight:600,marginBottom:4}}>Sin registros</div><div style={{fontSize:11}}>Registrá el primer pago</div></td></tr>}
              {!loading&&data.map(p=>{
                const dv=due(p);
                const ov=dv&&new Date(dv.slice(0,10)+'T12:00:00')<new Date();
                return(
                  <tr key={p.id} onClick={()=>setSel(p)} style={{borderBottom:'1px solid #F4F4F5',cursor:'pointer'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={c({fontWeight:700,color:'#18181B'})}>{p.invoice_number||'—'}</td>
                    <td style={c({fontWeight:600,color:'#18181B'})}>{p.model||'—'}</td>
                    <td style={c({color:'#3F3F46'})}>{p.color||'—'}</td>
                    <td style={c({color:'#3F3F46'})}>{p.commercial_year||'—'}</td>
                    <td style={c({color:'#18181B',fontSize:11})}>{p.chassis||'—'}</td>
                    <td style={c({color:'#18181B',fontSize:11})}>{p.motor_num||'—'}</td>
                    {showAll&&<td style={ca({color:'#71717A'})}>{$(p.neto)}</td>}
                    {showAll&&<td style={ca({color:'#71717A'})}>{$(p.iva)}</td>}
                    <td style={ca({fontWeight:600,color:'#18181B'})}>{$(p.total_amount)}</td>
                    {showAll&&<td style={c({color:'#A1A1AA',fontSize:11})}>{fd(p.invoice_date)}</td>}
                    <td style={c({fontSize:11,fontWeight:ov?600:400,color:ov?'#DC2626':'#A1A1AA'})}>{fd(dv)}</td>
                    {showAll&&<td style={c({color:'#A1A1AA',fontSize:11})}>{fd(p.payment_date)}</td>}
                    <td style={ca({fontWeight:600,color:p.paid_amount?'#15803D':'#D4D4D8'})}>{$(p.paid_amount)}</td>
                    {showAll&&<td style={c({color:'#71717A',fontSize:11,maxWidth:80,overflow:'hidden',textOverflow:'ellipsis'})}>{p.payment_method||'—'}</td>}
                    {showAll&&<td style={c({color:'#71717A',fontSize:11,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis'})}>{p.banco||'—'}</td>}
                    {showAll&&<td style={c({color:'#71717A',fontSize:11})}>{p.receipt_number||'—'}</td>}
                    <td style={c()}>
                      <div style={{display:'flex',gap:4}}>
                        {p.invoice_url&&<a href={p.invoice_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{...T,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'#FFF7ED',border:'1px solid #FED7AA',color:'#C2410C',textDecoration:'none'}}>F</a>}
                        {p.receipt_url&&<a href={p.receipt_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{...T,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#1D4ED8',textDecoration:'none'}}>C</a>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {!loading&&data.length>0&&(
        <div style={{...T,display:'flex',justifyContent:'space-between',marginTop:8,fontSize:11,color:'#A1A1AA'}}>
          <span>{data.length} registro{data.length!==1?'s':''}</span>
          <span>Total: <strong style={{color:'#18181B'}}>{$(data.reduce((s,p)=>s+(parseInt(p.total_amount)||0),0))}</strong></span>
        </div>
      )}

      {showNew&&<NewModal onClose={()=>setShowNew(false)} onCreated={p=>{setData(d=>[p,...d]);setShowNew(false);}}/>}
      {sel&&<DetailModal payment={sel} canDel={canDel} onClose={()=>setSel(null)}
        onUpdated={p=>{setData(d=>d.map(x=>x.id===p.id?p:x));setSel(p);}}
        onDeleted={id=>{setData(d=>d.filter(x=>x.id!==id));setSel(null);}}/>}
    </div>
  );
}
