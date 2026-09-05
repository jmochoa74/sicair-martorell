// ═══════════════════════════════════════════════════════════════════
// SN8Panel.tsx — Gobierno del respirómetro SN-8 integrado en SICAIR 3.0
// Diseñado para encajar con la estética del dashboard de Palacios:
// fondo #fff/#fafafa, radios 16px, borde #f0f0f0, sombra suave.
//
// Uso en App.tsx:
//   import SN8Panel from "./SN8Panel";
//   ...
//   {tab==="sn8" && <SN8Panel C={C} planta={INSTALL?.planta || "palacios"}/>}
//
// Recibe la paleta C del propio App para heredar sus colores exactos.
// Lectura/escritura reales vía backend -> sn8_bridge.py -> PLC.
// Detecta capacidades: si el estado trae claves de gobierno (operativo,
// manual, hab_test1...) muestra control completo; si no, modo lectura.
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";

// Backend compartido por todas las plantas (reverse_proxy /api -> :8000)
const API = "https://sn8.sensaratech.com/api";

// Credenciales de login por planta (usuario operador, solo lectura de su instalación).
// El estado del equipo lo publica el bridge del PC con influente="equipo".
const LOGIN_PLANTA = {
  martorell: { username: "operador_martorell", password: "SN8_martorell_3.0" },
  // palacios: { username: "operador_palacios", password: "..." },  // añadir cuando toque
};
const INFLUENTE_EQUIPO = "equipo";

const EQUIPOS = [
  {id:"bomba1", label:"Bomba 1", icon:"⛽", estado:"bomba1_man"},
  {id:"bomba2", label:"Bomba 2", icon:"⛽", estado:"bomba2_man"},
  {id:"oxigenador", label:"Oxigenador", icon:"💨", estado:"oxigenador_man"},
  {id:"oxi_lento", label:"Oxig. lenta", icon:"🌬️", estado:"oxi_lento_man"},
  {id:"valv_vaciado", label:"V. vaciado", icon:"🔧", estado:"valv_vaciado_man"},
  {id:"valv_limp", label:"V. limpieza", icon:"🔧", estado:"valv_limp_man"},
  {id:"recirc", label:"Recirculación", icon:"🌀", estado:"recirc_man"},
  {id:"perist1", label:"Peristáltica 1", icon:"🧪", estado:"perist1_man"},
  {id:"perist2", label:"Peristáltica 2", icon:"🧪", estado:"perist2_man"},
];

// Toxicidad (test 5) tiene 2 etapas dentro de sus 14 fases.
// Corte por defecto: fases "0".."6" = Etapa 1 (basal/blanco, TOX1);
// "7".."12" = Etapa 2 (con tóxico, TOX2). Ajustar TOX_CORTE si cambia.
const TOX_CORTE = 7;  // primera fase (índice) que pertenece a la Etapa 2
const TOX_FASE_NUM = f => { const n = parseInt(String(f),10); return isNaN(n)?0:n; };

const TESTS = [
  {n:1, hab:"hab_test1", label:"Respirometría Global", icon:"🔄", ck:"green",  activo:"test1_activo", fase:"test1_fase", tiempos:"test1_tiempos", habEstado:"hab_test1"},
  {n:2, hab:"hab_test2", label:"Desnitrificación",     icon:"🔵", ck:"blue",   activo:"test2_activo", fase:"test2_fase", tiempos:"test2_tiempos", habEstado:"hab_test2"},
  {n:3, hab:"hab_test3", label:"Nitrificación",        icon:"🟣", ck:"purple", activo:"test3_activo", fase:"test3_fase", tiempos:"test3_tiempos", habEstado:"hab_test3"},
  {n:4, hab:"hab_test4", label:"DQOb",                 icon:"🧪", ck:"amber",  activo:"test4_activo", fase:"test4_fase", tiempos:"test4_tiempos", habEstado:"hab_test4"},
  {n:5, hab:"hab_test5", label:"Toxicidad",            icon:"☣️", ck:"red",    activo:"test5_activo", fase:"test5_fase", tiempos:"test5_tiempos", habEstado:"hab_test5"},
];

