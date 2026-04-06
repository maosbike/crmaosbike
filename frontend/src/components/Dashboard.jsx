import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Ic, S, Bdg, TBdg, PBdg, Stat, Modal, Field, TICKET_STATUS, PRIORITY, SRC, COMUNAS, RECHAZO_MOTIVOS, SIT_LABORAL, CONTINUIDAD, FIN_STATUS, PAYMENT_TYPES, INV_ST, fmt, fD, fDT, ago, mapTicket } from '../ui.jsx';

export function Dashboard({leads,inv,user,nav,branches=[]}){
  const[stats,setStats]=useState(null);
  const active=leads.filter(l=>!["ganado","perdido"].includes(l.status));
  const ganados=leads.filter(l=>l.status==="ganado");
  const avail=inv.filter(x=>x.status==="disponible").length;
  const pipe=Object.entries(TICKET_STATUS).slice(0,5).map(([k,v])=>({name:v.l,count:leads.filter(l=>l.status===k).length,color:v.c}));
  useEffect(()=>{api.getCommercialStats().then(d=>setStats(d)).catch(()=>{});},[]);
  const kpi=(key,...fallbacks)=>{if(!stats)return 0;for(const k of[key,...fallbacks]){const v=stats.stats?.[k]??stats.kpis?.[k]??stats[k];if(v!==undefined&&v!==null)return v;}return 0;};
  const urgentes=stats?.leads_urgentes||stats?.urgentes||[];
  const tareasHoy=stats?.recordatorios_hoy||stats?.tareas_hoy||stats?.reminders_today||[];
  return(
    <div>
      <div style={{marginBottom:18}}><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Bienvenido, {user.fn}</h1><p style={{color:"#6B6B6B",fontSize:12,margin:"2px 0 0"}}>{user.branchName||"Todas las sucursales"}</p></div>

      {stats&&<>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:14}}>
          <Stat icon={Ic.alert} ic="#EF4444" ib="rgba(239,68,68,0.1)" label="Sin atender" val={kpi("vencidos","sla_vencidos")} al={kpi("vencidos","sla_vencidos")>0} sub="Vencidos sin gestión"/>
          <Stat icon={Ic.clock} ic="#F97316" ib="rgba(249,115,22,0.1)" label="Atender ya" val={kpi("prox_vencer","proximos_vencer")} sub="Quedan menos de 2h"/>
          <Stat icon={Ic.users} ic="#6B7280" ib="rgba(107,114,128,0.1)" label="Sin gestionar" val={kpi("sin_tocar")} sub="Esperando primera acción"/>
          <Stat icon={Ic.remind} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Tareas hoy" val={kpi("recordatorios_hoy")}/>
          <Stat icon={Ic.bell} ic="#F28100" ib="rgba(242,129,0,0.1)" label="Reasignados" val={kpi("reasignados_hoy")} sub="Hoy"/>
        </div>
        {urgentes.length>0&&<div style={{...S.card,marginBottom:14}}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px",color:"#EF4444"}}>Requieren atención</h3>
          {urgentes.slice(0,5).map((l,i)=>{
            const st=l.sla_status;
            const lbl=(st==="breached"||st==="vencido"||l.hours_left!=null&&l.hours_left<=0)?"Vencido":st==="warning"||l.hours_left!=null&&l.hours_left<1?`Atender ya · ${Math.ceil(l.hours_left||0)}h`:l.hours_left!=null?`Quedan ${Math.ceil(l.hours_left)}h`:"Sin gestionar";
            const lc=(st==="breached"||st==="vencido"||l.hours_left!=null&&l.hours_left<=0)?"#EF4444":st==="reassigned"?"#8B5CF6":l.hours_left!=null&&l.hours_left<2?"#F97316":"#6B7280";
            return<div key={i} onClick={()=>nav("ticket",String(l.id||l.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#F3F4F6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{[l.fn||l.first_name, l.ln||l.last_name].filter(Boolean).join(' ').trim()||'—'}</div><div style={{fontSize:11,color:"#6B7280"}}>{l.seller_name||(l.seller_first?`${l.seller_first} ${l.seller_last||""}`.trim():"")}</div></div><span style={{fontSize:11,color:lc,fontWeight:600}}>{lbl}</span></div>;
          })}
        </div>}
        {tareasHoy.length>0&&<div style={{...S.card,marginBottom:14}}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px"}}>Tareas para hoy</h3>
          {tareasHoy.slice(0,5).map((t,i)=><div key={i} onClick={()=>t.ticket_id&&nav("ticket",String(t.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#F3F4F6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{t.title}</div><div style={{fontSize:11,color:"#6B7280"}}>{t.client_name||""}</div></div><span style={{fontSize:10,color:"#F28100"}}>{t.reminder_time||fD(t.reminder_date)}</span></div>)}
        </div>}
      </>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:10,marginBottom:18}}>
        <Stat icon={Ic.users} ic="#3B82F6" ib="rgba(59,130,246,0.1)" label="Tickets Activos" val={active.length} sub={`${ganados.length} ganados`}/>
        <Stat icon={Ic.target} ic="#10B981" ib="rgba(16,185,129,0.1)" label="Ganados" val={ganados.length} sub={`${leads.length>0?((ganados.length/leads.length)*100).toFixed(0):0}% conversión`} sc="#10B981"/>
        <Stat icon={Ic.box} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Stock Disponible" val={avail} sub={`${inv.length} total`}/>
        <Stat icon={Ic.alert} ic="#EF4444" ib="rgba(239,68,68,0.1)" label="Perdidos" val={leads.filter(l=>l.status==="perdido").length} al={leads.filter(l=>l.status==="perdido").length>0}/>
      </div>
      <div className="crm-dash-bottom" style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:18}}>
        <div style={S.card}><h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px"}}>Pipeline</h3><div style={{display:"flex",gap:4,marginBottom:4}}>{pipe.map((d,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:11,fontWeight:700}}>{d.count}</div>)}</div><div style={{display:"flex",gap:4,alignItems:"flex-end",height:88,overflow:"hidden"}}>{pipe.map((d,i)=>{const maxH=Math.max(...pipe.map(x=>x.count),1);const barH=Math.max(Math.round((d.count/maxH)*76),d.count>0?4:2);return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><div style={{width:"100%",height:barH,background:d.color,borderRadius:4,opacity:0.8}}/><span style={{fontSize:8,color:"#6B7280",textAlign:"center",lineHeight:1.1}}>{d.name}</span></div>})}</div></div>
        <div style={S.card}><h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Inventario por Sucursal</h3>{branches.map(b=><div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F3F4F6",fontSize:12}}><span style={{color:"#6B7280"}}>{b.name}</span><span style={{fontWeight:700}}>{inv.filter(x=>x.branch_id===b.id&&x.status==="disponible").length} disp.</span></div>)}</div>
      </div>
      <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><h3 style={{fontSize:13,fontWeight:600,margin:0}}>Tickets Recientes</h3><button onClick={()=>nav("leads")} style={{...S.gh,fontSize:11,color:"#F28100"}}>Ver todos →</button></div>{leads.slice(0,6).map(l=>{const motoBrand=l.model_brand||'';const motoModel=l.model_name||'';return<div key={l.id} onClick={()=>nav("ticket",l.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#F3F4F6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{l.fn} {l.ln}</div><div style={{fontSize:11,color:"#6B7280"}}>{motoBrand&&motoModel?`${motoBrand} ${motoModel} · `:`${motoBrand||motoModel||'Sin moto'} · `}{l.num}</div></div><PBdg p={l.priority}/><TBdg s={l.status}/></div>;})}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LEADS LIST
// ═══════════════════════════════════════════
