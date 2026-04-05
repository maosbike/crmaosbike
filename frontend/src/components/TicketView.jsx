import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';
import { RemindersTab } from './RemindersTab.jsx';
import { SellFromTicketModal } from './SellFromTicketModal.jsx';

// Formatea teléfono para display: "912345678" → "+56 9 1234 5678"
function formatPhone(raw) {
  if (!raw) return '';
  const s = raw.toString().trim();
  if (/^9\d{8}$/.test(s))   return `+56 9 ${s.slice(1,5)} ${s.slice(5)}`;
  if (/^569\d{8}$/.test(s)) return `+56 9 ${s.slice(3,7)} ${s.slice(7)}`;
  return s;
}

// Formatea RUT para display: "163459779" o "16345977-9" → "16.345.977-9"
function displayRut(raw) {
  if (!raw) return '';
  const s = raw.toString().replace(/\./g, '').trim();
  const [body, dv] = s.includes('-') ? s.split('-') : [s.slice(0, -1), s.slice(-1)];
  if (!body) return raw;
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + (dv || '');
}

const slaBox = (bg, border, color) => ({
  background:bg, border:`1px solid ${border}`, borderRadius:8,
  padding:'7px 10px', marginBottom:8, fontSize:11, color,
  display:'flex', alignItems:'flex-start', gap:6, lineHeight:1.4,
});
const zoneDiv  = { borderRight:'1px solid #ECEEF1' };
const lbl9     = { display:'block', fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:5 };
const secCard  = { background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden', marginBottom:12 };
const secTitle = (color='#374151') => ({
  fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.14em',
  paddingBottom:7, marginBottom:10, borderBottom:`2px solid ${color}22`,
});

// Resultados que exigen evidencia (screenshot o nota ≥50 chars)
const EVIDENCE_RESULTS=['Contactado','Interesado','Agendó visita','Cotización entregada','Envió documentos','No interesado'];
// Resultados que solo exigen nota ≥40 chars (intento fallido)
const NOTE_RESULTS=['No contesta','Buzón de voz'];
const EV_TYPES=[
  {v:'screenshot_whatsapp',l:'WhatsApp'},
  {v:'screenshot_llamada',  l:'Llamada'},
  {v:'archivo',             l:'Otro archivo'},
];

export function TicketView({lead,user,nav,updLead}){
  const[histOpen,setHistOpen]=useState(false);
  const m=lead.model_brand?{brand:lead.model_brand,model:lead.model_name,price:lead.model_price||0,bonus:lead.model_bonus||0,year:lead.model_year||2025,cc:lead.model_cc||0,cat:lead.model_category||'',colors:[],image:lead.model_image||null}:null;
  const s={fn:lead.seller_fn||'',ln:lead.seller_ln||''};
  const br={name:lead.branch_name||'',code:lead.branch_code||'',addr:lead.branch_addr||''};
  const isAdmin=["super_admin","admin_comercial"].includes(user.role);
  const[realSellers,setRealSellers]=useState([]);
  const[realModels,setRealModels]=useState([]);
  const[assignHistory,setAssignHistory]=useState([]);
  useEffect(()=>{
    if(isAdmin){
      api.getSellers().then(d=>setRealSellers(Array.isArray(d)?d:[])).catch(()=>{});
      api.getReassignments(lead.id).then(d=>setAssignHistory(Array.isArray(d)?d:[])).catch(()=>{});
    }
    api.getModels().then(d=>setRealModels(Array.isArray(d)?d:[])).catch(()=>{});
  },[isAdmin,lead.id]);
  const sellers=realSellers;

  const created=new Date(lead.createdAt).getTime();const now=Date.now();
  const lastC=lead.lastContact?new Date(lead.lastContact).getTime():0;
  const sinContactoH=Math.floor((lastC?(now-lastC):(now-created))/(1e3*60*60));
  const slaReassigned=lead.sla_status==="reassigned";
  const slaBreach=lead.sla_status==="breached";
  const slaWarning=lead.sla_status==="warning";

  const[showSell,setShowSell]=useState(false);
  const[noteForm,setNoteForm]=useState("");
  const[noteErr,setNoteErr]=useState("");

  // ── Modal Registrar Contacto ──
  const[showContact,setShowContact]=useState(false);
  const[cf,setCf]=useState({method:'whatsapp',result:'',note:'',evMode:'file',evType:'screenshot_whatsapp'});
  const[evFile,setEvFile]=useState(null);
  const[evPreview,setEvPreview]=useState(null);
  const[cfErr,setCfErr]=useState('');
  const[cfSaving,setCfSaving]=useState(false);
  const[cfDone,setCfDone]=useState(false);

  const needsEvidence=EVIDENCE_RESULTS.includes(cf.result);
  const needsNote=NOTE_RESULTS.includes(cf.result);
  const noteMinLen=needsEvidence?50:needsNote?40:0;

  const resetContact=()=>{
    setCf({method:'whatsapp',result:'',note:'',evMode:'file',evType:'screenshot_whatsapp'});
    setEvFile(null);setEvPreview(null);setCfErr('');setCfDone(false);
  };
  const closeContact=()=>{setShowContact(false);resetContact();};

  const submitContact=async()=>{
    setCfErr('');
    if(!cf.result){setCfErr('Selecciona un resultado antes de continuar.');return;}
    if(needsEvidence){
      if(cf.evMode==='file'&&!evFile){setCfErr('Debes subir una captura de pantalla o cambiar a nota detallada.');return;}
      if(cf.evMode==='note'&&cf.note.trim().length<50){setCfErr(`La nota debe tener al menos 50 caracteres (${cf.note.trim().length}/50).`);return;}
    }
    if(needsNote&&cf.note.trim().length<40){setCfErr(`Para este resultado la nota es obligatoria (mín. 40 caracteres, ${cf.note.trim().length}/40).`);return;}
    setCfSaving(true);
    try{
      // Si hay evidencia con archivo, subirla como entrada de evidencia
      if(needsEvidence&&cf.evMode==='file'&&evFile){
        const fd=new FormData();
        fd.append('file',evFile);
        fd.append('ev_type',cf.evType);
        if(cf.note.trim())fd.append('note',cf.note.trim());
        await api.addEvidence(lead.id,fd);
      } else if(needsEvidence&&cf.evMode==='note'){
        const fd=new FormData();
        fd.append('note',cf.note.trim());
        fd.append('ev_type','nota');
        await api.addEvidence(lead.id,fd);
      }
      // Registrar el contacto en timeline
      const title=`${cf.method.charAt(0).toUpperCase()+cf.method.slice(1)}: ${cf.result}`;
      const noteForTimeline=(needsEvidence||needsNote)?null:cf.note.trim()||null;
      const entry=await api.addTimeline(lead.id,{type:'contact_registered',method:cf.method,title,note:noteForTimeline});
      addTimelineLocal(entry);
      // Reflejo inmediato del estado en UI: si el lead no está en estado avanzado/terminal, pasa a En gestión
      if(!['en_gestion','cotizado','financiamiento','ganado','perdido','cerrado'].includes(lead.status)){
        updLead(lead.id,{status:'en_gestion'});
      }
      setCfDone(true);
      setTimeout(()=>closeContact(),2200);
    }catch(e){
      setCfErr(e.message||'Error al guardar. Intentá de nuevo.');
    }finally{setCfSaving(false);}
  };

  const upd=(field,val)=>updLead(lead.id,{[field]:val});
  const addTimelineLocal=(entry)=>{updLead(lead.id,{timeline:[entry,...(lead.timeline||[])],first_action_at:lead.first_action_at||entry.created_at||entry.date,lastContact:new Date().toISOString()});};

  const submitNote=async e=>{
    e.preventDefault();
    if(noteForm.trim().length<20){setNoteErr("La nota debe tener al menos 20 caracteres");return;}
    setNoteErr("");
    try{
      const entry=await api.addTimeline(lead.id,{type:"note_added",title:"Nota agregada",note:noteForm.trim()});
      addTimelineLocal(entry);
    }catch{
      addTimelineLocal({id:`tl-${Date.now()}`,type:"note_added",title:"Nota agregada",note:noteForm.trim(),date:new Date().toISOString(),user_fn:user.fn,user_ln:user.ln});
    }
    setNoteForm("");
  };
  const isGanado=lead.status==="ganado";
  const isPerdido=lead.status==="perdido";

  return(
    <div style={{ width:'100%' }}>

      {/* ── BREADCRUMB + ACCIONES ── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
        <button onClick={()=>nav("leads")}
          style={{ ...S.gh, display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
            fontSize:12, fontWeight:500, color:'#6B7280',
            border:'1px solid #E5E7EB', background:'#FFFFFF', borderRadius:7 }}>
          <Ic.back size={13} color="#9CA3AF"/> Leads
        </button>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <span style={{ fontSize:12, color:'#9CA3AF' }}>#{lead.num}</span>
        <span style={{ color:'#D1D5DB' }}>›</span>
        <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{lead.fn} {lead.ln}</span>
        {/* Acciones principales — derecha */}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {!isPerdido&&!isGanado&&(
            <button onClick={()=>{resetContact();setShowContact(true);}}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                background:'#2563EB', color:'#fff', border:'none', borderRadius:8,
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                boxShadow:'0 2px 8px rgba(37,99,235,0.25)' }}>
              <Ic.phone size={13} color="#fff"/>Registrar contacto
            </button>
          )}
          {!isPerdido&&(
            <button onClick={()=>setShowSell(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
                background: isGanado?'transparent':'#10B981', color: isGanado?'#10B981':'#fff',
                border: isGanado?'1.5px solid #6EE7B7':'none', borderRadius:8,
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                boxShadow: isGanado?'none':'0 2px 8px rgba(16,185,129,0.25)' }}>
              <Ic.sale size={13} color={isGanado?"#10B981":"#fff"}/>
              {isGanado?'Registrar otra unidad':'Registrar venta'}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TOP CARD — CLIENTE | PRODUCTO | CONTACTO | STATUS
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        background:'#FFFFFF', borderRadius:14, border:'1px solid #E5E7EB',
        boxShadow:'0 1px 6px rgba(0,0,0,0.06)',
        display:'grid', gridTemplateColumns:'minmax(180px,200px) minmax(0,1fr) minmax(200px,268px) minmax(200px,252px)',
        overflow:'hidden', marginBottom:12, minWidth:0,
      }}>

        {/* Z1: CLIENTE */}
        <div style={{ ...zoneDiv, padding:'18px 16px', display:'flex', flexDirection:'column' }}>
          <div style={lbl9}>Cliente</div>
          <h1 style={{ margin:'0 0 10px', fontSize:18, fontWeight:900, color:'#0F172A', letterSpacing:'-0.4px', lineHeight:1.15 }}>
            {lead.fn} {lead.ln}
          </h1>
          <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
            {lead.phone&&<span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#374151', fontWeight:500 }}><Ic.phone size={11} color="#9CA3AF"/>{formatPhone(lead.phone)}</span>}
            {lead.email&&<span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}><Ic.mail size={11} color="#9CA3AF"/>{lead.email}</span>}
            {lead.rut&&<span style={{ fontSize:11, color:'#6B7280', fontVariantNumeric:'tabular-nums' }}>RUT {displayRut(lead.rut)}</span>}
            {lead.comuna&&<span style={{ fontSize:11, color:'#9CA3AF' }}>{lead.comuna}</span>}
          </div>
          <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid #F1F3F5', display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontSize:10, color:'#9CA3AF' }}>Prioridad</span><PBdg p={lead.priority}/></div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontSize:10, color:'#9CA3AF' }}>Vendedor</span><span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{s.fn} {s.ln}</span></div>
            {br.name&&<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontSize:10, color:'#9CA3AF' }}>Sucursal</span><span style={{ fontSize:11, color:'#6B7280' }}>{br.name}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontSize:10, color:'#9CA3AF' }}>Ingresó</span><span style={{ fontSize:11, color:'#9CA3AF' }}>{ago(lead.createdAt)}</span></div>
          </div>
        </div>

        {/* Z2: PRODUCTO */}
        <div style={{ ...zoneDiv, padding:'18px 22px', display:'flex', flexDirection:'column' }}>
          <div style={{ ...lbl9, color:'#F28100' }}>Producto Cotizado</div>
          {m ? (
            <>
              <div style={{ display:'flex', gap:20, marginBottom:14, alignItems:'flex-start', flex:1 }}>
                <div style={{ width:140, height:112, borderRadius:10, background:'#F3F4F6', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #E5E7EB' }}>
                  {m.image?<img src={m.image} alt={m.model} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ fontSize:9, color:'#9CA3AF', fontWeight:600 }}>SIN IMG</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:22, fontWeight:900, color:'#0F172A', letterSpacing:'-0.6px', lineHeight:1.1, marginBottom:4 }}>{m.brand} {m.model}</div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
                    {m.year&&<span style={{ fontSize:12, fontWeight:700, color:'#4F46E5', background:'#EEF2FF', padding:'2px 9px', borderRadius:6, border:'1px solid #C7D2FE' }}>{m.year}</span>}
                    {m.cc>0&&<span style={{ fontSize:11, color:'#9CA3AF' }}>{m.cc}cc</span>}
                    {m.cat&&<span style={{ fontSize:11, color:'#9CA3AF' }}>{m.cat}</span>}
                  </div>
                  {m.price>0&&(
                    <div>
                      <div style={{ fontSize:28, fontWeight:900, color:'#F28100', letterSpacing:'-1px', lineHeight:1 }}>{fmt(m.price)}</div>
                      {m.bonus>0&&<div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>Desde {fmt(m.price-m.bonus)} · ahorra {fmt(m.bonus)}</div>}
                    </div>
                  )}
                  {lead.colorPref&&<div style={{ marginTop:8 }}><span style={{ fontSize:10, background:'#F3F4F6', borderRadius:5, padding:'3px 9px', color:'#6B7280', fontWeight:500, border:'1px solid #E5E7EB' }}>Color: {lead.colorPref}</span></div>}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', color:'#9CA3AF', fontSize:13 }}>Sin modelo seleccionado</div>
          )}
          <div style={{ marginTop:'auto' }}>
            <label style={lbl9}>Cambiar modelo</label>
            <select value={lead.motoId||""} onChange={e=>upd("motoId",e.target.value)} style={{ ...S.inp, width:'100%', fontSize:11 }}>
              <option value="">Seleccionar...</option>
              {realModels.map(mo=><option key={mo.id} value={mo.id}>{mo.brand} {mo.model}{mo.price?` - ${fmt(mo.price)}`:''}</option>)}
            </select>
          </div>
        </div>

        {/* Z3: OBSERVACIONES */}
        <div style={{ ...zoneDiv, padding:'18px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={lbl9}>Observaciones</div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <label style={lbl9}>Obs. Vendedor</label>
              <textarea value={lead.obsVendedor||""} onChange={e=>upd("obsVendedor",e.target.value)} rows={4}
                style={{ ...S.inp, width:'100%', resize:'none', fontSize:11 }} placeholder="Notas internas del vendedor..."/>
            </div>
            {isAdmin&&(
              <div>
                <label style={lbl9}>Obs. Supervisor</label>
                <textarea value={lead.obsSupervisor||""} onChange={e=>upd("obsSupervisor",e.target.value)} rows={4}
                  style={{ ...S.inp, width:'100%', resize:'none', fontSize:11 }} placeholder="Notas del supervisor..."/>
              </div>
            )}
          </div>
          {lead.lastContact&&(
            <div style={{ marginTop:'auto', paddingTop:10, borderTop:'1px solid #F1F3F5' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3 }}>Último contacto</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fDT(lead.lastContact)}</div>
            </div>
          )}
        </div>

        {/* Z4: STATUS */}
        <div style={{ padding:'18px 16px', background:'#FAFBFC', display:'flex', flexDirection:'column' }}>
          <div style={{ marginBottom:12, paddingBottom:10, borderBottom:'1px solid #ECEEF1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em' }}>#{lead.num}</span>
              {sinContactoH>0&&<span style={{ fontSize:11, fontWeight:600, color: slaBreach?'#EF4444':slaWarning?'#F97316':'#9CA3AF' }}>{sinContactoH}h</span>}
            </div>
            <TBdg s={lead.status}/>
            {/* Autofin badge — visible sin bajar */}
            {(() => {
              const fd = lead.fin_data ? (typeof lead.fin_data==='string'?JSON.parse(lead.fin_data):lead.fin_data) : null;
              const ev = fd?.eval_autofin || fd?.pre_eval_autofin;
              if (!ev) return null;
              const color = /aprob/i.test(ev)?'#10B981':/rechaz/i.test(ev)?'#EF4444':'#F59E0B';
              return <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:color+'18', border:`1px solid ${color}40`, fontSize:10, fontWeight:700, color }}><span style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }}/>Autofin: {ev}</div>;
            })()}
          </div>
          {slaReassigned&&<div style={slaBox("rgba(139,92,246,0.07)","rgba(139,92,246,0.22)","#7C3AED")}><Ic.users size={12} color="#7C3AED"/><span><strong>Reasignado</strong> · {s.fn}{s.ln?` ${s.ln}`:''}</span></div>}
          {slaBreach&&!slaReassigned&&<div style={slaBox("rgba(239,68,68,0.07)","rgba(239,68,68,0.22)","#EF4444")}><Ic.alert size={12} color="#EF4444"/><span><strong>Vencido</strong> · {sinContactoH}h sin gestión</span></div>}
          {slaWarning&&<div style={slaBox("rgba(249,115,22,0.07)","rgba(249,115,22,0.22)","#F97316")}><Ic.clock size={12} color="#F97316"/><span><strong>Atender ya</strong> · {8-sinContactoH}h restantes</span></div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:8 }}>
            <div>
              <label style={S.lbl}>Prioridad</label>
              <select value={lead.priority} onChange={e=>upd("priority",e.target.value)} style={{ ...S.inp, width:'100%', fontSize:11 }}>
                {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Estado</label>
              <select value={lead.status} onChange={e=>upd("status",e.target.value)} style={{ ...S.inp, width:'100%', fontSize:11 }}>
                {Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <label style={S.lbl}>Test Ride</label>
            <div style={{ display:'flex', gap:5 }}>
              {[true,false].map(v=>(
                <button key={String(v)} onClick={()=>upd("testRide",v)}
                  style={{ flex:1, padding:'5px', fontSize:11, fontWeight:600, fontFamily:'inherit', borderRadius:6, cursor:'pointer', border:'none',
                    background: lead.testRide===v?(v?'#10B981':'#374151'):'#EFEFEF', color: lead.testRide===v?'#fff':'#9CA3AF' }}>
                  {v?"✓ Sí":"✗ No"}
                </button>
              ))}
            </div>
          </div>
          {isAdmin&&(
            <div style={{ marginBottom:8 }}>
              <label style={S.lbl}>Vendedor asignado</label>
              <select value={lead.seller_id||lead.seller||""}
                onChange={e=>{
                  const sl=sellers.find(s=>s.id===e.target.value);
                  const slName=sl?(sl.first_name||sl.fn||'')+" "+(sl.last_name||sl.ln||''):"";
                  updLead(lead.id,{seller:e.target.value,seller_id:e.target.value,timeline:[{id:`tl-${Date.now()}`,type:"system",title:`Reasignado a ${slName.trim()}`,date:new Date().toISOString(),user:`${user.fn} ${user.ln}`},...lead.timeline]});
                }}
                style={{ ...S.inp, width:'100%', fontSize:11 }}>
                <option value="">Seleccionar...</option>
                {sellers.map(sl=>{const fn=sl.first_name||sl.fn||'';const ln=sl.last_name||sl.ln||'';const bc=sl.branch_code||'';return<option key={sl.id} value={sl.id}>{fn} {ln}{bc?` - ${bc}`:''}</option>;})}
              </select>
            </div>
          )}
        </div>

      </div>{/* /top card */}

      {/* ══════════════════════════════════════════════════════════
          DATOS CLIENTE + FINANCIAMIENTO — sección principal
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'16px 20px 0', borderBottom:'1px solid #F1F3F5', marginBottom:0 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Datos del Cliente</span>
        </div>
        <div style={{ padding:'18px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>

            {/* Columna izq: Identificación + Contacto */}
            <div>
              <div style={secTitle('#F28100')}>Identificación Personal</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:20 }}>
                <Field label="RUT" value={displayRut(lead.rut)} onChange={v=>upd("rut",v)}/>
                <Field label="Nombre" value={lead.fn} onChange={v=>upd("fn",v)}/>
                <Field label="Apellido" value={lead.ln} onChange={v=>upd("ln",v)}/>
                <Field label="Fecha Nacimiento" value={lead.bday} onChange={v=>upd("bday",v)} ph="DD/MM/AAAA"/>
              </div>

              <div style={secTitle('#3B82F6')}>Contacto</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                <Field label="Email" value={lead.email} onChange={v=>upd("email",v)} type="email"/>
                <Field label="Celular" value={lead.phone} onChange={v=>upd("phone",v)}/>
                <Field label="Comuna" value={lead.comuna} onChange={v=>upd("comuna",v)} opts={COMUNAS.map(c=>({v:c,l:c}))}/>
                <Field label="Origen" value={lead.source} onChange={v=>upd("source",v)} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/>
              </div>
            </div>

            {/* Columna der: Perfil Financiero + Financiamiento */}
            <div>
              <div style={secTitle('#10B981')}>Perfil Financiero</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:14 }}>
                <Field label="Situación Laboral" value={lead.sitLab} onChange={v=>upd("sitLab",v)} opts={[{v:"",l:"Seleccionar..."},...SIT_LABORAL.map(s=>({v:s,l:s}))]}/>
                <Field label="Continuidad Laboral" value={lead.continuidad} onChange={v=>upd("continuidad",v)} opts={[{v:"",l:"Seleccionar..."},...CONTINUIDAD.map(c=>({v:c,l:c}))]}/>
                <Field label="Renta Líquida" value={lead.renta} onChange={v=>upd("renta",Number(v))} type="number"/>
                <Field label="Pie" value={lead.pie} onChange={v=>upd("pie",Number(v))} type="number"/>
              </div>

              {/* Financiamiento integrado */}
              <div style={secTitle('#8B5CF6')}>Financiamiento</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:12 }}>
                <div>
                  <label style={S.lbl}>Estado</label>
                  <select value={lead.finStatus} onChange={e=>upd("finStatus",e.target.value)} style={{ ...S.inp, width:'100%' }}>
                    {Object.entries(FIN_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Motivo Rechazo</label>
                  <select value={lead.rechazoMotivo||""} onChange={e=>upd("rechazoMotivo",e.target.value)}
                    style={{ ...S.inp, width:'100%' }} disabled={lead.finStatus!=="rechazado"}>
                    <option value="">Seleccionar...</option>
                    {RECHAZO_MOTIVOS.map(mo=><option key={mo} value={mo}>{mo}</option>)}
                  </select>
                </div>
              </div>
              {lead.finStatus==="rechazado"&&lead.rechazoMotivo&&(
                <div style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#EF4444' }}>
                  Rechazado: {lead.rechazoMotivo}
                </div>
              )}
              {lead.finStatus==="aprobado"&&(
                <div style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#10B981' }}>
                  Financiamiento aprobado
                </div>
              )}

              {/* ¿Financiamiento? + Guardar */}
              <div style={{ display:'flex', alignItems:'center', gap:16, padding:'10px 12px', background:'#F9FAFB', borderRadius:8, border:'1px solid #E5E7EB' }}>
                <div>
                  <label style={{ ...S.lbl, marginBottom:5 }}>¿Solicita financiamiento?</label>
                  <div style={{ display:'flex', gap:6 }}>
                    {[true,false].map(v=>(
                      <button key={String(v)} type="button" onClick={()=>upd("wantsFin",v)}
                        style={{ ...S.btn2, padding:'4px 14px', fontSize:12,
                          background:lead.wantsFin===v?(v?"#F28100":"#374151"):"transparent",
                          color:lead.wantsFin===v?"#fff":"#888",
                          border:lead.wantsFin===v?"none":"1px solid #D1D5DB" }}>
                        {v?"Sí":"No"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginLeft:'auto' }}>
                  <button onClick={async()=>{
                    try{const e=await api.addTimeline(lead.id,{type:"system",title:"Datos del cliente actualizados",note:null});addTimelineLocal(e);}
                    catch{addTimelineLocal({id:`tl-${Date.now()}`,type:"system",title:"Datos del cliente actualizados",date:new Date().toISOString()});}
                  }} style={{ ...S.btn, fontSize:12 }}>
                    Guardar cambios
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          EVALUACIONES YAMAHA — solo si hay fin_data
      ══════════════════════════════════════════════════════════ */}
      {lead.fin_data && Object.keys(lead.fin_data).length > 0 && (() => {
        const fd = typeof lead.fin_data === 'string' ? JSON.parse(lead.fin_data) : lead.fin_data;
        const hasAutofin = fd.id_autofin || fd.pre_eval_autofin || fd.eval_autofin || fd.obs_autofin;
        if (!hasAutofin) return null;
        const evalColor = (v) => !v ? '#9CA3AF' : /aprob/i.test(v) ? '#10B981' : /rechaz/i.test(v) ? '#EF4444' : '#F59E0B';
        return (
          <div style={secCard}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F3F5', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Autofin</span>
              {fd.id_autofin && <span style={{ fontSize:11, color:'#94A3B8' }}>ID {fd.id_autofin}</span>}
              {fd.vendedor_ref && <span style={{ fontSize:11, color:'#94A3B8', marginLeft:'auto' }}>Ref: {fd.vendedor_ref}</span>}
            </div>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:8 }}>
              {fd.pre_eval_autofin && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Pre-evaluación:</span>
                <span style={{ fontSize:12, fontWeight:700, color:evalColor(fd.pre_eval_autofin) }}>{fd.pre_eval_autofin}</span>
              </div>}
              {fd.eval_autofin && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Evaluación:</span>
                <span style={{ fontSize:12, fontWeight:700, color:evalColor(fd.eval_autofin) }}>{fd.eval_autofin}</span>
              </div>}
              {fd.obs_autofin && <div style={{ fontSize:11, color:'#6B7280', background:'#F9FAFB', borderRadius:6, padding:'8px 10px', lineHeight:1.5 }}>{fd.obs_autofin}</div>}
              {fd.opcion_compra && <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6B7280', minWidth:110 }}>Opción compra:</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{fd.opcion_compra}</span>
              </div>}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
          TIMELINE — sección inferior
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F3F5' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Timeline de Gestión</span>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {/* Agregar nota */}
          <form onSubmit={submitNote} style={{ marginBottom:18, padding:12, background:'#F9FAFB', borderRadius:10, border:'1px solid #E5E7EB' }}>
            <label style={{ ...S.lbl, marginBottom:6 }}>Agregar nota <span style={{ color:'#9CA3AF', fontWeight:400 }}>(mín. 20 caracteres)</span></label>
            <textarea value={noteForm} onChange={e=>{setNoteForm(e.target.value);if(noteErr)setNoteErr("");}}
              rows={3} style={{ ...S.inp, width:'100%', resize:'vertical', marginBottom:6 }}
              placeholder="Ej: Llamé al cliente, dice que está evaluando otras opciones, volver en 3 días..."/>
            {noteErr&&<div style={{ fontSize:11, color:'#EF4444', marginBottom:6 }}>{noteErr}</div>}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:noteForm.length>=20?"#10B981":"#9CA3AF" }}>{noteForm.length}/20</span>
              <button type="submit" style={{ ...S.btn2, padding:'6px 14px', fontSize:12 }}>Guardar nota</button>
            </div>
          </form>
          {/* Entradas */}
          <div style={{ position:'relative', paddingLeft:20 }}>
            <div style={{ position:'absolute', left:7, top:0, bottom:0, width:2, background:'#E5E7EB' }}/>
            {(lead.timeline||[]).map((t,i)=>{
              const isEvidence=t.type==="contact_evidence";
              const dotColor=isEvidence?"#0D9488":t.type==="contact_registered"||t.type==="contact"?"#3B82F6":t.type==="note_added"?"#10B981":t.type==="status"?"#F28100":t.type==="reminder_created"?"#8B5CF6":"#374151";
              const userName=t.user||(t.user_fn?`${t.user_fn} ${t.user_ln}`:"Sistema");
              const evTypeLabel={screenshot_whatsapp:'WhatsApp',screenshot_llamada:'Llamada',archivo:'Archivo adjunto',nota:'Nota detallada'};
              return(
                <div key={t.id||i} style={{ position:'relative', paddingBottom:14, paddingLeft:16 }}>
                  <div style={{ position:'absolute', left:-2, top:4, width:12, height:12, borderRadius:'50%', background:dotColor, border:'2px solid #F5F5F7' }}/>
                  <div style={{ background: isEvidence?'#F0FDFA':'#F9FAFB', borderRadius:10, padding:12, border: isEvidence?'1px solid #99F6E4':'1px solid transparent' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{t.title}</span>
                      <span style={{ fontSize:10, color:'#9CA3AF' }}>{fDT(t.date||t.created_at)}</span>
                    </div>
                    {t.note&&<div style={{ fontSize:12, color:'#6B7280', marginTop:4, lineHeight:1.4 }}>{t.note}</div>}
                    {isEvidence&&t.evidence_url&&(
                      <a href={t.evidence_url} target="_blank" rel="noopener noreferrer"
                        style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:8, fontSize:12, fontWeight:600, color:'#0D9488', textDecoration:'none', background:'#CCFBF1', padding:'4px 10px', borderRadius:6 }}>
                        <Ic.file size={12} color="#0D9488"/> Ver evidencia adjunta
                      </a>
                    )}
                    <div style={{ fontSize:10, color:'#9CA3AF', marginTop:6 }}>
                      {userName}
                      {t.method?` · vía ${t.method}`:""}
                      {isEvidence&&t.evidence_type?` · ${evTypeLabel[t.evidence_type]||t.evidence_type}`:""}
                    </div>
                  </div>
                </div>
              );
            })}
            {!(lead.timeline||[]).length&&(
              <div style={{ fontSize:12, color:'#9CA3AF', paddingLeft:16 }}>Sin actividad registrada aún.</div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          RECORDATORIOS — sección inferior
      ══════════════════════════════════════════════════════════ */}
      <div style={secCard}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F1F3F5' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Recordatorios</span>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <RemindersTab ticketId={lead.id} user={user}/>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          HISTORIAL ASIGNACIÓN — solo admin, acordeón
      ══════════════════════════════════════════════════════════ */}
      {isAdmin&&(
        <div style={secCard}>
          <button onClick={()=>setHistOpen(o=>!o)}
            style={{ width:'100%', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center',
              background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#0F172A' }}>Historial de Asignación</span>
            <span style={{ fontSize:11, color:'#9CA3AF', display:'flex', alignItems:'center', gap:6 }}>
              {lead.reassignment_count>0&&<span style={{ fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,0.1)', color:'#7C3AED' }}>{lead.reassignment_count} reasignación{lead.reassignment_count!==1?"es":""}</span>}
              <Ic.chev size={14} color="#9CA3AF" style={{ transform: histOpen?'rotate(90deg)':'rotate(0deg)', transition:'transform 0.15s' }}/>
            </span>
          </button>
          {histOpen&&(
            <div style={{ padding:'0 20px 18px' }}>
              {assignHistory.length===0
                ?<div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:12 }}>Cargando historial...</div>
                :<div style={{ position:'relative', paddingLeft:24 }}>
                  <div style={{ position:'absolute', left:9, top:14, bottom:14, width:2, background:'#E5E7EB', borderRadius:2 }}/>
                  {assignHistory.map((ev,i)=>{
                    const isInit=ev.type==="initial_assignment";
                    const isSLA=ev.reason==="sla_breach";
                    const isManual=ev.reason==="manual";
                    const isCurrent=ev.is_current;
                    const dotC=isInit?"#3B82F6":isSLA?"#EF4444":isManual?"#8B5CF6":"#6B7280";
                    const cardBg=isInit?"rgba(59,130,246,0.05)":isSLA?"rgba(239,68,68,0.05)":isManual?"rgba(139,92,246,0.05)":"rgba(107,114,128,0.04)";
                    const cardBorder=isInit?"rgba(59,130,246,0.18)":isSLA?"rgba(239,68,68,0.18)":isManual?"rgba(139,92,246,0.18)":"rgba(107,114,128,0.1)";
                    return(
                      <div key={ev.id||i} style={{ position:'relative', paddingBottom:i<assignHistory.length-1?14:0, paddingLeft:18 }}>
                        <div style={{ position:'absolute', left:-12, top:11, width:14, height:14, borderRadius:'50%', background:dotC, border:'2px solid #F5F5F7', boxShadow:isCurrent?`0 0 0 3px ${dotC}25`:"none" }}/>
                        <div style={{ padding:'10px 14px', borderRadius:10, background:cardBg, border:`1px solid ${cardBorder}` }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:5 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#111827', lineHeight:1.3 }}>
                              {isInit?<>↳ Asignado a <span style={{ color:dotC }}>{ev.to_name}</span></>:<><span style={{ color:'#6B7280' }}>{ev.from_name}</span> <span style={{ color:dotC, fontWeight:800 }}>→</span> <span style={{ color:'#111827' }}>{ev.to_name}</span></>}
                              {isCurrent&&<span style={{ marginLeft:8, fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:8, background:'#F28100', color:'#fff' }}>ACTUAL</span>}
                            </div>
                            <span style={{ fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap', flexShrink:0 }}>{fDT(ev.created_at)}</span>
                          </div>
                          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:6 }}>
                            <span style={{ fontSize:11, color:'#6B7280' }}>{ev.reason_label}</span>
                            <span style={{ fontSize:11, color:'#9CA3AF' }}>·</span>
                            <span style={{ fontSize:11, color:'#6B7280' }}>por {ev.by_name}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'flex-end' }}>
                            <span style={{ fontSize:10, color:isCurrent?"#F28100":"#9CA3AF", padding:'2px 8px', borderRadius:6, background:isCurrent?"rgba(242,129,0,0.08)":"rgba(0,0,0,0.04)", fontWeight:isCurrent?600:400 }}>
                              {isCurrent?"En curso · "+ev.duration_label:ev.duration_label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          )}
        </div>
      )}

      {showSell&&<SellFromTicketModal ticketId={lead.id} lead={lead} user={user} onClose={()=>setShowSell(false)} onSuccess={()=>{updLead(lead.id,{status:"ganado"});}}/>}

      {/* ══ MODAL REGISTRAR CONTACTO ══════════════════════════════ */}
      {showContact&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}
          onClick={e=>{if(e.target===e.currentTarget)closeContact();}}>
          <div style={{ background:'#fff',borderRadius:16,width:'100%',maxWidth:520,boxShadow:'0 20px 60px rgba(0,0,0,0.18)',overflow:'hidden' }}>

            {/* Header */}
            <div style={{ padding:'18px 22px',borderBottom:'1px solid #E5E7EB',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#FAFBFC' }}>
              <div>
                <div style={{ fontSize:15,fontWeight:800,color:'#0F172A' }}>Registrar contacto</div>
                <div style={{ fontSize:11,color:'#9CA3AF',marginTop:1 }}>#{lead.num} · {lead.fn} {lead.ln}</div>
              </div>
              <button onClick={closeContact} style={{ background:'none',border:'none',cursor:'pointer',padding:4,borderRadius:6,color:'#9CA3AF',fontSize:18,lineHeight:1 }}>✕</button>
            </div>

            {/* Contenido */}
            {cfDone?(
              /* ── Estado de éxito ── */
              <div style={{ padding:'40px 24px',textAlign:'center' }}>
                <div style={{ fontSize:44,marginBottom:12 }}>✅</div>
                <div style={{ fontSize:16,fontWeight:800,color:'#0F172A',marginBottom:6 }}>Contacto guardado</div>
                <div style={{ fontSize:13,color:'#6B7280' }}>Ticket <strong>#{lead.num}</strong> actualizado correctamente.</div>
              </div>
            ):(
              <div style={{ padding:'20px 22px',display:'flex',flexDirection:'column',gap:16 }}>

                {/* Canal */}
                <div>
                  <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Canal de contacto</div>
                  <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                    {["whatsapp","llamada","email","presencial","sms"].map(mt=>(
                      <button key={mt} type="button" onClick={()=>setCf(p=>({...p,method:mt}))}
                        style={{ padding:'6px 12px',fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer',borderRadius:6,
                          background:cf.method===mt?'#2563EB':'#F3F4F6',
                          color:cf.method===mt?'#fff':'#6B7280',
                          border:cf.method===mt?'none':'1px solid #E5E7EB' }}>
                        {mt.charAt(0).toUpperCase()+mt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resultado */}
                <div>
                  <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Resultado del contacto</div>
                  <select value={cf.result} onChange={e=>setCf(p=>({...p,result:e.target.value,note:'',evMode:'file'}))}
                    style={{ ...S.inp,width:'100%',fontSize:12 }}>
                    <option value="">Seleccionar resultado...</option>
                    <optgroup label="— Contacto real">
                      <option value="Contactado">Contactado</option>
                      <option value="Interesado">Interesado</option>
                      <option value="Agendó visita">Agendó visita</option>
                      <option value="Cotización entregada">Cotización entregada</option>
                      <option value="Envió documentos">Envió documentos</option>
                      <option value="No interesado">No interesado</option>
                    </optgroup>
                    <optgroup label="— Intento fallido">
                      <option value="No contesta">No contesta</option>
                      <option value="Buzón de voz">Buzón de voz</option>
                      <option value="Número equivocado">Número equivocado</option>
                    </optgroup>
                  </select>
                </div>

                {/* EVIDENCIA — solo si result requiere evidencia */}
                {needsEvidence&&(
                  <div style={{ background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:10,padding:'14px 16px' }}>
                    <div style={{ fontSize:11,fontWeight:700,color:'#92400E',marginBottom:10 }}>
                      ⚠️ Este resultado exige evidencia de contacto real
                    </div>
                    {/* Toggle file/note */}
                    <div style={{ display:'flex',gap:6,marginBottom:12 }}>
                      {[{v:'file',l:'📎 Subir captura'},{v:'note',l:'✏️ Nota detallada'}].map(o=>(
                        <button key={o.v} type="button" onClick={()=>setCf(p=>({...p,evMode:o.v}))}
                          style={{ flex:1,padding:'7px',fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer',borderRadius:7,
                            background:cf.evMode===o.v?'#2563EB':'#fff',
                            color:cf.evMode===o.v?'#fff':'#374151',
                            border:`1.5px solid ${cf.evMode===o.v?'#2563EB':'#E5E7EB'}` }}>
                          {o.l}
                        </button>
                      ))}
                    </div>

                    {cf.evMode==='file'?(
                      <div>
                        <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>Tipo de captura</div>
                        <div style={{ display:'flex',gap:5,marginBottom:10 }}>
                          {EV_TYPES.map(t=>(
                            <button key={t.v} type="button" onClick={()=>setCf(p=>({...p,evType:t.v}))}
                              style={{ padding:'4px 10px',fontSize:10,fontWeight:600,fontFamily:'inherit',cursor:'pointer',borderRadius:5,
                                background:cf.evType===t.v?'#1D4ED8':'#F1F5F9',
                                color:cf.evType===t.v?'#fff':'#374151',border:'none' }}>
                              {t.l}
                            </button>
                          ))}
                        </div>
                        {evPreview?(
                          <div style={{ position:'relative',marginBottom:6 }}>
                            <img src={evPreview} alt="preview" style={{ width:'100%',maxHeight:140,objectFit:'cover',borderRadius:8,border:'1px solid #E5E7EB' }}/>
                            <button onClick={()=>{setEvFile(null);setEvPreview(null);}}
                              style={{ position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.5)',color:'#fff',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer' }}>✕</button>
                          </div>
                        ):(
                          <label style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'18px',borderRadius:8,border:'2px dashed #CBD5E1',background:'#F8FAFC',cursor:'pointer',fontSize:12,color:'#64748B' }}>
                            <span style={{ fontSize:22 }}>📎</span>
                            <span>Hacer clic para seleccionar imagen</span>
                            <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                              const f=e.target.files[0];if(!f)return;
                              setEvFile(f);setEvPreview(URL.createObjectURL(f));
                            }}/>
                          </label>
                        )}
                      </div>
                    ):(
                      <div>
                        <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>Nota detallada <span style={{ color:'#EF4444' }}>*</span> (mín. 50 caracteres)</div>
                        <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))}
                          rows={4} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                          placeholder="Describe el contacto en detalle: qué se habló, qué se acordó, próximos pasos..."/>
                        <div style={{ textAlign:'right',fontSize:10,color:cf.note.length>=50?'#10B981':'#9CA3AF',marginTop:3 }}>{cf.note.length}/50</div>
                      </div>
                    )}
                  </div>
                )}

                {/* NOTA OBLIGATORIA — para intentos fallidos */}
                {needsNote&&(
                  <div>
                    <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>
                      Nota obligatoria <span style={{ color:'#EF4444' }}>*</span> (mín. 40 caracteres)
                    </div>
                    <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))}
                      rows={3} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                      placeholder="Ej: Llamé a las 14:30, entró al buzón. Volver a intentar mañana a las 11:00..."/>
                    <div style={{ textAlign:'right',fontSize:10,color:cf.note.length>=40?'#10B981':'#9CA3AF',marginTop:3 }}>{cf.note.length}/40</div>
                  </div>
                )}

                {/* NOTA OPCIONAL — otros resultados */}
                {!needsEvidence&&!needsNote&&cf.result&&(
                  <div>
                    <div style={{ fontSize:9,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>Nota adicional (opcional)</div>
                    <textarea value={cf.note} onChange={e=>setCf(p=>({...p,note:e.target.value}))}
                      rows={3} style={{ ...S.inp,width:'100%',resize:'none',fontSize:12 }}
                      placeholder="Comentario adicional..."/>
                  </div>
                )}

                {/* Error */}
                {cfErr&&(
                  <div style={{ background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#DC2626',fontWeight:600 }}>
                    ⚠ {cfErr}
                  </div>
                )}

                {/* Acciones */}
                <div style={{ display:'flex',gap:8,justifyContent:'flex-end',paddingTop:4 }}>
                  <button onClick={closeContact} style={{ ...S.btn2,padding:'9px 18px',fontSize:12 }}>Cancelar</button>
                  <button onClick={submitContact} disabled={cfSaving||!cf.result}
                    style={{ ...S.btn,padding:'9px 20px',fontSize:12,fontWeight:700,opacity:(cfSaving||!cf.result)?0.6:1 }}>
                    {cfSaving?'Guardando...':'Guardar contacto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
