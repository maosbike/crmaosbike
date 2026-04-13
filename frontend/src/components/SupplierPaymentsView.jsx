import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal } from '../ui.jsx';

const STATUS_CFG = {
  pendiente: { label:'Pendiente', bg:'#FEF9C3', color:'#854D0E', border:'#FDE047' },
  pagado:    { label:'Pagado',    bg:'#D1FAE5', color:'#065F46', border:'#6EE7B7' },
  revisado:  { label:'Revisado',  bg:'#E0E7FF', color:'#3730A3', border:'#A5B4FC' },
};

const EMPTY = () => ({
  provider:'', invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', neto:'', iva:'',
  receipt_number:'', payer_name:'', banco:'', payment_method:'',
  brand:'', model:'', color:'', commercial_year:'',
  motor_num:'', chassis:'', internal_code:'',
  invoice_url:'', receipt_url:'', notes:'', status:'pendiente',
});

function fmtCLP(n) {
  if (!n && n !== 0) return '—';
  return '$\u202F' + parseInt(n).toLocaleString('es-CL');
}
function fDate(s) {
  if (!s) return '—';
  const part = String(s).slice(0, 10); // 'YYYY-MM-DD' (handles ISO strings too)
  const [y, m, d] = part.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

// Calcula vencimiento: campo propio o factura + 1 mes
function getDueDate(p) {
  if (p.due_date) return p.due_date;
  if (p.invoice_date) {
    const d = new Date(String(p.invoice_date).slice(0,10) + 'T12:00:00');
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0,10);
  }
  return null;
}

// ─── Campo de formulario ──────────────────────────────────────────────────────
function F({ label, value, onChange, type='text', half, mono, highlight, readOnly }) {
  return (
    <div style={{ gridColumn: half ? 'auto' : '1/-1' }}>
      <label style={{
        fontSize:10, fontWeight:700,
        color: highlight ? '#B45309' : '#6B7280',
        textTransform:'uppercase', letterSpacing:'0.07em',
        display:'block', marginBottom:3,
      }}>
        {label}{highlight ? ' *' : ''}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          ...S.inp, width:'100%', fontSize:12,
          fontFamily: mono ? 'monospace' : 'inherit',
          borderColor: highlight ? '#FCD34D' : '#E5E7EB',
          background: readOnly ? '#F9FAFB' : '#fff',
        }}
      />
    </div>
  );
}

// ─── Zona de carga de archivo ─────────────────────────────────────────────────
function FileZone({ label, file, onFile, url, onUrl, accent = '#F28100' }) {
  const [mode, setMode] = useState(url ? 'url' : 'upload');
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ border:`1.5px solid ${dragging?accent:'#E5E7EB'}`, borderRadius:8, padding:12, background:'#FAFAFA' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {[['upload','Subir PDF'],['url','URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, cursor:'pointer',
              border:`1.5px solid ${mode===m?accent:'#E5E7EB'}`,
              background: mode===m?accent:'#fff', color: mode===m?'#fff':'#6B7280' }}>
            {l}
          </button>
        ))}
      </div>
      {mode === 'upload' ? (
        <label
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)onFile(f);}}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
            padding:'14px 10px', border:`2px dashed ${dragging?accent:'#D1D5DB'}`,
            borderRadius:8, cursor:'pointer' }}>
          <Ic.file size={18} color={dragging?accent:'#9CA3AF'}/>
          <span style={{ fontSize:12, color:'#6B7280', textAlign:'center' }}>
            {file
              ? <strong style={{color:'#0F172A'}}>{file.name}</strong>
              : 'Arrastrá o clickeá para subir PDF'}
          </span>
          <input type="file" accept=".pdf" style={{ display:'none' }}
            onChange={e=>{ if(e.target.files[0]) onFile(e.target.files[0]); }}/>
        </label>
      ) : (
        <input value={url} onChange={e=>onUrl(e.target.value)}
          placeholder="https://drive.google.com/file/d/..."
          style={{ ...S.inp, width:'100%', fontSize:12 }}/>
      )}
    </div>
  );
}

