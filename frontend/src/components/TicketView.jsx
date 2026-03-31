import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';
import { RemindersTab } from './RemindersTab.jsx';
import { SellFromTicketModal } from './SellFromTicketModal.jsx';

// ─── Estilos ────────────────────────────────────────────────────────────────────
const slaBox = (bg, border, color) => ({
  background:bg, border:`1px solid ${border}`, borderRadius:8,
  padding:'7px 10px', marginBottom:9, fontSize:11, color,
  display:'flex', alignItems:'flex-start', gap:7, lineHeight:1.4,
});
const secHdr = {
  fontSize:9, fontWeight:800, color:'#9CA3AF',
  textTransform:'uppercase', letterSpacing:'0.14em',
  paddingBottom:7, marginBottom:10,
  borderBottom:'1px solid #F1F3F5',
};

export function TicketView({lead,user,nav,updLead}){
  const[tab,setTab]=useState("datos");
  const[contactForm,setContactForm]=useState({method:"whatsapp",result:"",note:""});
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
  const upd=(field,val)=>updLead(lead.id,{[field]:val});
  const addTimelineLocal=(entry)=>{updLead(lead.id,{timeline:[entry,...(lead.timeline||[])],first_action_at:lead.first_action_at||entry.created_at||entry.date,lastContact:new Date().toISOString()});};
  const submitContact=async e=>{
    e.preventDefault();
    if(!contactForm.result)return;
    const title=`${contactForm.method.toUpperCase()}: ${contactForm.result}`;
    try{
      const entry=await api.addTimeline(lead.id,{type:"contact_registered",method:contactForm.method,title,note:contactForm.note||null});
      addTimelineLocal(entry);
    }catch{
      addTimelineLocal({id:`tl-${Date.now()}`,type:"contact_registered",title,note:contactForm.note,date:new Date().toISOString(),user_fn:user.fn,user_ln:user.ln,method:contactForm.method});
    }
    setContactForm({method:"whatsapp",result:"",note:""});
  };
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
  const tabs=[{id:"datos",l:"Datos Cliente"},{id:"timeline",l:"Timeline"},{id:"recordatorios",l:"Recordatorios"},{id:"financiamiento",l:"Financiamiento"},...(isAdmin?[{id:"historial_asignacion",l:"Historial Vendedor"}]:[])];

  const isGanado=lead.status==="ganado";
  const isPerdido=lead.status==="perdido";

  return(
    <div style={{ maxWidth:1400 }}>

      {/* ── BREADCRUMB ── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
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
      </div>

      {/* ══════════════════════════════════════════════════════════
          BLOQUE SUPERIOR — 3 zonas en una sola card
          [CLIENTE] [PRODUCTO COTIZADO] [STATUS + ACCIONES]
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        background:'#FFFFFF', borderRadius:14,
        border:'1px solid #E5E7EB',
        boxShadow:'0 1px 6px rgba(0,0,0,0.06)',
        display:'grid', gridTemplateColumns:'minmax(220px,252px) 1fr minmax(280px,310px)',
        overflow:'hidden', marginBottom:12,
      }}>

        {/* ── ZONA 1: CLIENTE ── */}
        <div style={{ padding:'20px 20px', borderRight:'1px solid #F1F3F5', display:'flex', flexDirection:'column' }}>
          <div style={{ fontSize:9, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:10 }}>
            Cliente
          </div>
          <h1 style={{ margin:'0 0 8px', fontSize:20, fontWeight:900, color:'#0F172A', letterSpacing:'-0.5px', lineHeight:1.1 }}>
            {lead.fn} {lead.ln}
          </h1>
          {/* Contacto */}
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
            {lead.phone&&(
              <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151', fontWeight:500 }}>
                <Ic.phone size={12} color="#9CA3AF"/>{lead.phone}
              </span>
            )}
            {lead.email&&(
              <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#6B7280' }}>
                <Ic.mail size={12} color="#9CA3AF"/>{lead.email}
              </span>
            )}
            {lead.comuna&&(
              <span style={{ fontSize:11, color:'#9CA3AF' }}>{lead.comuna}</span>
            )}
          </div>
          {/* Meta */}
          <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:6, paddingTop:12, borderTop:'1px solid #F3F4F6' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#9CA3AF' }}>Prioridad</span>
              <PBdg p={lead.priority}/>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#9CA3AF' }}>Vendedor</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{s.fn} {s.ln}</span>
            </div>
            {br.name&&(
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#9CA3AF' }}>Sucursal</span>
                <span style={{ fontSize:11, color:'#6B7280' }}>{br.code||''} {br.name}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#9CA3AF' }}>Ingresó</span>
              <span style={{ fontSize:11, color:'#9CA3AF' }}>{ago(lead.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* ── ZONA 2: PRODUCTO COTIZADO ── */}
        <div style={{ padding:'20px 24px', borderRight:'1px solid #F1F3F5', display:'flex', flexDirection:'column' }}>
          <div style={{ fontSize:9, fontWeight:800, color:'#F28100', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:14 }}>
            Producto Cotizado
          </div>

          {m ? (
            <>
              <div style={{ display:'flex', gap:18, marginBottom:14, alignItems:'flex-start' }}>
                {/* Imagen */}
                <div style={{ width:110, height:88, borderRadius:10, background:'#F3F4F6', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #E5E7EB' }}>
                  {m.image
                    ? <img src={m.image} alt={m.model} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <span style={{ fontSize:9, color:'#9CA3AF', fontWeight:600 }}>SIN IMG</span>}
                </div>
                {/* Datos */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:20, fontWeight:900, color:'#0F172A', letterSpacing:'-0.5px', lineHeight:1.1, marginBottom:3 }}>
                    {m.brand} {m.model}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
                    {m.year&&(
                      <span style={{ fontSize:12, fontWeight:700, color:'#4F46E5', background:'#EEF2FF', padding:'2px 9px', borderRadius:6, border:'1px solid #C7D2FE' }}>
                        {m.year}
                      </span>
                    )}
                    {m.cc>0&&<span style={{ fontSize:11, color:'#9CA3AF' }}>{m.cc}cc</span>}
                    {m.cat&&<span style={{ fontSize:11, color:'#9CA3AF' }}>{m.cat}</span>}
                  </div>
                  {m.price>0 ? (
                    <div>
                      <div style={{ fontSize:22, fontWeight:900, color:'#F28100', letterSpacing:'-0.8px', lineHeight:1 }}>
                        {fmt(m.price)}
                      </div>
                      {m.bonus>0&&(
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                          Desde {fmt(m.price-m.bonus)} · ahorra {fmt(m.bonus)}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Chips adicionales */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
                {lead.colorPref&&(
                  <span style={{ fontSize:10, background:'#F3F4F6', borderRadius:5, padding:'3px 9px', color:'#6B7280', fontWeight:500, border:'1px solid #E5E7EB' }}>
                    Color: {lead.colorPref}
                  </span>
                )}
                {br.addr&&(
                  <span style={{ fontSize:10, background:'#F3F4F6', borderRadius:5, padding:'3px 9px', color:'#6B7280', border:'1px solid #E5E7EB' }}>
                    📍 {br.addr}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:13, marginBottom:14 }}>
              Sin modelo seleccionado
            </div>
          )}

          {/* Cambiar modelo — siempre al fondo */}
          <div style={{ marginTop:'auto' }}>
            <label style={{ ...S.lbl, fontSize:10 }}>Cambiar modelo</label>
            <select value={lead.motoId||""} onChange={e=>upd("motoId",e.target.value)}
              style={{ ...S.inp, width:'100%', fontSize:11 }}>
              <option value="">Seleccionar...</option>
              {realModels.map(mo=><option key={mo.id} value={mo.id}>{mo.brand} {mo.model}{mo.price?` - ${fmt(mo.price)}`:''}</option>)}
            </select>
          </div>
        </div>

        {/* ── ZONA 3: STATUS + ACCIONES ── */}
        <div style={{ padding:'16px 18px', background:'#FAFBFC', display:'flex', flexDirection:'column' }}>

          {/* Ticket # + Badge + horas */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, paddingBottom:10, borderBottom:'1px solid #ECEEF1' }}>
            <div>
              <div style={{ fontSize:9, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>
                Ticket #{lead.num}
              </div>
              <TBdg s={lead.status}/>
            </div>
            {sinContactoH>0&&(
              <span style={{ fontSize:11, fontWeight:600, color: slaBreach?'#EF4444':slaWarning?'#F97316':'#9CA3AF' }}>
                {sinContactoH}h
              </span>
            )}
          </div>

          {/* SLA alerts */}
          {slaReassigned&&(
            <div style={slaBox("rgba(139,92,246,0.07)","rgba(139,92,246,0.22)","#7C3AED")}>
              <Ic.users size={13} color="#7C3AED"/>
              <span><strong>Reasignado</strong> · {s.fn}{s.ln?` ${s.ln}`:''}</span>
            </div>
          )}
          {slaBreach&&!slaReassigned&&(
            <div style={slaBox("rgba(239,68,68,0.07)","rgba(239,68,68,0.22)","#EF4444")}>
              <Ic.alert size={13} color="#EF4444"/>
              <span><strong>Vencido</strong> · {sinContactoH}h sin gestión</span>
            </div>
          )}
          {slaWarning&&(
            <div style={slaBox("rgba(249,115,22,0.07)","rgba(249,115,22,0.22)","#F97316")}>
              <Ic.clock size={13} color="#F97316"/>
              <span><strong>Atender ya</strong> · {8-sinContactoH}h restantes</span>
            </div>
          )}

          {/* Prioridad + Estado */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <div>
              <label style={S.lbl}>Prioridad</label>
              <select value={lead.priority} onChange={e=>upd("priority",e.target.value)}
                style={{ ...S.inp, width:'100%', fontSize:11 }}>
                {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Estado</label>
              <select value={lead.status} onChange={e=>upd("status",e.target.value)}
                style={{ ...S.inp, width:'100%', fontSize:11 }}>
                {Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
              </select>
            </div>
          </div>

          {/* Test Ride */}
          <div style={{ marginBottom:10 }}>
            <label style={S.lbl}>Test Ride</label>
            <div style={{ display:'flex', gap:5 }}>
              {[true,false].map(v=>(
                <button key={String(v)} onClick={()=>upd("testRide",v)}
                  style={{
                    flex:1, padding:'6px', fontSize:11, fontWeight:600,
                    fontFamily:'inherit', borderRadius:7, cursor:'pointer', border:'none',
                    background: lead.testRide===v ? (v?'#10B981':'#374151') : '#F0F0F0',
                    color: lead.testRide===v ? '#fff' : '#9CA3AF',
                  }}>
                  {v?"✓ Sí":"✗ No"}
                </button>
              ))}
            </div>
          </div>

          {/* Reasignar (admin) */}
          {isAdmin&&(
            <div style={{ marginBottom:10 }}>
              <label style={S.lbl}>Vendedor asignado</label>
              <select value={lead.seller_id||lead.seller||""}
                onChange={e=>{
                  const sl=sellers.find(s=>s.id===e.target.value);
                  const slName=sl?(sl.first_name||sl.fn||'')+" "+(sl.last_name||sl.ln||''):"";
                  updLead(lead.id,{seller:e.target.value,seller_id:e.target.value,timeline:[{id:`tl-${Date.now()}`,type:"system",title:`Reasignado a ${slName.trim()}`,date:new Date().toISOString(),user:`${user.fn} ${user.ln}`},...lead.timeline]});
                }}
                style={{ ...S.inp, width:'100%', fontSize:11 }}>
                <option value="">Seleccionar...</option>
                {sellers.map(sl=>{
                  const fn=sl.first_name||sl.fn||'';
                  const ln=sl.last_name||sl.ln||'';
                  const bc=sl.branch_code||'';
                  return<option key={sl.id} value={sl.id}>{fn} {ln}{bc?` - ${bc}`:''}</option>;
                })}
              </select>
            </div>
          )}

          {/* Sell button — empuja al fondo */}
          {!isPerdido&&(
            <div style={{ marginTop:'auto', paddingTop:10 }}>
              <button onClick={()=>setShowSell(true)}
                style={{
                  width:'100%', padding:'11px', borderRadius:9,
                  background: isGanado ? 'transparent' : '#10B981',
                  color: isGanado ? '#10B981' : '#fff',
                  border: isGanado ? '1.5px solid #6EE7B7' : 'none',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                  boxShadow: isGanado ? 'none' : '0 2px 10px rgba(16,185,129,0.28)',
                }}>
                <Ic.sale size={14} color={isGanado?"#10B981":"#fff"}/>
                {isGanado ? "Registrar otra unidad" : "Registrar Venta"}
              </button>
            </div>
          )}
        </div>

      </div>{/* /top card */}

      {/* ══════════════════════════════════════════════════════════
          REGISTRAR CONTACTO — strip horizontal compacto
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        background:'#FFFFFF', borderRadius:12,
        border:'1px solid #E5E7EB',
        boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
        padding:'14px 18px', marginBottom:12,
      }}>
        <div style={{ fontSize:9, fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:10 }}>
          Registrar Contacto
        </div>
        <form onSubmit={submitContact}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
            {/* Canal */}
            <div style={{ flexShrink:0 }}>
              <label style={{ ...S.lbl, fontSize:9 }}>Canal</label>
              <div style={{ display:'flex', gap:3 }}>
                {["whatsapp","llamada","email","presencial","sms"].map(mt=>(
                  <button key={mt} type="button" onClick={()=>setContactForm({...contactForm,method:mt})}
                    style={{
                      padding:'5px 10px', fontSize:10, fontWeight:600, fontFamily:'inherit',
                      cursor:'pointer', borderRadius:6, border:'none',
                      background: contactForm.method===mt ? '#F28100' : '#F3F4F6',
                      color: contactForm.method===mt ? '#fff' : '#6B7280',
                    }}>
                    {mt.charAt(0).toUpperCase()+mt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {/* Resultado */}
            <div style={{ flex:'0 0 190px' }}>
              <label style={{ ...S.lbl, fontSize:9 }}>Resultado</label>
              <select value={contactForm.result} onChange={e=>setContactForm({...contactForm,result:e.target.value})}
                style={{ ...S.inp, width:'100%', fontSize:11 }} required>
                <option value="">Seleccionar...</option>
                <option value="Contactado">Contactado</option>
                <option value="No contesta">No contesta</option>
                <option value="Buzón de voz">Buzón de voz</option>
                <option value="Número equivocado">Número equivocado</option>
                <option value="Interesado">Interesado</option>
                <option value="Agendó visita">Agendó visita</option>
                <option value="Cotización entregada">Cotización entregada</option>
                <option value="Envió documentos">Envió documentos</option>
                <option value="No interesado">No interesado</option>
              </select>
            </div>
            {/* Nota */}
            <div style={{ flex:1, minWidth:200 }}>
              <label style={{ ...S.lbl, fontSize:9 }}>Nota</label>
              <input value={contactForm.note} onChange={e=>setContactForm({...contactForm,note:e.target.value})}
                style={{ ...S.inp, width:'100%', fontSize:11 }}
                placeholder="Ej: Cliente evalúa opciones, volver a llamar en 1 semana..."/>
            </div>
            {/* Submit */}
            <div style={{ flexShrink:0 }}>
              <button type="submit"
                style={{ ...S.btn, display:'flex', alignItems:'center', gap:5, fontSize:11, padding:'8px 16px', whiteSpace:'nowrap' }}>
                <Ic.send size={12}/>Registrar
              </button>
            </div>
          </div>
        </form>

        {/* Observaciones */}
        <div style={{ display:'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap:10, marginTop:10, paddingTop:10, borderTop:'1px solid #F3F4F6' }}>
          <div>
            <label style={{ ...S.lbl, fontSize:9 }}>Observaciones Vendedor</label>
            <textarea value={lead.obsVendedor||""} onChange={e=>upd("obsVendedor",e.target.value)} rows={1}
              style={{ ...S.inp, width:'100%', resize:'none', fontSize:11 }} placeholder="Notas del vendedor..."/>
          </div>
          {isAdmin&&(
            <div>
              <label style={{ ...S.lbl, fontSize:9 }}>Observaciones Supervisor</label>
              <textarea value={lead.obsSupervisor||""} onChange={e=>upd("obsSupervisor",e.target.value)} rows={1}
                style={{ ...S.inp, width:'100%', resize:'none', fontSize:11 }} placeholder="Notas del supervisor..."/>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TABS + CONTENIDO
      ══════════════════════════════════════════════════════════ */}
      <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E5E7EB', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', overflow:'hidden' }}>

        {/* Tab bar */}
        <div style={{ display:'flex', borderBottom:'1px solid #E5E7EB', background:'#FAFAFA', padding:'0 6px' }}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{
                padding:'10px 15px', fontSize:12, fontWeight:tab===t.id ? 700 : 500,
                background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
                color: tab===t.id ? '#F28100' : '#6B7280',
                borderBottom: tab===t.id ? '2px solid #F28100' : '2px solid transparent',
                whiteSpace:'nowrap',
              }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* ── DATOS CLIENTE ── */}
        {tab==="datos"&&(
          <div style={{ padding:'20px 22px' }}>

            {/* Sección: Identificación */}
            <div style={{ marginBottom:18 }}>
              <div style={secHdr}>Identificación Personal</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                <Field label="RUT" value={lead.rut} onChange={v=>upd("rut",v)}/>
                <Field label="Nombre" value={lead.fn} onChange={v=>upd("fn",v)}/>
                <Field label="Apellido" value={lead.ln} onChange={v=>upd("ln",v)}/>
                <Field label="Fecha Nacimiento" value={lead.bday} onChange={v=>upd("bday",v)} ph="DD/MM/AAAA"/>
              </div>
            </div>

            {/* Sección: Contacto */}
            <div style={{ marginBottom:18 }}>
              <div style={secHdr}>Contacto</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                <Field label="Email" value={lead.email} onChange={v=>upd("email",v)} type="email"/>
                <Field label="Celular" value={lead.phone} onChange={v=>upd("phone",v)}/>
                <Field label="Comuna" value={lead.comuna} onChange={v=>upd("comuna",v)} opts={COMUNAS.map(c=>({v:c,l:c}))}/>
                <Field label="Origen" value={lead.source} onChange={v=>upd("source",v)} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/>
              </div>
            </div>

            {/* Sección: Perfil Financiero */}
            <div style={{ marginBottom:10 }}>
              <div style={secHdr}>Perfil Financiero</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:12 }}>
                <Field label="Situación Laboral" value={lead.sitLab} onChange={v=>upd("sitLab",v)} opts={[{v:"",l:"Seleccionar..."},...SIT_LABORAL.map(s=>({v:s,l:s}))]}/>
                <Field label="Continuidad Laboral" value={lead.continuidad} onChange={v=>upd("continuidad",v)} opts={[{v:"",l:"Seleccionar..."},...CONTINUIDAD.map(c=>({v:c,l:c}))]}/>
                <Field label="Renta Líquida" value={lead.renta} onChange={v=>upd("renta",Number(v))} type="number"/>
                <Field label="Pie" value={lead.pie} onChange={v=>upd("pie",Number(v))} type="number"/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                <div>
                  <label style={S.lbl}>¿Financiamiento?</label>
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    {[true,false].map(v=>(
                      <button key={String(v)} type="button" onClick={()=>upd("wantsFin",v)}
                        style={{ ...S.btn2, padding:'5px 16px', fontSize:12,
                          background:lead.wantsFin===v?(v?"#F28100":"#374151"):"transparent",
                          color:lead.wantsFin===v?"#fff":"#888",
                          border:lead.wantsFin===v?"none":"1px solid #D1D5DB" }}>
                        {v?"Sí":"No"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop:18 }}>
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
        )}

        {/* ── TIMELINE ── */}
        {tab==="timeline"&&(
          <div style={{ padding:'16px 20px' }}>
            <form onSubmit={submitNote} style={{ marginBottom:16, padding:12, background:'#F9FAFB', borderRadius:10, border:'1px solid #E5E7EB' }}>
              <label style={{ ...S.lbl, marginBottom:6 }}>
                Agregar nota{' '}
                <span style={{ color:'#9CA3AF', fontWeight:400 }}>(mín. 20 caracteres)</span>
              </label>
              <textarea value={noteForm} onChange={e=>{setNoteForm(e.target.value);if(noteErr)setNoteErr("");}}
                rows={3} style={{ ...S.inp, width:'100%', resize:'vertical', marginBottom:6 }}
                placeholder="Ej: Llamé al cliente, dice que está evaluando otras opciones, volver en 3 días..."/>
              {noteErr&&<div style={{ fontSize:11, color:'#EF4444', marginBottom:6 }}>{noteErr}</div>}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:10, color:noteForm.length>=20?"#10B981":"#9CA3AF" }}>{noteForm.length}/20</span>
                <button type="submit" style={{ ...S.btn2, padding:'6px 14px', fontSize:12 }}>Guardar nota</button>
              </div>
            </form>
            <div style={{ position:'relative', paddingLeft:20 }}>
              <div style={{ position:'absolute', left:7, top:0, bottom:0, width:2, background:'#E5E7EB' }}/>
              {(lead.timeline||[]).map((t,i)=>{
                const dotColor=t.type==="contact_registered"||t.type==="contact"?"#3B82F6":t.type==="note_added"?"#10B981":t.type==="status"?"#F28100":t.type==="reminder_created"?"#8B5CF6":"#374151";
                const userName=t.user||(t.user_fn?`${t.user_fn} ${t.user_ln}`:"Sistema");
                return(
                  <div key={t.id||i} style={{ position:'relative', paddingBottom:14, paddingLeft:16 }}>
                    <div style={{ position:'absolute', left:-2, top:4, width:12, height:12, borderRadius:'50%', background:dotColor, border:'2px solid #F5F5F7' }}/>
                    <div style={{ background:'#F9FAFB', borderRadius:10, padding:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{t.title}</span>
                        <span style={{ fontSize:10, color:'#9CA3AF' }}>{fDT(t.date||t.created_at)}</span>
                      </div>
                      {t.note&&<div style={{ fontSize:12, color:'#6B7280', marginTop:4, lineHeight:1.4 }}>{t.note}</div>}
                      <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4 }}>{userName}{t.method?` · vía ${t.method}`:""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FINANCIAMIENTO ── */}
        {tab==="financiamiento"&&(
          <div style={{ padding:'16px 20px' }}>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {["Autofin"].map(inst=>(
                <button key={inst}
                  style={{ ...S.btn2, padding:'6px 16px', fontSize:12,
                    background:lead.finInst===inst?"rgba(242,129,0,0.12)":"transparent",
                    color:lead.finInst===inst?"#F28100":"#888",
                    border:lead.finInst===inst?"1px solid #F28100":"1px solid #D1D5DB" }}>
                  {inst}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
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
              <div style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:10, marginBottom:14, fontSize:12, color:'#EF4444' }}>
                Rechazado: {lead.rechazoMotivo}
              </div>
            )}
            {lead.finStatus==="aprobado"&&(
              <div style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:8, padding:10, marginBottom:14, fontSize:12, color:'#10B981' }}>
                Financiamiento aprobado
              </div>
            )}
            <div>
              <label style={S.lbl}>Observaciones (exclusivo Autofin)</label>
              <textarea value="" onChange={()=>{}} rows={3}
                style={{ ...S.inp, width:'100%', resize:'vertical' }} placeholder="Notas internas sobre evaluación..."/>
            </div>
          </div>
        )}

        {/* ── RECORDATORIOS ── */}
        {tab==="recordatorios"&&(
          <div style={{ padding:'16px 20px' }}>
            <RemindersTab ticketId={lead.id} user={user}/>
          </div>
        )}

        {/* ── HISTORIAL ASIGNACIÓN ── */}
        {tab==="historial_asignacion"&&isAdmin&&(
          <div style={{ padding:'16px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Historial de Asignación</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>Solo visible para administradores · Trazabilidad completa del lead</div>
              </div>
              {lead.reassignment_count>0&&(
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:12, background:'rgba(139,92,246,0.1)', color:'#7C3AED' }}>
                  {lead.reassignment_count} reasignación{lead.reassignment_count!==1?"es":""}
                </span>
              )}
            </div>
            {assignHistory.length===0
              ? <div style={{ textAlign:'center', padding:'28px 0', color:'#9CA3AF', fontSize:12 }}>Cargando historial...</div>
              : <div style={{ position:'relative', paddingLeft:24 }}>
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
                              {isInit
                                ?<>↳ Asignado a <span style={{ color:dotC }}>{ev.to_name}</span></>
                                :<><span style={{ color:'#6B7280' }}>{ev.from_name}</span> <span style={{ color:dotC, fontWeight:800 }}>→</span> <span style={{ color:'#111827' }}>{ev.to_name}</span></>
                              }
                              {isCurrent&&<span style={{ marginLeft:8, fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:8, background:'#F28100', color:'#fff', letterSpacing:'0.02em' }}>ACTUAL</span>}
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

      </div>{/* /tabs card */}

      {showSell&&<SellFromTicketModal ticketId={lead.id} lead={lead} user={user} onClose={()=>setShowSell(false)} onSuccess={()=>{updLead(lead.id,{status:"ganado"});}}/>}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
