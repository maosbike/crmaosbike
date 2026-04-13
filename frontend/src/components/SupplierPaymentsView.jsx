import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Ic, S, Modal, fmt } from '../ui.jsx';

const STATUS_CFG = {
  pendiente: { label:'Pendiente', bg:'#FEF9C3', color:'#854D0E', border:'#FDE047' },
  pagado:    { label:'Pagado',    bg:'#D1FAE5', color:'#065F46', border:'#6EE7B7' },
  revisado:  { label:'Revisado',  bg:'#E0E7FF', color:'#3730A3', border:'#A5B4FC' },
};

const EMPTY = () => ({
  provider:'', invoice_number:'', invoice_date:'', due_date:'', payment_date:'',
  total_amount:'', receipt_number:'', payer_name:'',
  brand:'', model:'', color:'', commercial_year:'',
  motor_num:'', chassis:'', internal_code:'',
  invoice_url:'', receipt_url:'', notes:'', status:'pendiente',
});

function fmtCLP(n) {
  if (!n) return '—';
  return '$' + parseInt(n).toLocaleString('es-CL');
}
function fDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('es-CL');
}

// ─── FileZone — zona de carga (upload o URL de Drive) ────────────────────────
function FileZone({ label, file, onFile, url, onUrl, accent = '#F28100' }) {
  const [mode, setMode] = useState(url ? 'url' : 'upload');
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ border:`1.5px solid ${dragging?accent:'#E5E7EB'}`, borderRadius:10, padding:12, background:'#FAFAFA', transition:'border-color 0.15s' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>

      {/* Selector de modo */}
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {[['upload','📄 Subir PDF'],['url','🔗 URL Drive']].map(([m,l])=>(
          <button key={m} type="button" onClick={()=>setMode(m)}
            style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
              border:`1.5px solid ${mode===m?accent:'#E5E7EB'}`,
              background: mode===m?accent:'#fff', color: mode===m?'#fff':'#6B7280',
              cursor:'pointer' }}>
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
            borderRadius:8, cursor:'pointer', transition:'border-color 0.15s' }}>
          <span style={{ fontSize:20 }}>📄</span>
          <span style={{ fontSize:12, color:'#6B7280', textAlign:'center' }}>
            {file ? <strong style={{color:'#0F172A'}}>{file.name}</strong> : 'Arrastrá o clickeá para subir PDF'}
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

// ─── Campo de formulario simple ───────────────────────────────────────────────
function F({ label, value, onChange, type='text', half, mono, highlight }) {
  return (
    <div style={{ gridColumn: half ? 'auto' : '1/-1' }}>
      <label style={{ fontSize:10, fontWeight:700, color: highlight?'#F28100':'#6B7280',
        textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:3 }}>
        {label}{highlight && ' ✦'}
      </label>
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)}
        style={{ ...S.inp, width:'100%', fontSize:12, fontFamily: mono?'monospace':'inherit',
          borderColor: highlight?'#FDBA74':'#E5E7EB' }}/>
    </div>
  );
}