// ─── Modal nuevo pago ─────────────────────────────────────────────────────────
function NewPaymentModal({ onClose, onCreated }) {
  const [step,       setStep]       = useState(1);
  const [invFile,    setInvFile]    = useState(null);
  const [recFile,    setRecFile]    = useState(null);
  const [invUrl,     setInvUrl]     = useState('');
  const [recUrl,     setRecUrl]     = useState('');
  const [extracting, setExtracting] = useState(false);
  const [form,       setForm]       = useState(EMPTY());
  const [highlighted,setHighlighted]= useState({});
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  const set = k => v => setForm(f => ({...f, [k]:v}));

  const handleExtract = async () => {
    if (!invFile && !recFile) { setErr('Subí al menos uno de los dos archivos para analizar'); return; }
    setExtracting(true); setErr('');
    try {
      const res = await api.extractSupplierPayment(invFile, recFile);
      const m   = res.merged || {};
      const newForm = { ...EMPTY() };
      const hl = {};
      for (const [k,v] of Object.entries(m)) {
        if (v !== null && v !== undefined && String(v).trim()) {
          newForm[k] = String(v);
          hl[k] = true;
        }
      }
      if (invUrl) newForm.invoice_url = invUrl;
      if (recUrl) newForm.receipt_url = recUrl;
      setForm(f => ({...f, ...newForm}));
      setHighlighted(hl);
      setStep(2);
    } catch (e) { setErr(e.message || 'Error al analizar'); }
    finally { setExtracting(false); }
  };

  const handleSkipExtract = () => {
    const newForm = { ...EMPTY() };
    if (invUrl) newForm.invoice_url = invUrl;
    if (recUrl) newForm.receipt_url = recUrl;
    setForm(f => ({...f, ...newForm}));
    setHighlighted({});
    setStep(2);
  };

  const handleSave = async () => {
    if (!form.invoice_number) { setErr('El número de factura es obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      const res = await api.createSupplierPayment(form);
      onCreated(res);
      setStep(3);
    } catch (e) { setErr(e.message || 'Error al guardar'); setSaving(false); }
  };

  if (step === 3) return (
    <Modal onClose={onClose} title="Registro creado">
      <div style={{ textAlign:'center', padding:'28px 0' }}>
        <div style={{ width:48, height:48, borderRadius:'50%', background:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <Ic.check size={24} color="#065F46"/>
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:'#0F172A', marginBottom:6 }}>Pago registrado</div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:20 }}>El registro fue guardado correctamente.</div>
        <button onClick={onClose} style={{ ...S.btn, padding:'8px 28px' }}>Cerrar</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos extraídos'} wide>

      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:12, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'8px 12px' }}>
            Subí los PDF o pegá los links de Google Drive. Podés analizar automáticamente o ingresar los datos a mano.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FileZone label="Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl} accent="#F28100"/>
            <FileZone label="Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>
          {err && <div style={{ color:'#B91C1C', fontSize:12, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'6px 10px' }}>{err}</div>}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={handleExtract} disabled={extracting} style={{ ...S.btn, flex:2 }}>
              {extracting ? 'Analizando PDFs...' : 'Analizar y extraer datos'}
            </button>
            <button onClick={handleSkipExtract} style={{ ...S.btn2, flex:1 }}>Ingresar manualmente</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ maxHeight:'72vh', overflowY:'auto', paddingRight:4 }}>
          {Object.keys(highlighted).length > 0 && (
            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'7px 12px', marginBottom:14, fontSize:11, color:'#92400E' }}>
              Los campos marcados (*) fueron extraídos automáticamente. Revisá y corregí si es necesario.
            </div>
          )}

          <Section title="Factura">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="Proveedor" value={form.provider} onChange={set('provider')} highlight={!!highlighted.provider}/>
              <F label="N° Factura" value={form.invoice_number} onChange={set('invoice_number')} mono half highlight={!!highlighted.invoice_number}/>
              <F label="Fecha emisión" value={form.invoice_date} onChange={set('invoice_date')} type="date" half highlight={!!highlighted.invoice_date}/>
              <F label="Fecha vencimiento" value={form.due_date} onChange={set('due_date')} type="date" half highlight={!!highlighted.due_date}/>
              <F label="Monto neto ($)" value={form.neto} onChange={set('neto')} type="number" half highlight={!!highlighted.neto}/>
              <F label="IVA ($)" value={form.iva} onChange={set('iva')} type="number" half highlight={!!highlighted.iva}/>
              <F label="Total ($)" value={form.total_amount} onChange={set('total_amount')} type="number" half highlight={!!highlighted.total_amount}/>
            </div>
          </Section>

          <Section title="Comprobante de pago">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="N° Comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono half highlight={!!highlighted.receipt_number}/>
              <F label="Fecha de pago" value={form.payment_date} onChange={set('payment_date')} type="date" half highlight={!!highlighted.payment_date}/>
              <F label="Banco" value={form.banco} onChange={set('banco')} highlight={!!highlighted.banco}/>
              <F label="Medio de pago" value={form.payment_method} onChange={set('payment_method')} half highlight={!!highlighted.payment_method}/>
              <F label="Nombre pagador" value={form.payer_name} onChange={set('payer_name')} highlight={!!highlighted.payer_name}/>
            </div>
          </Section>

          <Section title="Vehículo">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="Marca" value={form.brand} onChange={set('brand')} half highlight={!!highlighted.brand}/>
              <F label="Modelo" value={form.model} onChange={set('model')} half highlight={!!highlighted.model}/>
              <F label="Color" value={form.color} onChange={set('color')} half highlight={!!highlighted.color}/>
              <F label="Año comercial" value={form.commercial_year} onChange={set('commercial_year')} type="number" half highlight={!!highlighted.commercial_year}/>
              <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono half highlight={!!highlighted.motor_num}/>
              <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono half highlight={!!highlighted.chassis}/>
              <F label="Código interno" value={form.internal_code} onChange={set('internal_code')} mono half highlight={!!highlighted.internal_code}/>
            </div>
          </Section>

          <Section title="Archivos">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="URL Factura (Drive / Cloudinary)" value={form.invoice_url} onChange={set('invoice_url')} highlight={!!highlighted.invoice_url}/>
              <F label="URL Comprobante (Drive / Cloudinary)" value={form.receipt_url} onChange={set('receipt_url')} highlight={!!highlighted.receipt_url}/>
            </div>
          </Section>

          <Section title="Estado y notas">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <F label="Notas" value={form.notes} onChange={set('notes')}/>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Estado</label>
                <div style={{ display:'flex', gap:8 }}>
                  {Object.entries(STATUS_CFG).map(([k,v])=>(
                    <button key={k} type="button" onClick={()=>set('status')(k)}
                      style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                        border:`1.5px solid ${form.status===k?v.border:'#E5E7EB'}`,
                        background: form.status===k?v.bg:'#fff', color: form.status===k?v.color:'#9CA3AF' }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {err && <div style={{ color:'#B91C1C', fontSize:12, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'6px 10px', marginTop:10 }}>{err}</div>}

          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={()=>setStep(1)} style={{ ...S.btn2, flex:1 }}>Volver</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex:2 }}>
              {saving ? 'Guardando...' : 'Guardar registro'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal detalle / edición ──────────────────────────────────────────────────
function DetailModal({ payment: p0, onClose, onUpdated, onDeleted, isSuperAdmin }) {
  const [p,         setP]         = useState(p0);
  const [editing,   setEditing]   = useState(false);
  const [form,      setForm]      = useState({});
  const [saving,    setSaving]    = useState(false);
  const [confirmDel,setConfirmDel]= useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const set = k => v => setForm(f => ({...f, [k]:v}));

  const startEdit = () => {
    setForm({
      ...p,
      invoice_date:  p.invoice_date?.slice(0,10)  || '',
      due_date:      p.due_date?.slice(0,10)       || '',
      payment_date:  p.payment_date?.slice(0,10)   || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSupplierPayment(p.id, form);
      setP(updated); onUpdated(updated); setEditing(false);
    } catch (e) { alert(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.deleteSupplierPayment(p.id); onDeleted(p.id); onClose(); }
    catch (e) { alert(e.message || 'Error al eliminar'); setDeleting(false); setConfirmDel(false); }
  };

  const sc = STATUS_CFG[p.status] || STATUS_CFG.pendiente;

  return (
    <Modal onClose={onClose} title={`Factura ${p.invoice_number || '—'}`} wide>
      <div style={{ maxHeight:'75vh', overflowY:'auto', paddingRight:4 }}>

        {/* Barra de acciones */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20,
            background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>{sc.label}</span>
          <span style={{ flex:1 }}/>
          {!editing && (
            <button onClick={startEdit} style={{ ...S.btn2, padding:'5px 14px', fontSize:12 }}>Editar</button>
          )}
          {isSuperAdmin && !editing && (
            <button onClick={()=>setConfirmDel(true)}
              style={{ ...S.btn2, padding:'5px 14px', fontSize:12, color:'#EF4444', borderColor:'#FECACA' }}>
              Eliminar
            </button>
          )}
        </div>

        {confirmDel && (
          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#EF4444', marginBottom:8 }}>¿Eliminar este registro?</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleDelete} disabled={deleting}
                style={{ ...S.btn, background:'#EF4444', padding:'5px 14px', fontSize:12 }}>
                {deleting?'Eliminando...':'Confirmar'}
              </button>
              <button onClick={()=>setConfirmDel(false)} style={{ ...S.btn2, padding:'5px 14px', fontSize:12 }}>Cancelar</button>
            </div>
          </div>
        )}

        {editing ? (
          <div>
            <Section title="Factura">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <F label="Proveedor" value={form.provider} onChange={set('provider')}/>
                <F label="N° Factura" value={form.invoice_number} onChange={set('invoice_number')} mono half/>
                <F label="Fecha emisión" value={form.invoice_date} onChange={set('invoice_date')} type="date" half/>
                <F label="Fecha vencimiento" value={form.due_date} onChange={set('due_date')} type="date" half/>
                <F label="Neto ($)" value={form.neto} onChange={set('neto')} type="number" half/>
                <F label="IVA ($)" value={form.iva} onChange={set('iva')} type="number" half/>
                <F label="Total ($)" value={form.total_amount} onChange={set('total_amount')} type="number" half/>
              </div>
            </Section>
            <Section title="Comprobante">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <F label="N° Comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono half/>
                <F label="Fecha de pago" value={form.payment_date} onChange={set('payment_date')} type="date" half/>
                <F label="Banco" value={form.banco} onChange={set('banco')}/>
                <F label="Medio de pago" value={form.payment_method} onChange={set('payment_method')} half/>
                <F label="Pagador" value={form.payer_name} onChange={set('payer_name')} half/>
              </div>
            </Section>
            <Section title="Vehículo">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <F label="Marca" value={form.brand} onChange={set('brand')} half/>
                <F label="Modelo" value={form.model} onChange={set('model')} half/>
                <F label="Color" value={form.color} onChange={set('color')} half/>
                <F label="Año comercial" value={form.commercial_year} onChange={set('commercial_year')} type="number" half/>
                <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono half/>
                <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono half/>
                <F label="Código interno" value={form.internal_code} onChange={set('internal_code')} mono half/>
              </div>
            </Section>
            <Section title="Archivos y notas">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <F label="URL Factura" value={form.invoice_url} onChange={set('invoice_url')}/>
                <F label="URL Comprobante" value={form.receipt_url} onChange={set('receipt_url')}/>
                <F label="Notas" value={form.notes} onChange={set('notes')}/>
              </div>
            </Section>
            <Section title="Estado">
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(STATUS_CFG).map(([k,v])=>(
                  <button key={k} type="button" onClick={()=>set('status')(k)}
                    style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                      border:`1.5px solid ${form.status===k?v.border:'#E5E7EB'}`,
                      background:form.status===k?v.bg:'#fff', color:form.status===k?v.color:'#9CA3AF' }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </Section>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex:2 }}>{saving?'Guardando...':'Guardar'}</button>
              <button onClick={()=>setEditing(false)} style={{ ...S.btn2, flex:1 }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <Section title="Factura">
              <DGrid>
                <DRow label="Proveedor"     value={p.provider}                        span/>
                <DRow label="N° Factura"    value={p.invoice_number}      mono bold/>
                <DRow label="Fecha emisión" value={fDate(p.invoice_date)}/>
                <DRow label="Vencimiento"   value={fDate(getDueDate(p))}/>
                <DRow label="Neto"          value={fmtCLP(p.neto)}/>
                <DRow label="IVA"           value={fmtCLP(p.iva)}/>
                <DRow label="Total"         value={fmtCLP(p.total_amount)} bold accent/>
              </DGrid>
            </Section>

            <Section title="Comprobante de pago">
              <DGrid>
                <DRow label="N° Comprobante" value={p.receipt_number}              mono bold/>
                <DRow label="Fecha de pago"  value={fDate(p.payment_date)}         accent/>
                <DRow label="Banco"          value={p.banco}                       span/>
                <DRow label="Medio de pago"  value={p.payment_method}/>
                <DRow label="Pagador"        value={p.payer_name}                  span/>
              </DGrid>
            </Section>

            <Section title="Vehículo">
              <DGrid>
                <DRow label="Marca"    value={p.brand}/>
                <DRow label="Modelo"   value={p.model}/>
                <DRow label="Color"    value={p.color}/>
                <DRow label="Año"      value={p.commercial_year}/>
                <DRow label="N° Motor" value={p.motor_num}  mono/>
                <DRow label="N° Chasis" value={p.chassis}   mono/>
                <DRow label="Cód. interno" value={p.internal_code} mono/>
              </DGrid>
            </Section>

            {p.notes && (
              <div style={{ marginTop:8, background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#4B5563' }}>
                {p.notes}
              </div>
            )}

            {(p.invoice_url || p.receipt_url) && (
              <div style={{ marginTop:14, display:'flex', gap:8 }}>
                {p.invoice_url && (
                  <a href={p.invoice_url} target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
                      background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:8,
                      textDecoration:'none', fontSize:12, fontWeight:600, color:'#EA580C' }}>
                    <Ic.file size={13}/> Ver Factura
                  </a>
                )}
                {p.receipt_url && (
                  <a href={p.receipt_url} target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
                      background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8,
                      textDecoration:'none', fontSize:12, fontWeight:600, color:'#2563EB' }}>
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

// ─── Componentes auxiliares del detalle ──────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{title}</div>
      {children}
    </div>
  );
}
function DGrid({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>{children}</div>;
}
function DRow({ label, value, bold, mono, accent, span }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ gridColumn: span ? '1/-1' : 'auto', padding:'5px 0', borderBottom:'1px solid #F3F4F6' }}>
      <div style={{ fontSize:10, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:1 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:bold?700:400, fontFamily:mono?'monospace':'inherit', color:accent?'#0F172A':'#374151' }}>
        {value}
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
export function SupplierPaymentsView({ user }) {
  const isSuperAdmin = user.role === 'super_admin';
  const canCreate    = ['super_admin','admin_comercial','backoffice'].includes(user.role);

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
    try {
      const res = await api.syncSupplierPaymentsFromDrive();
      setSyncResult({ ok: true, ...res });
      load();
    } catch (e) {
      setSyncResult({ ok: false, error: e.message });
    } finally { setSyncing(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q)       params.q      = q;
      if (fStatus) params.status = fStatus;
      const res = await api.getSupplierPayments(params);
      setPayments(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [q, fStatus]);

  useEffect(() => { load(); }, [load]);

  const pendientes = payments.filter(p => p.status === 'pendiente').length;
  const totalPend  = payments.filter(p => p.status === 'pendiente')
                             .reduce((s,p) => s + (parseInt(p.total_amount)||0), 0);

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, maxWidth:1200 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:18 }}>
        <div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em' }}>Pagos a proveedor</h1>
          {pendientes > 0 && (
            <div style={{ fontSize:11, color:'#854D0E', marginTop:3 }}>
              {pendientes} pendiente{pendientes!==1?'s':''} · {fmtCLP(totalPend)} por pagar
            </div>
          )}
        </div>
        <div style={{ flex:1 }}/>
        {canCreate && (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={handleSyncDrive} disabled={syncing}
              style={{ ...S.btn2, display:'flex', alignItems:'center', gap:6, fontWeight:600, fontSize:12 }}>
              <Ic.refresh size={14} color={syncing?'#9CA3AF':'#374151'}/>
              {syncing ? 'Sincronizando...' : 'Actualizar desde Drive'}
            </button>
            <button onClick={()=>setShowNew(true)}
              style={{ ...S.btn, display:'flex', alignItems:'center', gap:6 }}>
              <Ic.plus size={14}/> Nuevo pago
            </button>
          </div>
        )}
      </div>

      {/* Banner sync */}
      {syncResult && (
        <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, fontSize:12,
          background: syncResult.ok ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${syncResult.ok ? '#86EFAC' : '#FECACA'}`,
          color: syncResult.ok ? '#065F46' : '#991B1B',
          display:'flex', alignItems:'center', gap:10 }}>
          {syncResult.ok
            ? `Sync completado — ${syncResult.created} nuevo${syncResult.created!==1?'s':''}, ${syncResult.updated} actualizado${syncResult.updated!==1?'s':''} (${syncResult.facturas_leidas} facturas / ${syncResult.comprobantes_leidos} comprobantes)`
            : syncResult.error}
          {syncResult.ok && syncResult.errors?.length > 0 && (
            <span style={{ color:'#92400E' }}>· {syncResult.errors.length} con error</span>
          )}
          <button onClick={()=>setSyncResult(null)}
            style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', fontSize:16, opacity:0.5, lineHeight:1 }}>
            x
          </button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar por factura, proveedor, chasis, modelo..."
          style={{ ...S.inp, width:300, fontSize:12 }}/>
        <div style={{ display:'flex', gap:6 }}>
          {[['','Todos'],['pendiente','Pendientes'],['pagado','Pagados'],['revisado','Revisados']].map(([v,l])=>(
            <button key={v} onClick={()=>setFStatus(v)}
              style={{ padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer',
                border:`1.5px solid ${fStatus===v?(STATUS_CFG[v]?.border||'#0F172A'):'#E5E7EB'}`,
                background: fStatus===v?(STATUS_CFG[v]?.bg||'#F1F5F9'):'#fff',
                color: fStatus===v?(STATUS_CFG[v]?.color||'#0F172A'):'#6B7280' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ flex:1, overflowY:'auto', border:'1px solid #E5E7EB', borderRadius:12, background:'#fff' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#FAFAFA', borderBottom:'2px solid #F1F3F5' }}>
              {[
                ['Estado',''],['N° Factura',''],['Proveedor',''],
                ['Modelo','fw'],['Color',''],['Año',''],
                ['N° Chasis','fw'],['N° Motor','fw'],
                ['Neto','r'],['IVA','r'],['Total','r'],
                ['F. Factura',''],['Vencimiento',''],['F. Pago',''],
                ['N° Comp.',''],['Banco',''],['Arch.',''],
              ].map(([h,cls]) => (
                <th key={h} style={{ padding:'9px 10px', textAlign: cls==='r'?'right':'left', fontSize:10, fontWeight:700, color: cls==='fw'?'#374151':'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={17} style={{ padding:32, textAlign:'center', color:'#9CA3AF' }}>Cargando...</td></tr>
            )}
            {!loading && payments.length === 0 && (
              <tr><td colSpan={17} style={{ padding:48, textAlign:'center', color:'#9CA3AF' }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>Sin registros</div>
                <div style={{ fontSize:11 }}>Registrá el primer pago a proveedor</div>
              </td></tr>
            )}
            {!loading && payments.map(p => {
              const sc  = STATUS_CFG[p.status] || STATUS_CFG.pendiente;
              const due = getDueDate(p);
              const overdue = p.status==='pendiente' && due && new Date(due.slice(0,10)+'T12:00:00') < new Date();
              return (
                <tr key={p.id} onClick={()=>setSelected(p)}
                  style={{ borderBottom:'1px solid #F3F4F6', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#FAFBFF'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:12,
                      background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>{sc.label}</span>
                  </td>
                  <td style={{ padding:'9px 10px', fontFamily:'monospace', fontWeight:700, color:'#0F172A', whiteSpace:'nowrap' }}>
                    {p.invoice_number || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', color:'#374151', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.provider || '—'}
                  </td>
                  {/* Vehículo — prominente */}
                  <td style={{ padding:'9px 10px', fontWeight:700, color:'#0F172A', whiteSpace:'nowrap' }}>
                    {p.model || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', color:'#374151', whiteSpace:'nowrap' }}>
                    {p.color || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', color:'#374151', whiteSpace:'nowrap' }}>
                    {p.commercial_year || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:11, color:'#0F172A', whiteSpace:'nowrap' }}>
                    {p.chassis || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:11, color:'#374151', whiteSpace:'nowrap' }}>
                    {p.motor_num || '—'}
                  </td>
                  {/* Importes */}
                  <td style={{ padding:'9px 10px', color:'#6B7280', whiteSpace:'nowrap', textAlign:'right' }}>{fmtCLP(p.neto)}</td>
                  <td style={{ padding:'9px 10px', color:'#6B7280', whiteSpace:'nowrap', textAlign:'right' }}>{fmtCLP(p.iva)}</td>
                  <td style={{ padding:'9px 10px', fontWeight:700, color:'#0F172A', whiteSpace:'nowrap', textAlign:'right' }}>{fmtCLP(p.total_amount)}</td>
                  {/* Fechas — menos protagonismo */}
                  <td style={{ padding:'9px 10px', color:'#9CA3AF', whiteSpace:'nowrap', fontSize:11 }}>{fDate(p.invoice_date)}</td>
                  <td style={{ padding:'9px 10px', whiteSpace:'nowrap', fontSize:11,
                    color: overdue ? '#DC2626' : '#9CA3AF',
                    fontWeight: overdue ? 700 : 400 }}>
                    {fDate(due)}
                  </td>
                  <td style={{ padding:'9px 10px', color:'#9CA3AF', whiteSpace:'nowrap', fontSize:11 }}>{fDate(p.payment_date)}</td>
                  {/* Comprobante + banco */}
                  <td style={{ padding:'9px 10px', fontFamily:'monospace', fontSize:11, color:'#6B7280', whiteSpace:'nowrap' }}>
                    {p.receipt_number || '—'}
                  </td>
                  <td style={{ padding:'9px 10px', color:'#6B7280', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:11 }}>
                    {p.banco || '—'}
                  </td>
                  {/* Archivos */}
                  <td style={{ padding:'9px 10px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {p.invoice_url && (
                        <a href={p.invoice_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:'#FFF7ED', border:'1px solid #FDBA74', color:'#EA580C', textDecoration:'none', whiteSpace:'nowrap' }}>
                          Fact.
                        </a>
                      )}
                      {p.receipt_url && (
                        <a href={p.receipt_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#2563EB', textDecoration:'none', whiteSpace:'nowrap' }}>
                          Comp.
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pie de tabla */}
      {!loading && payments.length > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8, fontSize:11, color:'#9CA3AF' }}>
          <span>{payments.length} registro{payments.length!==1?'s':''}</span>
          {payments.some(p => p.total_amount) && (
            <span>Total visible: <strong style={{ color:'#0F172A' }}>
              {fmtCLP(payments.reduce((s,p)=>s+(parseInt(p.total_amount)||0),0))}
            </strong></span>
          )}
        </div>
      )}

      {showNew && (
        <NewPaymentModal
          onClose={()=>setShowNew(false)}
          onCreated={p=>{ setPayments(prev=>[p,...prev]); setShowNew(false); }}
        />
      )}
      {selected && (
        <DetailModal
          payment={selected}
          isSuperAdmin={isSuperAdmin}
          onClose={()=>setSelected(null)}
          onUpdated={p=>{ setPayments(prev=>prev.map(x=>x.id===p.id?p:x)); setSelected(p); }}
          onDeleted={id=>{ setPayments(prev=>prev.filter(x=>x.id!==id)); setSelected(null); }}
        />
      )}
    </div>
  );
}
