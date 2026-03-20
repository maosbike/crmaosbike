import { useState, useEffect, useRef } from "react";
import { api } from "./services/api";

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════
const BRANCHES=[{id:"b1",name:"Mall Plaza Norte",code:"MPN",addr:"Av. Américo Vespucio 1737, Auto Plaza Local 106, Huechuraba"},{id:"b2",name:"Mall Plaza Sur",code:"MPS",addr:"Av. Vicuña Mackenna 13451, La Florida"},{id:"b3",name:"Movicenter",code:"MOV",addr:"Av. Américo Vespucio 1001, Cerrillos"}];
const USERS=[
  {id:"u1",email:"admin@maosbike.cl",pw:"admin",fn:"Carlos",ln:"Mao",role:"super_admin",branch:null},
  {id:"u2",email:"jefe@maosbike.cl",pw:"jefe",fn:"Patricia",ln:"González",role:"admin_comercial",branch:"b1"},
  {id:"u3",email:"fran@maosbike.cl",pw:"fran",fn:"Francisca",ln:"Reyes",role:"backoffice",branch:null},
  {id:"u10",email:"diego@maosbike.cl",pw:"diego",fn:"Diego",ln:"Muñoz",role:"vendedor",branch:"b1"},
  {id:"u11",email:"javiera@maosbike.cl",pw:"javiera",fn:"Javiera",ln:"López",role:"vendedor",branch:"b1"},
  {id:"u12",email:"roberto@maosbike.cl",pw:"roberto",fn:"Roberto",ln:"Soto",role:"vendedor",branch:"b2"},
  {id:"u13",email:"catalina@maosbike.cl",pw:"catalina",fn:"Catalina",ln:"Vera",role:"vendedor",branch:"b2"},
  {id:"u14",email:"andres@maosbike.cl",pw:"andres",fn:"Andrés",ln:"Fuentes",role:"vendedor",branch:"b3"},
];
const BRANDS_LIST=["Honda","Suzuki","Yamaha","Benelli","Keeway","Royal Enfield","Takasaki","UM","Can-Am","Zontes","Voge","QJ Motor","Benda","Segway","Kymco"];
const MOTOS=[
  {id:"m1",brand:"Honda",model:"CB 190R",year:2025,cc:184,price:2490000,bonus:100000,cat:"Sport",colors:["Negro","Rojo","Azul"]},
  {id:"m2",brand:"Honda",model:"PCX 160",year:2025,cc:156,price:3290000,bonus:150000,cat:"Scooter",colors:["Blanco","Azul","Negro"]},
  {id:"m3",brand:"Yamaha",model:"R15 V4",year:2025,cc:155,price:3790000,bonus:0,cat:"Sport",colors:["Azul","Negro","Gris"]},
  {id:"m4",brand:"Yamaha",model:"MT-03",year:2025,cc:321,price:4590000,bonus:200000,cat:"Naked",colors:["Azul","Negro"]},
  {id:"m5",brand:"Yamaha",model:"NMAX Connected",year:2025,cc:155,price:2890000,bonus:100000,cat:"Scooter",colors:["Negro","Azul"]},
  {id:"m6",brand:"Suzuki",model:"Gixxer 250 SF",year:2025,cc:249,price:3490000,bonus:100000,cat:"Sport",colors:["Negro/Azul","Rojo"]},
  {id:"m7",brand:"Suzuki",model:"V-Strom 250 SX",year:2025,cc:249,price:3790000,bonus:100000,cat:"Adventure",colors:["Amarillo","Negro"]},
  {id:"m8",brand:"Benelli",model:"TNT 300",year:2025,cc:300,price:3690000,bonus:150000,cat:"Naked",colors:["Rojo","Negro"]},
  {id:"m9",brand:"Benelli",model:"TRK 502 X",year:2025,cc:500,price:5990000,bonus:200000,cat:"Adventure",colors:["Gris","Negro"]},
  {id:"m10",brand:"Keeway",model:"RKF 125",year:2025,cc:125,price:1490000,bonus:50000,cat:"Sport",colors:["Negro","Azul"]},
  {id:"m11",brand:"Royal Enfield",model:"Classic 350",year:2025,cc:349,price:4590000,bonus:100000,cat:"Clásica",colors:["Negro","Verde"]},
  {id:"m12",brand:"Royal Enfield",model:"Himalayan 450",year:2025,cc:452,price:5990000,bonus:150000,cat:"Adventure",colors:["Negro","Gris"]},
  {id:"m13",brand:"Zontes",model:"350T",year:2025,cc:349,price:4290000,bonus:100000,cat:"Naked",colors:["Negro","Blanco"]},
  {id:"m14",brand:"Voge",model:"500 DS",year:2025,cc:471,price:4990000,bonus:150000,cat:"Adventure",colors:["Negro","Gris"]},
  {id:"m15",brand:"Can-Am",model:"Ryker 600",year:2025,cc:600,price:8990000,bonus:0,cat:"3 Ruedas",colors:["Negro","Rojo"]},
  {id:"m16",brand:"Kymco",model:"AK 550",year:2025,cc:550,price:7990000,bonus:200000,cat:"Maxi Scooter",colors:["Negro","Gris"]},
  {id:"m17",brand:"QJ Motor",model:"SRV 300",year:2025,cc:296,price:3290000,bonus:100000,cat:"Naked",colors:["Negro","Azul"]},
  {id:"m18",brand:"Benda",model:"Napoleon 300",year:2025,cc:298,price:3490000,bonus:100000,cat:"Cruiser",colors:["Negro","Verde"]},
  {id:"m19",brand:"Segway",model:"E125",year:2025,cc:0,price:2490000,bonus:100000,cat:"Eléctrica",colors:["Blanco","Negro"]},
  {id:"m20",brand:"Takasaki",model:"TK 200",year:2025,cc:200,price:1290000,bonus:50000,cat:"Sport",colors:["Negro","Rojo"]},
  {id:"m21",brand:"UM",model:"Renegade Sport S",year:2025,cc:230,price:2290000,bonus:100000,cat:"Cruiser",colors:["Negro"]},
];

const TICKET_STATUS={abierto:{l:"Abierto",c:"#3B82F6"},en_gestion:{l:"En Gestión",c:"#F59E0B"},cotizado:{l:"Cotizado",c:"#8B5CF6"},financiamiento:{l:"Financiamiento",c:"#F28100"},ganado:{l:"Ganado",c:"#10B981"},perdido:{l:"Perdido",c:"#EF4444"},cerrado:{l:"Cerrado",c:"#6B7280"}};
const PRIORITY={alta:{l:"Alta",c:"#EF4444"},media:{l:"Media",c:"#F59E0B"},baja:{l:"Baja",c:"#6B7280"}};
const SRC={web:"Web",redes_sociales:"RRSS",whatsapp:"WhatsApp",presencial:"Presencial",referido:"Referido",evento:"Evento",llamada:"Llamada"};
const COMUNAS=["Huechuraba","Providencia","Las Condes","La Florida","Maipú","Santiago Centro","Ñuñoa","Vitacura","Puente Alto","San Bernardo","Cerrillos","Recoleta","Independencia","Quilicura","Lo Barnechea","Peñalolén","La Reina","Macul","San Miguel","Otra"];
const RECHAZO_MOTIVOS=["Renta insuficiente","Sin continuidad laboral","No cuenta con pie inicial solicitado","Sin ingresos acreditables","Mal comportamiento de pago","Morosidad vigente","Edad fuera de rango","Otro"];
const SIT_LABORAL=["Dependiente","Independiente","Jubilado","Estudiante","Sin actividad"];
const CONTINUIDAD=["Menos de 6 meses","6 a 12 meses","Mayor a 12 meses","Mayor a 24 meses"];
const FIN_STATUS={sin_movimiento:{l:"Sin Movimiento",c:"#6B7280"},en_evaluacion:{l:"En Evaluación",c:"#F59E0B"},aprobado:{l:"Aprobado",c:"#10B981"},rechazado:{l:"Rechazado",c:"#EF4444"},desistido:{l:"Desistido",c:"#6B7280"}};
const PAYMENT_TYPES=["Contado","Transferencia","Tarjeta Débito","Tarjeta Crédito","Crédito Autofin","Mixto"];
const INV_ST={disponible:{l:"Disponible",c:"#10B981"},reservada:{l:"Reservada",c:"#F59E0B"},vendida:{l:"Vendida",c:"#8B5CF6"},preinscrita:{l:"Preinscrita",c:"#06B6D4"}};

const d2=(d)=>new Date(Date.now()-d*864e5).toISOString();
const fmt=(n)=>n?"$"+Number(n).toLocaleString("es-CL"):"$0";
const fD=(d)=>d?new Date(d).toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}):"-";
const fDT=(d)=>d?new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"-";
const ago=(d)=>{if(!d)return"";const m=Math.floor((Date.now()-new Date(d).getTime())/6e4);if(m<60)return m+"min";const h=Math.floor(m/60);if(h<24)return h+"h";return Math.floor(h/24)+"d";};
const gM=(id)=>MOTOS.find(m=>m.id===id);
const gU=(id)=>USERS.find(u=>u.id===id);
const gB=(id)=>BRANCHES.find(b=>b.id===id);

const genLeads=()=>{
  const names=[["Franco","Muñoz","19344481-4","24/07/1996","Franko.algenis96@gmail.com","957223438","Huechuraba"],["María","González","13346679-1","15/03/1985","maria.g@gmail.com","955551002","La Florida"],["Carlos","Soto","14347680-2","01/11/1990","carlos.soto@gmail.com","955551003","Maipú"],["Andrea","Silva","15678901-2","22/06/1992","andrea.s@yahoo.com","955551004","Providencia"],["Pedro","Fuentes","16789012-3","10/09/1988","pedro.f@outlook.com","955551005","Las Condes"],["Sofía","Reyes","17890123-4","03/12/1995","sofia.r@gmail.com","955551006","Ñuñoa"],["Fernando","Castro","18901234-5","18/04/1987","fcastro@gmail.com","955551007","Santiago Centro"],["Camila","Torres","19012345-6","25/08/1993","camila.t@gmail.com","955551008","Puente Alto"],["Rodrigo","Herrera","20123456-7","12/02/1991","rodrigo.h@gmail.com","955551009","San Bernardo"],["Valentina","Díaz","21234567-8","07/07/1994","vale.d@gmail.com","955551010","Quilicura"],["Sebastián","Rojas","22345678-9","30/01/1989","seba.r@gmail.com","955551011","Recoleta"],["Isidora","Mora","12456789-0","14/05/1996","isi.mora@gmail.com","955551012","Peñalolén"],["Nicolás","Vega","13567890-1","20/10/1986","nico.v@gmail.com","955551013","Macul"],["Catalina","Pinto","14678901-2","08/03/1993","cata.p@gmail.com","955551014","Lo Barnechea"],["Matías","Araya","15789012-3","16/11/1990","matias.a@gmail.com","955551015","Vitacura"],["Tomás","Navarro","16890123-4","29/06/1988","tomas.n@gmail.com","955551016","La Reina"],["Gabriel","Espinoza","17901234-5","05/09/1994","gabi.e@gmail.com","955551017","Independencia"],["Antonella","Figueroa","18012345-6","11/04/1992","anto.f@gmail.com","955551018","San Miguel"]];
  const sellers=USERS.filter(u=>u.role==="vendedor");
  const statuses=["abierto","abierto","en_gestion","en_gestion","cotizado","cotizado","financiamiento","financiamiento","ganado","ganado","ganado","perdido","perdido","cerrado","abierto","en_gestion","cotizado","financiamiento"];
  return names.map(([fn,ln,rut,bday,email,phone,comuna],i)=>{
    const s=sellers[i%sellers.length],m=MOTOS[i%MOTOS.length];
    const st=statuses[i]||"abierto";
    const prio=i<4?"alta":i<10?"media":"baja";
    const wantsFin=i%3===0;
    const sitLab=SIT_LABORAL[i%5];
    const cont=CONTINUIDAD[i%4];
    const renta=(500+i*50)*1000;
    const pie=Math.round(m.price*0.15+(i*10000));
    const finSt=st==="financiamiento"?(i%2===0?"en_evaluacion":"aprobado"):st==="ganado"?"aprobado":st==="perdido"?(i%2===0?"rechazado":"desistido"):"sin_movimiento";
    const rechazoMotivo=finSt==="rechazado"?RECHAZO_MOTIVOS[i%RECHAZO_MOTIVOS.length]:null;
    const testRide=i<6;
    return{
      id:`t-${i+1}`,num:`SCM-${247100+i+1}`,fn,ln,rut,bday,email,phone,comuna,
      source:Object.keys(SRC)[i%7],branch:s.branch,seller:s.id,
      status:st,priority:prio,motoId:m.id,colorPref:m.colors[0],
      wantsFin,sitLab,continuidad:cont,renta,pie,testRide,
      finStatus:finSt,finInst:"Autofin",rechazoMotivo,
      obsVendedor:i<8?`Cliente interesado en ${m.brand} ${m.model}. ${wantsFin?"Solicita financiamiento.":"Pago contado."}`:null,
      obsSupervisor:i<4?"Dar seguimiento prioritario":null,
      createdAt:d2(i*2),lastContact:i<12?d2(i*0.5):null,
      timeline:[
        {id:`tl-${i}-1`,type:"system",title:"Ticket creado",date:d2(i*2),user:"Sistema"},
        ...(i<14?[{id:`tl-${i}-2`,type:"contact",method:i%2===0?"llamada":"whatsapp",result:i<10?"Contactado":"No contesta",note:i<10?"Cliente respondió, se agenda visita":"Sin respuesta, reintentar",date:d2(i*1.2),user:`${s.fn} ${s.ln}`}]:[]),
        ...(i<10?[{id:`tl-${i}-3`,type:"contact",method:"presencial",result:"Cotización entregada",note:`Vino a tienda, cotizó ${m.brand} ${m.model}`,date:d2(i*0.6),user:`${s.fn} ${s.ln}`}]:[]),
        ...(i<6?[{id:`tl-${i}-4`,type:"contact",method:"whatsapp",result:"Envío documentos",note:"Cliente envió documentos para evaluación",date:d2(i*0.3),user:`${s.fn} ${s.ln}`}]:[]),
      ],
      postVenta:{factura:st==="ganado",pagoReg:st==="ganado",homSol:st==="ganado"&&i<10,homRec:st==="ganado"&&i<9,enrolada:st==="ganado"&&i<8,entregada:st==="ganado"&&i<7},
    };
  });
};

const genInv=()=>{
  const inv=[];let idx=0;
  MOTOS.slice(0,12).forEach((m,mi)=>{
    m.colors.forEach((color,ci)=>{
      BRANCHES.forEach((br,bi)=>{
        if((mi+ci+bi)%3===0||idx<20){
          const st=idx<16?"disponible":idx<20?"reservada":idx<24?"vendida":"preinscrita";
          inv.push({id:`inv-${++idx}`,branch:br.id,year:m.year,brand:m.brand,model:m.model,color,chassis:`9C2${String(1e7+idx)}`,motor:`E${String(2e6+idx)}`,status:st,price:m.price,motoId:m.id});
        }
      });
    });
  });
  return inv;
};

