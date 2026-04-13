import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal } from '../ui.jsx';

/* ── Tipografía del módulo ──────────────────────────────────────────────────── */
const FONT = "'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const MOD  = { fontFamily: FONT };

const STATUS_CFG = {
  pendiente: { label:'Pendiente', bg:'#FEF9C3', color:'#854D0E', border:'#FDE047' },
  pagado:    { label:'Pagado',    bg:'#D1FAE5', color:'#065F46', border:'#6EE7B7' },
  revisado:  { label:'Revisado',  bg:'#E0E7FF', color:'#3730A3', border:'#A5B4FC' },
};

const EMPTY = () => ({
  invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', neto:'', iva:'', paid_amount:'',
  receipt_number:'', payer_name:'', banco:'', payment_method:'',
  brand:'', model:'', color:'', commercial_year:'',
  motor_num:'', chassis:'', internal_code:'',
  invoice_url:'', receipt_url:'', notes:'', status:'pendiente',
});

/* ── Utilidades ─────────────────────────────────────────────────────────────── */
function fmtCLP(n) {
  if (!n && n !== 0) return '—';
  return '$\u202F' + parseInt(n).toLocaleString('es-CL');
}
function fDate(s) {
  if (!s) return '—';
  const [y,m,d] = String(s).slice(0,10).split('-');
  if (!y||!m||!d) return '—';
  return `${d}/${m}/${y}`;
}
function getDueDate(p) {
  if (p.due_date) return p.due_date;
  if (p.invoice_date) {
    const d = new Date(String(p.invoice_date).slice(0,10)+'T12:00:00');
    d.setMonth(d.getMonth()+1);
    return d.toISOString().slice(0,10);
  }
  return null;
}

/* ── Hook responsive ────────────────────────────────────────────────────────── */
function useIsMobile() {
  const [mobile, setMobile] = useState(()=>window.innerWidth < 768);
  useEffect(()=>{
    const fn = ()=>setMobile(window.innerWidth<768);
    window.addEventListener('resize',fn);
    return ()=>window.removeEventListener('resize',fn);
  },[]);
  return mobile;
}

/* ── Campo de formulario ────────────────────────────────────────────────────── */
function F({ label, value, onChange, type='text', half, mono, highlight }) {
  return (
    <div style={{ gridColumn: half?'auto':'1/-1' }}>
      <label style={{ ...MOD, fontSize:10, fontWeight:600, color:highlight?'#B45309':'#6B7280',
        textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:3 }}>
        {label}{highlight?' *':''}
      </label>
      <input type={type} value={value||''} onChange={e=>onChange&&onChange(e.target.value)}
        style={{ ...S.inp, ...MOD, width:'100%', fontSize:13,
          fontFamily:mono?'ui-monospace,monospace':FONT,
          borderColor:highlight?'#FCD34D':'#E5E7EB' }}/>
    </div>
  );
}

/* ── Zona de carga de archivo ───────────────────────────────────────────────── */
function FileZone({ label, file, onFile, url, onUrl, accent='#F28100' }) {
  const [mode, setMode] = useState(url?'url':'upload');
  const [drag, setDrag] = useState(false);
  return (
    <div style={{ border:`1.5px solid ${drag?accent:'#E5E7EB'}`, borderRadius:8, padding:12, background:'#FAFAFA' }}>
      <div style={{ ...MOD, fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ ...MOD, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, cursor:'pointer',
              border:`1.5px solid ${mode===m?accent:'#E5E7EB'}`,
              background:mode===m?accent:'#fff', color:mode===m?'#fff':'#6B7280' }}>{l}</button>
        ))}
      </div>
      {mode==='upload' ? (
        <label
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onFile(f);}}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'14px 10px',
            border:`2px dashed ${drag?accent:'#D1D5DB'}`, borderRadius:8, cursor:'pointer' }}>
          <Ic.file size={18} color={drag?accent:'#9CA3AF'}/>
          <span style={{ ...MOD, fontSize:12, color:'#6B7280', textAlign:'center' }}>
            {file?<strong style={{color:'#0F172A'}}>{file.name}</strong>:'Arrastrá o clickeá para subir PDF'}
          </span>
          <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0]);}}/>
        </label>
      ) : (
        <input value={url} onChange={e=>onUrl(e.target.value)}
          placeholder="https://drive.google.com/file/d/..."
          style={{ ...S.inp, ...MOD, width:'100%', fontSize:12 }}/>
      )}
    </div>
  );
}

