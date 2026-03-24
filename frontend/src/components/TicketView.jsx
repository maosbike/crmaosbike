import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function TicketView({lead,user,nav,updLead}){
  const[tab,setTab]=useState("datos");
  const[contactForm,setContactForm]=useState({method:"whatsapp",result:"",note:""});
  const m=lead.model_brand?{brand:lead.model_brand,model:lead.model_name,price:0,bonus:0,year:lead.year||2025,cc:lead.cc||0,cat:lead.category||'',colors:[]}:null;
  const s=gU(lead.seller)||{fn:lead.seller_fn||'',ln:lead.seller_ln||''};
  const br=gB(lead.branch)||{name:lead.branch_name||'',code:lead.branch_code||'',addr:lead.branch_addr||''};
  const isAdmin=["super_admin","admin_comercial"].includes(user.role);
  const[realSellers,setRealSellers]=useState([]);
  const[realModels,setRealModels]=useState([]);
  useEffect(()=>{
    if(isAdmin)api.getSellers().then(d=>setRealSellers(Array.isArray(d)?d:[])).catch(()=>{});
    api.getModels().then(d=>setRealModels(Array.isArray(d)?d:[])).catch(()=>{});
  },[isAdmin]);
  const sellers=realSellers.length>0?realSellers:USERS.filter(u=>u.role==="vendedor");
  // SLA calc
  const created=new Date(lead.createdAt).getTime();const now=Date.now();
  const lastC=lead.lastContact?new Date(lead.lastContact).getTime():0;
  const sinContactoH=Math.floor((lastC?(now-lastC):(now-created))/(1e3*60*60));
  const slaBreach=lead.sla_status==="vencido"||(sinContactoH>=8&&lead.status==="abierto");
  const slaWarning=lead.sla_status==="en_riesgo"||(sinContactoH>=6&&sinContactoH<8&&lead.status==="abierto");

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
  const togglePV=(f)=>updLead(lead.id,{postVenta:{...lead.postVenta,[f]:!lead.postVenta[f]}});

  const tabs=[{id:"datos",l:"Datos Cliente"},{id:"timeline",l:"Timeline"},{id:"recordatorios",l:"Recordatorios"},{id:"financiamiento",l:"Financiamiento"},{id:"postventa",l:"Post Venta"}];

  return(
    <div>
      {/* HEADER */}
      <div className="crm-ticket-top" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>nav("leads")} style={{...S.gh,padding:6,marginTop:2}}><Ic.back size={17}/></button>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:13,color:"#F28100",fontWeight:600}}>Ticket #{lead.num}</span><span style={{fontSize:12,color:"#6B7280"}}>/ a cargo de {s?.fn} {s?.ln}</span></div>
            <h1 style={{fontSize:20,fontWeight:700,margin:"4px 0 0"}}>{lead.fn} {lead.ln}</h1>
          </div>
        </div>
        {/* STATUS PANEL */}
        <div className="crm-status-panel" style={{...S.card,padding:14,minWidth:280}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontSize:12,fontWeight:600}}>Status Ticket</span><TBdg s={lead.status}/></div>
          {slaBreach&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"8px 10px",marginBottom:10,fontSize:11,color:"#EF4444",display:"flex",alignItems:"center",gap:6}}><Ic.alert size={14} color="#EF4444"/>SLA VENCIDO · {sinContactoH}h sin contacto · Requiere reasignación</div>}
          {slaWarning&&<div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:8,padding:"8px 10px",marginBottom:10,fontSize:11,color:"#F59E0B",display:"flex",alignItems:"center",gap:6}}><Ic.clock size={14} color="#F59E0B"/>Quedan {8-sinContactoH}h para vencimiento SLA</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={S.lbl}>Prioridad</label><select value={lead.priority} onChange={e=>upd("priority",e.target.value)} style={{...S.inp,width:"100%",fontSize:11}}>{Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
            <div><label style={S.lbl}>Marcar como</label><select value={lead.status} onChange={e=>upd("status",e.target.value)} style={{...S.inp,width:"100%",fontSize:11}}>{Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
          </div>
          <div style={{marginTop:8}}><label style={S.lbl}>¿Test ride realizado?</label><div style={{display:"flex",gap:6}}>{[true,false].map(v=><button key={String(v)} onClick={()=>upd("testRide",v)} style={{...S.btn2,padding:"4px 14px",fontSize:11,background:lead.testRide===v?(v?"#10B981":"#333"):"transparent",color:lead.testRide===v?"#fff":"#888",border:lead.testRide===v?"none":"1px solid #333"}}>{v?"SÍ":"NO"}</button>)}</div></div>
          {isAdmin&&<div style={{marginTop:10}}><label style={S.lbl}>Reasignar vendedor</label><select value={lead.seller_id||lead.seller||""} onChange={e=>{const sl=sellers.find(s=>s.id===e.target.value);const slName=sl?(sl.first_name||sl.fn||'')+" "+(sl.last_name||sl.ln||''):"";updLead(lead.id,{seller:e.target.value,seller_id:e.target.value,timeline:[{id:`tl-${Date.now()}`,type:"system",title:`Reasignado a ${slName.trim()}`,date:new Date().toISOString(),user:`${user.fn} ${user.ln}`},...lead.timeline]});}} style={{...S.inp,width:"100%",fontSize:11}}><option value="">Seleccionar vendedor...</option>{sellers.map(sl=>{const fn=sl.first_name||sl.fn||'';const ln=sl.last_name||sl.ln||'';const bc=sl.branch_code||(gB(sl.branch)?.code)||'';return<option key={sl.id} value={sl.id}>{fn} {ln}{bc?` - ${bc}`:''}</option>;})}</select></div>}
        </div>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div className="crm-ticket-cols" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
        {/* LEFT: PRODUCT */}
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 12px",color:"#F28100"}}>Producto Cotizado</h3>
          {m?(<>
            <div style={{display:"flex",gap:14}}>
              <div style={{width:100,height:80,borderRadius:8,background:"#F3F4F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#6B7280"}}>📷 {m.brand}</div>
              <div><div style={{fontSize:16,fontWeight:700}}>{m.brand} {m.model}</div><div style={{fontSize:12,color:"#888",marginTop:2}}>{m.year} · {m.cc}cc · {m.cat}</div><div style={{marginTop:6}}><span style={{fontSize:18,fontWeight:800,color:"#F28100"}}>Desde {fmt(m.price-m.bonus)}</span></div><div style={{fontSize:11,color:"#888"}}>{fmt(m.price)} precio de lista</div></div>
            </div>
            <div style={{marginTop:10,display:"flex",gap:12,fontSize:11,color:"#888"}}>
              <span>📄 Ficha Técnica: <span style={{color:"#3B82F6",cursor:"pointer"}}>Descargar</span></span>
              <span>🎨 Color: {lead.colorPref||m.colors[0]}</span>
            </div>
          </>):(<div style={{color:"#6B7280",fontSize:12}}>Sin modelo seleccionado</div>)}
          <div style={{marginTop:10}}><label style={S.lbl}>Cambiar modelo</label><select value={lead.motoId||""} onChange={e=>upd("motoId",e.target.value)} style={{...S.inp,width:"100%",fontSize:11}}><option value="">Seleccionar...</option>{realModels.map(m=><option key={m.id} value={m.id}>{m.brand} {m.model}{m.price?` - ${fmt(m.price)}`:''}</option>)}</select></div>
          {/* SUCURSAL */}
          <div style={{marginTop:12,padding:10,background:"#F9FAFB",borderRadius:8}}>
            <div style={{fontWeight:600,fontSize:12}}>MAOS RACING {br?.name.toUpperCase()}</div>
            <div style={{fontSize:10,color:"#6B7280",marginTop:2}}>{br?.addr}</div>
          </div>
        </div>

        {/* RIGHT: REGISTER CONTACT */}
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Registrar Contacto</h3>
          <form onSubmit={submitContact}>
            <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>{["whatsapp","llamada","email","presencial","sms"].map(mt=><button key={mt} type="button" onClick={()=>setContactForm({...contactForm,method:mt})} style={{...S.btn2,padding:"5px 10px",fontSize:11,background:contactForm.method===mt?"#F28100":"transparent",color:contactForm.method===mt?"#fff":"#888",border:contactForm.method===mt?"none":"1px solid #D1D5DB"}}>{mt.charAt(0).toUpperCase()+mt.slice(1)}</button>)}</div>
            <div style={{marginBottom:8}}><label style={S.lbl}>Resultado</label><select value={contactForm.result} onChange={e=>setContactForm({...contactForm,result:e.target.value})} style={{...S.inp,width:"100%"}} required><option value="">Seleccionar resultado...</option><option value="Contactado">Contactado</option><option value="No contesta">No contesta</option><option value="Buzón de voz">Buzón de voz</option><option value="Número equivocado">Número equivocado</option><option value="Interesado">Interesado</option><option value="Agendó visita">Agendó visita</option><option value="Cotización entregada">Cotización entregada</option><option value="Envió documentos">Envió documentos</option><option value="No interesado">No interesado</option></select></div>
            <div style={{marginBottom:10}}><label style={S.lbl}>Nota / Comentario</label><textarea value={contactForm.note} onChange={e=>setContactForm({...contactForm,note:e.target.value})} rows={3} style={{...S.inp,width:"100%",resize:"vertical"}} placeholder="Ej: Cliente aún no tiene el pie, volver a llamar en 1 semana..."/></div>
            <button type="submit" style={{...S.btn,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic.send size={13}/>Registrar Contacto</button>
          </form>
          {/* OBS */}
          <div style={{marginTop:14}}>
            <label style={S.lbl}>Observaciones Vendedor</label>
            <textarea value={lead.obsVendedor||""} onChange={e=>upd("obsVendedor",e.target.value)} rows={2} style={{...S.inp,width:"100%",resize:"vertical",fontSize:12}} placeholder="Notas del vendedor..."/>
          </div>
          {isAdmin&&<div style={{marginTop:8}}><label style={S.lbl}>Observaciones Supervisor</label><textarea value={lead.obsSupervisor||""} onChange={e=>upd("obsSupervisor",e.target.value)} rows={2} style={{...S.inp,width:"100%",resize:"vertical",fontSize:12}} placeholder="Notas del supervisor..."/></div>}
        </div>
      </div>

      {/* TABS */}
      <div className="crm-tabs" style={{display:"flex",gap:1,borderBottom:"1px solid #E5E7EB",marginBottom:14}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 16px",fontSize:12,fontWeight:500,background:"none",border:"none",cursor:"pointer",color:tab===t.id?"#F28100":"#555",borderBottom:tab===t.id?"2px solid #F28100":"2px solid transparent",fontFamily:"inherit"}}>{t.l}</button>)}</div>

      {/* TAB CONTENT */}
      {tab==="datos"&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Datos del Cliente</h3>
          <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <Field label="RUT" value={lead.rut} onChange={v=>upd("rut",v)}/>
            <Field label="Nombre" value={lead.fn} onChange={v=>upd("fn",v)}/>
            <Field label="Apellido" value={lead.ln} onChange={v=>upd("ln",v)}/>
          </div>
          <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <Field label="Fecha Nacimiento" value={lead.bday} onChange={v=>upd("bday",v)} ph="DD/MM/AAAA"/>
            <Field label="Email" value={lead.email} onChange={v=>upd("email",v)} type="email"/>
            <Field label="Celular" value={lead.phone} onChange={v=>upd("phone",v)}/>
          </div>
          <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <Field label="Comuna" value={lead.comuna} onChange={v=>upd("comuna",v)} opts={COMUNAS.map(c=>({v:c,l:c}))}/>
            <Field label="Origen" value={lead.source} onChange={v=>upd("source",v)} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/>
            <div><label style={S.lbl}>¿Financiamiento?</label><div style={{display:"flex",gap:6,marginTop:4}}>{[true,false].map(v=><button key={String(v)} type="button" onClick={()=>upd("wantsFin",v)} style={{...S.btn2,padding:"5px 14px",fontSize:12,background:lead.wantsFin===v?(v?"#F28100":"#333"):"transparent",color:lead.wantsFin===v?"#fff":"#888",border:lead.wantsFin===v?"none":"1px solid #333"}}>{v?"Sí":"No"}</button>)}</div></div>
          </div>
          <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <Field label="Situación Laboral" value={lead.sitLab} onChange={v=>upd("sitLab",v)} opts={[{v:"",l:"Seleccionar..."},...SIT_LABORAL.map(s=>({v:s,l:s}))]}/>
            <Field label="Continuidad Laboral" value={lead.continuidad} onChange={v=>upd("continuidad",v)} opts={[{v:"",l:"Seleccionar..."},...CONTINUIDAD.map(c=>({v:c,l:c}))]}/>
            <Field label="Renta Líquida" value={lead.renta} onChange={v=>upd("renta",Number(v))} type="number"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
            <Field label="Pie" value={lead.pie} onChange={v=>upd("pie",Number(v))} type="number"/>
            <div style={{display:"flex",alignItems:"flex-end"}}><button onClick={()=>addTimeline("system","Datos del cliente actualizados","")} style={{...S.btn,fontSize:12}}>Actualizar</button></div>
          </div>
        </div>
      )}

      {tab==="timeline"&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Timeline de Gestión</h3>
          {/* Agregar nota */}
          <form onSubmit={submitNote} style={{marginBottom:16,padding:12,background:"#F9FAFB",borderRadius:10,border:"1px solid #E5E7EB"}}>
            <label style={{...S.lbl,marginBottom:6}}>Agregar nota <span style={{color:"#6B7280",fontWeight:400}}>(mín. 20 caracteres para contar como gestión SLA)</span></label>
            <textarea value={noteForm} onChange={e=>{setNoteForm(e.target.value);if(noteErr)setNoteErr("");}} rows={3} style={{...S.inp,width:"100%",resize:"vertical",marginBottom:6}} placeholder="Ej: Llamé al cliente, dice que está evaluando otras opciones, volver en 3 días..."/>
            {noteErr&&<div style={{fontSize:11,color:"#EF4444",marginBottom:6}}>{noteErr}</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:noteForm.length>=20?"#10B981":"#555"}}>{noteForm.length}/20</span>
              <button type="submit" style={{...S.btn2,padding:"6px 14px",fontSize:12}}>Guardar nota</button>
            </div>
          </form>
          {/* Lista */}
          <div style={{position:"relative",paddingLeft:20}}>
            <div style={{position:"absolute",left:7,top:0,bottom:0,width:2,background:"#E5E7EB"}}/>
            {(lead.timeline||[]).map((t,i)=>{
              const dotColor=t.type==="contact_registered"||t.type==="contact"?"#3B82F6":t.type==="note_added"?"#10B981":t.type==="status"?"#F28100":t.type==="reminder_created"?"#8B5CF6":"#333";
              const userName=t.user||(t.user_fn?`${t.user_fn} ${t.user_ln}`:"Sistema");
              return(
              <div key={t.id||i} style={{position:"relative",paddingBottom:16,paddingLeft:16}}>
                <div style={{position:"absolute",left:-2,top:4,width:12,height:12,borderRadius:"50%",background:dotColor,border:"2px solid #F5F5F7"}}/>
                <div style={{background:"#F9FAFB",borderRadius:10,padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{t.title}</span>
                    <span style={{fontSize:10,color:"#6B7280"}}>{fDT(t.date||t.created_at)}</span>
                  </div>
                  {t.note&&<div style={{fontSize:12,color:"#6B7280",marginTop:4,lineHeight:1.4}}>{t.note}</div>}
                  <div style={{fontSize:10,color:"#6B7280",marginTop:4}}>{userName}{t.method?` · vía ${t.method}`:""}</div>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {tab==="financiamiento"&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Evaluación Financiamiento</h3>
          <div style={{display:"flex",gap:6,marginBottom:14}}>{["Autofin"].map(inst=><button key={inst} style={{...S.btn2,padding:"6px 16px",fontSize:12,background:lead.finInst===inst?"rgba(242,129,0,0.15)":"transparent",color:lead.finInst===inst?"#F28100":"#888",border:lead.finInst===inst?"1px solid #F28100":"1px solid #D1D5DB"}}>{inst}</button>)}</div>
          <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div><label style={S.lbl}>Estado</label><select value={lead.finStatus} onChange={e=>upd("finStatus",e.target.value)} style={{...S.inp,width:"100%"}}>{Object.entries(FIN_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
            <div><label style={S.lbl}>Motivo Rechazo</label><select value={lead.rechazoMotivo||""} onChange={e=>upd("rechazoMotivo",e.target.value)} style={{...S.inp,width:"100%"}} disabled={lead.finStatus!=="rechazado"}><option value="">Seleccionar...</option>{RECHAZO_MOTIVOS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          {lead.finStatus==="rechazado"&&lead.rechazoMotivo&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:10,marginBottom:14,fontSize:12,color:"#EF4444"}}>⚠ Rechazado: {lead.rechazoMotivo}</div>}
          {lead.finStatus==="aprobado"&&<div style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:10,marginBottom:14,fontSize:12,color:"#10B981"}}>✓ Financiamiento aprobado</div>}
          <div style={{marginTop:8}}><label style={S.lbl}>Observaciones (exclusivo Autofin)</label><textarea value="" onChange={()=>{}} rows={3} style={{...S.inp,width:"100%",resize:"vertical"}} placeholder="Notas internas sobre evaluación..."/></div>
        </div>
      )}

      {tab==="recordatorios"&&(
        <div style={S.card}>
          <RemindersTab ticketId={lead.id} user={user}/>
        </div>
      )}

      {tab==="postventa"&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Documentación / Entrega</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["factura","Factura emitida"],["pagoReg","Pago registrado"],["homSol","Homologación solicitada"],["homRec","Homologación recibida"],["enrolada","Moto enrolada"],["entregada","Entrega realizada"]].map(([key,label])=>(
              <div key={key} onClick={()=>togglePV(key)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:"#F9FAFB",cursor:"pointer",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#F3F4F6"} onMouseLeave={e=>e.currentTarget.style.background="#F9FAFB"}>
                <div style={{width:22,height:22,borderRadius:6,border:lead.postVenta[key]?"none":"2px solid #333",background:lead.postVenta[key]?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{lead.postVenta[key]&&<Ic.check size={13} color="white"/>}</div>
                <span style={{fontSize:13,color:lead.postVenta[key]?"#1a1a1a":"#888"}}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