const BRANCH_CODE_TO_LOCAL={MPN:'b1',MPS:'b2',MOV:'b3'};
const mapTicket=(t)=>{
  const motoLocal=t.moto_brand?MOTOS.find(m=>m.brand===t.moto_brand&&m.model===t.moto_model):null;
  const pv=t.post_venta||{factura:false,pagoReg:false,homSol:false,homRec:false,enrolada:false,entregada:false};
  return{
    id:t.id,num:t.ticket_num,
    fn:t.first_name,ln:t.last_name||'',
    rut:t.rut||'',bday:t.birthdate||'',
    email:t.email||'',phone:t.phone||'',
    comuna:t.comuna||'',source:t.source||'presencial',
    branch:BRANCH_CODE_TO_LOCAL[t.branch_code]||null,
    branch_id:t.branch_id||null,branch_name:t.branch_name||'',
    branch_code:t.branch_code||'',branch_addr:t.branch_addr||'',
    seller:null,seller_fn:t.seller_fn||'',seller_ln:t.seller_ln||'',
    seller_id:t.assigned_to||null,
    status:t.status||'abierto',priority:t.priority||'media',
    motoId:motoLocal?.id||null,
    model_brand:t.moto_brand||null,model_name:t.moto_model||null,
    colorPref:t.color_pref||'',wantsFin:t.wants_financing||false,
    sitLab:t.sit_laboral||'',continuidad:t.continuidad||'',
    renta:t.renta||0,pie:t.pie||0,
    testRide:t.test_ride||false,
    finStatus:t.fin_status||'sin_movimiento',
    finInst:t.fin_institution||'Autofin',
    rechazoMotivo:t.rechazo_motivo||null,
    obsVendedor:t.obs_vendedor||'',obsSupervisor:t.obs_supervisor||'',
    createdAt:t.created_at,lastContact:t.last_contact_at||null,
    sla_status:t.sla_status||null,sla_deadline:t.sla_deadline||null,
    first_action_at:t.first_action_at||null,
    postVenta:typeof pv==='string'?JSON.parse(pv):pv,
    timeline:[],fin_data:t.fin_data||null,
  };
};