/* ── Sección en modal ───────────────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ ...MOD, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, paddingBottom:4, borderBottom:'1px solid #F1F5F9' }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Fila de detalle ────────────────────────────────────────────────────────── */
function DRow({ label, value, mono, bold, accent, span }) {
  if (!value && value!==0) return null;
  return (
    <div style={{ gridColumn:span?'1/-1':'auto', padding:'5px 0', borderBottom:'1px solid #F3F4F6' }}>
      <div style={{ ...MOD, fontSize:10, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:1 }}>{label}</div>
      <div style={{ ...MOD, fontSize:13, fontWeight:bold?700:500, fontFamily:mono?'ui-monospace,monospace':FONT, color:accent?'#0F172A':'#374151' }}>{value}</div>
    </div>
  );
}

/* ── Modal nuevo pago ───────────────────────────────────────────────────────── */
function NewPaymentModal({ onClose, onCreated }) {
  const [step, setStep]           = useState(1);
  const [invFile, setInvFile]     = useState(null);
  const [recFile, setRecFile]     = useState(null);
  const [invUrl, setInvUrl]       = useState('');
  const [recUrl, setRecUrl]       = useState('');
  const [extracting,setExtracting]= useState(false);
  const [form, setForm]           = useState(EMPTY());
  const [hl, setHl]               = useState({});
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const handleExtract = async () => {
    if (!invFile&&!recFile) { setErr('Subí al menos un archivo'); return; }
    setExtracting(true); setErr('');
    try {
      const res = await api.extractSupplierPayment(invFile,recFile);
      const m = res.merged||{};
      const nf = {...EMPTY()}; const h = {};
      for (const [k,v] of Object.entries(m)) {
        if (v!==null&&v!==undefined&&String(v).trim()) { nf[k]=String(v); h[k]=true; }
      }
      if (invUrl) nf.invoice_url=invUrl;
      if (recUrl) nf.receipt_url=recUrl;
      setForm(f=>({...f,...nf})); setHl(h); setStep(2);
    } catch(e){ setErr(e.message||'Error al analizar'); }
    finally{ setExtracting(false); }
  };

  const handleSave = async () => {
    if (!form.invoice_number) { setErr('N° de factura obligatorio'); return; }
    setSaving(true); setErr('');
    try { const res=await api.createSupplierPayment(form); onCreated(res); setStep(3); }
    catch(e){ setErr(e.message||'Error'); setSaving(false); }
  };

  if (step===3) return (
    <Modal onClose={onClose} title="Registro creado">
      <div style={{ textAlign:'center', padding:'28px 0' }}>
        <div style={{ width:44,height:44,borderRadius:'50%',background:'#D1FAE5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px' }}>
          <Ic.check size={22} color="#065F46"/>
        </div>
        <div style={{ ...MOD,fontSize:15,fontWeight:700,color:'#0F172A',marginBottom:6 }}>Pago registrado</div>
        <button onClick={onClose} style={{ ...S.btn,...MOD,padding:'8px 28px' }}>Cerrar</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos extraídos'} wide>
      {step===1 && (
        <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
          <div style={{ ...MOD,fontSize:12,color:'#6B7280',background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:8,padding:'8px 12px' }}>
            Subí los PDF o pegá los links de Google Drive.
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12 }}>
            <FileZone label="Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl} accent="#F28100"/>
            <FileZone label="Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>
          {err&&<div style={{ ...MOD,color:'#B91C1C',fontSize:12,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'6px 10px' }}>{err}</div>}
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button onClick={handleExtract} disabled={extracting} style={{ ...S.btn,...MOD,flex:2,minWidth:140 }}>
              {extracting?'Analizando PDFs...':'Analizar y extraer datos'}
            </button>
            <button onClick={()=>{const nf={...EMPTY()};if(invUrl)nf.invoice_url=invUrl;if(recUrl)nf.receipt_url=recUrl;setForm(f=>({...f,...nf}));setHl({});setStep(2);}}
              style={{ ...S.btn2,...MOD,flex:1,minWidth:100 }}>Ingresar manualmente</button>
          </div>
        </div>
      )}
      {step===2 && (
        <div style={{ maxHeight:'72vh',overflowY:'auto',paddingRight:4 }}>
          {Object.keys(hl).length>0&&(
            <div style={{ ...MOD,background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'7px 12px',marginBottom:14,fontSize:11,color:'#92400E' }}>
              Campos con * fueron extraídos automáticamente. Revisá antes de guardar.
            </div>
          )}
          <Section title="Factura">
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
              <F label="N° Factura" value={form.invoice_number} onChange={set('invoice_number')} mono half highlight={!!hl.invoice_number}/>
              <F label="Fecha emisión" value={form.invoice_date} onChange={set('invoice_date')} type="date" half highlight={!!hl.invoice_date}/>
              <F label="Fecha vencimiento" value={form.due_date} onChange={set('due_date')} type="date" half highlight={!!hl.due_date}/>
              <F label="Neto ($)" value={form.neto} onChange={set('neto')} type="number" half highlight={!!hl.neto}/>
              <F label="IVA ($)" value={form.iva} onChange={set('iva')} type="number" half highlight={!!hl.iva}/>
              <F label="Total factura ($)" value={form.total_amount} onChange={set('total_amount')} type="number" half highlight={!!hl.total_amount}/>
              <F label="Monto pagado ($)" value={form.paid_amount} onChange={set('paid_amount')} type="number" half/>
            </div>
          </Section>
          <Section title="Comprobante de pago">
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono half highlight={!!hl.receipt_number}/>
              <F label="Fecha de pago" value={form.payment_date} onChange={set('payment_date')} type="date" half highlight={!!hl.payment_date}/>
              <F label="Banco" value={form.banco} onChange={set('banco')} highlight={!!hl.banco}/>
              <F label="Medio de pago" value={form.payment_method} onChange={set('payment_method')} half highlight={!!hl.payment_method}/>
              <F label="Nombre pagador" value={form.payer_name} onChange={set('payer_name')} highlight={!!hl.payer_name}/>
            </div>
          </Section>
          <Section title="Vehículo">
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
              <F label="Marca" value={form.brand} onChange={set('brand')} half highlight={!!hl.brand}/>
              <F label="Modelo" value={form.model} onChange={set('model')} half highlight={!!hl.model}/>
              <F label="Color" value={form.color} onChange={set('color')} half highlight={!!hl.color}/>
              <F label="Año comercial" value={form.commercial_year} onChange={set('commercial_year')} type="number" half highlight={!!hl.commercial_year}/>
              <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono half highlight={!!hl.motor_num}/>
              <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono half highlight={!!hl.chassis}/>
            </div>
          </Section>
          <Section title="Archivos y estado">
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10 }}>
              <F label="URL Factura" value={form.invoice_url} onChange={set('invoice_url')} highlight={!!hl.invoice_url}/>
              <F label="URL Comprobante" value={form.receipt_url} onChange={set('receipt_url')} highlight={!!hl.receipt_url}/>
              <F label="Notas" value={form.notes} onChange={set('notes')}/>
              <div>
                <label style={{ ...MOD,fontSize:10,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6 }}>Estado</label>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                  {Object.entries(STATUS_CFG).map(([k,v])=>(
                    <button key={k} type="button" onClick={()=>set('status')(k)}
                      style={{ ...MOD,padding:'5px 14px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                        border:`1.5px solid ${form.status===k?v.border:'#E5E7EB'}`,
                        background:form.status===k?v.bg:'#fff',color:form.status===k?v.color:'#9CA3AF' }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
          {err&&<div style={{ ...MOD,color:'#B91C1C',fontSize:12,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'6px 10px',marginTop:8 }}>{err}</div>}
          <div style={{ display:'flex',gap:8,marginTop:14,flexWrap:'wrap' }}>
            <button onClick={()=>setStep(1)} style={{ ...S.btn2,...MOD,flex:1,minWidth:80 }}>Volver</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn,...MOD,flex:2,minWidth:140 }}>
              {saving?'Guardando...':'Guardar registro'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Modal detalle / edición ────────────────────────────────────────────────── */
function DetailModal({ payment:p0, onClose, onUpdated, onDeleted, isSuperAdmin }) {
  const [p,setP]             = useState(p0);
  const [editing,setEditing] = useState(false);
  const [form,setForm]       = useState({});
  const [saving,setSaving]   = useState(false);
  const [confirmDel,setCD]   = useState(false);
  const [deleting,setDeleting]= useState(false);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const startEdit = () => {
    setForm({ ...p,
      invoice_date: p.invoice_date?.slice(0,10)||'',
      due_date:     p.due_date?.slice(0,10)||'',
      payment_date: p.payment_date?.slice(0,10)||'',
    }); setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try { const u=await api.updateSupplierPayment(p.id,form); setP(u); onUpdated(u); setEditing(false); }
    catch(e){ alert(e.message||'Error'); }
    finally{ setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.deleteSupplierPayment(p.id); onDeleted(p.id); onClose(); }
    catch(e){ alert(e.message||'Error'); setDeleting(false); setCD(false); }
  };

  const sc  = STATUS_CFG[p.status]||STATUS_CFG.pendiente;
  const due = getDueDate(p);
  const overdue = p.status==='pendiente'&&due&&new Date(due.slice(0,10)+'T12:00:00')<new Date();

  return (
    <Modal onClose={onClose} title={`Factura ${p.invoice_number||'—'}`} wide>
      <div style={{ maxHeight:'78vh',overflowY:'auto',paddingRight:4 }}>

        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap' }}>
          <span style={{ ...MOD,fontSize:11,fontWeight:700,padding:'3px 12px',borderRadius:20,
            background:sc.bg,color:sc.color,border:`1px solid ${sc.border}` }}>{sc.label}</span>
          {overdue&&<span style={{ ...MOD,fontSize:11,fontWeight:700,color:'#DC2626' }}>Vencido</span>}
          <span style={{ flex:1 }}/>
          {!editing&&<button onClick={startEdit} style={{ ...S.btn2,...MOD,padding:'5px 14px',fontSize:12 }}>Editar</button>}
          {isSuperAdmin&&!editing&&(
            <button onClick={()=>setCD(true)}
              style={{ ...S.btn2,...MOD,padding:'5px 14px',fontSize:12,color:'#EF4444',borderColor:'#FECACA' }}>Eliminar</button>
          )}
        </div>

        {confirmDel&&(
          <div style={{ background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:12,marginBottom:12 }}>
            <div style={{ ...MOD,fontSize:12,fontWeight:700,color:'#EF4444',marginBottom:8 }}>¿Eliminar este registro?</div>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={handleDelete} disabled={deleting}
                style={{ ...S.btn,...MOD,background:'#EF4444',padding:'5px 14px',fontSize:12 }}>
                {deleting?'Eliminando...':'Confirmar'}
              </button>
              <button onClick={()=>setCD(false)} style={{ ...S.btn2,...MOD,padding:'5px 14px',fontSize:12 }}>Cancelar</button>
            </div>
          </div>
        )}

        {editing ? (
          <div>
            <Section title="Factura">
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
                <F label="N° Factura" value={form.invoice_number} onChange={set('invoice_number')} mono half/>
                <F label="Fecha emisión" value={form.invoice_date} onChange={set('invoice_date')} type="date" half/>
                <F label="Vencimiento" value={form.due_date} onChange={set('due_date')} type="date" half/>
                <F label="Neto ($)" value={form.neto} onChange={set('neto')} type="number" half/>
                <F label="IVA ($)" value={form.iva} onChange={set('iva')} type="number" half/>
                <F label="Total factura ($)" value={form.total_amount} onChange={set('total_amount')} type="number" half/>
                <F label="Monto pagado ($)" value={form.paid_amount} onChange={set('paid_amount')} type="number" half/>
              </div>
            </Section>
            <Section title="Comprobante">
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
                <F label="N° Comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono half/>
                <F label="Fecha de pago" value={form.payment_date} onChange={set('payment_date')} type="date" half/>
                <F label="Banco" value={form.banco} onChange={set('banco')}/>
                <F label="Medio de pago" value={form.payment_method} onChange={set('payment_method')} half/>
                <F label="Pagador" value={form.payer_name} onChange={set('payer_name')} half/>
              </div>
            </Section>
            <Section title="Vehículo">
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10 }}>
                <F label="Marca" value={form.brand} onChange={set('brand')} half/>
                <F label="Modelo" value={form.model} onChange={set('model')} half/>
                <F label="Color" value={form.color} onChange={set('color')} half/>
                <F label="Año" value={form.commercial_year} onChange={set('commercial_year')} type="number" half/>
                <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono half/>
                <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono half/>
              </div>
            </Section>
            <Section title="Archivos / notas">
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10 }}>
                <F label="URL Factura" value={form.invoice_url} onChange={set('invoice_url')}/>
                <F label="URL Comprobante" value={form.receipt_url} onChange={set('receipt_url')}/>
                <F label="Notas" value={form.notes} onChange={set('notes')}/>
              </div>
            </Section>
            <Section title="Estado">
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                {Object.entries(STATUS_CFG).map(([k,v])=>(
                  <button key={k} type="button" onClick={()=>set('status')(k)}
                    style={{ ...MOD,padding:'5px 14px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      border:`1.5px solid ${form.status===k?v.border:'#E5E7EB'}`,
                      background:form.status===k?v.bg:'#fff',color:form.status===k?v.color:'#9CA3AF' }}>{v.label}</button>
                ))}
              </div>
            </Section>
            <div style={{ display:'flex',gap:8,marginTop:14,flexWrap:'wrap' }}>
              <button onClick={handleSave} disabled={saving} style={{ ...S.btn,...MOD,flex:2,minWidth:120 }}>{saving?'Guardando...':'Guardar'}</button>
              <button onClick={()=>setEditing(false)} style={{ ...S.btn2,...MOD,flex:1,minWidth:80 }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <Section title="Factura">
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4 }}>
                <DRow label="N° Factura"     value={p.invoice_number} mono bold/>
                <DRow label="Fecha emisión"  value={fDate(p.invoice_date)}/>
                <DRow label="Vencimiento"    value={fDate(due)} accent={overdue} bold={overdue}/>
                <DRow label="Neto"           value={fmtCLP(p.neto)}/>
                <DRow label="IVA"            value={fmtCLP(p.iva)}/>
                <DRow label="Total factura"  value={fmtCLP(p.total_amount)} bold/>
                <DRow label="Monto pagado"   value={fmtCLP(p.paid_amount)} bold accent/>
              </div>
            </Section>
            <Section title="Comprobante de pago">
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4 }}>
                <DRow label="N° Comprobante" value={p.receipt_number} mono bold/>
                <DRow label="Fecha de pago"  value={fDate(p.payment_date)}/>
                <DRow label="Banco"          value={p.banco} span/>
                <DRow label="Medio de pago"  value={p.payment_method}/>
                <DRow label="Pagador"        value={p.payer_name} span/>
              </div>
            </Section>
            <Section title="Vehículo">
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4 }}>
                <DRow label="Marca"     value={p.brand}/>
                <DRow label="Modelo"    value={p.model} bold/>
                <DRow label="Color"     value={p.color}/>
                <DRow label="Año"       value={p.commercial_year}/>
                <DRow label="N° Motor"  value={p.motor_num} mono/>
                <DRow label="N° Chasis" value={p.chassis}   mono/>
              </div>
            </Section>
            {p.notes&&(
              <div style={{ ...MOD,background:'#F8FAFC',border:'1px solid #E5E7EB',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#4B5563',marginTop:4 }}>{p.notes}</div>
            )}
            {(p.invoice_url||p.receipt_url)&&(
              <div style={{ marginTop:14,display:'flex',gap:8,flexWrap:'wrap' }}>
                {p.invoice_url&&(
                  <a href={p.invoice_url} target="_blank" rel="noreferrer"
                    style={{ ...MOD,display:'flex',alignItems:'center',gap:6,padding:'7px 14px',
                      background:'#FFF7ED',border:'1px solid #FDBA74',borderRadius:8,
                      textDecoration:'none',fontSize:12,fontWeight:600,color:'#EA580C' }}>
                    <Ic.file size={13}/> Ver Factura
                  </a>
                )}
                {p.receipt_url&&(
                  <a href={p.receipt_url} target="_blank" rel="noreferrer"
                    style={{ ...MOD,display:'flex',alignItems:'center',gap:6,padding:'7px 14px',
                      background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,
                      textDecoration:'none',fontSize:12,fontWeight:600,color:'#2563EB' }}>
                    <Ic.file size={13}/> Ver Comprobante
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Card mobile (reemplaza fila de tabla en pantallas pequeñas) ──────────── */
function PayCard({ p, onClick }) {
  const sc  = STATUS_CFG[p.status]||STATUS_CFG.pendiente;
  const due = getDueDate(p);
  const overdue = p.status==='pendiente'&&due&&new Date(due.slice(0,10)+'T12:00:00')<new Date();
  return (
    <div onClick={onClick} style={{ ...MOD,background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:8 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
        <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}` }}>{sc.label}</span>
        <span style={{ fontFamily:'ui-monospace,monospace',fontWeight:700,fontSize:13,color:'#0F172A' }}>{p.invoice_number||'—'}</span>
        <span style={{ flex:1 }}/>
        <span style={{ fontWeight:700,fontSize:13 }}>{fmtCLP(p.total_amount)}</span>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:12 }}>
        <div><span style={{ color:'#9CA3AF',fontSize:10 }}>MODELO </span><strong>{p.model||'—'}</strong></div>
        <div><span style={{ color:'#9CA3AF',fontSize:10 }}>COLOR </span>{p.color||'—'}</div>
        <div><span style={{ color:'#9CA3AF',fontSize:10 }}>AÑO </span>{p.commercial_year||'—'}</div>
        <div><span style={{ color:'#9CA3AF',fontSize:10,fontWeight:overdue?700:400,color:overdue?'#DC2626':'#9CA3AF' }}>VENC. </span>
          <span style={{ fontWeight:overdue?700:400,color:overdue?'#DC2626':'#374151' }}>{fDate(due)}</span>
        </div>
        {p.chassis&&<div style={{ gridColumn:'1/-1' }}><span style={{ color:'#9CA3AF',fontSize:10 }}>CHASIS </span><span style={{ fontFamily:'ui-monospace,monospace',fontSize:11 }}>{p.chassis}</span></div>}
        {p.motor_num&&<div style={{ gridColumn:'1/-1' }}><span style={{ color:'#9CA3AF',fontSize:10 }}>MOTOR </span><span style={{ fontFamily:'ui-monospace,monospace',fontSize:11 }}>{p.motor_num}</span></div>}
      </div>
    </div>
  );
}

/* ── Vista principal ────────────────────────────────────────────────────────── */
export function SupplierPaymentsView({ user }) {
  const isSuperAdmin = user.role==='super_admin';
  const canCreate    = ['super_admin','admin_comercial','backoffice'].includes(user.role);
  const mobile       = useIsMobile();

  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [q,          setQ]          = useState('');
  const [fStatus,    setFStatus]    = useState('');
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSyncDrive = async () => {
    setSyncing(true); setSyncResult(null);
    try { const res=await api.syncSupplierPaymentsFromDrive(); setSyncResult({ok:true,...res}); load(); }
    catch(e){ setSyncResult({ok:false,error:e.message}); }
    finally{ setSyncing(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params={};
      if (q) params.q=q;
      if (fStatus) params.status=fStatus;
      const res=await api.getSupplierPayments(params);
      setPayments(res.data||[]);
    } catch(e){ console.error(e); }
    finally{ setLoading(false); }
  },[q,fStatus]);

  useEffect(()=>{ load(); },[load]);

  const pendientes = payments.filter(p=>p.status==='pendiente').length;
  const totalPend  = payments.filter(p=>p.status==='pendiente').reduce((s,p)=>s+(parseInt(p.total_amount)||0),0);

  /* ── Columnas de la tabla desktop ── */
  const COLS = [
    {h:'Estado',   w:90},
    {h:'N° Factura',w:100,fw:true},
    {h:'Modelo',   w:90, fw:true},
    {h:'Color',    w:80},
    {h:'Año',      w:55},
    {h:'N° Chasis',w:160,fw:true},
    {h:'N° Motor', w:150,fw:true},
    {h:'Neto',     w:100,r:true},
    {h:'IVA',      w:90, r:true},
    {h:'Total',    w:105,r:true},
    {h:'M. Pagado',w:105,r:true},
    {h:'F. Factura',w:88},
    {h:'Vencimiento',w:90},
    {h:'F. Pago',  w:80},
    {h:'N° Comp.', w:110},
    {h:'Banco',    w:120},
    {h:'Arch.',    w:80},
  ];

  return (
    <div style={{ ...MOD,flex:1,display:'flex',flexDirection:'column',minHeight:0,maxWidth:1400 }}>

      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:16,flexWrap:'wrap' }}>
        <div>
          <h1 style={{ ...MOD,margin:0,fontSize:mobile?16:19,fontWeight:800,color:'#0F172A',letterSpacing:'-0.025em' }}>Pagos a proveedor</h1>
          {pendientes>0&&(
            <div style={{ ...MOD,fontSize:11,color:'#854D0E',marginTop:3 }}>
              {pendientes} pendiente{pendientes!==1?'s':''} · {fmtCLP(totalPend)} por pagar
            </div>
          )}
        </div>
        <div style={{ flex:1 }}/>
        {canCreate&&(
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button onClick={handleSyncDrive} disabled={syncing}
              style={{ ...S.btn2,...MOD,display:'flex',alignItems:'center',gap:6,fontWeight:600,fontSize:12 }}>
              <Ic.refresh size={13} color={syncing?'#9CA3AF':'#374151'}/>
              {syncing?'Sincronizando...':'Actualizar desde Drive'}
            </button>
            <button onClick={()=>setShowNew(true)}
              style={{ ...S.btn,...MOD,display:'flex',alignItems:'center',gap:6 }}>
              <Ic.plus size={14}/> Nuevo pago
            </button>
          </div>
        )}
      </div>

      {/* Banner sync */}
      {syncResult&&(
        <div style={{ ...MOD,marginBottom:12,padding:'10px 14px',borderRadius:10,fontSize:12,
          background:syncResult.ok?'#F0FDF4':'#FEF2F2',
          border:`1px solid ${syncResult.ok?'#86EFAC':'#FECACA'}`,
          color:syncResult.ok?'#065F46':'#991B1B',
          display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
          {syncResult.ok
            ?`Sync OK — ${syncResult.created} nuevo${syncResult.created!==1?'s':''}, ${syncResult.updated} actualizado${syncResult.updated!==1?'s':''} (${syncResult.facturas_leidas} fact. / ${syncResult.comprobantes_leidos} comp.)`
            :syncResult.error}
          {syncResult.ok&&syncResult.errors?.length>0&&<span style={{ color:'#92400E' }}>· {syncResult.errors.length} con error</span>}
          <button onClick={()=>setSyncResult(null)} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:0.5,lineHeight:1 }}>×</button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center' }}>
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar factura, chasis, modelo..."
          style={{ ...S.inp,...MOD,flex:1,minWidth:180,maxWidth:300,fontSize:12 }}/>
        <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
          {[['','Todos'],['pendiente','Pendientes'],['pagado','Pagados'],['revisado','Revisados']].map(([v,l])=>(
            <button key={v} onClick={()=>setFStatus(v)}
              style={{ ...MOD,padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                border:`1.5px solid ${fStatus===v?(STATUS_CFG[v]?.border||'#0F172A'):'#E5E7EB'}`,
                background:fStatus===v?(STATUS_CFG[v]?.bg||'#F1F5F9'):'#fff',
                color:fStatus===v?(STATUS_CFG[v]?.color||'#0F172A'):'#6B7280' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Vista mobile: cards */}
      {mobile ? (
        <div style={{ flex:1,overflowY:'auto' }}>
          {loading&&<div style={{ ...MOD,padding:32,textAlign:'center',color:'#9CA3AF' }}>Cargando...</div>}
          {!loading&&payments.length===0&&(
            <div style={{ ...MOD,padding:48,textAlign:'center',color:'#9CA3AF' }}>
              <div style={{ fontWeight:600,marginBottom:4 }}>Sin registros</div>
            </div>
          )}
          {!loading&&payments.map(p=>(
            <PayCard key={p.id} p={p} onClick={()=>setSelected(p)}/>
          ))}
        </div>
      ) : (
        /* Vista desktop: tabla */
        <div style={{ flex:1,overflowX:'auto',overflowY:'auto',border:'1px solid #E5E7EB',borderRadius:12,background:'#fff' }}>
          <table style={{ ...MOD,width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1100 }}>
            <thead>
              <tr style={{ background:'#FAFAFA',borderBottom:'2px solid #EAECF0',position:'sticky',top:0,zIndex:1 }}>
                {COLS.map(({h,fw,r})=>(
                  <th key={h} style={{ ...MOD,padding:'9px 10px',textAlign:r?'right':'left',fontSize:10,fontWeight:700,
                    color:fw?'#374151':'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap',
                    background:'#FAFAFA' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading&&<tr><td colSpan={COLS.length} style={{ ...MOD,padding:32,textAlign:'center',color:'#9CA3AF' }}>Cargando...</td></tr>}
              {!loading&&payments.length===0&&(
                <tr><td colSpan={COLS.length} style={{ ...MOD,padding:48,textAlign:'center',color:'#9CA3AF' }}>
                  <div style={{ fontWeight:600,marginBottom:4 }}>Sin registros</div>
                  <div style={{ fontSize:11 }}>Registrá el primer pago a proveedor</div>
                </td></tr>
              )}
              {!loading&&payments.map(p=>{
                const sc  = STATUS_CFG[p.status]||STATUS_CFG.pendiente;
                const due = getDueDate(p);
                const overdue = p.status==='pendiente'&&due&&new Date(due.slice(0,10)+'T12:00:00')<new Date();
                return (
                  <tr key={p.id} onClick={()=>setSelected(p)}
                    style={{ borderBottom:'1px solid #F3F4F6',cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    {/* Estado */}
                    <td style={{ padding:'9px 10px',whiteSpace:'nowrap' }}>
                      <span style={{ ...MOD,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}` }}>{sc.label}</span>
                    </td>
                    {/* N° Factura */}
                    <td style={{ padding:'9px 10px',fontFamily:'ui-monospace,monospace',fontWeight:700,color:'#0F172A',whiteSpace:'nowrap',fontSize:12 }}>
                      {p.invoice_number||'—'}
                    </td>
                    {/* Modelo */}
                    <td style={{ padding:'9px 10px',fontWeight:700,color:'#0F172A',whiteSpace:'nowrap' }}>{p.model||'—'}</td>
                    {/* Color */}
                    <td style={{ padding:'9px 10px',color:'#374151',whiteSpace:'nowrap' }}>{p.color||'—'}</td>
                    {/* Año */}
                    <td style={{ padding:'9px 10px',color:'#374151',whiteSpace:'nowrap' }}>{p.commercial_year||'—'}</td>
                    {/* Chasis */}
                    <td style={{ padding:'9px 10px',fontFamily:'ui-monospace,monospace',fontSize:11,color:'#1E293B',whiteSpace:'nowrap' }}>{p.chassis||'—'}</td>
                    {/* Motor */}
                    <td style={{ padding:'9px 10px',fontFamily:'ui-monospace,monospace',fontSize:11,color:'#1E293B',whiteSpace:'nowrap' }}>{p.motor_num||'—'}</td>
                    {/* Neto */}
                    <td style={{ padding:'9px 10px',color:'#6B7280',whiteSpace:'nowrap',textAlign:'right' }}>{fmtCLP(p.neto)}</td>
                    {/* IVA */}
                    <td style={{ padding:'9px 10px',color:'#6B7280',whiteSpace:'nowrap',textAlign:'right' }}>{fmtCLP(p.iva)}</td>
                    {/* Total */}
                    <td style={{ padding:'9px 10px',fontWeight:700,color:'#0F172A',whiteSpace:'nowrap',textAlign:'right' }}>{fmtCLP(p.total_amount)}</td>
                    {/* Monto Pagado */}
                    <td style={{ padding:'9px 10px',fontWeight:700,color:p.paid_amount?'#065F46':'#9CA3AF',whiteSpace:'nowrap',textAlign:'right' }}>{fmtCLP(p.paid_amount)}</td>
                    {/* Fechas */}
                    <td style={{ padding:'9px 10px',color:'#94A3B8',whiteSpace:'nowrap',fontSize:11 }}>{fDate(p.invoice_date)}</td>
                    <td style={{ padding:'9px 10px',whiteSpace:'nowrap',fontSize:11,fontWeight:overdue?700:400,color:overdue?'#DC2626':'#94A3B8' }}>{fDate(due)}</td>
                    <td style={{ padding:'9px 10px',color:'#94A3B8',whiteSpace:'nowrap',fontSize:11 }}>{fDate(p.payment_date)}</td>
                    {/* Comprobante + banco */}
                    <td style={{ padding:'9px 10px',fontFamily:'ui-monospace,monospace',fontSize:11,color:'#6B7280',whiteSpace:'nowrap' }}>{p.receipt_number||'—'}</td>
                    <td style={{ padding:'9px 10px',color:'#6B7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11 }}>{p.banco||'—'}</td>
                    {/* Archivos */}
                    <td style={{ padding:'9px 10px' }}>
                      <div style={{ display:'flex',gap:4 }}>
                        {p.invoice_url&&(
                          <a href={p.invoice_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ ...MOD,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:'#FFF7ED',border:'1px solid #FDBA74',color:'#EA580C',textDecoration:'none',whiteSpace:'nowrap' }}>Fact.</a>
                        )}
                        {p.receipt_url&&(
                          <a href={p.receipt_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ ...MOD,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#2563EB',textDecoration:'none',whiteSpace:'nowrap' }}>Comp.</a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pie */}
      {!loading&&payments.length>0&&(
        <div style={{ ...MOD,display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,fontSize:11,color:'#9CA3AF' }}>
          <span>{payments.length} registro{payments.length!==1?'s':''}</span>
          {payments.some(p=>p.total_amount)&&(
            <span>Total: <strong style={{ color:'#0F172A' }}>{fmtCLP(payments.reduce((s,p)=>s+(parseInt(p.total_amount)||0),0))}</strong></span>
          )}
        </div>
      )}

      {showNew&&(
        <NewPaymentModal onClose={()=>setShowNew(false)} onCreated={p=>{ setPayments(prev=>[p,...prev]); setShowNew(false); }}/>
      )}
      {selected&&(
        <DetailModal payment={selected} isSuperAdmin={isSuperAdmin}
          onClose={()=>setSelected(null)}
          onUpdated={p=>{ setPayments(prev=>prev.map(x=>x.id===p.id?p:x)); setSelected(p); }}
          onDeleted={id=>{ setPayments(prev=>prev.filter(x=>x.id!==id)); setSelected(null); }}/>
      )}
    </div>
  );
}