const CONSIGNAS = [
  {id:"cons_aur_max", label:"AUR máx", unit:"", dec:2},
  {id:"cons_aur_min", label:"AUR mín", unit:"", dec:2},
  {id:"cons_trc_max", label:"TRC máx", unit:"d", dec:2},
  {id:"cons_trc_min", label:"TRC mín", unit:"d", dec:2},
  {id:"cons_trh_max", label:"TRH máx", unit:"h", dec:1},
  {id:"cons_trh_min", label:"TRH mín", unit:"h", dec:1},
];

export default function SN8Panel({ C, planta = "palacios" }) {
  const [d,setD]=useState(null);
  const [pendientes,setPendientes]=useState([]);
  const [fuente,setFuente]=useState("offline");
  const [err,setErr]=useState(null);
  const tokenRef = useRef(null);

  // Estilos base heredando la estética del dashboard
  const card = {background:"#fff",borderRadius:16,padding:"20px 22px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f0f0f0",marginBottom:20};
  const subcard = {background:"#fafafa",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 16px"};
  const titulo = {fontSize:13,fontWeight:700,color:C.text,marginBottom:14};

  const Badge = ({children,color}) => (
    <span style={{background:color+"18",color,border:`1px solid ${color}44`,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600}}>{children}</span>
  );
  const Dot = ({on,color=C.green}) => (
    <span style={{width:9,height:9,borderRadius:"50%",display:"inline-block",flexShrink:0,background:on?color:"#e0e0e0",boxShadow:on?`0 0 6px 2px ${color}55`:"none"}}/>
  );

  // Login: obtiene y cachea el token JWT de la planta
  const login=useCallback(async()=>{
    const cred=LOGIN_PLANTA[planta];
    if(!cred) return null;
    const r=await fetch(`${API}/login`,{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:cred.username,password:cred.password})});
    if(!r.ok) throw new Error(`login ${r.status}`);
    const j=await r.json();
    tokenRef.current=j.token;
    return j.token;
  },[planta]);

  const cargar=useCallback(async()=>{
    try {
      // Asegurar token (login la primera vez o si expiró)
      if(!tokenRef.current) await login();
      let r=await fetch(`${API}/datos/${planta}/${INFLUENTE_EQUIPO}`,
        {headers:{Authorization:`Bearer ${tokenRef.current}`}});
      // Si el token caducó (401), reloguear una vez y reintentar
      if(r.status===401){ await login(); r=await fetch(`${API}/datos/${planta}/${INFLUENTE_EQUIPO}`,
        {headers:{Authorization:`Bearer ${tokenRef.current}`}}); }
      if(!r.ok) throw new Error(`datos ${r.status}`);
      setD(await r.json()); setFuente("backend"); return;
    } catch { tokenRef.current=null; setFuente("offline"); }
  },[planta,login]);
  useEffect(()=>{ cargar(); const iv=setInterval(cargar,15000); return ()=>clearInterval(iv); },[cargar]);

  const escribir=useCallback(async(registro,valor)=>{
    setErr(null);
    try {
      const r=await fetch(`${API}/sn8/write`,{method:"POST",
        headers:{"Content-Type":"application/json","X-Api-Key":API_KEY},
        body:JSON.stringify({planta,registro,valor})});
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`HTTP ${r.status}`); }
      setPendientes(p=>[...p.filter(x=>x.registro!==registro),{registro,valor}]);
      setTimeout(cargar,4000);
    } catch(e){ setErr(`No se pudo enviar: ${e.message}`); }
  },[cargar,planta]);

  const escrituraOK = false; // gobierno por /api/datos es solo lectura; la escritura llegara con el bridge del SN8 nuevo
  const pendiente = reg => pendientes.some(p=>p.registro===reg);
  // Detección de capacidades: ¿el equipo publica variables de gobierno?
  const puedeGobernar = d && ("operativo" in d || "manual" in d || "hab_test1" in d);

  const antiguedad = d?.ts ? Math.round((Date.now()-new Date(d.ts).getTime())/60000) : null;
  const rancio = antiguedad!=null && antiguedad>5;
  const modo = d?.stop?"STOP":d?.manual?"MANUAL":d?.operativo?"OPERATIVO":"—";
  const enManual = !!d?.manual;
  const alarmas = d ? Object.entries(d).filter(([k,v])=>k.startsWith("al_")&&v).map(([k])=>k) : [];

  // ── Botón con confirmación en dos pasos ────────────────────────
  const ConfirmButton = ({label, mensaje, color, onConfirm, disabled, small}) => {
    const [ask,setAsk]=useState(false);
    const pad = small ? "5px 12px" : "8px 18px";
    if (!ask) return (
      <button disabled={disabled} onClick={()=>setAsk(true)}
        style={{background:disabled?"#e8e8e8":color,color:disabled?"#aaa":"#fff",border:"none",borderRadius:8,padding:pad,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",transition:"all .15s"}}>{label}</button>
    );
    return (
      <span style={{display:"inline-flex",gap:6,alignItems:"center",background:C.amberFade,border:`1px solid ${C.amber}55`,borderRadius:8,padding:"3px 8px"}}>
        <span style={{fontSize:11,color:C.amber,fontWeight:600}}>{mensaje||"¿Confirmar?"}</span>
        <button onClick={()=>{onConfirm();setAsk(false);}} style={{background:C.amber,color:"#fff",border:"none",borderRadius:6,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Sí</button>
        <button onClick={()=>setAsk(false)} style={{background:"#fff",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer"}}>No</button>
      </span>
    );
  };

  // ── Gauge semicircular ──────────────────────────────────────────
  // Gauge con color segun rango: verde dentro de [okMin,okMax], ambar/rojo fuera.
  // Si no se pasan okMin/okMax, usa el color fijo indicado.
  const Gauge = ({label,v,min,max,unit,color,decimals=2,okMin,okMax}) => {
    const ok=v!=null&&!isNaN(v); const pct=ok?Math.min(1,Math.max(0,(v-min)/(max-min))):0; const arc=Math.PI*40;
    let col=color;
    if(ok && okMin!=null && okMax!=null){
      if(v>=okMin && v<=okMax) col=C.green;
      else if(v<okMin*0.8 || v>okMax*1.2) col=C.red;
      else col=C.amber;
    }
    return (
      <div style={{textAlign:"center",flex:1,minWidth:98}}>
        <svg viewBox="0 0 100 60" style={{width:"100%",maxWidth:116}}>
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#f0f0f0" strokeWidth={9} strokeLinecap="round"/>
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke={col} strokeWidth={9} strokeLinecap="round"
            strokeDasharray={arc} strokeDashoffset={arc*(1-pct)} style={{transition:"stroke-dashoffset .8s ease, stroke .4s ease"}}/>
          <text x={50} y={44} textAnchor="middle" fontSize={16} fontWeight={700} fill={ok?col:C.muted} fontFamily="ui-monospace,monospace">{ok?v.toFixed(decimals):"—"}</text>
          <text x={50} y={56} textAnchor="middle" fontSize={7} fill={C.muted}>{unit}</text>
        </svg>
        <div style={{fontSize:11,fontWeight:600,color:C.text,marginTop:-2}}>{label}</div>
      </div>
    );
  };

  const VRow = ({label,v,unit,hl,decimals,hideEmpty}) => {
    const vacio = v==null||isNaN(v);
    if(hideEmpty && vacio) return null;
    return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"6px 0",borderBottom:"1px solid #f4f4f4"}}>
      <span style={{fontSize:12,color:C.muted}}>{label}</span>
      <span><span style={{fontSize:13,fontWeight:700,fontFamily:"ui-monospace,monospace",color:hl||C.text}}>
        {vacio?"—":decimals!=null?Number(v).toFixed(decimals):v}</span>
        {unit&&<span style={{fontSize:10,color:C.muted,marginLeft:4}}>{unit}</span>}</span>
    </div>
    );
  };

  // ── Tarjeta de test con fase real y temporizadores ──────────────
  const TestCard = ({t}) => {
    const [,setT]=useState(0);
    const color = C[t.ck] || C.green;
    const activo = d?.[t.activo];
    useEffect(()=>{ if(!activo) return; const iv=setInterval(()=>setT(x=>x+1),1000); return ()=>clearInterval(iv); },[activo]);
    const habilitado = d?.[t.habEstado];
    const faseActual = d?.[t.fase];
    const tiempos = d?.[t.tiempos]||[];
    const fmt = s => s==null?"—:—":`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
    return (
      <div style={{...subcard,border:`1.5px solid ${activo?color:"#f0f0f0"}`,boxShadow:activo?`0 2px 12px ${color}22`:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:19}}>{t.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12.5,fontWeight:700,color:C.text}}>{t.label}</div>
            <div style={{fontSize:10,color:activo?color:C.muted,fontWeight:600}}>{activo?`● En curso · fase ${faseActual??"—"}`:habilitado?"Habilitado":"Inactivo"}</div>
          </div>
          {!activo
            ? <ConfirmButton label="▶ Habilitar" mensaje="¿Lanzar?" color={color} small disabled={!escrituraOK||pendiente(t.hab)} onConfirm={()=>escribir(t.hab,1)}/>
            : <ConfirmButton label="⏹ Parar" mensaje="¿Parar?" color={C.red} small disabled={!escrituraOK||pendiente(t.hab)} onConfirm={()=>escribir(t.hab,0)}/>}
        </div>
        {tiempos.length>0 && (() => {
          const esTox = t.n===5;
          const etapaDe = f => TOX_FASE_NUM(f.fase) >= TOX_CORTE ? 2 : 1;
          const faseEtapa = esTox && faseActual!=null ? (TOX_FASE_NUM(faseActual)>=TOX_CORTE?2:1) : null;
          const filaFase = f => {
            const act = f.fase===String(faseActual);
            const pct = f.sp>0 && f.restante!=null ? Math.max(0,Math.min(100,Math.round((1-f.restante/f.sp)*100))) : 0;
            return (
              <div key={f.fase} style={{background:act?color+"11":"transparent",borderRadius:6,padding:"3px 8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <Dot on={act} color={color}/>
                  <span style={{fontSize:11,flex:1,fontWeight:act?700:400,color:act?C.text:C.muted}}>Fase {f.fase}</span>
                  {act && f.restante!=null && <span style={{fontSize:11,fontFamily:"ui-monospace,monospace",color,fontWeight:700}}>{fmt(f.restante)}</span>}
                  <span style={{fontSize:10,fontFamily:"ui-monospace,monospace",color:C.muted}}>SP {f.sp??"—"}s</span>
                </div>
                {act && f.sp>0 && (
                  <div style={{height:3,background:"#f0f0f0",borderRadius:2,marginTop:2,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:color,transition:"width 1s linear"}}/>
                  </div>
                )}
              </div>
            );
          };
          const cabeceraEtapa = (n,label) => (
            <div style={{display:"flex",alignItems:"center",gap:6,margin:"6px 0 2px"}}>
              <span style={{fontSize:10,fontWeight:700,color:faseEtapa===n?color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Etapa {n} · {label}</span>
              {faseEtapa===n && <span style={{fontSize:9,color,fontWeight:700}}>● en curso</span>}
              <div style={{flex:1,height:1,background:"#f0f0f0"}}/>
            </div>
          );
          if (!esTox) {
            return <div style={{display:"flex",flexDirection:"column",gap:3}}>{tiempos.map(filaFase)}</div>;
          }
          const e1 = tiempos.filter(f=>etapaDe(f)===1);
          const e2 = tiempos.filter(f=>etapaDe(f)===2);
          return (
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {cabeceraEtapa(1,"basal")}
              {e1.map(filaFase)}
              {cabeceraEtapa(2,"tóxico")}
              {e2.map(filaFase)}
            </div>
          );
        })()}
      </div>
    );
  };

  const ConsignaRow = ({cs}) => {
    const [edit,setEdit]=useState(false); const [v,setV]=useState("");
    const valor=d?.[cs.id];
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f4f4f4",gap:8}}>
        <span style={{fontSize:12,color:C.muted,flex:1}}>{cs.label}</span>
        {!edit ? (
          <>
            <span style={{fontSize:13,fontWeight:700,fontFamily:"ui-monospace,monospace",color:C.text}}>{valor==null?"—":Number(valor).toFixed(cs.dec)}{cs.unit&&<span style={{fontSize:10,color:C.muted}}> {cs.unit}</span>}</span>
            {pendiente(cs.id) ? <Badge color={C.yellow}>⏳</Badge> :
              <button disabled={!escrituraOK} onClick={()=>{setEdit(true);setV(String(valor??""));}}
                style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 9px",fontSize:11,cursor:escrituraOK?"pointer":"default",color:escrituraOK?C.blue:C.muted}}>✏️</button>}
          </>
        ) : (
          <span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
            <input type="number" value={v} onChange={e=>setV(e.target.value)} step={cs.dec===2?0.01:0.1}
              style={{width:70,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 7px",fontSize:12,fontFamily:"ui-monospace,monospace",textAlign:"center"}}/>
            <button onClick={()=>{escribir(cs.id,Number(v));setEdit(false);}} style={{background:C.green,color:"#fff",border:"none",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓</button>
            <button onClick={()=>setEdit(false)} style={{background:"#fff",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 7px",fontSize:11,cursor:"pointer"}}>✕</button>
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Conexión */}
      <div style={{...subcard,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
        background:fuente!=="offline"?C.greenFade:C.redFade,border:`1px solid ${fuente!=="offline"?C.green:C.red}33`}}>
        <span style={{fontSize:12,color:C.text}}>
          {fuente==="backend"?(puedeGobernar?"🟢 Conectado · gobierno activo":"🟢 Conectado al equipo · solo lectura"):"🔴 Sin conexión con el SN-8"}
        </span>
        {d?.ts&&<span style={{color:rancio?C.red:C.muted,fontFamily:"ui-monospace,monospace",fontSize:11,fontWeight:rancio?700:400}}>{rancio&&"⚠️ "}{String(d.ts).slice(0,16).replace("T"," ")} ({antiguedad} min)</span>}
      </div>

      {/* HERO verde con modo */}
      <div style={{background:`linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 60%, #67a05c 100%)`,
        borderRadius:16,padding:"22px 26px",marginBottom:20,color:"#fff",boxShadow:"0 4px 24px rgba(45,122,39,0.28)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14}}>
          <div style={{fontSize:19,fontWeight:800,letterSpacing:0.3}}>SN-8 <span style={{opacity:0.85}}>ON-LINE</span></div>
          {puedeGobernar && <span style={{background:"rgba(255,255,255,0.22)",border:"1px solid rgba(255,255,255,0.4)",borderRadius:6,padding:"3px 12px",fontSize:12,fontWeight:800}}>Modo: {modo}</span>}
          {!puedeGobernar && d?.test_activo && <span style={{background:"rgba(255,255,255,0.18)",borderRadius:20,padding:"3px 12px",fontSize:11,color:"#eaf3de"}}>{d.test_activo}</span>}
          {alarmas.length>0 && <span style={{background:"rgba(255,255,255,0.9)",color:C.red,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>⚠️ {alarmas.length} alarma(s)</span>}
        </div>

        {puedeGobernar && (
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
            <ConfirmButton label="🟢 OPERATIVO" mensaje="¿OPERATIVO?" color="#256b20" disabled={!escrituraOK||modo==="OPERATIVO"} onConfirm={()=>escribir("modo_operativo",1)}/>
            <ConfirmButton label="🟠 MANUAL" mensaje="¿MANUAL?" color={C.amber} disabled={!escrituraOK||modo==="MANUAL"} onConfirm={()=>escribir("modo_manual",1)}/>
            <ConfirmButton label="🔴 STOP" mensaje="¿Parar SN-8?" color={C.red} disabled={!escrituraOK||modo==="STOP"} onConfirm={()=>escribir("modo_stop",1)}/>
          </div>
        )}

        {(() => {
          const kpis = [
            {l:"AUR", v:d?.aur, dec:2, u:"mg O₂/L·h"},
            {l:"RN", v:d?.rn, dec:1, u:"mg N/L·h"},
            {l:"SSVLM", v:d?.solidos, dec:0, u:"mg/L"},
            {l:"TRC", v:d?.trc, dec:2, u:"días"},
          ].filter(k => k.v!=null && !isNaN(k.v));
          const n = kpis.length || 1;
          return (
            <div style={{display:"grid",gridTemplateColumns:`repeat(${n},1fr)`,gap:12}}>
              {kpis.map(({l,v,u,dec})=>(
                <div key={l} style={{background:"rgba(255,255,255,0.16)",border:"1px solid rgba(255,255,255,0.28)",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{fontSize:9.5,color:"rgba(255,255,255,0.75)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:"#fff",fontFamily:"ui-monospace,monospace",lineHeight:1}}>{Number(v).toFixed(dec)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.75)",marginTop:3}}>{u}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {err && <div style={{background:C.redFade,border:`1px solid ${C.red}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.red,marginBottom:16}}>{err}</div>}


      {/* CONTROL DE TESTS */}
      {puedeGobernar && (
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div><div style={titulo}>🧪 Control de tests</div>
              <div style={{fontSize:11,color:C.muted,marginTop:-8}}>Habilitar/parar · fase y temporizadores reales del PLC</div></div>
            <Badge color={escrituraOK?C.green:C.muted}>{escrituraOK?"Control disponible":"Sin backend"}</Badge>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
            {TESTS.map(t=><TestCard key={t.n} t={t}/>)}
          </div>
        </div>
      )}

      {/* CONTROL DE EQUIPOS */}
      {puedeGobernar && (
        <div style={{...card,border:`1.5px solid ${enManual?C.amber+"44":"#f0f0f0"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div><div style={titulo}>🔌 Control de equipos</div>
              <div style={{fontSize:11,color:C.muted,marginTop:-8}}>Marcha/paro individual · solo en modo MANUAL</div></div>
            {enManual ? <Badge color={C.amber}>MANUAL activo</Badge> : <Badge color={C.muted}>Bloqueado (pon MANUAL)</Badge>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {EQUIPOS.map(eq=>{
              const on=d?.[eq.estado]; const pend=pendiente(eq.id);
              return (
                <div key={eq.id} style={{...subcard,border:`1.5px solid ${on?C.green:"#f0f0f0"}`,display:"flex",alignItems:"center",gap:10,opacity:enManual?1:0.55}}>
                  <span style={{fontSize:18}}>{eq.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11.5,fontWeight:700,color:C.text}}>{eq.label}</div>
                    <div style={{fontSize:10,color:on?C.green:C.muted,fontWeight:600}}>{pend?"⏳ …":on?"En marcha":"Parado"}</div>
                  </div>
                  {enManual && !pend
                    ? <button onClick={()=>escribir(eq.id, on?0:1)} style={{background:on?C.red:C.green,color:"#fff",border:"none",borderRadius:8,padding:"5px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{on?"Parar":"Marcha"}</button>
                    : <Dot on={on}/>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SENSORES */}
      <div style={card}>
        <div style={titulo}>📡 Sensores en tiempo real</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Gauge label="Oxígeno" v={d?.oxigeno} min={0} max={12} unit="mg/L" color={C.blue} okMin={1.5} okMax={4}/>
          <Gauge label="pH" v={d?.ph} min={4} max={10} unit="" color={C.green} okMin={6.5} okMax={8.5}/>
          <Gauge label="Temperatura" v={d?.temp} min={0} max={40} unit="°C" color={C.amber} decimals={1} okMin={12} okMax={30}/>
          <Gauge label="ORP" v={d?.orp} min={-500} max={500} unit="mV" color={C.muted} decimals={0}/>
          {d?.trh!=null && <Gauge label="TRH" v={d?.trh} min={0} max={24} unit="h" color={C.purple} decimals={1}/>}
          {d?.inh!=null && <Gauge label="Inhibición" v={d?.inh} min={0} max={100} unit="%" color={C.red} decimals={0} okMin={0} okMax={20}/>}
        </div>
      </div>

      {/* PARÁMETROS + (CONSIGNAS solo con gobierno) + ESTADO EDAR */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{...card,marginBottom:0,borderTop:`3px solid ${C.purple}`}}>
          <div style={titulo}>🧫 Respirometría</div>
          <VRow label="AUR" v={d?.aur} unit="mg O₂/L·h" decimals={2} hl={C.green}/>
          <VRow label="RN" v={d?.rn} unit="mg N/L·h" decimals={1} hideEmpty/>
          <VRow label="NUR" v={d?.nur} unit="" decimals={1} hideEmpty/>
          <VRow label="OUR" v={d?.our} decimals={1}/>
          <VRow label="SOUR" v={d?.sour} decimals={0}/>
          <VRow label="DQOb" v={d?.dqob} unit="mg/L" decimals={0} hideEmpty/>
          <VRow label="TRC" v={d?.trc} unit="días" decimals={2} hl={C.purple}/>
          <VRow label="Min. totales aire" v={d?.min_total_aire} unit="min" decimals={0} hl={C.amber} hideEmpty/>
          <VRow label="Caudal entrada" v={d?.caudal_entrada} unit="m³/h" decimals={0} hideEmpty/>
        </div>

        {puedeGobernar ? (
          <div style={{...card,marginBottom:0,borderTop:`3px solid ${C.blue}`}}>
            <div style={titulo}>🎯 Consignas de alarma</div>
            <div style={{fontSize:11,color:C.muted,marginTop:-8,marginBottom:8}}>Editables{escrituraOK?"":" (requiere backend)"}</div>
            {CONSIGNAS.map(cs=><ConsignaRow key={cs.id} cs={cs}/>)}
          </div>
        ) : (
          <div style={{...card,marginBottom:0,borderTop:`3px solid ${C.blue}`}}>
            <div style={titulo}>🏭 Estado EDAR</div>
            <VRow label="Modo depuradora" v={d==null?null:(d.modo_depuradora===1?"SN8 / SICAIR":"Sonda O₂")} hl={d?.modo_depuradora===1?C.green:C.amber}/>
            <VRow label="Test activo" v={d?.test_activo}/>
            <div style={{marginTop:12}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Soplantes</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                {[d?.soplante1,d?.soplante2,d?.soplante3,d?.soplante4,d?.soplante5].map((s,i)=>{
                  const on=s>=1;
                  return (
                    <div key={i} style={{textAlign:"center",background:on?C.greenFade:"#fafafa",border:`1px solid ${on?C.green+"44":"#f0f0f0"}`,borderRadius:8,padding:"8px 2px"}}>
                      <div style={{fontSize:15,color:on?C.green:C.muted}}>💨</div>
                      <div style={{fontSize:11,fontWeight:on?700:400,color:on?C.green:C.muted,marginTop:2}}>S{i+1}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