// ═══════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════
const I=({d,s=18,c="currentColor",...p})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d}/></svg>;
const Ic={
  home:p=><I d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M9 22V12h6v10" {...p}/>,
  users:p=><I d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" {...p}/>,
  kanban:p=><I d="M3 3h6v18H3zM9 3h6v12H9zM15 3h6v8h-6z" {...p}/>,
  box:p=><I d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" {...p}/>,
  sale:p=><I d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18 M16 10a4 4 0 01-8 0" {...p}/>,
  bike:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M12 17V5l4 4M8 9h8"/></svg>,
  chart:p=><I d="M18 20V10 M12 20V4 M6 20v-6" {...p}/>,
  gear:p=><I d="M12 15a3 3 0 100-6 3 3 0 000 6z" {...p}/>,
  out:p=><I d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9" {...p}/>,
  search:p=><I d="M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.35-4.35" {...p}/>,
  plus:p=><I d="M12 5v14 M5 12h14" {...p}/>,
  back:p=><I d="M19 12H5 M12 19l-7-7 7-7" {...p}/>,
  phone:p=><I d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" {...p}/>,
  mail:p=><I d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" {...p}/>,
  alert:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>,
  check:p=><I d="M20 6L9 17l-5-5" {...p}/>,
  x:p=><I d="M18 6L6 18M6 6l12 12" {...p}/>,
  send:p=><I d="M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z" {...p}/>,
  file:p=><I d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" {...p}/>,
  chev:p=><I d="M9 18l6-6-6-6" {...p}/>,
  bell:p=><I d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" {...p}/>,
  msg:p=><I d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" {...p}/>,
  clock:p=><I d="M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2" {...p}/>,
  target:p=><svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  user:p=><I d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z" {...p}/>,
  dl:p=><I d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3" {...p}/>,
  cal:p=><I d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" {...p}/>,
  remind:p=><I d="M15 17H20L18.6 15.6A7 7 0 0018 14V11a6 6 0 10-12 0v3a7 7 0 00-.6 1.6L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" {...p}/>,
  lock:p=><I d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4" {...p}/>,
  menu:p=><I d="M3 12h18 M3 6h18 M3 18h18" {...p}/>,
  tag:p=><I d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01" {...p}/>,
};

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const S={
  card:{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,padding:16},
  inp:{background:"#0E0E0F",border:"1px solid #262626",borderRadius:8,padding:"8px 12px",color:"#FAFAFA",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"},
  btn:{background:"#F28100",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  btn2:{background:"#1A1A1B",color:"#FAFAFA",border:"1px solid #262626",borderRadius:8,padding:"8px 16px",fontWeight:500,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  gh:{background:"transparent",border:"none",cursor:"pointer",borderRadius:8,fontFamily:"inherit"},
  lbl:{display:"block",fontSize:11,color:"#6B6B6B",marginBottom:4,fontWeight:500},
};
const Bdg=({l,c,bg})=><span style={{display:"inline-flex",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,color:c,background:bg||`${c}18`,whiteSpace:"nowrap"}}>{l}</span>;
const TBdg=({s})=>{const x=TICKET_STATUS[s];return x?<Bdg l={x.l} c={x.c}/>:<Bdg l={s} c="#6B6B6B"/>;};
const PBdg=({p})=>{const x=PRIORITY[p];return x?<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:x.c}}><span style={{width:7,height:7,borderRadius:"50%",background:x.c}}/>{x.l}</span>:null;};
const Stat=({icon:Ico,ic,ib,label,val,sub,sc,al})=>(
  <div style={{...S.card,display:"flex",flexDirection:"column",gap:4}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{padding:6,borderRadius:8,background:ib}}><Ico size={16} color={ic}/></div><span style={{fontSize:10,color:"#6B6B6B",textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:600}}>{label}</span></div>
    <span style={{fontSize:22,fontWeight:800,color:al?"#EF4444":undefined}}>{val}</span>
    {sub&&<span style={{fontSize:11,color:sc||"#6B6B6B"}}>{sub}</span>}
  </div>
);
const Modal=({onClose,title,children,wide})=>(
  <div onClick={onClose} className="crm-modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:60,padding:16}}>
    <div onClick={e=>e.stopPropagation()} className="crm-modal-inner" style={{background:"#151516",border:"1px solid #262626",borderRadius:16,padding:24,width:"100%",maxWidth:wide?750:480,maxHeight:"90vh",overflow:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontSize:16,fontWeight:700,margin:0}}>{title}</h2><button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18}/></button></div>{children}</div>
  </div>
);
const Field=({label,value,onChange,type="text",ph,req,opts,rows,disabled})=>{
  const renderInput=()=>{
    if(opts)return <select value={value} onChange={e=>onChange(e.target.value)} style={{...S.inp,width:"100%"}} disabled={disabled}>{opts.map(o=><option key={o.v!==undefined?o.v:o} value={o.v!==undefined?o.v:o}>{o.l||o}</option>)}</select>;
    if(rows)return <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} style={{...S.inp,width:"100%",resize:"vertical"}} placeholder={ph} disabled={disabled}/>;
    return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} required={req} style={{...S.inp,width:"100%"}} disabled={disabled}/>;
  };
  return <div><label style={S.lbl}>{label}</label>{renderInput()}</div>;
};

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App(){
  const[user,setUser]=useState(null);
  const[page,setPage]=useState("dashboard");
  const[leads,setLeads]=useState([]);
  const[inv,setInv]=useState(()=>genInv());
  const[selLead,setSelLead]=useState(null);
  const[showChangePw,setShowChangePw]=useState(false);
  const[drawerOpen,setDrawerOpen]=useState(false);
  const[realBranches,setRealBranches]=useState(BRANCHES);

  useEffect(()=>{
    if(!user)return;
    api.getTickets({limit:500}).then(d=>setLeads((d.data||[]).map(mapTicket))).catch(()=>{});
    api.getBranches().then(bs=>setRealBranches(bs.length?bs:BRANCHES)).catch(()=>{});
  },[user?.id]);

  if(!user)return<Login onLogin={setUser}/>;
  if(user.forceChange)return<ForceChangeView user={user} onChanged={u=>{setUser(u);localStorage.setItem("crm_user",JSON.stringify(u));}}/>;
  const reloadLeads=()=>api.getTickets({limit:500}).then(d=>setLeads((d.data||[]).map(mapTicket))).catch(()=>{});
  const nav=(pg,lid)=>{
    if(pg==="ticket"&&lid){
      setSelLead(leads.find(l=>l.id===lid)||{id:lid,fn:'',ln:'',timeline:[]});
      api.getTicket(lid).then(d=>{
        const tl=(d.timeline||[]).map(t=>({id:t.id,type:t.type,title:t.title,note:t.note,method:t.method,date:t.created_at,user_fn:t.user_fn,user_ln:t.user_ln}));
        const full={...mapTicket(d),timeline:tl};
        setSelLead(full);
        setLeads(p=>p.map(l=>l.id===lid?full:l));
      }).catch(()=>{});
    }
    setPage(pg);
  };
  const updLead=(id,u)=>{setLeads(p=>p.map(l=>l.id===id?{...l,...u}:l));if(selLead?.id===id)setSelLead(p=>({...p,...u}));};
  const addLead=l=>setLeads(p=>[l,...p]);
  const updInv=(id,u)=>setInv(p=>p.map(x=>x.id===id?{...x,...u}:x));
  const addInv=x=>setInv(p=>[x,...p]);
  const r=user.role;
  const items=[
    {id:"dashboard",icon:Ic.home,label:"Dashboard"},
    ...(r!=="backoffice"?[{id:"leads",icon:Ic.users,label:"Leads / Tickets"},{id:"pipeline",icon:Ic.kanban,label:"Pipeline"}]:[]),
    {id:"calendar",icon:Ic.cal,label:"Calendario"},
    {id:"inventory",icon:Ic.box,label:"Inventario"},
    {id:"sales",icon:Ic.sale,label:"Ventas"},
    {id:"catalog",icon:Ic.bike,label:"Catálogo"},
    ...(["super_admin","admin_comercial"].includes(r)?[{id:"reports",icon:Ic.chart,label:"Reportes"}]:[]),
    ...(r==="super_admin"?[{id:"admin",icon:Ic.gear,label:"Admin"},{id:"import",icon:Ic.dl,label:"Importar"},{id:"pricelist",icon:Ic.tag,label:"Lista Precios"}]:[]),
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:"#0A0A0B",color:"#FAFAFA",fontFamily:"'Montserrat',system-ui,sans-serif",fontSize:14,overflow:"hidden"}}>
      <MobileDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} items={items} page={page} nav={(pg,lid)=>{setDrawerOpen(false);nav(pg,lid);}} user={user} onChangePw={()=>{setDrawerOpen(false);setShowChangePw(true);}} onLogout={()=>setUser(null)}/>
      <aside className="crm-sidebar" style={{width:210,background:"#111112",borderRight:"1px solid #1E1E1F",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 14px",height:52,borderBottom:"1px solid #1E1E1F"}}><div style={{width:30,height:30,borderRadius:8,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={17} color="white"/></div><span style={{fontSize:14,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#A3A3A3"}}><it.icon size={16}/>{it.label}</button>;})}</nav>
        <div style={{borderTop:"1px solid #1E1E1F",padding:10}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:10,fontWeight:700}}>{(user.fn[0]+(user.ln&&user.ln!=='-'?user.ln[0]:'')).toUpperCase()}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600}}>{user.fn}</div><div style={{fontSize:9,color:"#555"}}>{user.branchName||user.role}</div></div><button onClick={()=>setShowChangePw(true)} style={{...S.gh,padding:4}} title="Cambiar contraseña"><Ic.lock size={14} color="#555"/></button><button onClick={()=>setUser(null)} style={{...S.gh,padding:4}} title="Cerrar sesión"><Ic.out size={14} color="#555"/></button></div></div>
      </aside>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <header className="crm-mobile-hdr" style={{display:"none",height:52,alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:"1px solid #1E1E1F",background:"#111112",flexShrink:0,gap:10}}>
          <button onClick={()=>setDrawerOpen(true)} style={{...S.gh,padding:6}}><Ic.menu size={22} color="#A3A3A3"/></button>
          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:24,height:24,borderRadius:6,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={13} color="white"/></div><span style={{fontSize:13,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
          <NotifBell nav={nav}/>
        </header>
        <header className="crm-desktop-hdr" style={{height:48,display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"0 18px",borderBottom:"1px solid #1E1E1F",background:"rgba(17,17,18,0.7)",flexShrink:0}}><NotifBell nav={nav}/></header>
        <main className="crm-scroll-area" style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
          {page==="dashboard"&&<Dashboard leads={leads} inv={inv} user={user} nav={nav}/>}
          {page==="leads"&&<LeadsList leads={leads} user={user} nav={nav} addLead={addLead} onRefresh={reloadLeads} realBranches={realBranches}/>}
          {page==="pipeline"&&<PipelineView leads={leads} user={user} nav={nav} updLead={updLead}/>}
          {page==="ticket"&&selLead&&<TicketView lead={selLead} user={user} nav={nav} updLead={updLead}/>}
          {page==="inventory"&&<InventoryView inv={inv} updInv={updInv} addInv={addInv} user={user}/>}
          {page==="sales"&&<SalesView leads={leads} user={user}/>}
          {page==="catalog"&&<CatalogView/>}
          {page==="reports"&&<ReportsView leads={leads}/>}
          {page==="admin"&&<AdminView/>}{page==="import"&&r==="super_admin"&&<ImportView/>}
          {page==="pricelist"&&r==="super_admin"&&<PricelistView/>}
          {page==="calendar"&&<CalendarView user={user} nav={nav}/>}
        </main>
      </div>
      {showChangePw&&<ChangePasswordModal onClose={()=>setShowChangePw(false)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════
// MOBILE DRAWER
// ═══════════════════════════════════════════
function MobileDrawer({open,onClose,items,page,nav,user,onChangePw,onLogout}){
  return(
    <>
      {open&&<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:88}}/>}
      <div className={`crm-drawer${open?" open":""}`} style={{position:"fixed",left:0,top:0,bottom:0,width:240,background:"#111112",borderRight:"1px solid #1E1E1F",display:"flex",flexDirection:"column",zIndex:89,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",height:52,borderBottom:"1px solid #1E1E1F",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:"#F28100",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic.bike size={14} color="white"/></div><span style={{fontSize:13,fontWeight:700}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></span></div>
          <button onClick={onClose} style={{...S.gh,padding:4}}><Ic.x size={18} color="#A3A3A3"/></button>
        </div>
        <nav style={{flex:1,padding:"8px 6px",display:"flex",flexDirection:"column",gap:1}}>{items.map(it=>{const act=page===it.id||(it.id==="leads"&&page==="ticket");return<button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"12px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit",background:act?"rgba(242,129,0,0.1)":"transparent",color:act?"#F28100":"#A3A3A3",textAlign:"left"}}><it.icon size={17}/>{it.label}</button>;})}
        </nav>
        <div style={{borderTop:"1px solid #1E1E1F",padding:10,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 4px"}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(242,129,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:11,fontWeight:700,flexShrink:0}}>{user&&(user.fn[0]+user.ln[0]).toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600}}>{user?.fn} {user?.ln}</div><div style={{fontSize:10,color:"#555"}}>{user?.role?.replace(/_/g," ")}</div></div>
          </div>
          <button onClick={onChangePw} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"1px solid #262626",background:"transparent",color:"#A3A3A3",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.lock size={14}/>Cambiar contraseña</button>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",borderRadius:8,border:"none",background:"transparent",color:"#EF4444",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}><Ic.out size={14}/>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════
function ChangePasswordModal({onClose}){
  const[form,setForm]=useState({current:"",next:"",confirm:""});
  const[err,setErr]=useState("");
  const[ok,setOk]=useState(false);
  const[loading,setLoading]=useState(false);
  const submit=async e=>{
    e.preventDefault();setErr("");
    if(form.next!==form.confirm)return setErr("Las contraseñas nuevas no coinciden");
    if(form.next.length<8)return setErr("La nueva contraseña debe tener mínimo 8 caracteres");
    setLoading(true);
    try{
      await api.changePassword(form.current,form.next,form.confirm);
      setOk(true);
    }catch(ex){setErr(ex.message||"Error al cambiar contraseña");}
    finally{setLoading(false);}
  };
  return(
    <Modal onClose={onClose} title="Cambiar Contraseña">
      {ok
        ?<div style={{textAlign:"center",padding:"16px 0"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><Ic.check size={24} color="#10B981"/></div>
          <p style={{color:"#10B981",fontWeight:600,marginBottom:4}}>Contraseña actualizada</p>
          <p style={{color:"#6B6B6B",fontSize:12,marginBottom:16}}>Tu contraseña fue cambiada correctamente.</p>
          <button onClick={onClose} style={S.btn}>Cerrar</button>
        </div>
        :<form onSubmit={submit}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Field label="Contraseña actual *" value={form.current} onChange={v=>setForm({...form,current:v})} type="password" ph="Tu contraseña actual" req/>
            <Field label="Nueva contraseña *" value={form.next} onChange={v=>setForm({...form,next:v})} type="password" ph="Mínimo 8 caracteres" req/>
            <Field label="Confirmar nueva contraseña *" value={form.confirm} onChange={v=>setForm({...form,confirm:v})} type="password" ph="Repite la nueva contraseña" req/>
          </div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button type="button" onClick={onClose} style={S.btn2}>Cancelar</button>
            <button type="submit" disabled={loading} style={{...S.btn,opacity:loading?0.7:1}}>{loading?"Guardando...":"Cambiar Contraseña"}</button>
          </div>
        </form>
      }
    </Modal>
  );
}

// ═══════════════════════════════════════════
// FORCE CHANGE PASSWORD VIEW
// ═══════════════════════════════════════════
function ForceChangeView({user,onChanged}){
  const[form,setForm]=useState({current:"",next:"",confirm:""});
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const submit=async e=>{
    e.preventDefault();setErr("");
    if(form.next!==form.confirm)return setErr("Las contraseñas nuevas no coinciden");
    if(form.next.length<8)return setErr("La nueva contraseña debe tener mínimo 8 caracteres");
    setLoading(true);
    try{
      await api.changePassword(form.current,form.next,form.confirm);
      onChanged({...user,forceChange:false});
    }catch(ex){setErr(ex.message||"Error al cambiar contraseña");}
    finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A0A0B",fontFamily:"'Montserrat',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:400,padding:"0 20px"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:14,background:"rgba(242,129,0,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}><Ic.lock size={24} color="#F28100"/></div>
          <h1 style={{fontSize:20,fontWeight:800,color:"#FAFAFA",margin:0}}>Cambio de contraseña requerido</h1>
          <p style={{color:"#6B6B6B",fontSize:12,marginTop:6}}>Hola {user.fn}, debes cambiar tu contraseña antes de continuar.</p>
        </div>
        <form onSubmit={submit} style={{background:"#151516",border:"1px solid #262626",borderRadius:14,padding:22}}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Field label="Contraseña temporal *" value={form.current} onChange={v=>setForm({...form,current:v})} type="password" ph="La contraseña que te dieron" req/>
            <Field label="Nueva contraseña *" value={form.next} onChange={v=>setForm({...form,next:v})} type="password" ph="Mínimo 8 caracteres" req/>
            <Field label="Confirmar nueva contraseña *" value={form.confirm} onChange={v=>setForm({...form,confirm:v})} type="password" ph="Repite la nueva contraseña" req/>
          </div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:12}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",padding:11,opacity:loading?0.7:1}}>{loading?"Guardando...":"Establecer nueva contraseña"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════
function Login({onLogin}){
  const[identifier,setIdentifier]=useState("");
  const[pw,setPw]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const go=async e=>{
    e.preventDefault();
    setErr("");setLoading(true);
    try{
      const {token,user}=await api.login(identifier,pw);
      localStorage.setItem("crm_token",token);
      localStorage.setItem("crm_user",JSON.stringify(user));
      onLogin(user);
    }catch(ex){
      setErr(ex.message||"Credenciales inválidas");
    }finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A0A0B",fontFamily:"'Montserrat',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380,padding:"0 20px"}}>
        <div style={{textAlign:"center",marginBottom:28}}><div style={{width:56,height:56,borderRadius:14,background:"#F28100",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:14,boxShadow:"0 8px 32px rgba(242,129,0,0.3)"}}><Ic.bike size={28} color="white"/></div><h1 style={{fontSize:22,fontWeight:800,color:"#FAFAFA",margin:0}}>MaosBike <span style={{color:"#F28100"}}>CRM</span></h1><p style={{color:"#6B6B6B",fontSize:12,marginTop:4}}>Sistema de gestión comercial</p></div>
        <form onSubmit={go} style={{background:"#151516",border:"1px solid #262626",borderRadius:14,padding:22}}>
          <div style={{marginBottom:14}}><label style={S.lbl}>Usuario o Email</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="ej: joaquin" autoComplete="username" style={{...S.inp,width:"100%"}}/></div>
          <div style={{marginBottom:18}}><label style={S.lbl}>Contraseña</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" style={{...S.inp,width:"100%"}}/></div>
          {err&&<div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"7px 12px",color:"#EF4444",fontSize:12,marginBottom:14}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...S.btn,width:"100%",padding:11,opacity:loading?0.7:1}}>{loading?"Ingresando...":"Ingresar"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function Dashboard({leads,inv,user,nav}){
  const[stats,setStats]=useState(null);
  const active=leads.filter(l=>!["ganado","perdido","cerrado"].includes(l.status));
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
          <Stat icon={Ic.alert} ic="#EF4444" ib="rgba(239,68,68,0.1)" label="SLA Vencidos" val={kpi("vencidos","sla_vencidos")} al={kpi("vencidos","sla_vencidos")>0}/>
          <Stat icon={Ic.clock} ic="#F59E0B" ib="rgba(245,158,11,0.1)" label="Por Vencer" val={kpi("prox_vencer","proximos_vencer")} sub="Próximas 2h"/>
          <Stat icon={Ic.users} ic="#6B7280" ib="rgba(107,114,128,0.1)" label="Sin Tocar" val={kpi("sin_tocar")} sub="Leads sin gestión"/>
          <Stat icon={Ic.remind} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Recor. Hoy" val={kpi("recordatorios_hoy")}/>
          <Stat icon={Ic.bell} ic="#F28100" ib="rgba(242,129,0,0.1)" label="Reasignados" val={kpi("reasignados_hoy")} sub="Hoy"/>
        </div>
        {urgentes.length>0&&<div style={{...S.card,marginBottom:14}}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px",color:"#EF4444"}}>⚠ Leads urgentes</h3>
          {urgentes.slice(0,5).map((l,i)=><div key={i} onClick={()=>nav("ticket",String(l.id||l.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#1A1A1B"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{l.client_name||l.first_name||`${l.fn||""} ${l.ln||""}`.trim()}{l.last_name?` ${l.last_name}`:""}</div><div style={{fontSize:11,color:"#666"}}>{l.seller_name||(l.seller_first?`${l.seller_first} ${l.seller_last||""}`.trim():"")}</div></div><span style={{fontSize:11,color:"#EF4444",fontWeight:600}}>{(l.sla_status==="breached"||l.sla_status==="vencido")?"SLA Vencido":l.hours_left!=null&&l.hours_left<=0?"SLA Vencido":l.hours_left!=null?`${Math.ceil(l.hours_left)}h restantes`:"Sin gestión"}</span></div>)}
        </div>}
        {tareasHoy.length>0&&<div style={{...S.card,marginBottom:14}}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px"}}>📋 Tareas para hoy</h3>
          {tareasHoy.slice(0,5).map((t,i)=><div key={i} onClick={()=>t.ticket_id&&nav("ticket",String(t.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#1A1A1B"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{t.title}</div><div style={{fontSize:11,color:"#666"}}>{t.client_name||""}</div></div><span style={{fontSize:10,color:"#F28100"}}>{t.reminder_time||fD(t.reminder_date)}</span></div>)}
        </div>}
      </>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:10,marginBottom:18}}>
        <Stat icon={Ic.users} ic="#3B82F6" ib="rgba(59,130,246,0.1)" label="Tickets Activos" val={active.length} sub={`${ganados.length} ganados`}/>
        <Stat icon={Ic.target} ic="#10B981" ib="rgba(16,185,129,0.1)" label="Ganados" val={ganados.length} sub={`${leads.length>0?((ganados.length/leads.length)*100).toFixed(0):0}% conversión`} sc="#10B981"/>
        <Stat icon={Ic.box} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Stock Disponible" val={avail} sub={`${inv.length} total`}/>
        <Stat icon={Ic.alert} ic="#EF4444" ib="rgba(239,68,68,0.1)" label="Perdidos" val={leads.filter(l=>l.status==="perdido").length} al={leads.filter(l=>l.status==="perdido").length>0}/>
      </div>
      <div className="crm-dash-bottom" style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:18}}>
        <div style={S.card}><h3 style={{fontSize:13,fontWeight:600,margin:"0 0 10px"}}>Pipeline</h3><div style={{display:"flex",gap:4,marginBottom:4}}>{pipe.map((d,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:11,fontWeight:700}}>{d.count}</div>)}</div><div style={{display:"flex",gap:4,alignItems:"flex-end",height:88,overflow:"hidden"}}>{pipe.map((d,i)=>{const maxH=Math.max(...pipe.map(x=>x.count),1);const barH=Math.max(Math.round((d.count/maxH)*76),d.count>0?4:2);return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><div style={{width:"100%",height:barH,background:d.color,borderRadius:4,opacity:0.8}}/><span style={{fontSize:8,color:"#666",textAlign:"center",lineHeight:1.1}}>{d.name}</span></div>})}</div></div>
        <div style={S.card}><h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Inventario por Sucursal</h3>{BRANCHES.map(b=><div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1A1A1B",fontSize:12}}><span style={{color:"#A3A3A3"}}>{b.name}</span><span style={{fontWeight:700}}>{inv.filter(x=>x.branch===b.id&&x.status==="disponible").length} disp.</span></div>)}</div>
      </div>
      <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><h3 style={{fontSize:13,fontWeight:600,margin:0}}>Tickets Recientes</h3><button onClick={()=>nav("leads")} style={{...S.gh,fontSize:11,color:"#F28100"}}>Ver todos →</button></div>{leads.slice(0,6).map(l=>{const m=gM(l.motoId);const motoBrand=l.model_brand||m?.brand||'';const motoModel=l.model_name||m?.model||'';return<div key={l.id} onClick={()=>nav("ticket",l.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",borderRadius:8,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#1A1A1B"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{l.fn} {l.ln}</div><div style={{fontSize:11,color:"#666"}}>{motoBrand&&motoModel?`${motoBrand} ${motoModel} · `:`${motoBrand||motoModel||'Sin moto'} · `}{l.num}</div></div><PBdg p={l.priority}/><TBdg s={l.status}/></div>;})}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LEADS LIST
// ═══════════════════════════════════════════
function LeadsList({leads,user,nav,addLead,onRefresh,realBranches}){
  const brs=realBranches||BRANCHES;
  const[search,setSearch]=useState("");const[stF,setStF]=useState("");const[brF,setBrF]=useState("");const[showNew,setShowNew]=useState(false);
  const[nw,setNw]=useState({fn:"",ln:"",phone:"",email:"",rut:"",comuna:"",source:"presencial",motoId:"",branch_id:user.branch||"",priority:"media"});
  const f=leads.filter(l=>{if(search&&!`${l.fn} ${l.ln} ${l.phone} ${l.email} ${l.rut} ${l.num}`.toLowerCase().includes(search.toLowerCase()))return false;if(stF&&l.status!==stF)return false;if(brF&&l.branch_id!==brF&&l.branch!==brF)return false;if(user.role==="vendedor"&&l.seller_id!==user.id)return false;return true;});
  const[adding,setAdding]=useState(false);
  const handleAdd=async e=>{
    e.preventDefault();setAdding(true);
    try{
      const body={first_name:nw.fn,last_name:nw.ln,phone:nw.phone,email:nw.email,rut:nw.rut,comuna:nw.comuna,source:nw.source,branch_id:nw.branch_id||null,priority:nw.priority,model_id:null,wants_financing:false};
      if(nw.motoId){const m=gM(nw.motoId);if(m){const models=await api.getModels({brand:m.brand}).catch(()=>({data:[]}));const found=(models.data||models||[]).find(x=>x.brand===m.brand&&x.model===m.model);if(found)body.model_id=found.id;}}
      const created=await api.createTicket(body);
      addLead(mapTicket(created));
      setShowNew(false);
      setTimeout(()=>onRefresh?.(),1000);
    }catch(ex){alert(ex.message||"Error al crear ticket");}
    finally{setAdding(false);}
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Leads / Tickets</h1><p style={{color:"#6B6B6B",fontSize:12}}>{f.length} tickets</p></div><button onClick={()=>setShowNew(true)} style={{...S.btn,display:"flex",alignItems:"center",gap:6,fontSize:12}}><Ic.plus size={15}/>Nuevo Ticket</button></div>
      <div className="crm-filters" style={{...S.card,padding:10,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}><div className="crm-search" style={{position:"relative",flex:1,minWidth:200}}><Ic.search size={14} color="#555" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, RUT, ticket..." style={{...S.inp,paddingLeft:30,width:"100%"}}/></div><select value={stF} onChange={e=>setStF(e.target.value)} style={{...S.inp,minWidth:140}}><option value="">Todos los estados</option>{Object.entries(TICKET_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select><select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp,minWidth:140}}><option value="">Todas las sucursales</option>{brs.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Ticket","Cliente","Contacto","Moto","Prioridad","Estado","Vendedor","Fecha"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:10,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{f.map(l=>{const m=gM(l.motoId)||(l.model_brand?{brand:l.model_brand,model:l.model_name}:null);const sfn=l.seller_fn||(gU(l.seller)?.fn)||'';const sln=l.seller_ln||(gU(l.seller)?.ln)||'';return<tr key={l.id} onClick={()=>nav("ticket",l.id)} style={{borderBottom:"1px solid #1A1A1B",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#151516"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><td style={{padding:"9px 12px",color:"#F28100",fontWeight:600,fontSize:11}}>{l.num}</td><td style={{padding:"9px 12px"}}><div style={{fontWeight:600}}>{l.fn} {l.ln}</div><div style={{fontSize:10,color:"#555"}}>{l.rut}</div></td><td style={{padding:"9px 12px"}}><div style={{fontSize:11,color:"#888"}}>{l.phone}</div><div style={{fontSize:10,color:"#555"}}>{l.email}</div></td><td style={{padding:"9px 12px"}}>{m?`${m.brand} ${m.model}`:<span style={{color:"#555"}}>-</span>}</td><td style={{padding:"9px 12px"}}><PBdg p={l.priority}/></td><td style={{padding:"9px 12px"}}><TBdg s={l.status}/></td><td style={{padding:"9px 12px",fontSize:11}}>{sfn}{sln?` ${sln[0]}.`:''}</td><td style={{padding:"9px 12px",fontSize:10,color:"#555"}}>{ago(l.createdAt)}</td></tr>;})}</tbody></table></div>
      {showNew&&<Modal onClose={()=>setShowNew(false)} title="Nuevo Ticket / Cotización" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Nombre *" value={nw.fn} onChange={v=>setNw({...nw,fn:v})} req/><Field label="Apellido *" value={nw.ln} onChange={v=>setNw({...nw,ln:v})} req/><Field label="RUT" value={nw.rut} onChange={v=>setNw({...nw,rut:v})} ph="12.345.678-9"/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Celular" value={nw.phone} onChange={v=>setNw({...nw,phone:v})} ph="9XXXXXXXX"/><Field label="Email" value={nw.email} onChange={v=>setNw({...nw,email:v})} type="email"/><Field label="Comuna" value={nw.comuna} onChange={v=>setNw({...nw,comuna:v})} opts={["",..."Huechuraba,Providencia,Las Condes,La Florida,Maipú,Santiago Centro,Ñuñoa,Puente Alto,Otra".split(",")].map(c=>({v:c,l:c||"Seleccionar..."}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Origen" value={nw.source} onChange={v=>setNw({...nw,source:v})} opts={Object.entries(SRC).map(([k,v])=>({v:k,l:v}))}/><Field label="Sucursal" value={nw.branch_id} onChange={v=>setNw({...nw,branch_id:v})} opts={[{v:"",l:"Seleccionar..."},...brs.map(b=>({v:b.id,l:b.name}))]}/><Field label="Prioridad" value={nw.priority} onChange={v=>setNw({...nw,priority:v})} opts={Object.entries(PRIORITY).map(([k,v])=>({v:k,l:v.l}))}/></div><div style={{marginBottom:16}}><Field label="Moto de interés" value={nw.motoId} onChange={v=>setNw({...nw,motoId:v})} opts={[{v:"",l:"Seleccionar modelo..."},...MOTOS.map(m=>({v:m.id,l:`${m.brand} ${m.model} - ${fmt(m.price)}`}))]}/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button><button type="submit" disabled={adding} style={{...S.btn,opacity:adding?0.7:1}}>{adding?"Creando...":"Crear Ticket"}</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════
function PipelineView({leads,user,nav,updLead}){
  const[dragId,setDragId]=useState(null);
  const stages=["abierto","en_gestion","cotizado","financiamiento"];
  const pLeads=leads.filter(l=>{if(!stages.includes(l.status))return false;if(user.role==="vendedor"&&l.seller_id!==user.id)return false;return true;});
  const drop=stage=>{if(dragId){const ld=leads.find(l=>l.id===dragId);if(ld)updLead(dragId,{status:stage,timeline:[{id:`tl-${Date.now()}`,type:"status",title:`Estado → ${TICKET_STATUS[stage]?.l}`,date:new Date().toISOString(),user:user.fn},...ld.timeline]});setDragId(null);}};
  const getSlaInfo=(l)=>{
    if(l.sla_status==="vencido")return{horas:0,breach:true,warning:false};
    if(l.sla_status==="en_riesgo")return{horas:0,breach:false,warning:true};
    const created=new Date(l.createdAt).getTime();const now=Date.now();const diff=now-created;const horas=diff/(1e3*60*60);const lastC=l.lastContact?new Date(l.lastContact).getTime():0;const sinContacto=lastC?((now-lastC)/(1e3*60*60)):horas;return{horas:Math.floor(sinContacto),breach:sinContacto>=8&&!l.lastContact,warning:sinContacto>=6&&sinContacto<8};
  };
  return(
    <div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Pipeline {user.role==="vendedor"&&<span style={{fontSize:13,fontWeight:400,color:"#666"}}>· Mis tickets</span>}</h1><div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:14}}>{stages.map(stage=>{const sc=TICKET_STATUS[stage],sl=pLeads.filter(l=>l.status===stage);return(<div key={stage} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(stage)} style={{minWidth:250,flex:"0 0 250px",background:"#111112",borderRadius:12,border:"1px solid #1E1E1F",display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 130px)"}}><div style={{padding:"10px 12px",borderBottom:"1px solid #1E1E1F",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:sc?.c}}/><span style={{fontSize:11,fontWeight:600}}>{sc?.l}</span></div><span style={{fontSize:10,color:"#555",fontWeight:600}}>{sl.length}</span></div><div style={{flex:1,overflowY:"auto",padding:6,display:"flex",flexDirection:"column",gap:5}}>{sl.map(l=>{const m=gM(l.motoId);const sla=getSlaInfo(l);return(<div key={l.id} draggable onDragStart={()=>setDragId(l.id)} onClick={()=>nav("ticket",l.id)} style={{background:sla.breach?"rgba(239,68,68,0.05)":"#171718",border:sla.breach?"1px solid rgba(239,68,68,0.3)":"1px solid #222",borderRadius:10,padding:10,cursor:"grab"}} onMouseEnter={e=>{if(!sla.breach)e.currentTarget.style.borderColor="#F28100";}} onMouseLeave={e=>{if(!sla.breach)e.currentTarget.style.borderColor="#222";}}>
      {sla.breach&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,padding:"3px 8px",borderRadius:6,background:"rgba(239,68,68,0.1)",fontSize:10,color:"#EF4444",fontWeight:600}}><Ic.alert size={11} color="#EF4444"/>SLA vencido · {sla.horas}h sin contacto</div>}
      {sla.warning&&!sla.breach&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,padding:"3px 8px",borderRadius:6,background:"rgba(245,158,11,0.1)",fontSize:10,color:"#F59E0B",fontWeight:600}}><Ic.clock size={11} color="#F59E0B"/>{8-sla.horas}h para SLA</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:4}}><div style={{fontWeight:600,fontSize:12}}>{l.fn} {l.ln}</div><PBdg p={l.priority}/></div>{m&&<div style={{fontSize:10,color:"#888",marginBottom:4}}>{m.brand} {m.model}</div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#555"}}><span>{l.phone}</span>{m&&<span style={{fontWeight:600,color:"#F28100"}}>{fmt(m.price-m.bonus)}</span>}</div><div style={{fontSize:9,color:"#444",marginTop:4}}>{l.seller_fn||(gU(l.seller)?.fn)||''} · {l.branch_code||(gB(l.branch)?.code)||''} · {ago(l.createdAt)}</div></div>);})}  {sl.length===0&&<div style={{padding:16,textAlign:"center",color:"#333",fontSize:11}}>Sin tickets</div>}</div></div>);})}</div></div>
  );
}

// ═══════════════════════════════════════════
// TICKET VIEW (Yamaha-style lead detail)
// ═══════════════════════════════════════════
function TicketView({lead,user,nav,updLead}){
  const[tab,setTab]=useState("datos");
  const[contactForm,setContactForm]=useState({method:"whatsapp",result:"",note:""});
  const m=gM(lead.motoId)||(lead.model_brand?{brand:lead.model_brand,model:lead.model_name,price:0,bonus:0,year:2025,cc:0,cat:'',colors:[]}:null);
  const s=gU(lead.seller)||{fn:lead.seller_fn||'',ln:lead.seller_ln||''};
  const br=gB(lead.branch)||{name:lead.branch_name||'',code:lead.branch_code||'',addr:lead.branch_addr||''};
  const isAdmin=["super_admin","admin_comercial"].includes(user.role);
  const[realSellers,setRealSellers]=useState([]);
  useEffect(()=>{if(isAdmin)api.getSellers().then(d=>setRealSellers(Array.isArray(d)?d:[])).catch(()=>{});},[isAdmin]);
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
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:13,color:"#F28100",fontWeight:600}}>Ticket #{lead.num}</span><span style={{fontSize:12,color:"#555"}}>/ a cargo de {s?.fn} {s?.ln}</span></div>
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
              <div style={{width:100,height:80,borderRadius:8,background:"#1A1A1B",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#555"}}>📷 {m.brand}</div>
              <div><div style={{fontSize:16,fontWeight:700}}>{m.brand} {m.model}</div><div style={{fontSize:12,color:"#888",marginTop:2}}>{m.year} · {m.cc}cc · {m.cat}</div><div style={{marginTop:6}}><span style={{fontSize:18,fontWeight:800,color:"#F28100"}}>Desde {fmt(m.price-m.bonus)}</span></div><div style={{fontSize:11,color:"#888"}}>{fmt(m.price)} precio de lista</div></div>
            </div>
            <div style={{marginTop:10,display:"flex",gap:12,fontSize:11,color:"#888"}}>
              <span>📄 Ficha Técnica: <span style={{color:"#3B82F6",cursor:"pointer"}}>Descargar</span></span>
              <span>🎨 Color: {lead.colorPref||m.colors[0]}</span>
            </div>
          </>):(<div style={{color:"#555",fontSize:12}}>Sin modelo seleccionado</div>)}
          <div style={{marginTop:10}}><label style={S.lbl}>Cambiar modelo</label><select value={lead.motoId||""} onChange={e=>upd("motoId",e.target.value)} style={{...S.inp,width:"100%",fontSize:11}}><option value="">Seleccionar...</option>{MOTOS.map(m=><option key={m.id} value={m.id}>{m.brand} {m.model} - {fmt(m.price)}</option>)}</select></div>
          {/* SUCURSAL */}
          <div style={{marginTop:12,padding:10,background:"#0E0E0F",borderRadius:8}}>
            <div style={{fontWeight:600,fontSize:12}}>MAOS RACING {br?.name.toUpperCase()}</div>
            <div style={{fontSize:10,color:"#666",marginTop:2}}>{br?.addr}</div>
          </div>
        </div>

        {/* RIGHT: REGISTER CONTACT */}
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Registrar Contacto</h3>
          <form onSubmit={submitContact}>
            <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>{["whatsapp","llamada","email","presencial","sms"].map(mt=><button key={mt} type="button" onClick={()=>setContactForm({...contactForm,method:mt})} style={{...S.btn2,padding:"5px 10px",fontSize:11,background:contactForm.method===mt?"#F28100":"transparent",color:contactForm.method===mt?"#fff":"#888",border:contactForm.method===mt?"none":"1px solid #262626"}}>{mt.charAt(0).toUpperCase()+mt.slice(1)}</button>)}</div>
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
      <div className="crm-tabs" style={{display:"flex",gap:1,borderBottom:"1px solid #1E1E1F",marginBottom:14}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 16px",fontSize:12,fontWeight:500,background:"none",border:"none",cursor:"pointer",color:tab===t.id?"#F28100":"#555",borderBottom:tab===t.id?"2px solid #F28100":"2px solid transparent",fontFamily:"inherit"}}>{t.l}</button>)}</div>

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
          <form onSubmit={submitNote} style={{marginBottom:16,padding:12,background:"#0E0E0F",borderRadius:10,border:"1px solid #1E1E1F"}}>
            <label style={{...S.lbl,marginBottom:6}}>Agregar nota <span style={{color:"#555",fontWeight:400}}>(mín. 20 caracteres para contar como gestión SLA)</span></label>
            <textarea value={noteForm} onChange={e=>{setNoteForm(e.target.value);if(noteErr)setNoteErr("");}} rows={3} style={{...S.inp,width:"100%",resize:"vertical",marginBottom:6}} placeholder="Ej: Llamé al cliente, dice que está evaluando otras opciones, volver en 3 días..."/>
            {noteErr&&<div style={{fontSize:11,color:"#EF4444",marginBottom:6}}>{noteErr}</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:noteForm.length>=20?"#10B981":"#555"}}>{noteForm.length}/20</span>
              <button type="submit" style={{...S.btn2,padding:"6px 14px",fontSize:12}}>Guardar nota</button>
            </div>
          </form>
          {/* Lista */}
          <div style={{position:"relative",paddingLeft:20}}>
            <div style={{position:"absolute",left:7,top:0,bottom:0,width:2,background:"#1E1E1F"}}/>
            {(lead.timeline||[]).map((t,i)=>{
              const dotColor=t.type==="contact_registered"||t.type==="contact"?"#3B82F6":t.type==="note_added"?"#10B981":t.type==="status"?"#F28100":t.type==="reminder_created"?"#8B5CF6":"#333";
              const userName=t.user||(t.user_fn?`${t.user_fn} ${t.user_ln}`:"Sistema");
              return(
              <div key={t.id||i} style={{position:"relative",paddingBottom:16,paddingLeft:16}}>
                <div style={{position:"absolute",left:-2,top:4,width:12,height:12,borderRadius:"50%",background:dotColor,border:"2px solid #0A0A0B"}}/>
                <div style={{background:"#0E0E0F",borderRadius:10,padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{t.title}</span>
                    <span style={{fontSize:10,color:"#555"}}>{fDT(t.date||t.created_at)}</span>
                  </div>
                  {t.note&&<div style={{fontSize:12,color:"#A3A3A3",marginTop:4,lineHeight:1.4}}>{t.note}</div>}
                  <div style={{fontSize:10,color:"#555",marginTop:4}}>{userName}{t.method?` · vía ${t.method}`:""}</div>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {tab==="financiamiento"&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 14px"}}>Evaluación Financiamiento</h3>
          <div style={{display:"flex",gap:6,marginBottom:14}}>{["Autofin"].map(inst=><button key={inst} style={{...S.btn2,padding:"6px 16px",fontSize:12,background:lead.finInst===inst?"rgba(242,129,0,0.15)":"transparent",color:lead.finInst===inst?"#F28100":"#888",border:lead.finInst===inst?"1px solid #F28100":"1px solid #262626"}}>{inst}</button>)}</div>
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
              <div key={key} onClick={()=>togglePV(key)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:"#0E0E0F",cursor:"pointer",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#1A1A1B"} onMouseLeave={e=>e.currentTarget.style.background="#0E0E0F"}>
                <div style={{width:22,height:22,borderRadius:6,border:lead.postVenta[key]?"none":"2px solid #333",background:lead.postVenta[key]?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{lead.postVenta[key]&&<Ic.check size={13} color="white"/>}</div>
                <span style={{fontSize:13,color:lead.postVenta[key]?"#FAFAFA":"#888"}}>{label}</span>
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
function InventoryView({inv,updInv,addInv,user}){
  const[brF,setBrF]=useState("");const[stF,setStF]=useState("");const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[viewPhoto,setViewPhoto]=useState(null);const[detailUnit,setDetailUnit]=useState(null);
  const[nw,setNw]=useState({branch:"b1",year:2025,brand:"Honda",model:"",color:"",chassis:"",motor:"",status:"disponible",price:0});
  const f=inv.filter(x=>{if(brF&&x.branch!==brF)return false;if(stF&&x.status!==stF)return false;if(search&&!`${x.brand} ${x.model} ${x.chassis} ${x.color}`.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const counts=Object.fromEntries(Object.keys(INV_ST).map(k=>[k,inv.filter(x=>x.status===k).length]));
  const handleAdd=e=>{e.preventDefault();addInv({...nw,id:`inv-${Date.now()}`,motoId:"",chassisPhoto:null,motorPhoto:null});setShowAdd(false);};
  const handlePhoto=(id,field)=>{
    const input=document.createElement("input");input.type="file";input.accept="image/*";
    input.onchange=e=>{const file=e.target.files[0];if(file){const reader=new FileReader();reader.onload=ev=>{updInv(id,{[field]:ev.target.result});};reader.readAsDataURL(file);}};
    input.click();
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Inventario</h1><p style={{color:"#6B6B6B",fontSize:12}}>{inv.length} unidades · {counts.disponible} disponibles</p></div><button onClick={()=>setShowAdd(true)} style={{...S.btn,display:"flex",alignItems:"center",gap:6,fontSize:12}}><Ic.plus size={15}/>Agregar Moto</button></div>
      <div className="grid-4col" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>{Object.entries(INV_ST).map(([k,v])=><div key={k} onClick={()=>setStF(stF===k?"":k)} style={{...S.card,padding:10,textAlign:"center",cursor:"pointer",border:stF===k?`1px solid ${v.c}`:"1px solid #1E1E1F"}}><div style={{fontSize:20,fontWeight:800,color:v.c}}>{counts[k]}</div><div style={{fontSize:10,color:"#6B6B6B"}}>{v.l}</div></div>)}</div>
      <div style={{...S.card,padding:10,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}><div style={{position:"relative",flex:1,minWidth:180}}><Ic.search size={14} color="#555" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{...S.inp,paddingLeft:30,width:"100%"}}/></div><select value={brF} onChange={e=>setBrF(e.target.value)} style={{...S.inp}}><option value="">Todas las sucursales</option>{BRANCHES.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1050}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Sucursal","Año","Marca","Modelo","Color","N° Chasis","Foto Chasis","N° Motor","Foto Motor","Estado","Precio",""].map(h=><th key={h} style={{textAlign:"left",padding:"9px 8px",fontSize:9,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{f.map(x=><tr key={x.id} style={{borderBottom:"1px solid #1A1A1B"}}>
        <td style={{padding:"8px"}}><Bdg l={gB(x.branch)?.code} c="#A3A3A3"/></td>
        <td style={{padding:"8px"}}>{x.year}</td>
        <td style={{padding:"8px",fontWeight:600}}>{x.brand}</td>
        <td style={{padding:"8px"}}>{x.model}</td>
        <td style={{padding:"8px"}}>{x.color}</td>
        <td style={{padding:"8px",fontFamily:"monospace",fontSize:11}}>{x.chassis}</td>
        <td style={{padding:"8px"}}>
          {x.chassisPhoto?<img src={x.chassisPhoto} onClick={()=>setViewPhoto({src:x.chassisPhoto,title:`Chasis ${x.chassis}`})} style={{width:36,height:36,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #333"}}/>:<button onClick={()=>handlePhoto(x.id,"chassisPhoto")} style={{...S.gh,padding:"4px 8px",fontSize:10,color:"#F28100",border:"1px dashed #333",borderRadius:6}}>📷</button>}
        </td>
        <td style={{padding:"8px",fontFamily:"monospace",fontSize:11}}>{x.motor}</td>
        <td style={{padding:"8px"}}>
          {x.motorPhoto?<img src={x.motorPhoto} onClick={()=>setViewPhoto({src:x.motorPhoto,title:`Motor ${x.motor}`})} style={{width:36,height:36,borderRadius:6,objectFit:"cover",cursor:"pointer",border:"1px solid #333"}}/>:<button onClick={()=>handlePhoto(x.id,"motorPhoto")} style={{...S.gh,padding:"4px 8px",fontSize:10,color:"#F28100",border:"1px dashed #333",borderRadius:6}}>📷</button>}
        </td>
        <td style={{padding:"8px"}}><select value={x.status} onChange={e=>updInv(x.id,{status:e.target.value})} style={{...S.inp,padding:"3px 6px",fontSize:11,background:"transparent",border:"none",color:INV_ST[x.status]?.c,fontWeight:600,cursor:"pointer"}}>{Object.entries(INV_ST).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></td>
        <td style={{padding:"8px",fontWeight:600,color:"#F28100"}}>{fmt(x.price)}</td>
        <td style={{padding:"8px"}}><select defaultValue="" onChange={e=>{if(e.target.value)updInv(x.id,{branch:e.target.value});e.target.value="";}} style={{...S.inp,padding:"3px 6px",fontSize:10,width:55}}><option value="" disabled>Mover</option>{BRANCHES.filter(b=>b.id!==x.branch).map(b=><option key={b.id} value={b.id}>{b.code}</option>)}</select></td>
      </tr>)}</tbody></table></div>

      {viewPhoto&&<div onClick={()=>setViewPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:70,cursor:"pointer"}}><div onClick={e=>e.stopPropagation()} style={{background:"#151516",borderRadius:16,padding:16,maxWidth:600,width:"90%"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:14,fontWeight:600}}>{viewPhoto.title}</span><button onClick={()=>setViewPhoto(null)} style={{...S.gh,padding:4}}><Ic.x size={18}/></button></div><img src={viewPhoto.src} style={{width:"100%",borderRadius:10,maxHeight:400,objectFit:"contain"}}/></div></div>}

      {showAdd&&<Modal onClose={()=>setShowAdd(false)} title="Agregar Moto" wide><form onSubmit={handleAdd}><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Sucursal" value={nw.branch} onChange={v=>setNw({...nw,branch:v})} opts={BRANCHES.map(b=>({v:b.id,l:b.name}))}/><Field label="Año" value={nw.year} onChange={v=>setNw({...nw,year:v})} type="number"/><Field label="Marca" value={nw.brand} onChange={v=>setNw({...nw,brand:v})} opts={BRANDS_LIST.map(b=>({v:b,l:b}))}/></div><div className="grid-3col" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}><Field label="Modelo *" value={nw.model} onChange={v=>setNw({...nw,model:v})} req/><Field label="Color *" value={nw.color} onChange={v=>setNw({...nw,color:v})} req/><Field label="Precio" value={nw.price} onChange={v=>setNw({...nw,price:Number(v)})} type="number"/></div><div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}><Field label="N° Chasis *" value={nw.chassis} onChange={v=>setNw({...nw,chassis:v})} req/><Field label="N° Motor *" value={nw.motor} onChange={v=>setNw({...nw,motor:v})} req/></div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" onClick={()=>setShowAdd(false)} style={S.btn2}>Cancelar</button><button type="submit" style={S.btn}>Agregar</button></div></form></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════
// SALES, CATALOG, REPORTS, ADMIN (compact)
// ═══════════════════════════════════════════
function SalesView({leads,user}){
  const ganados=leads.filter(l=>l.status==="ganado");
  return(<div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Ventas Cerradas</h1><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:10,marginBottom:16}}><Stat icon={Ic.sale} ic="#10B981" ib="rgba(16,185,129,0.1)" label="Ventas" val={ganados.length}/><Stat icon={Ic.file} ic="#F59E0B" ib="rgba(245,158,11,0.1)" label="Sin Factura" val={ganados.filter(l=>!l.postVenta.factura).length}/><Stat icon={Ic.box} ic="#8B5CF6" ib="rgba(139,92,246,0.1)" label="Pend. Homolog." val={ganados.filter(l=>!l.postVenta.homRec).length}/><Stat icon={Ic.target} ic="#06B6D4" ib="rgba(6,182,212,0.1)" label="Pend. Entrega" val={ganados.filter(l=>!l.postVenta.entregada).length}/></div>
    <div className="crm-table-scroll" style={{background:"#111112",border:"1px solid #1E1E1F",borderRadius:12,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:550}}><thead><tr style={{borderBottom:"1px solid #1E1E1F"}}>{["Ticket","Cliente","Moto","Factura","Pago","Homolog.","Enrolada","Entregada"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 10px",fontSize:10,fontWeight:600,color:"#6B6B6B",textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{ganados.map(l=>{const m=gM(l.motoId);return<tr key={l.id} style={{borderBottom:"1px solid #1A1A1B"}}><td style={{padding:"8px 10px",color:"#F28100",fontWeight:600,fontSize:11}}>{l.num}</td><td style={{padding:"8px 10px"}}>{l.fn} {l.ln}</td><td style={{padding:"8px 10px"}}>{m?.brand} {m?.model}</td>{["factura","pagoReg","homRec","enrolada","entregada"].map(f=><td key={f} style={{padding:"8px 10px",textAlign:"center"}}>{l.postVenta[f]?<Ic.check size={16} color="#10B981"/>:<div style={{width:16,height:16,borderRadius:4,border:"2px solid #333",margin:"0 auto"}}/>}</td>)}</tr>;})}</tbody></table></div>
  </div>);
}

function CatalogView(){
  const[brandF,setBrandF]=useState("");
  const f=brandF?MOTOS.filter(m=>m.brand===brandF):MOTOS;
  return(<div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Catálogo de Motos</h1><p style={{color:"#6B6B6B",fontSize:12,margin:"-10px 0 14px"}}>{MOTOS.length} modelos · {BRANDS_LIST.length} marcas</p><select value={brandF} onChange={e=>setBrandF(e.target.value)} style={{...S.inp,marginBottom:14,minWidth:180}}><option value="">Todas las marcas</option>{BRANDS_LIST.map(b=><option key={b} value={b}>{b}</option>)}</select><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>{f.map(m=><div key={m.id} style={S.card}><div style={{fontSize:10,color:"#666",fontWeight:600,textTransform:"uppercase"}}>{m.brand}</div><div style={{fontSize:15,fontWeight:700,marginTop:2}}>{m.model}</div><div style={{fontSize:11,color:"#555",marginTop:3}}>{m.year} · {m.cc?m.cc+"cc":"Eléctrica"} · {m.cat}</div><div style={{marginTop:8}}><span style={{fontSize:18,fontWeight:800,color:"#F28100"}}>{fmt(m.price)}</span>{m.bonus>0&&<div style={{fontSize:11,color:"#10B981",marginTop:2}}>Bono: {fmt(m.bonus)} → <b>{fmt(m.price-m.bonus)}</b></div>}</div><div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>{m.colors.map(c=><span key={c} style={{fontSize:9,padding:"2px 6px",borderRadius:12,background:"#1A1A1B",color:"#888"}}>{c}</span>)}</div></div>)}</div></div>);
}

function ReportsView({leads}){
  const[realSellers,setRealSellers]=useState([]);
  useEffect(()=>{api.getSellers().then(d=>setRealSellers(Array.isArray(d)?d:[])).catch(()=>{});},[]);
  const sellersToUse=realSellers.length>0?realSellers:[];
  const rank=sellersToUse.map(s=>({name:`${s.first_name} ${(s.last_name||'')[0]||''}.`,total:leads.filter(l=>l.seller_id===s.id).length,ganados:leads.filter(l=>l.seller_id===s.id&&l.status==="ganado").length,branch:s.branch_code})).filter(r=>r.total>0||sellersToUse.length>0).sort((a,b)=>b.ganados-a.ganados);
  const byBranch=BRANCHES.map(b=>({name:b.name,leads:leads.filter(l=>l.branch===b.id||l.branch_code===b.code).length,ganados:leads.filter(l=>(l.branch===b.id||l.branch_code===b.code)&&l.status==="ganado").length}));
  return(<div><h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Reportes</h1><div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><div style={S.card}><h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Ranking Vendedores</h3><table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}><thead><tr>{["Vendedor","Suc.","Total","Ganados","Conv."].map(h=><th key={h} style={{textAlign:"left",padding:"5px 6px",color:"#555",fontSize:9,textTransform:"uppercase",borderBottom:"1px solid #1E1E1F"}}>{h}</th>)}</tr></thead><tbody>{rank.map((r,i)=><tr key={i} style={{borderBottom:"1px solid #1A1A1B"}}><td style={{padding:"6px",fontWeight:600}}>{i<3?["🥇","🥈","🥉"][i]+" ":""}{r.name}</td><td style={{padding:"6px",color:"#555"}}>{r.branch}</td><td style={{padding:"6px"}}>{r.total}</td><td style={{padding:"6px",fontWeight:700,color:"#10B981"}}>{r.ganados}</td><td style={{padding:"6px",color:"#F28100"}}>{r.total>0?((r.ganados/r.total)*100).toFixed(0):0}%</td></tr>)}</tbody></table></div><div style={S.card}><h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Por Sucursal</h3>{byBranch.map(b=><div key={b.name} style={{background:"#0E0E0F",borderRadius:10,padding:12,marginBottom:8}}><div style={{fontWeight:700,marginBottom:4}}>{b.name}</div><div style={{display:"flex",gap:20}}><div><span style={{fontSize:18,fontWeight:800}}>{b.leads}</span><div style={{fontSize:9,color:"#555"}}>Leads</div></div><div><span style={{fontSize:18,fontWeight:800,color:"#10B981"}}>{b.ganados}</span><div style={{fontSize:9,color:"#555"}}>Ganados</div></div><div><span style={{fontSize:18,fontWeight:800,color:"#F28100"}}>{b.leads>0?((b.ganados/b.leads)*100).toFixed(0):0}%</span><div style={{fontSize:9,color:"#555"}}>Conversión</div></div></div></div>)}</div></div></div>);
}

function AdminView(){
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[resetInfo,setResetInfo]=useState(null);
  const[branches,setBranches]=useState([]);
  const[cleaning,setCleaning]=useState(false);
  const[cleanDone,setCleanDone]=useState(false);
  const[cleaningImports,setCleaningImports]=useState(false);
  const[cleanImportsDone,setCleanImportsDone]=useState(null);
  useEffect(()=>{
    api.listUsers().then(setUsers).catch(()=>{}).finally(()=>setLoading(false));
    api.getBranches().then(setBranches).catch(()=>{});
  },[]);
  const handleCleanData=async()=>{
    if(!confirm('⚠️ ATENCIÓN: Esto eliminará TODOS los tickets, leads, importaciones e inventario.\n\nUsuarios, sucursales y catálogo de motos se conservan.\n\n¿Confirmar?'))return;
    if(!confirm('Segunda confirmación: ¿Estás seguro? Esta acción NO se puede deshacer.'))return;
    setCleaning(true);
    try{
      await api.resetDemoData();
      setCleanDone(true);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar'));}
    finally{setCleaning(false);}
  };
  const handleCleanImports=async()=>{
    if(!confirm('¿Eliminar todos los tickets importados (source=importacion) y los logs de importación?\n\nLos tickets creados manualmente se conservan.'))return;
    setCleaningImports(true);
    try{
      const r=await api.resetImports();
      setCleanImportsDone(r.deleted??0);
    }catch(ex){alert('Error: '+(ex.message||'No se pudo limpiar'));}
    finally{setCleaningImports(false);}
  };
  const ROLE_C={super_admin:"#EF4444",admin_comercial:"#8B5CF6",backoffice:"#F59E0B",vendedor:"#3B82F6"};
  const handleReset=async(u)=>{
    if(!confirm(`¿Resetear contraseña de ${u.first_name} ${u.last_name}? Se generará una contraseña temporal.`))return;
    try{
      const r=await api.resetPassword(u.id);
      setResetInfo({name:`${u.first_name} ${u.last_name}`,temp:r.temp_password});
    }catch(ex){alert(ex.message||"Error al resetear contraseña");}
  };
  return(
    <div>
      <h1 style={{fontSize:18,fontWeight:700,margin:"0 0 14px"}}>Administración</h1>
      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={S.card}>
          <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Usuarios ({users.length})</h3>
          {loading&&<div style={{color:"#555",fontSize:12,padding:8}}>Cargando...</div>}
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #1A1A1B"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(242,129,0,0.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#F28100",fontSize:9,fontWeight:700,flexShrink:0}}>
                {(u.first_name[0]+u.last_name[0]).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600}}>{u.first_name} {u.last_name}</div>
                <div style={{fontSize:10,color:"#555"}}>{u.username||u.email}</div>
              </div>
              <Bdg l={u.role.replace(/_/g," ")} c={ROLE_C[u.role]||"#6B7280"}/>
              <button onClick={()=>handleReset(u)} style={{...S.gh,fontSize:10,color:"#555",padding:"3px 7px",border:"1px solid #262626",borderRadius:6}} title="Reset contraseña"><Ic.lock size={12}/></button>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 10px"}}>Sucursales</h3>
          {branches.map(b=>(
            <div key={b.id} style={{background:"#0E0E0F",borderRadius:10,padding:12,marginBottom:8}}>
              <div style={{fontWeight:700,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:11,color:"#555"}}>{b.address||b.addr}</div>
              <div style={{fontSize:11,color:"#555",marginTop:4}}>Código: {b.code} · Vendedores: {users.filter(u=>u.branch_id===b.id&&u.role==="vendedor").length}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{...S.card,marginTop:14,borderColor:"rgba(239,68,68,0.25)"}}>
        <h3 style={{fontSize:12,fontWeight:600,margin:"0 0 6px",color:"#EF4444"}}>Zona de peligro</h3>
        <p style={{fontSize:11,color:"#6B6B6B",marginBottom:12}}>Elimina todos los tickets, leads, importaciones e inventario de prueba. Los usuarios, sucursales y catálogo de motos se conservan.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {cleanImportsDone!==null
            ?<div style={{display:"flex",alignItems:"center",gap:8,color:"#10B981",fontSize:12,fontWeight:600}}><Ic.check size={16} color="#10B981"/>{cleanImportsDone} tickets importados eliminados. Recarga para ver cambios.</div>
            :<button onClick={handleCleanImports} disabled={cleaningImports||cleanDone} style={{...S.btn,background:"#F59E0B",opacity:cleaningImports?0.7:1,fontSize:12}}>{cleaningImports?"Limpiando...":"🗑 Borrar data importada"}</button>
          }
          {cleanDone
            ?<div style={{display:"flex",alignItems:"center",gap:8,color:"#10B981",fontSize:12,fontWeight:600}}><Ic.check size={16} color="#10B981"/>Todo borrado. Recarga la página.</div>
            :<button onClick={handleCleanData} disabled={cleaning} style={{...S.btn,background:"#EF4444",opacity:cleaning?0.7:1,fontSize:12}}>{cleaning?"Limpiando...":"🗑 Borrar TODO (tickets + inventario)"}</button>
          }
        </div>
      </div>

      {resetInfo&&(
        <Modal onClose={()=>setResetInfo(null)} title="Contraseña Reseteada">
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}><Ic.check size={24} color="#10B981"/></div>
            <p style={{fontWeight:600,marginBottom:4}}>{resetInfo.name}</p>
            <p style={{color:"#6B6B6B",fontSize:12,marginBottom:12}}>Contraseña temporal generada. El usuario deberá cambiarla al ingresar.</p>
            <div style={{background:"#0E0E0F",borderRadius:10,padding:"14px 20px",marginBottom:16,fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:2,color:"#F28100"}}>{resetInfo.temp}</div>
            <p style={{color:"#555",fontSize:11,marginBottom:16}}>Comparte esta contraseña con el usuario de forma segura.</p>
            <button onClick={()=>setResetInfo(null)} style={S.btn}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// NOTIFICATION BELL
// ═══════════════════════════════════════════
function NotifBell({nav}){
  const[open,setOpen]=useState(false);
  const[notifs,setNotifs]=useState([]);
  const[unread,setUnread]=useState(0);

  const fetchCount=async()=>{try{const d=await api.getUnreadCount();setUnread(d.count||0);}catch{}};
  const fetchNotifs=async()=>{try{const d=await api.getNotifications({limit:30});setNotifs(d.notifications||[]);}catch{}};

  useEffect(()=>{
    fetchCount();
    const iv=setInterval(fetchCount,30000);
    return()=>clearInterval(iv);
  },[]);

  const handleOpen=()=>{setOpen(true);fetchNotifs();};
  const markAll=async()=>{try{await api.markAllRead();setUnread(0);setNotifs(p=>p.map(n=>({...n,is_read:true})));}catch{}};
  const markOne=async(id)=>{try{await api.markRead(id);setNotifs(p=>p.map(n=>n.id===id?{...n,is_read:true}:n));setUnread(p=>Math.max(0,p-1));}catch{}};
  const goTicket=(n)=>{markOne(n.id);if(n.ticket_id&&nav)nav("ticket",String(n.ticket_id));setOpen(false);};

  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>open?setOpen(false):handleOpen()} style={{...S.gh,padding:6,position:"relative"}}>
        <Ic.bell size={17} color={unread>0?"#F28100":"#8A8A8A"}/>
        {unread>0&&<span style={{position:"absolute",top:1,right:1,minWidth:16,height:16,borderRadius:8,background:"#EF4444",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",padding:"0 3px"}}>{unread>9?"9+":unread}</span>}
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:50}} onClick={()=>setOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:50,right:18,width:320,background:"#151516",border:"1px solid #262626",borderRadius:14,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",zIndex:51}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid #1E1E1F"}}>
              <span style={{fontWeight:700,fontSize:13}}>Notificaciones{unread>0&&<span style={{color:"#F28100"}}> ({unread})</span>}</span>
              {unread>0&&<button onClick={markAll} style={{...S.gh,fontSize:11,color:"#F28100",padding:"2px 6px"}}>Marcar leídas</button>}
            </div>
            <div style={{maxHeight:380,overflowY:"auto"}}>
              {notifs.length===0&&<div style={{padding:24,textAlign:"center",color:"#555",fontSize:12}}>Sin notificaciones pendientes</div>}
              {notifs.map(n=>(
                <div key={n.id} onClick={()=>goTicket(n)} style={{padding:"10px 14px",borderBottom:"1px solid #1A1A1B",cursor:"pointer",background:n.is_read?"transparent":"rgba(242,129,0,0.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{fontSize:12,fontWeight:n.is_read?400:600,color:n.is_read?"#888":"#FAFAFA",flex:1}}>{n.title}</div>
                    {!n.is_read&&<div style={{width:7,height:7,borderRadius:"50%",background:"#F28100",flexShrink:0,marginTop:4}}/>}
                  </div>
                  {n.body&&<div style={{fontSize:11,color:"#555",marginTop:2,lineHeight:1.4}}>{n.body}</div>}
                  <div style={{fontSize:10,color:"#444",marginTop:4}}>{ago(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// REMINDERS TAB
// ═══════════════════════════════════════════
function RemindersTab({ticketId,user}){
  const[reminders,setReminders]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showNew,setShowNew]=useState(false);
  const[form,setForm]=useState({title:"",type:"llamada",reminder_date:"",reminder_time:"",priority:"media",note:""});
  const TYPE_L={llamada:"Llamada",visita:"Visita",whatsapp:"WhatsApp",email:"Email",otro:"Otro"};
  const ST_C={pending:"#F59E0B",completed:"#10B981",overdue:"#EF4444"};
  const ST_L={pending:"Pendiente",completed:"Completado",overdue:"Vencido"};

  useEffect(()=>{
    api.getReminders({ticket_id:ticketId}).then(d=>setReminders(d.reminders||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[ticketId]);

  const create=async(e)=>{
    e.preventDefault();
    try{const d=await api.createReminder({...form,ticket_id:ticketId});setReminders(p=>[d.reminder,...p]);setShowNew(false);setForm({title:"",type:"llamada",reminder_date:"",reminder_time:"",priority:"media",note:""});}
    catch(err){alert(err.message);}
  };
  const complete=async(id)=>{try{await api.completeReminder(id);setReminders(p=>p.map(r=>r.id===id?{...r,status:"completed"}:r));}catch{}};
  const del=async(id)=>{if(!confirm("¿Eliminar recordatorio?"))return;try{await api.deleteReminder(id);setReminders(p=>p.filter(r=>r.id!==id));}catch{}};

  if(loading)return<div style={{padding:20,textAlign:"center",color:"#555",fontSize:12}}>Cargando...</div>;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontWeight:600,fontSize:13}}>Recordatorios del lead</span>
        <button onClick={()=>setShowNew(true)} style={{...S.btn,fontSize:12,display:"flex",alignItems:"center",gap:5}}><Ic.plus size={13}/>Nuevo</button>
      </div>
      {reminders.length===0&&<div style={{padding:24,textAlign:"center",color:"#555",fontSize:12,background:"#0E0E0F",borderRadius:10}}>Sin recordatorios. Crea uno para hacer seguimiento.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {reminders.map(r=>(
          <div key={r.id} style={{background:"#0E0E0F",borderRadius:10,padding:12,border:`1px solid ${r.status==="overdue"?"rgba(239,68,68,0.3)":r.status==="completed"?"rgba(16,185,129,0.2)":"#1E1E1F"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontWeight:600,fontSize:13,textDecoration:r.status==="completed"?"line-through":"none",color:r.status==="completed"?"#555":"#FAFAFA"}}>{r.title}</span>
                  <Bdg l={ST_L[r.status]||r.status} c={ST_C[r.status]||"#6B7280"}/>
                </div>
                <div style={{fontSize:11,color:"#888",display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span>{TYPE_L[r.type]||r.type}</span>
                  <span>{fD(r.reminder_date)}{r.reminder_time&&" · "+r.reminder_time}</span>
                  {r.priority==="alta"&&<span style={{color:"#EF4444",fontWeight:600}}>Alta prioridad</span>}
                </div>
                {r.note&&<div style={{fontSize:11,color:"#666",marginTop:6}}>{r.note}</div>}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:12}}>
                {r.status==="pending"&&<button onClick={()=>complete(r.id)} style={{...S.btn2,padding:"4px 10px",fontSize:11,background:"rgba(16,185,129,0.1)",color:"#10B981",border:"1px solid rgba(16,185,129,0.2)"}}>Completar</button>}
                <button onClick={()=>del(r.id)} style={{...S.gh,padding:4,color:"#555"}}><Ic.x size={14}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {showNew&&(
        <Modal onClose={()=>setShowNew(false)} title="Nuevo Recordatorio">
          <form onSubmit={create}>
            <div style={{marginBottom:10}}><Field label="Título *" value={form.title} onChange={v=>setForm({...form,title:v})} req ph="Ej: Llamar para confirmar visita..."/></div>
            <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Tipo" value={form.type} onChange={v=>setForm({...form,type:v})} opts={Object.entries(TYPE_L).map(([k,v])=>({v:k,l:v}))}/>
              <Field label="Prioridad" value={form.priority} onChange={v=>setForm({...form,priority:v})} opts={[{v:"alta",l:"Alta"},{v:"media",l:"Media"},{v:"baja",l:"Baja"}]}/>
            </div>
            <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Field label="Fecha *" value={form.reminder_date} onChange={v=>setForm({...form,reminder_date:v})} type="date" req/>
              <Field label="Hora" value={form.reminder_time} onChange={v=>setForm({...form,reminder_time:v})} type="time"/>
            </div>
            <div style={{marginBottom:16}}><Field label="Nota" value={form.note} onChange={v=>setForm({...form,note:v})} rows={2} ph="Detalles adicionales..."/></div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button type="button" onClick={()=>setShowNew(false)} style={S.btn2}>Cancelar</button>
              <button type="submit" style={S.btn}>Crear Recordatorio</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CALENDAR VIEW
// ═══════════════════════════════════════════
function CalendarView({user,nav}){
  const[date,setDate]=useState(new Date());
  const[events,setEvents]=useState([]);
  const[loading,setLoading]=useState(true);
  const yr=date.getFullYear();const mo=date.getMonth();
  const MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const TYPE_C={reminder:"#3B82F6",sla_deadline:"#EF4444"};

  useEffect(()=>{
    setLoading(true);
    const start=new Date(yr,mo,1).toISOString().split("T")[0];
    const end=new Date(yr,mo+1,0).toISOString().split("T")[0];
    api.getCalendarEvents({start,end}).then(d=>setEvents(d.events||[])).catch(()=>setEvents([])).finally(()=>setLoading(false));
  },[yr,mo]);

  const firstDay=new Date(yr,mo,1).getDay();
  const daysInMonth=new Date(yr,mo+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);

  const eventsForDay=(d)=>{
    if(!d)return[];
    const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return events.filter(e=>(e.date||"").startsWith(ds));
  };
  const today=new Date();
  const todayStr=today.toISOString().split("T")[0];
  const upcoming=events.filter(e=>e.date>=todayStr).slice(0,10);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><h1 style={{fontSize:18,fontWeight:700,margin:0}}>Calendario</h1><p style={{color:"#6B6B6B",fontSize:12,margin:"2px 0 0"}}>{events.length} eventos este mes</p></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setDate(new Date(yr,mo-1,1))} style={{...S.btn2,padding:"6px 14px"}}>←</button>
          <span style={{fontWeight:700,fontSize:15,minWidth:160,textAlign:"center"}}>{MESES[mo]} {yr}</span>
          <button onClick={()=>setDate(new Date(yr,mo+1,1))} style={{...S.btn2,padding:"6px 14px"}}>→</button>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#888"}}><div style={{width:10,height:10,borderRadius:2,background:"#3B82F6"}}/> Recordatorio</div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#888"}}><div style={{width:10,height:10,borderRadius:2,background:"#EF4444"}}/> Vencimiento SLA</div>
      </div>
      <div style={{...S.card,padding:0,overflow:"hidden",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #1E1E1F"}}>
          {DIAS.map(d=><div key={d} style={{padding:"9px 4px",textAlign:"center",fontSize:10,fontWeight:600,color:"#555",textTransform:"uppercase"}}>{d}</div>)}
        </div>
        {loading
          ?<div style={{padding:48,textAlign:"center",color:"#555",fontSize:12}}>Cargando eventos...</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {cells.map((day,i)=>{
              const evs=eventsForDay(day);
              const isToday=day&&today.getDate()===day&&today.getMonth()===mo&&today.getFullYear()===yr;
              return(
                <div key={i} style={{minHeight:88,padding:5,borderRight:"1px solid #1A1A1B",borderBottom:"1px solid #1A1A1B",background:isToday?"rgba(242,129,0,0.04)":"transparent"}}>
                  {day&&<div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?"#F28100":"#888",width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?"rgba(242,129,0,0.15)":"transparent",marginBottom:3}}>{day}</div>}
                  {evs.slice(0,3).map((ev,ei)=>(
                    <div key={ei} onClick={()=>ev.ticket_id&&nav("ticket",String(ev.ticket_id))} title={ev.title} style={{fontSize:9,padding:"2px 5px",borderRadius:3,background:`${TYPE_C[ev.type]||"#F28100"}22`,color:TYPE_C[ev.type]||"#F28100",marginBottom:2,cursor:ev.ticket_id?"pointer":"default",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:600}}>{ev.title}</div>
                  ))}
                  {evs.length>3&&<div style={{fontSize:9,color:"#555"}}>+{evs.length-3} más</div>}
                </div>
              );
            })}
          </div>
        }
      </div>
      {upcoming.length>0&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Próximos eventos</h3>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {upcoming.map((ev,i)=>(
              <div key={i} onClick={()=>ev.ticket_id&&nav("ticket",String(ev.ticket_id))} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"#0E0E0F",cursor:ev.ticket_id?"pointer":"default"}} onMouseEnter={e=>ev.ticket_id&&(e.currentTarget.style.background="#1A1A1B")} onMouseLeave={e=>(e.currentTarget.style.background="#0E0E0F")}>
                <div style={{width:4,height:32,borderRadius:2,background:TYPE_C[ev.type]||"#F28100",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600}}>{ev.title}</div>
                  {ev.client_name&&<div style={{fontSize:11,color:"#666"}}>{ev.client_name}</div>}
                </div>
                <div style={{fontSize:11,color:"#555",textAlign:"right"}}>
                  <div>{fD(ev.date)}</div>
                  {ev.time&&<div>{ev.time}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// IMPORT VIEW (solo super_admin)
// ═══════════════════════════════════════════
function ImportView() {
  const [step, setStep]         = useState('upload');
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [skipDups, setSkipDups] = useState(true);
  const [filter, setFilter]     = useState('all');
  const [dragOver, setDragOver] = useState(false);
  const [logs, setLogs]         = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('import');

  const STATUS_CFG = {
    valid:    { l:'Válido',       c:'#10B981', bg:'rgba(16,185,129,0.1)' },
    error:    { l:'Error',        c:'#EF4444', bg:'rgba(239,68,68,0.1)'  },
    dup_file: { l:'Dup. archivo', c:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
    dup_db:   { l:'Dup. CRM',     c:'#F28100', bg:'rgba(242,129,0,0.1)'  },
  };

  const processFile = async (f) => {
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const data = await api.importPreview(fd);
      setPreview(data);
      setStep('preview');
      setFilter('all');
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const data = await api.importConfirm({
        rows: preview.rows, filename: preview.filename,
        skip_dups: skipDups,
      });
      setResult(data); setStep('result');
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    if (logs) return;
    setLogsLoading(true);
    try { const d = await api.getImportLogs(); setLogs(d); }
    catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const reset = () => { setStep('upload'); setPreview(null); setResult(null); setFilter('all'); };

  const filteredRows = preview?.rows?.filter(r => {
    if (filter==='all')   return true;
    if (filter==='valid') return r.status==='valid';
    if (filter==='error') return r.status==='error';
    if (filter==='dup')   return r.status==='dup_file'||r.status==='dup_db';
    return true;
  }) || [];

  const willImport = preview?.rows?.filter(r =>
    r.status==='valid' ||
    (r.status==='dup_db' && !skipDups)
  ).length || 0;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Importar prospectos</h2>
          <p style={{fontSize:12,color:'#6B6B6B',margin:'4px 0 0'}}>Carga masiva — acceso exclusivo super_admin</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[{k:'import',l:'Importación'},{k:'logs',l:'Historial'}].map(t=>(
            <button key={t.k} onClick={()=>{setActiveTab(t.k);if(t.k==='logs')loadLogs();}}
              style={{...S.btn2,padding:'6px 14px',fontSize:12,
                background:activeTab===t.k?'rgba(242,129,0,0.1)':'transparent',
                color:activeTab===t.k?'#F28100':'#A3A3A3',
                border:activeTab===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #262626'}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {activeTab==='logs'&&(
        <div style={S.card}>
          <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 14px'}}>Historial de importaciones</h3>
          {logsLoading&&<div style={{color:'#555',fontSize:12}}>Cargando...</div>}
          {logs&&logs.length===0&&<div style={{color:'#555',fontSize:12}}>Sin importaciones registradas.</div>}
          {logs&&logs.length>0&&(
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr>{['Fecha','Archivo','Importado por','Total','Importados','Errores','Dups.','Sin vendedor'].map(h=>(
                  <th key={h} style={{textAlign:'left',padding:'6px 10px',borderBottom:'1px solid #1E1E1F',color:'#6B6B6B',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                ))}</tr></thead>
                <tbody>{logs.map(l=>(
                  <tr key={l.id} style={{borderBottom:'1px solid #111112'}}>
                    <td style={{padding:'7px 10px',color:'#888'}}>{fDT(l.created_at)}</td>
                    <td style={{padding:'7px 10px'}}>{l.filename}</td>
                    <td style={{padding:'7px 10px'}}>{l.first_name} {l.last_name}</td>
                    <td style={{padding:'7px 10px',textAlign:'center'}}>{l.total_rows}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:'#10B981',fontWeight:600}}>{l.imported}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.errors>0?'#EF4444':'#555'}}>{l.errors}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.duplicates>0?'#F59E0B':'#555'}}>{l.duplicates}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',color:l.no_seller>0?'#6B7280':'#555'}}>{l.no_seller}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab==='import'&&(
        <>
          {step==='upload'&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
                style={{...S.card,border:`2px dashed ${dragOver?'#F28100':'#262626'}`,textAlign:'center',
                  padding:'48px 24px',cursor:'pointer',transition:'border 0.2s',
                  background:dragOver?'rgba(242,129,0,0.04)':'#111112'}}
                onClick={()=>document.getElementById('imp-file-input').click()}
              >
                <Ic.dl size={36} color={dragOver?'#F28100':'#333'}/>
                <div style={{fontSize:15,fontWeight:600,marginTop:12,marginBottom:6}}>
                  {loading?'Procesando archivo..':'Arrastra tu archivo aquí o haz clic para seleccionar'}
                </div>
                <div style={{fontSize:12,color:'#555'}}>CSV o XLSX · Máximo 5 MB</div>
                <input id="imp-file-input" type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
                  onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
              </div>

              <div style={{...S.card,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <Ic.file size={20} color='#F28100'/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>Plantilla CSV</div>
                  <div style={{fontSize:11,color:'#555'}}>Descarga el formato con las columnas requeridas</div>
                </div>
                <a href={api.getImportTemplate()} download="template_prospectos.csv"
                   style={{...S.btn2,padding:'7px 14px',fontSize:12,textDecoration:'none',display:'inline-block'}}>
                  Descargar plantilla
                </a>
              </div>

              <div style={S.card}>
                <h3 style={{fontSize:13,fontWeight:600,margin:'0 0 12px'}}>Columnas del archivo</h3>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead><tr>{['Columna','Obligatoria','Descripción'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'5px 10px',borderBottom:'1px solid #1E1E1F',color:'#6B6B6B',fontWeight:600}}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{[
                      ['nombre',    'Sí',  'Nombre del prospecto'],
                      ['apellido',  'No',  'Apellido'],
                      ['telefono',  'Sí*', 'Obligatorio si no hay email'],
                      ['email',     'Sí*', 'Obligatorio si no hay teléfono'],
                      ['sucursal',  'Sí',  'Código de sucursal: MPN, MPS o MOV'],
                      ['rut',       'No',  'Formato: 12345678-9'],
                      ['fuente',    'No',  'web / whatsapp / presencial / referido / evento / llamada'],
                      ['prioridad', 'No',  'alta / media / baja'],
                      ['comuna',    'No',  'Ciudad o comuna'],
                      ['color_pref','No',  'Color de moto preferido'],
                    ].map(([col,req,desc])=>(
                      <tr key={col} style={{borderBottom:'1px solid #111112'}}>
                        <td style={{padding:'5px 10px',fontFamily:'monospace',color:'#F28100'}}>{col}</td>
                        <td style={{padding:'5px 10px',color:req.includes('Sí')?'#10B981':'#555',fontWeight:req.includes('Sí')?600:400}}>{req}</td>
                        <td style={{padding:'5px 10px',color:'#777'}}>{desc}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step==='preview'&&preview&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10}}>
                {[
                  {l:'Total',        v:preview.summary.total,    c:'#FAFAFA'},
                  {l:'Válidos',      v:preview.summary.valid,    c:'#10B981'},
                  {l:'Errores',      v:preview.summary.errors,   c:'#EF4444'},
                  {l:'Dup. archivo', v:preview.summary.dup_file, c:'#F59E0B'},
                  {l:'Dup. CRM',     v:preview.summary.dup_db,   c:'#F28100'},
                ].map(x=>(
                  <div key={x.l} style={{...S.card,padding:'12px 14px',textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:800,color:x.c}}>{x.v}</div>
                    <div style={{fontSize:10,color:'#555',marginTop:2}}>{x.l}</div>
                  </div>
                ))}
              </div>

              <div style={{...S.card,display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#888'}}>Opciones:</span>
                <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12}}>
                  <input type="checkbox" checked={skipDups} onChange={e=>setSkipDups(e.target.checked)} style={{accentColor:'#F28100'}}/>
                  Omitir duplicados del CRM
                </label>
                <div style={{marginLeft:'auto',fontSize:12,color:'#888'}}>
                  Importando <span style={{color:'#10B981',fontWeight:700}}>{willImport}</span> de {preview.summary.total}
                </div>
              </div>

              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {[
                  {k:'all',   l:`Todas (${preview.summary.total})`},
                  {k:'valid', l:`Válidas (${preview.summary.valid})`},
                  {k:'error', l:`Errores (${preview.summary.errors})`},
                  {k:'dup',   l:`Duplicados (${preview.summary.dup_file+preview.summary.dup_db})`},
                ].map(t=>(
                  <button key={t.k} onClick={()=>setFilter(t.k)}
                    style={{...S.btn2,padding:'5px 12px',fontSize:11,
                      background:filter===t.k?'rgba(242,129,0,0.1)':'transparent',
                      color:filter===t.k?'#F28100':'#888',
                      border:filter===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #262626'}}>
                    {t.l}
                  </button>
                ))}
              </div>

              <div style={S.card}>
                <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:720}}>
                    <thead style={{position:'sticky',top:0,background:'#111112',zIndex:1}}>
                      <tr>{['Fila','Estado','Nombre','Teléfono','Email','Sucursal','Moto','Observaciones'].map(h=>(
                        <th key={h} style={{textAlign:'left',padding:'7px 10px',borderBottom:'1px solid #1E1E1F',color:'#6B6B6B',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r,i)=>{
                        const sc=STATUS_CFG[r.status]||STATUS_CFG.error;
                        const obs=[...(r.errors||[]),r.dup_reason].filter(Boolean).join(' · ');
                        return(
                          <tr key={i} style={{borderBottom:'1px solid #0E0E0F',background:i%2?'transparent':'rgba(255,255,255,0.01)'}}>
                            <td style={{padding:'6px 10px',color:'#555'}}>{r._row}</td>
                            <td style={{padding:'6px 10px'}}>
                              <span style={{display:'inline-flex',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,color:sc.c,background:sc.bg,whiteSpace:'nowrap'}}>{sc.l}</span>
                            </td>
                            <td style={{padding:'6px 10px',fontWeight:500}}>{r.nombre}{r.apellido?` ${r.apellido}`:''}</td>
                            <td style={{padding:'6px 10px',color:'#888'}}>{r.telefono||'—'}</td>
                            <td style={{padding:'6px 10px',color:'#888'}}>{r.email||'—'}</td>
                            <td style={{padding:'6px 10px'}}>{r.branch_name||r.sucursal_raw||'—'}</td>
                            <td style={{padding:'6px 10px',fontSize:11}}>
                              {r.model_resolved_name
                                ?<span style={{color:'#10B981',fontWeight:600}}>{r.model_resolved_name}</span>
                                :r.model_raw
                                  ?<span style={{color:'#F59E0B'}} title={`Sin match: "${r.model_raw}"`}>⚠ {r.model_raw}</span>
                                  :<span style={{color:'#555'}}>—</span>
                              }
                            </td>
                            <td style={{padding:'6px 10px',color:r.errors?.length?'#EF4444':'#555',fontSize:11}}>{obs||'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRows.length===0&&(
                    <div style={{padding:'24px',textAlign:'center',color:'#555',fontSize:12}}>Sin filas con este filtro</div>
                  )}
                </div>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={reset} style={{...S.btn2,padding:'9px 20px'}}>Cancelar</button>
                <button onClick={handleConfirm} disabled={willImport===0||loading}
                  style={{...S.btn,padding:'9px 24px',opacity:willImport===0||loading?0.5:1}}>
                  {loading?'Importando...':`Confirmar importación (${willImport} leads)`}
                </button>
              </div>
            </div>
          )}

          {step==='result'&&result&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{...S.card,textAlign:'center',padding:'32px 24px'}}>
                <div style={{fontSize:40,marginBottom:8}}>✓</div>
                <h3 style={{fontSize:18,fontWeight:700,margin:'0 0 6px',color:'#10B981'}}>Importación completada</h3>
                <div style={{fontSize:13,color:'#888'}}>{preview?.filename}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
                {[
                  {l:'Leads importados', v:result.imported, c:'#10B981'},
                  {l:'Errores en fila',  v:result.errors,   c:'#EF4444'},
                ].map(x=>(
                  <div key={x.l} style={{...S.card,padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:26,fontWeight:800,color:x.c}}>{x.v}</div>
                    <div style={{fontSize:10,color:'#555',marginTop:4}}>{x.l}</div>
                  </div>
                ))}
              </div>
              {result.tickets?.length>0&&(
                <div style={S.card}>
                  <h3 style={{fontSize:12,fontWeight:600,margin:'0 0 10px',color:'#888'}}>Tickets creados</h3>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {result.tickets.map(n=>(
                      <span key={n} style={{padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600,color:'#F28100',background:'rgba(242,129,0,0.1)'}}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>{setActiveTab('logs');setLogs(null);loadLogs();}} style={{...S.btn2,padding:'9px 20px'}}>Ver historial</button>
                <button onClick={reset} style={{...S.btn,padding:'9px 20px'}}>Nueva importación</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PRICELIST VIEW — Importar listas de precios PDF (solo super_admin)
// ═══════════════════════════════════════════
function PricelistView() {
  const [step, setStep]       = useState('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult]   = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('import');
  const [logs, setLogs]       = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [rowOverrides, setRowOverrides] = useState({}); // { rowIdx: { skip, create_new, model_id } }

  const STATUS_CFG = {
    match:     { l:'Coincide',   c:'#10B981', bg:'rgba(16,185,129,0.1)' },
    update:    { l:'Actualiza',  c:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
    fuzzy:     { l:'Fuzzy',      c:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
    ambiguous: { l:'Ambiguo',    c:'#F28100', bg:'rgba(242,129,0,0.1)'  },
    new:       { l:'Nuevo',      c:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
  };

  const SOURCE_LABELS = { honda:'Honda', yamaha:'Yamaha', mmb:'MMB (Keeway/Benelli/Benda/QJ)', promobility:'Promobility' };

  const processFile = async (f) => {
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', f);
      const data = await api.pricelistPreview(fd);
      setPreview(data);
      setRowOverrides({});
      setStep('preview');
    } catch (e) { alert('Error al procesar PDF: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.pdf')) processFile(f);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const rows = (preview.rows || []).map((row, i) => {
        const ov = rowOverrides[i] || {};
        return {
          ...row,
          skip:       ov.skip       ?? false,
          create_new: ov.create_new ?? false,
          model_id:   ov.model_id   ?? row.model_id,
        };
      });
      const data = await api.pricelistConfirm({
        period:      preview.period,
        source_type: preview.source_type,
        filename:    preview.filename,
        rows,
      });
      setResult(data);
      setStep('result');
    } catch (e) { alert('Error al confirmar: ' + e.message); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    if (logs) return;
    setLogsLoading(true);
    try { const d = await api.getPricelistLogs(); setLogs(d); }
    catch { setLogs([]); }
    finally { setLogsLoading(false); }
  };

  const setOv = (i, patch) => setRowOverrides(p => ({ ...p, [i]: { ...(p[i]||{}), ...patch } }));
  const reset = () => { setStep('upload'); setPreview(null); setResult(null); setRowOverrides({}); };

  const fmtP = (n) => n ? '$' + Number(n).toLocaleString('es-CL') : '—';

  const rows = preview?.rows || [];
  const summary = preview?.summary || {};
  const activeRows = rows.filter((_,i) => !rowOverrides[i]?.skip);
  const willImport = activeRows.filter(r => r.status === 'match' || r.status === 'update' || r.status === 'fuzzy').length
    + activeRows.filter((r,i) => r.status === 'new' && rowOverrides[i]?.create_new).length;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,margin:0}}>Lista de Precios</h2>
          <p style={{fontSize:12,color:'#6B6B6B',margin:'4px 0 0'}}>Importar PDFs mensuales de precios — solo super_admin</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[{k:'import',l:'Importar'},{k:'logs',l:'Historial'}].map(t=>(
            <button key={t.k} onClick={()=>{setActiveTab(t.k);if(t.k==='logs'){setLogs(null);loadLogs();}}}
              style={{...S.btn2,padding:'7px 16px',fontSize:12,
                background:activeTab===t.k?'rgba(242,129,0,0.1)':'',
                color:activeTab===t.k?'#F28100':'#A3A3A3',
                border:activeTab===t.k?'1px solid rgba(242,129,0,0.3)':'1px solid #262626'}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {activeTab==='logs' && (
        <div style={S.card}>
          <h3 style={{fontSize:14,fontWeight:600,margin:'0 0 14px'}}>Historial de importaciones</h3>
          {logsLoading ? <p style={{color:'#555',fontSize:13}}>Cargando...</p>
          : !logs?.length ? <p style={{color:'#555',fontSize:13}}>Sin importaciones registradas.</p>
          : <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{borderBottom:'1px solid #1E1E1F'}}>{['Fecha','Archivo','Período','Formato','Total','Importados','Actualizados','Nuevos Modelos','Errores','Por'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:600,color:'#6B6B6B',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>{logs.map((l,i)=><tr key={i} style={{borderBottom:'1px solid #1A1A1B'}}>
                  <td style={{padding:'8px 10px',color:'#888',whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{padding:'8px 10px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={l.filename}>{l.filename}</td>
                  <td style={{padding:'8px 10px',fontWeight:600,color:'#F28100'}}>{l.period}</td>
                  <td style={{padding:'8px 10px'}}>{SOURCE_LABELS[l.source_type]||l.source_type}</td>
                  <td style={{padding:'8px 10px',textAlign:'center'}}>{l.total_rows}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#10B981',fontWeight:600}}>{l.imported}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#3B82F6',fontWeight:600}}>{l.updated}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:'#8B5CF6',fontWeight:600}}>{l.new_models}</td>
                  <td style={{padding:'8px 10px',textAlign:'center',color:l.errors>0?'#EF4444':'#555'}}>{l.errors}</td>
                  <td style={{padding:'8px 10px',fontSize:11,color:'#666'}}>{l.imported_by_name}</td>
                </tr>)}</tbody>
              </table>
            </div>
          }
        </div>
      )}

      {activeTab==='import' && (
        <>
          {/* STEP: UPLOAD */}
          {step==='upload' && (
            <div style={S.card}>
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                style={{border:`2px dashed ${dragOver?'#F28100':'#262626'}`,borderRadius:12,padding:'48px 24px',textAlign:'center',background:dragOver?'rgba(242,129,0,0.04)':'#0E0E0F',transition:'all 0.2s',cursor:'pointer'}}
                onClick={()=>document.getElementById('pl-pdf-input').click()}
              >
                <div style={{width:52,height:52,borderRadius:14,background:'rgba(242,129,0,0.1)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                  <Ic.tag size={26} color="#F28100"/>
                </div>
                <p style={{fontSize:15,fontWeight:600,margin:'0 0 6px'}}>
                  {loading ? 'Procesando PDF...' : 'Arrastra el PDF de lista de precios aquí'}
                </p>
                <p style={{fontSize:12,color:'#555',margin:0}}>o haz clic para seleccionar — Formatos: Honda · Yamaha · MMB · Promobility</p>
                <input id="pl-pdf-input" type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
              </div>

              <div style={{marginTop:16,padding:14,background:'#0E0E0F',borderRadius:10,fontSize:12,color:'#888'}}>
                <div style={{fontWeight:600,color:'#FAFAFA',marginBottom:8}}>Formatos soportados</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[
                    ['Honda','Código · Categoría · Precio · Bono TMP · Bono Autofin'],
                    ['Yamaha / Yamaimport','Cilindrada · Precio · Bono Yamaha · Bono Autofin'],
                    ['MMB (Keeway/Benelli/Benda/QJ)','Marca · Precio · Bono · Dcto 30/60 días'],
                    ['Promobility (Suzuki/Cyclone/KYMCO/RE)','Marca · Segmento · Año · Precio · Bono'],
                  ].map(([n,d])=>(
                    <div key={n} style={{padding:'8px 10px',background:'#151516',borderRadius:8,border:'1px solid #1E1E1F'}}>
                      <div style={{fontWeight:600,color:'#F28100',marginBottom:2}}>{n}</div>
                      <div style={{fontSize:11,color:'#666'}}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP: PREVIEW */}
          {step==='preview' && preview && (
            <div>
              {/* Header del preview */}
              <div style={{...S.card,marginBottom:12,display:'flex',flexWrap:'wrap',gap:16,alignItems:'center'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>
                    {SOURCE_LABELS[preview.source_type]||preview.source_type}
                    {preview.period && <span style={{color:'#F28100',marginLeft:10}}>Período: {preview.period}</span>}
                  </div>
                  <div style={{fontSize:11,color:'#666'}}>{preview.filename}</div>
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {[
                    {l:'Total',    v:summary.total,     c:'#FAFAFA'},
                    {l:'Coincide', v:summary.match,     c:'#10B981'},
                    {l:'Actualiza',v:summary.update,    c:'#3B82F6'},
                    {l:'Fuzzy',    v:summary.fuzzy,     c:'#F59E0B'},
                    {l:'Ambiguo',  v:summary.ambiguous, c:'#F28100'},
                    {l:'Nuevo',    v:summary.new,       c:'#8B5CF6'},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{textAlign:'center',padding:'6px 12px',background:'#0E0E0F',borderRadius:8,border:'1px solid #1E1E1F'}}>
                      <div style={{fontSize:18,fontWeight:800,color:c}}>{v||0}</div>
                      <div style={{fontSize:10,color:'#666'}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla de preview */}
              <div style={{...S.card,marginBottom:12,overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1E1E1F'}}>
                      {['','Estado','Marca','Modelo','Cat.','cc','Precio Lista','Bono TMP','P. TMP','Bono AF','P. AF','Notas'].map(h=>(
                        <th key={h} style={{textAlign:'left',padding:'8px 10px',fontSize:10,fontWeight:600,color:'#6B6B6B',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const ov = rowOverrides[i] || {};
                      const skipped = ov.skip;
                      const cfg = STATUS_CFG[row.status] || STATUS_CFG.new;
                      return (
                        <tr key={i} style={{borderBottom:'1px solid #1A1A1B',opacity:skipped?0.35:1}}>
                          {/* Skip checkbox */}
                          <td style={{padding:'6px 10px'}}>
                            <input type="checkbox" checked={!!ov.skip}
                              onChange={e=>setOv(i,{skip:e.target.checked})}
                              title="Omitir esta fila"/>
                          </td>
                          {/* Status badge */}
                          <td style={{padding:'6px 10px',whiteSpace:'nowrap'}}>
                            <span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700,color:cfg.c,background:cfg.bg}}>
                              {cfg.l}
                            </span>
                            {row.status==='new' && !skipped && (
                              <label style={{display:'flex',alignItems:'center',gap:4,marginTop:3,fontSize:10,color:'#8B5CF6',cursor:'pointer'}}>
                                <input type="checkbox" checked={!!ov.create_new}
                                  onChange={e=>setOv(i,{create_new:e.target.checked})}/>
                                Crear
                              </label>
                            )}
                            {row.status==='ambiguous' && !skipped && (
                              <select style={{...S.inp,padding:'2px 6px',fontSize:10,marginTop:3,width:140}}
                                value={ov.model_id||''}
                                onChange={e=>setOv(i,{model_id:e.target.value})}>
                                <option value="">— elegir —</option>
                                {(row.candidates||[]).map(c=>(
                                  <option key={c.id} value={c.id}>{c.brand} {c.model}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={{padding:'6px 10px',fontWeight:600}}>{row.brand}</td>
                          <td style={{padding:'6px 10px',maxWidth:180}}>
                            <div style={{fontWeight:600}}>{row.model}</div>
                            {row.code && <div style={{fontSize:10,color:'#555'}}>{row.code}</div>}
                          </td>
                          <td style={{padding:'6px 10px',color:'#888'}}>{row.category||row.segment||'—'}</td>
                          <td style={{padding:'6px 10px',color:'#888'}}>{row.cc||'—'}</td>
                          <td style={{padding:'6px 10px',fontWeight:600}}>{fmtP(row.price_list)}</td>
                          <td style={{padding:'6px 10px',color:'#10B981'}}>{fmtP(row.bono_todo_medio)}</td>
                          <td style={{padding:'6px 10px',fontWeight:600,color:'#3B82F6'}}>{fmtP(row.price_todo_medio)}</td>
                          <td style={{padding:'6px 10px',color:'#F59E0B'}}>{fmtP(row.bono_financiamiento)}</td>
                          <td style={{padding:'6px 10px',fontWeight:600,color:'#F28100'}}>{fmtP(row.price_financiamiento)}</td>
                          <td style={{padding:'6px 10px',fontSize:10,color:'#666',maxWidth:160}}>{row.notes||row.dcto_30_dias||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Acciones */}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',alignItems:'center'}}>
                <span style={{fontSize:12,color:'#888'}}>Se importarán <strong style={{color:'#F28100'}}>{willImport}</strong> filas</span>
                <button onClick={reset} style={{...S.btn2,padding:'9px 20px'}}>Cancelar</button>
                <button onClick={handleConfirm} disabled={loading||willImport===0} style={{...S.btn,padding:'9px 24px',opacity:loading||willImport===0?0.6:1}}>
                  {loading?'Guardando...':'Confirmar importación'}
                </button>
              </div>
            </div>
          )}

          {/* STEP: RESULT */}
          {step==='result' && result && (
            <div style={S.card}>
              <div style={{textAlign:'center',marginBottom:24}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(16,185,129,0.15)',display:'inline-flex',alignItems:'center',justifyContent:'center',marginBottom:12}}>
                  <Ic.check size={28} color="#10B981"/>
                </div>
                <h3 style={{fontSize:16,fontWeight:700,margin:'0 0 4px'}}>Importación completada</h3>
                <p style={{fontSize:12,color:'#666',margin:0}}>Período {result.period} · {SOURCE_LABELS[result.source_type]||result.source_type}</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10,marginBottom:24}}>
                {[
                  {l:'Importados',    v:result.imported,    c:'#10B981'},
                  {l:'Actualizados',  v:result.updated,     c:'#3B82F6'},
                  {l:'Nuevos modelos',v:result.new_models,  c:'#8B5CF6'},
                  {l:'Omitidos',      v:result.skipped,     c:'#6B7280'},
                  {l:'Errores',       v:result.errors?.length||0, c:'#EF4444'},
                ].map(({l,v,c})=>(
                  <div key={l} style={{textAlign:'center',padding:'12px 8px',background:'#0E0E0F',borderRadius:10,border:'1px solid #1E1E1F'}}>
                    <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:11,color:'#666',marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
              {result.errors?.length > 0 && (
                <div style={{marginBottom:16,padding:12,background:'rgba(239,68,68,0.05)',borderRadius:8,border:'1px solid rgba(239,68,68,0.2)'}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#EF4444',marginBottom:6}}>Errores</div>
                  {result.errors.map((e,i)=>(
                    <div key={i} style={{fontSize:11,color:'#EF4444',opacity:0.8}}>{e.model}: {e.error}</div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>{setActiveTab('logs');setLogs(null);loadLogs();}} style={{...S.btn2,padding:'9px 20px'}}>Ver historial</button>
                <button onClick={reset} style={{...S.btn,padding:'9px 20px'}}>Nueva importación</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