// ─── Modal "Nuevo pago" ───────────────────────────────────────────────────────
function NewPaymentModal({ onClose, onCreated }) {
  const [step,       setStep]       = useState(1); // 1=archivos, 2=revisar, 3=ok
  const [invFile,    setInvFile]    = useState(null);
  const [recFile,    setRecFile]    = useState(null);
  const [invUrl,     setInvUrl]     = useState('');
  const [recUrl,     setRecUrl]     = useState('');
  const [extracting, setExtracting] = useState(false);
  const [form,       setForm]       = useState(EMPTY());
  const [highlighted, setHighlighted] = useState({}); // campos auto-extraídos
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  const set = k => v => setForm(f => ({...f, [k]:v}));

  const handleExtract = async () => {
    if (!invFile && !recFile) { setErr('Subí al menos uno de los dos archivos para analizar'); return; }
    setExtracting(true); setErr('');
    try {
      const res = await api.extractSupplierPayment(invFile, recFile);
      const m   = res.merged || {};
      // Pre-llenar form con lo extraído, marcar campos con valor
      const newForm = { ...EMPTY() };
      const hl = {};
      for (const [k,v] of Object.entries(m)) {
        if (v !== null && v !== undefined && String(v).trim()) {
          newForm[k] = String(v);
          hl[k] = true;
        }
      }
      // Preservar URLs ingresadas manualmente
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
      const payload = { ...form };
      // Si hay archivos, adjuntarlos; si hay URL, enviarla como campo de texto
      if (invFile) payload._invoiceFile = invFile;
      if (recFile) payload._receiptFile = recFile;

      // Crear con FormData
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v !== null && v !== undefined && String(v).trim()) fd.append(k, v); });
      if (invFile) fd.append('invoice', invFile);
      if (recFile) fd.append('receipt', recFile);

      // Usar fetch directo para FormData con archivos
      const token = null; // api.js maneja el token internamente
      const res = await api.createSupplierPayment(form); // sin archivos — urls ya en form
      // Si hay archivos subirlos aparte via el endpoint normal
      // (la api ya arma FormData con archivos si se pasan como campo especial)
      onCreated(res);
      setStep(3);
    } catch (e) { setErr(e.message || 'Error al guardar'); setSaving(false); }
  };

  // Step 3: éxito
  if (step === 3) return (
    <Modal onClose={onClose} title="Registro creado">
      <div style={{ textAlign:'center', padding:'24px 0' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:15, fontWeight:800, color:'#0F172A', marginBottom:4 }}>Pago registrado</div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:20 }}>El registro fue guardado correctamente.</div>
        <button onClick={onClose} style={{ ...S.btn, padding:'8px 28px' }}>Cerrar</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={step===1?'Nuevo pago a proveedor':'Revisar datos extraídos'} wide>

      {/* STEP 1 — Archivos */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:12, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'8px 12px' }}>
            Subí los PDF o pegá los links de Google Drive. Podés analizar automáticamente o ingresar los datos a mano.
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FileZone label="📋 Factura proveedor" file={invFile} onFile={setInvFile} url={invUrl} onUrl={setInvUrl} accent="#F28100"/>
            <FileZone label="🏦 Comprobante de pago" file={recFile} onFile={setRecFile} url={recUrl} onUrl={setRecUrl} accent="#2563EB"/>
          </div>

          {err && <div style={{ color:'#EF4444', fontSize:12, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'6px 10px' }}>{err}</div>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={handleExtract} disabled={extracting}
              style={{ ...S.btn, flex:2 }}>
              {extracting ? 'Analizando PDFs…' : '🔍 Analizar y extraer datos'}
            </button>
            <button onClick={handleSkipExtract}
              style={{ ...S.btn2, flex:1 }}>
              Ingresar manual →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Revisar / editar */}
      {step === 2 && (
        <div style={{ maxHeight:'72vh', overflowY:'auto', paddingRight:4 }}>
          {Object.keys(highlighted).length > 0 && (
            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'7px 12px', marginBottom:12, fontSize:11, color:'#92400E' }}>
              ✦ Los campos marcados fueron extraídos automáticamente. Revisá y corregí si es necesario.
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

            <F label="Proveedor" value={form.provider} onChange={set('provider')} highlight={!!highlighted.provider}/>
            <F label="Número de factura *" value={form.invoice_number} onChange={set('invoice_number')} mono highlight={!!highlighted.invoice_number} half/>
            <F label="Número de comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono highlight={!!highlighted.receipt_number} half/>

            <F label="Fecha emisión factura" value={form.invoice_date} onChange={set('invoice_date')} type="date" highlight={!!highlighted.invoice_date} half/>
            <F label="Fecha vencimiento" value={form.due_date} onChange={set('due_date')} type="date" highlight={!!highlighted.due_date} half/>
            <F label="Fecha de pago" value={form.payment_date} onChange={set('payment_date')} type="date" highlight={!!highlighted.payment_date} half/>
            <F label="Monto total ($)" value={form.total_amount} onChange={set('total_amount')} type="number" highlight={!!highlighted.total_amount} half/>

            <F label="Nombre pagador" value={form.payer_name} onChange={set('payer_name')} highlight={!!highlighted.payer_name}/>

            <F label="Marca" value={form.brand} onChange={set('brand')} highlight={!!highlighted.brand} half/>
            <F label="Modelo" value={form.model} onChange={set('model')} highlight={!!highlighted.model} half/>
            <F label="Color" value={form.color} onChange={set('color')} highlight={!!highlighted.color} half/>
            <F label="Año comercial" value={form.commercial_year} onChange={set('commercial_year')} type="number" highlight={!!highlighted.commercial_year} half/>
            <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono highlight={!!highlighted.motor_num} half/>
            <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono highlight={!!highlighted.chassis} half/>
            <F label="Código interno" value={form.internal_code} onChange={set('internal_code')} mono highlight={!!highlighted.internal_code} half/>

            <F label="URL Factura (Drive o Cloudinary)" value={form.invoice_url} onChange={set('invoice_url')} highlight={!!highlighted.invoice_url}/>
            <F label="URL Comprobante (Drive o Cloudinary)" value={form.receipt_url} onChange={set('receipt_url')} highlight={!!highlighted.receipt_url}/>

            <F label="Notas" value={form.notes} onChange={set('notes')}/>

            {/* Estado */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:3 }}>Estado</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(STATUS_CFG).map(([k,v]) => (
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

          {err && <div style={{ color:'#EF4444', fontSize:12, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'6px 10px', marginTop:10 }}>{err}</div>}

          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={()=>setStep(1)} style={{ ...S.btn2, flex:1 }}>← Volver</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex:2 }}>
              {saving ? 'Guardando…' : '💾 Guardar registro'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal detalle/edición ────────────────────────────────────────────────────
function DetailModal({ payment: p0, onClose, onUpdated, onDeleted, isSuperAdmin }) {
  const [p, setP]         = useState(p0);
  const [editing, setEditing] = useState(false);
  const [form, setForm]   = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = k => v => setForm(f => ({...f, [k]:v}));

  const startEdit = () => {
    setForm({ ...p, invoice_date: p.invoice_date?.slice(0,10)||'', due_date: p.due_date?.slice(0,10)||'', payment_date: p.payment_date?.slice(0,10)||'' });
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
        {/* Header status + acciones */}
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
              <button onClick={handleDelete} disabled={deleting} style={{ ...S.btn, background:'#EF4444', padding:'5px 14px', fontSize:12 }}>{deleting?'Eliminando…':'Confirmar'}</button>
              <button onClick={()=>setConfirmDel(false)} style={{ ...S.btn2, padding:'5px 14px', fontSize:12 }}>Cancelar</button>
            </div>
          </div>
        )}

        {editing ? (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <F label="Proveedor" value={form.provider} onChange={set('provider')}/>
            <F label="N° Factura" value={form.invoice_number} onChange={set('invoice_number')} mono half/>
            <F label="N° Comprobante" value={form.receipt_number} onChange={set('receipt_number')} mono half/>
            <F label="Fecha factura" value={form.invoice_date} onChange={set('invoice_date')} type="date" half/>
            <F label="Vencimiento" value={form.due_date} onChange={set('due_date')} type="date" half/>
            <F label="Fecha pago" value={form.payment_date} onChange={set('payment_date')} type="date" half/>
            <F label="Monto total ($)" value={form.total_amount} onChange={set('total_amount')} type="number" half/>
            <F label="Pagador" value={form.payer_name} onChange={set('payer_name')}/>
            <F label="Marca" value={form.brand} onChange={set('brand')} half/>
            <F label="Modelo" value={form.model} onChange={set('model')} half/>
            <F label="Color" value={form.color} onChange={set('color')} half/>
            <F label="Año" value={form.commercial_year} onChange={set('commercial_year')} type="number" half/>
            <F label="N° Motor" value={form.motor_num} onChange={set('motor_num')} mono half/>
            <F label="N° Chasis" value={form.chassis} onChange={set('chassis')} mono half/>
            <F label="Código interno" value={form.internal_code} onChange={set('internal_code')} mono half/>
            <F label="URL Factura" value={form.invoice_url} onChange={set('invoice_url')}/>
            <F label="URL Comprobante" value={form.receipt_url} onChange={set('receipt_url')}/>
            <F label="Notas" value={form.notes} onChange={set('notes')}/>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:3 }}>Estado</label>
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
            </div>
            <div style={{ gridColumn:'1/-1', display:'flex', gap:8, marginTop:4 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...S.btn, flex:2 }}>{saving?'Guardando…':'Guardar'}</button>
              <button onClick={()=>setEditing(false)} style={{ ...S.btn2, flex:1 }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            {/* Info grid */}
            <Grid>
              <Row label="Proveedor"       value={p.provider}       bold/>
              <Row label="N° Factura"      value={p.invoice_number} mono bold/>
              <Row label="N° Comprobante"  value={p.receipt_number} mono/>
              <Row label="Fecha factura"   value={fDate(p.invoice_date)}/>
              <Row label="Vencimiento"     value={fDate(p.due_date)}/>
              <Row label="Fecha de pago"   value={fDate(p.payment_date)} highlight/>
              <Row label="Monto total"     value={fmtCLP(p.total_amount)} bold highlight/>
              <Row label="Pagador"         value={p.payer_name}/>
            </Grid>

            <div style={{ marginTop:14, marginBottom:4, fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Vehículo</div>
            <Grid>
              <Row label="Marca"  value={p.brand}  half/>
              <Row label="Modelo" value={p.model}  half/>
              <Row label="Color"  value={p.color}  half/>
              <Row label="Año"    value={p.commercial_year} half/>
              <Row label="N° Motor"  value={p.motor_num}  mono half/>
              <Row label="N° Chasis" value={p.chassis}    mono half/>
              <Row label="Cód. interno" value={p.internal_code} mono half/>
            </Grid>

            {p.notes && (
              <div style={{ marginTop:12, background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#4B5563' }}>
                📝 {p.notes}
              </div>
            )}

            {/* Links a archivos */}
            {(p.invoice_url || p.receipt_url) && (
              <div style={{ marginTop:12, display:'flex', gap:8 }}>
                {p.invoice_url && (
                  <a href={p.invoice_url} target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:8, textDecoration:'none', fontSize:12, fontWeight:700, color:'#EA580C' }}>
                    📋 Ver Factura
                  </a>
                )}
                {p.receipt_url && (
                  <a href={p.receipt_url} target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, textDecoration:'none', fontSize:12, fontWeight:700, color:'#2563EB' }}>
                    🏦 Ver Comprobante
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

function Grid({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>{children}</div>;
}
function Row({ label, value, bold, mono, highlight, half }) {
  if (!value) return null;
  return (
    <div style={{ gridColumn: half?'auto':'1/-1', padding:'6px 0', borderBottom:'1px solid #F3F4F6' }}>
      <div style={{ fontSize:10, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:1 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:bold?700:400, fontFamily:mono?'monospace':'inherit', color:highlight?'#0F172A':'#374151' }}>
        {value}
      </div>
    </div>
  );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
export function SupplierPaymentsView({ user }) {
  const isSuperAdmin = user.role === 'super_admin';
  const canCreate    = ['super_admin','admin_comercial','backoffice'].includes(user.role);

  const [payments,  setPayments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [q,         setQ]         = useState('');
  const [fStatus,   setFStatus]   = useState('');

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

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, padding:'20px 24px', maxWidth:1100 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
        <div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#0F172A' }}>Pagos a proveedor</h1>
          {pendientes > 0 && (
            <div style={{ fontSize:11, color:'#854D0E', marginTop:2 }}>
              {pendientes} {pendientes===1?'pago pendiente':'pagos pendientes'}
            </div>
          )}
        </div>
        <div style={{ flex:1 }}/>
        {canCreate && (
          <button onClick={()=>setShowNew(true)} style={{ ...S.btn, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:16, lineHeight:1 }}>+</span> Nuevo pago
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Buscar por factura, proveedor, chasis, modelo…"
          style={{ ...S.inp, width:280, fontSize:12 }}/>
        <div style={{ display:'flex', gap:6 }}>
          {[['','Todos'],['pendiente','Pendientes'],['pagado','Pagados'],['revisado','Revisados']].map(([v,l])=>(
            <button key={v} onClick={()=>setFStatus(v)}
              style={{ padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
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
              {['Estado','N° Factura','Proveedor','Fecha factura','Fecha pago','Monto','Vehículo','Archivos'].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#9CA3AF' }}>Cargando…</td></tr>
            )}
            {!loading && payments.length === 0 && (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
                <div style={{ fontWeight:600 }}>Sin registros</div>
                <div style={{ fontSize:11, marginTop:4 }}>Registrá el primer pago a proveedor</div>
              </td></tr>
            )}
            {!loading && payments.map(p => {
              const sc = STATUS_CFG[p.status] || STATUS_CFG.pendiente;
              return (
                <tr key={p.id} onClick={()=>setSelected(p)}
                  style={{ borderBottom:'1px solid #F3F4F6', cursor:'pointer', transition:'background 0.1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#FAFBFF'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:12,
                      background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, whiteSpace:'nowrap' }}>{sc.label}</span>
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'#0F172A' }}>
                    {p.invoice_number || '—'}
                  </td>
                  <td style={{ padding:'10px 12px', color:'#374151' }}>{p.provider || '—'}</td>
                  <td style={{ padding:'10px 12px', color:'#6B7280', whiteSpace:'nowrap' }}>{fDate(p.invoice_date)}</td>
                  <td style={{ padding:'10px 12px', color:'#6B7280', whiteSpace:'nowrap' }}>{fDate(p.payment_date)}</td>
                  <td style={{ padding:'10px 12px', fontWeight:700, color:'#0F172A', whiteSpace:'nowrap' }}>{fmtCLP(p.total_amount)}</td>
                  <td style={{ padding:'10px 12px', color:'#374151', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {[p.brand, p.model, p.commercial_year].filter(Boolean).join(' ')}
                    {p.chassis && <span style={{ marginLeft:4, fontSize:10, color:'#9CA3AF', fontFamily:'monospace' }}>({p.chassis})</span>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {p.invoice_url && <span title="Factura" style={{ fontSize:16 }}>📋</span>}
                      {p.receipt_url && <span title="Comprobante" style={{ fontSize:16 }}>🏦</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Contador */}
      {!loading && payments.length > 0 && (
        <div style={{ textAlign:'right', fontSize:11, color:'#9CA3AF', marginTop:8 }}>
          {payments.length} registro{payments.length!==1?'s':''}
        </div>
      )}

      {/* Modales */}
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
