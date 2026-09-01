import { useState, useRef, useCallback, useEffect } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, BarChart, Bar, Scatter, Legend, ReferenceArea } from "recharts";

const C = {
  green:"#2d7a27", greenLight:"#4a9c3f", greenFade:"rgba(45,122,39,0.08)",
  amber:"#c2410c", amberFade:"rgba(194,65,12,0.08)",
  blue:"#1d4ed8", blueFade:"rgba(29,78,216,0.08)",
  red:"#b91c1c", redFade:"rgba(185,28,28,0.08)",
  purple:"#6d28d9", yellow:"#d97706",
  bg:"#ffffff", panel:"#fafafa", border:"#f0f0f0",
  text:"#111111", muted:"#888888", gridLine:"#f4f4f4",
};
const RC = ["#4a9c3f","#1565c0","#e65100","#6a1b9a","#c62828","#f9a825"];
const TIPOS_INC = [
  {id:"parada",label:"🛑 Parada",color:C.red},
  {id:"averia",label:"🔧 Avería",color:C.amber},
  {id:"carga",label:"📥 Cambio carga",color:C.blue},
  {id:"toxicidad",label:"☣️ Toxicidad",color:C.purple},
  {id:"otro",label:"📝 Otro",color:C.muted},
];
const ALERT_DEF = [
  {id:"aur_bajo",label:"AUR mínimo",icon:"🔬",unit:"mg O₂/L·h",campo:"AUR",tipo:"min",valor:0.8,activa:true,sonido:true,severidad:"critica"},
  {id:"aur_alto",label:"AUR máximo",icon:"🔬",unit:"mg O₂/L·h",campo:"AUR",tipo:"max",valor:5.0,activa:true,sonido:false,severidad:"aviso"},
  {id:"tox",label:"SICTOX toxicidad",icon:"☣️",unit:"%",campo:"toxProb",tipo:"max",valor:40,activa:true,sonido:true,severidad:"critica"},
  {id:"mins_alto",label:"Soplante exceso",icon:"💨",unit:"min/ciclo",campo:"minsReal",tipo:"max",valor:120,activa:true,sonido:false,severidad:"aviso"},
  {id:"energia",label:"Sobreconsumo energía",icon:"⚡",unit:"% desviac.",campo:"energPct",tipo:"max",valor:20,activa:true,sonido:false,severidad:"aviso"},
  {id:"ciclo_anom",label:"Ciclo anómalo",icon:"⚠️",unit:"% desviación",campo:"cicloDesv",tipo:"max",valor:20,activa:true,sonido:true,severidad:"critica"},
  {id:"trc_alto",label:"TRC demasiado alto",icon:"🧫",unit:"días",campo:"TRC",tipo:"max",valor:30,activa:true,sonido:false,severidad:"aviso"},
  {id:"trc_bajo",label:"TRC demasiado bajo",icon:"🧫",unit:"días",campo:"TRC",tipo:"min",valor:5,activa:true,sonido:true,severidad:"critica"},
];


// ── Cálculo desglose Hz soplante VSD ─────────────────────────────
const VSD = {
  // S4 (VSD-A) ZS4 45kW — escalones como % de 71.15Hz (frecuencia máx)
  s4: {
    nombre: "S4 VSD-A (ZS4 45kW)",
    hz_max: 71.15,
    escalones: [
      {pct:0.20, hz:66.2, kw:40.2, q:2470, label:"T1 (93% de 71.15Hz)"},
      {pct:0.40, hz:50.5, kw:25.5, q:1760, label:"T2 (71% de 71.15Hz)"},
      {pct:0.40, hz:40.6, kw:14.2, q:940,  label:"T3 (57% de 71.15Hz)"},
    ]
  },
  // Valores por defecto para cálculos (usando S4)
  escalones: [
      {pct:0.20, hz:66.2, kw:40.2, q:2470},
      {pct:0.40, hz:50.5, kw:25.5, q:1760},
      {pct:0.40, hz:40.6, kw:14.2, q:940},
  ],
  // S5 (VSD-B) ZS55+ — escalones como % de 134Hz (frecuencia máx)
  s5: {
    nombre: "S5 VSD-B (ZS55+)",
    hz_max: 134,
    escalones: [
      {pct:0.20, hz:100.5, kw:42.8, q:1786, label:"T1 (75% de 134Hz)"},
      {pct:0.40, hz:80.4,  kw:33.0, q:1472, label:"T2 (60% de 134Hz)"},
      {pct:0.40, hz:60.3,  kw:22.5, q:1158, label:"T3 (45% de 134Hz)"},
    ]
  },
  // Soplantes fijas S1, S2, S3
  kw_fija: 75.0,
  q_fija:  2940,

  min_fase: 35,
};
// Calcula desglose ciclo completo: 50% VSD + 50% Fija
function calcCiclo(minsTotal) {
  const mins = Math.max(Math.round(minsTotal||0), VSD.min_fase*2);
  const minsVSD  = Math.max(VSD.min_fase, Math.round(mins*0.5));
  const minsFija = Math.max(VSD.min_fase, mins - minsVSD);
  return { minsVSD, minsFija, minsTotal: minsVSD+minsFija };
}
function calcHzDesglose(mins) {
  if (!mins || mins <= 0) return null;
  return VSD.escalones.map(e => ({
    hz: e.hz, kw: e.kw, q: e.q,
    mins: +(mins * e.pct).toFixed(1),
    kwh:  +(mins * e.pct / 60 * e.kw).toFixed(2),
  }));
}
function calcKwhTotal(mins) {
  if (!mins) return null;
  const vsd = VSD.escalones.reduce((s,e) => s + mins*e.pct/60*e.kw, 0);
  const fija = mins/60 * VSD.kw_fija;
  return +((vsd + fija)).toFixed(2);
}

function HzDesgloseCard({mins, label, color}) {
  if (!mins) return null;
  const ciclo = calcCiclo(mins);
  const desglose = calcHzDesglose(ciclo.minsVSD);
  const kwhFija = +(ciclo.minsFija/60*VSD.kw_fija).toFixed(2);
  const kwhVSD  = desglose ? +desglose.reduce((s,e)=>s+e.kwh,0).toFixed(2) : 0;
  return (
    <div style={{background:"#fafafa",border:"1px solid #f0f0f0",borderRadius:12,padding:"12px 16px"}}>
      <div style={{fontSize:11,fontWeight:600,color:color||C.text,marginBottom:8}}>{label} — {mins} min</div>
      {/* Barra visual 50/50 */}
      <div style={{display:"flex",height:20,borderRadius:6,overflow:"hidden",marginBottom:8}}>
        <div style={{width:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:9,color:"#fff",fontWeight:700}}>VSD {ciclo.minsVSD}min</span>
        </div>
        <div style={{width:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:9,color:"#fff",fontWeight:700}}>Fija {ciclo.minsFija}min</span>
        </div>
      </div>
      {/* Desglose Hz fase VSD */}
      {desglose&&desglose.map(e=>(
        <div key={e.hz} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
          <div style={{width:38,textAlign:"center",background:e.hz===65?"#fef3c7":e.hz===50?"#dbeafe":"#f0fdf4",borderRadius:5,padding:"1px 0",fontSize:9,fontWeight:700,color:e.hz===65?C.amber:e.hz===50?C.blue:C.green,flexShrink:0}}>{e.hz}Hz</div>
          <div style={{flex:1,height:5,background:"#e8e8e8",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${e.pct*100}%`,height:"100%",background:e.hz===65?C.amber:e.hz===50?C.blue:C.green,borderRadius:3}}/>
          </div>
          <div style={{fontSize:9,color:C.muted,minWidth:100,textAlign:"right"}}><b style={{color:C.text}}>{e.mins}min</b> · <b style={{color:C.amber}}>{e.kwh}kWh</b></div>
        </div>
      ))}
      <div style={{borderTop:"1px solid #f0f0f0",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",fontSize:9}}>
        <span style={{color:C.muted}}>Fija {ciclo.minsFija}min @{VSD.kw_fija}kW = <b style={{color:C.blue}}>{kwhFija}kWh</b></span>
        <span style={{fontWeight:700,color:C.amber}}>Total: {+(kwhVSD+kwhFija).toFixed(2)} kWh</span>
      </div>
    </div>
  );
}

const SensaraLogo = ({size=36}) => (
  <svg width={size*1.5} height={size} viewBox="0 0 120 80" fill="none">
    <polygon points="30,4 58,4 72,28 58,52 30,52 16,28" fill="#c8e000" opacity="0.85"/>
    <polygon points="50,4 78,4 92,28 78,52 50,52 36,28" fill="#4a9c3f" opacity="0.85"/>
    <polygon points="40,28 68,28 82,52 68,76 40,76 26,52" fill="#6dba5f" opacity="0.75"/>
    <text x="16" y="44" fontFamily="system-ui,sans-serif" fontWeight="700" fontSize="18" fill="white" letterSpacing="-0.5">sensara</text>
  </svg>
);

// ── Parsers ────────────────────────────────────────────────────────
function parseNum(s) {
  if (s==null||s.toString().trim()==="") return null;
  const n = parseFloat(s.toString().trim().replace(",","."));
  return isNaN(n) ? null : n;
}
function parseDate(fecha, hora) {
  if (!fecha||!hora) return null;
  const f = fecha.trim();
  if (f.includes("/")) {
    const [d,m,y] = f.split("/");
    if (!d||!m||!y) return null;
    return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T${hora.trim()}`);
  }
  return new Date(`${f}T${hora.trim()}`);
}
function buildRows(records, reactor="R1") {
  const rows = [];
  for (const v of records) {
    const aur=parseNum(v["AUR"]), trc=parseNum(v["TRC"]);
    const mR=parseNum(v["Min Total Rea Sopl"]), mT=parseNum(v["Min Total Teo Sopl"]);
    if (!aur||aur<=0||aur>15) continue;
    if (!trc||trc<=0||trc>300) continue;
    if (!mR||mR<1||mR>3600) continue;
    if (!mT||mT<1||mT>10000) continue;
    if (mT>mR*20) continue;
    const fecha=String(v["Fecha"]||"").trim(), hora=String(v["Hora"]||"").trim();
    const dt = parseDate(fecha, hora);
    if (!dt||isNaN(dt)) continue;
    rows.push({
      reactor, AUR:aur, RN:parseNum(v["RN"])||0, TRC:trc, TRH:parseNum(v["TRH"])||0,
      minsReal:mR, minsTeo:mT, datetime:dt,
      label:`${fecha.slice(0,10)} ${hora.slice(0,5)}`,
      dilucion:parseNum(v["dilucion"])||0,
      temp:parseNum(v["temp"])||0, precip:parseNum(v["precip"])||0,
    });
  }
  return rows.sort((a,b) => a.datetime-b.datetime);
}
function parseCSV(raw, reactor="R1") {
  const lines = raw.trim().split("\n").filter(l=>l.trim());
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const hdr = lines[0].split(sep).map(h=>h.trim());
  const records = [];
  for (let i=1; i<lines.length; i++) {
    const v = lines[i].split(sep);
    const obj = {};
    hdr.forEach((h,j) => obj[h]=v[j]?.trim());
    records.push(obj);
  }
  return buildRows(records, reactor);
}
async function parseXLSX(buffer, reactor="R1") {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
  const wb = XLSX.read(buffer, {type:"array"});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return buildRows(XLSX.utils.sheet_to_json(ws, {raw:false,defval:""}), reactor);
}
function parseJSON(raw) { try { return JSON.parse(raw); } catch { return null; } }

// ── Demo generators ────────────────────────────────────────────────
function generarDemoData() {
  const rows = [], now = new Date();
  for (let i=399; i>=0; i--) {
    const dt = new Date(now.getTime() - i*102*60000);
    const hora = dt.getHours(), dia = Math.floor(i/14);
    const patron = 2.0 + 1.5*Math.sin((hora-8)*Math.PI/12);
    let aur = Math.max(0.3, Math.min(7, patron+(Math.random()-0.5)*0.3));
    let dilucion=0, precip=0;
    if (dia>=5&&dia<=6) { aur*=0.65; dilucion=1; precip=8+Math.random()*4; }
    const trc = Math.min(22, 6+dia*0.45+(Math.random()-0.5)*0.5);
    const minsOpt = Math.round(Math.max(30, Math.min(150, aur*25)));
    const minsReal = Math.round(minsOpt*(1.35+Math.random()*0.10));
    const minsTeo = Math.round(minsOpt*(1.08+Math.random()*0.04));
    rows.push({
      reactor:"DEMO", AUR:+aur.toFixed(3), RN:+((aur*0.3)+Math.random()*0.1).toFixed(3),
      TRC:+trc.toFixed(1), TRH:+(10+Math.random()*2).toFixed(1),
      minsReal, minsTeo, datetime:dt,
      label:`${dt.toLocaleDateString("es-ES")} ${dt.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`,
      dilucion, precip, temp:+(15+dia*0.2+Math.random()*3).toFixed(1),
    });
  }
  rows.at(-1).AUR = +(rows.at(-2).AUR*1.45).toFixed(3);
  rows.at(-1).minsReal = Math.round(rows.at(-1).minsReal*1.4);
  return rows;
}
function generarDemoPred(data) {
  const last = data.at(-1);
  const a1 = +(last.AUR*0.72).toFixed(3);
  return {
    generado: new Date().toISOString(), ultimo_dato: last.datetime.toISOString(),
    ultimo_aur: last.AUR, ultimo_mins: last.minsReal, duracion_media_min: 102,
    ciclos_por_horizonte: {"1c":1,"3c":3,"6h":4},
    predicciones: {
      "1c": {aur_pred:a1, mins_pred:Math.round(a1*20), trc_pred:+(last.TRC+0.3).toFixed(1), prob_dilucion:0.05, precip_mm_prev:0, temp_prev:22, ciclos:1, horas_eq:1.7},
      "3c": {aur_pred:+(a1*0.95).toFixed(3), mins_pred:Math.round(a1*19), trc_pred:+(last.TRC+0.8).toFixed(1), prob_dilucion:0.03, precip_mm_prev:0, temp_prev:21, ciclos:3, horas_eq:5.1},
      "6h": {aur_pred:+(a1*0.90).toFixed(3), mins_pred:Math.round(a1*18), trc_pred:+(last.TRC+1.5).toFixed(1), prob_dilucion:0.02, precip_mm_prev:0, temp_prev:20, ciclos:4, horas_eq:6.8},
      tox_prob: 0.06,
    },
    metricas: {"1c":{mape_aur:8.4,mape_mins:12.2,mape_trc:6.1},"3c":{mape_aur:11.8,mape_mins:18.5,mape_trc:9.3},"6h":{mape_aur:14.2,mape_mins:22.0,mape_trc:11.7}},
    meteo_actual: {temp:22, precip:0, viento:12, humedad:58},
  };
}
function generarDemoHistorico() {
  const now = new Date();
  return Array.from({length:200}, (_,i) => {
    const dt = new Date(now.getTime() - (200-i)*102*60000);
    const minsReal = Math.round(110 + Math.random()*40);
    const minsPred = Math.round(minsReal*0.65);
    const aur = +(1.5 + Math.random()*2).toFixed(3);
    return {
      ts_prediccion: new Date(dt.getTime()-5000).toISOString(),
      ultimo_dato_ts: dt.toISOString(),
      ultimo_aur: aur, ultimo_mins: minsReal, duracion_media_min: 102,
      ts_objetivo_1c: new Date(dt.getTime()+102*60000).toISOString(),
      pred_1c: {aur_pred:+(aur*0.97).toFixed(3), mins_pred:minsPred, prob_dilucion:0.04},
    };
  });
}
function generarDemoValidacion(data) {
  if (!data||!data.length) return [];
  return data.slice(20, Math.min(90,data.length)).map(d => {
    const err = (Math.random()-0.5)*0.1;
    const aurPred = +Math.max(0.1, d.AUR+err).toFixed(3);
    const errPct = +(Math.abs(aurPred-d.AUR)/d.AUR*100).toFixed(1);
    return {
      ts_obj:d.datetime, horizonte:"1c", aur_pred:aurPred, aur_real:+d.AUR.toFixed(3),
      mins_pred:Math.round(d.minsReal*0.65), mins_real:d.minsReal,
      err_aur_pct:errPct, acierto:errPct<=20, sesgo:+(aurPred-d.AUR).toFixed(3),
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────
function detectAnomalias(data, umbral=2.5) {
  if (!data||!data.length) return [];
  return data.map((d,i) => {
    const sl = data.slice(Math.max(0,i-10),i+1).map(x=>x.AUR);
    const mean = sl.reduce((s,v)=>s+v,0)/sl.length;
    const std = Math.sqrt(sl.reduce((s,v)=>s+(v-mean)**2,0)/sl.length)||0.001;
    return {...d, anomalia: Math.abs((d.AUR-mean)/std)>umbral};
  });
}
function linReg(pts) {
  const n = pts.length;
  if (n<2) return {m:0,b:0,r2:0};
  const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
  const sxx=pts.reduce((s,p)=>s+p.x**2,0), sxy=pts.reduce((s,p)=>s+p.x*p.y,0);
  const m = (n*sxy-sx*sy)/(n*sxx-sx**2)||0, b = (sy-m*sx)/n;
  const yM=sy/n, ssT=pts.reduce((s,p)=>s+(p.y-yM)**2,0), ssR=pts.reduce((s,p)=>s+(p.y-(m*p.x+b))**2,0);
  return {m:+m.toFixed(4), b:+b.toFixed(4), r2:ssT?+(1-ssR/ssT).toFixed(3):0};
}
function playAlertTone(type="warning") {
  try {
    const ctx = new(window.AudioContext||window.webkitAudioContext)();
    const freqs = type==="critical" ? [880,660,880,660] : [660,880];
    let t = ctx.currentTime;
    freqs.forEach(f => {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value=f; o.type="sine";
      g.gain.setValueAtTime(0.3,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
      o.start(t); o.stop(t+0.2); t+=0.25;
    });
    setTimeout(()=>ctx.close(), 2000);
  } catch {}
}
function evaluarAlertas(alertas, data, pred) {
  if (!data||!alertas.length) return [];
  const last = data.at(-1);
  const tR=data.reduce((s,d)=>s+d.minsReal,0), tT=data.reduce((s,d)=>s+d.minsTeo,0);
  const energPct = tT ? Math.abs((tR-tT)/tT*100) : 0;
  const aurPred1c = pred?.predicciones?.["1c"]?.aur_pred;
  const cicloDesv = aurPred1c&&last?.AUR ? Math.abs((last.AUR-aurPred1c)/aurPred1c*100) : 0;
  const vals = {AUR:last?.AUR||0, minsReal:last?.minsReal||0, TRC:last?.TRC||0, toxProb:(pred?.predicciones?.tox_prob||0)*100, energPct, cicloDesv};
  return alertas.filter(a=>a.activa).map(a => {
    const v = vals[a.campo];
    if (v==null) return null;
    return ((a.tipo==="min"&&v<a.valor)||(a.tipo==="max"&&v>a.valor)) ? {...a, valorActual:+v.toFixed(2)} : null;
  }).filter(Boolean);
}
function cruzarHistoricoConReal(historico, data) {
  if (!historico||!data) return [];
  return historico.map(e => {
    const tsObj = new Date(e.ts_objetivo_1c);
    if (isNaN(tsObj)) return null;
    const vecino = data.reduce((m,d) => { const diff=Math.abs(d.datetime-tsObj); return (!m||diff<Math.abs(m.datetime-tsObj))?d:m; }, null);
    if (!vecino||Math.abs(vecino.datetime-tsObj)/60000>90) return null;
    return {ts:tsObj, label:tsObj.toISOString().slice(5,16).replace("T"," "), minsPred:e.pred_1c?.mins_pred||0, minsReal:vecino.minsReal};
  }).filter(Boolean).sort((a,b)=>a.ts-b.ts);
}
function cruzarDemoDirecto(historico) {
  if (!historico) return [];
  return historico.map(e => ({
    ts: new Date(e.ultimo_dato_ts),
    label: new Date(e.ultimo_dato_ts).toISOString().slice(5,16).replace("T"," "),
    minsReal: e.ultimo_mins,
    minsPred: e.pred_1c?.mins_pred||0,
  }));
}
function calcularScore(data) {
  if (!data||!data.length) return null;
  const last = data.at(-1);
  const aur = last.AUR;
  const aurS = aur>=0.8&&aur<=5.0 ? 100 : aur<0.8 ? Math.max(0,aur/0.8*100) : Math.max(0,100-(aur-5.0)*20);
  const trc = last.TRC;
  const trcS = trc>=5&&trc<=15 ? 100 : trc<5 ? Math.max(0,trc/5*100) : Math.max(0,100-(trc-15)*8);
  const ult20 = data.slice(-20);
  const tR=ult20.reduce((s,d)=>s+d.minsReal,0), tT=ult20.reduce((s,d)=>s+d.minsTeo,0);
  const eficS = tT ? Math.min(100,Math.max(0,100-(tR-tT)/tT*100)) : 100;
  const hace24h = new Date(last.datetime.getTime()-24*3600*1000);
  const anom = detectAnomalias(data.filter(d=>d.datetime>=hace24h)).filter(d=>d.anomalia).length;
  const anomS = Math.max(0,100-anom*25);
  const global = Math.round(aurS*0.30+trcS*0.25+eficS*0.25+anomS*0.20);
  const estado = global>=80?"Excelente":global>=60?"Bueno":global>=40?"Mejorable":"Crítico";
  const color = global>=80?C.green:global>=60?C.greenLight:global>=40?C.amber:C.red;
  return {global, estado, color, scores:{aur:Math.round(aurS),trc:Math.round(trcS),efic:Math.round(eficS),anom:Math.round(anomS)}};
}
function diagnosticarCausa(data, pred, alertas) {
  if (!data||!pred||!alertas) return null;
  const last = data.at(-1);
  if (!last) return null;
  const aurPred = pred.predicciones?.["1c"]?.aur_pred;
  if (!aurPred) return null;
  const desv = (last.AUR-aurPred)/aurPred*100;
  const umbral = alertas.find(a=>a.id==="ciclo_anom")?.valor??20;
  if (Math.abs(desv)<umbral) return null;
  const causas = [], meteo = pred.meteo_actual;
  if (meteo?.precip>2) causas.push({texto:"Precipitación reciente — posible dilución del influente",icono:"🌧",color:C.blue});
  if (meteo?.temp<10)  causas.push({texto:"Temperatura baja — actividad bacteriana reducida",icono:"🌡",color:C.blue});
  if (meteo?.temp>28)  causas.push({texto:"Temperatura alta — posible estrés térmico en el fango",icono:"🌡",color:C.amber});
  const tend = data.slice(-6).map(d=>d.AUR);
  const tendVal = tend.at(-1)-tend[0];
  if (tendVal<-0.5&&!causas.length) causas.push({texto:"Caída sostenida sin causa meteorológica — revisar carga orgánica",icono:"📉",color:C.amber});
  if (tendVal>0.5&&!causas.length)  causas.push({texto:"Subida sostenida de AUR — posible aumento de carga",icono:"📈",color:C.amber});
  if (!causas.length) causas.push({texto:"Causa no identificada — revisar operación manual",icono:"🔍",color:C.muted});
  return {desv:+desv.toFixed(1), aurReal:last.AUR, aurPred, causas, umbral};
}

// ── UI primitives ──────────────────────────────────────────────────
function Badge({children,color}) {
  return <span style={{background:color+"12",color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,letterSpacing:"0.02em"}}>{children}</span>;
}
function KpiCard({label,value,unit,color,icon}) {
  return (
    <div style={{background:"#fff",borderRadius:16,padding:"20px 22px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f0f0f0"}}>
      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,fontWeight:500}}>{label}</div>
      <div style={{fontSize:28,fontWeight:700,color,lineHeight:1,marginBottom:6,letterSpacing:"-0.02em"}}>{value}</div>
      <div style={{fontSize:11,color:C.muted}}>{unit}</div>
    </div>
  );
}
function CT({active,payload,label}) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,boxShadow:"0 4px 20px rgba(0,0,0,0.10)"}}>
      <div style={{color:C.muted,marginBottom:6,fontSize:11}}>{label}</div>
      {payload.map((p,i) => p.value!=null && (
        <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:p.color,display:"inline-block"}}/>
          <span style={{color:C.muted}}>{p.name}:</span>
          <span style={{fontWeight:600}}>{typeof p.value==="number"?p.value.toFixed(2):p.value}</span>
        </div>
      ))}
    </div>
  );
}
function DropZone({onFile,onBinary,accept,label,sublabel,color,done}) {
  const [drag,setDrag] = useState(false);
  const ref = useRef();
  const handle = useCallback(file => {
    if (!file) return;
    if (file.name?.match(/\.xlsx?$/i)&&onBinary) { const r=new FileReader(); r.onload=e=>onBinary(e.target.result); r.readAsArrayBuffer(file); }
    else { const r=new FileReader(); r.onload=e=>onFile(e.target.result); r.readAsText(file); }
  }, [onFile,onBinary]);
  return (
    <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}} onClick={()=>ref.current.click()}
      style={{border:`2px dashed ${done?color:drag?color:C.border}`,borderRadius:10,background:done?color+"08":drag?color+"10":"#fafafa",padding:"16px",textAlign:"center",cursor:"pointer",transition:"all .2s"}}>
      <input ref={ref} type="file" accept={accept} style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
      <div style={{fontSize:18,marginBottom:4}}>{done?"✅":"📂"}</div>
      <div style={{fontSize:11,fontWeight:700,color:done?color:C.text,marginBottom:2}}>{label}</div>
      <div style={{fontSize:10,color:C.muted}}>{sublabel}</div>
    </div>
  );
}
function DemoBanner({onExit}) {
  return (
    <div style={{background:"linear-gradient(135deg,#4a9c3f,#1565c0)",borderRadius:10,padding:"12px 20px",marginBottom:14,display:"flex",alignItems:"center",gap:16,color:"#fff"}}>
      <span style={{fontSize:22}}>🎬</span>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:800}}>Modo Demo — SENSARA SICAIR 3.0</div>
        <div style={{fontSize:11,opacity:0.85}}>Datos sintéticos · Planta 50.000 he · Dilución, TRC fuera de rango, ciclo anómalo y ahorro real</div>
      </div>
      <button onClick={onExit} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✕ Salir demo</button>
    </div>
  );
}

// ── Panels ─────────────────────────────────────────────────────────
function MeteoPanel() {
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"14px 22px",marginBottom:20,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>🌤</span>
        <div><div style={{fontSize:12,fontWeight:700,color:C.blue}}>Meteorología — Martorell</div><div style={{fontSize:11,color:C.muted}}>Datos en tiempo real en AEMET</div></div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <a href="https://www.aemet.es/es/eltiempo/prediccion/municipios/martorell-id08114" target="_blank" rel="noreferrer" style={{background:C.blue,color:"#fff",borderRadius:8,padding:"8px 18px",fontSize:12,fontWeight:700,textDecoration:"none"}}>🌐 AEMET →</a>
        <a href="https://www.eltiempo.es/martorell.html" target="_blank" rel="noreferrer" style={{background:"#fff",color:C.blue,border:`1px solid ${C.blue}`,borderRadius:8,padding:"8px 18px",fontSize:12,fontWeight:700,textDecoration:"none"}}>🌤 eltiempo.es →</a>
      </div>
    </div>
  );
}

function calcularDatoCongelado(pred, umbralHoras = 2.5) {
  if (!pred?.ultimo_dato) return null;
  const ultimo = new Date(pred.ultimo_dato);
  if (isNaN(ultimo)) return null;
  const horas = (Date.now() - ultimo.getTime()) / 3600000;
  if (horas < umbralHoras) return null;
  return { horas: +horas.toFixed(1), ultimo };
}

function DatoCongeladoBanner({ pred }) {
  const cong = calcularDatoCongelado(pred);
  if (!cong) return null;
  return (
    <div style={{
      background: C.redFade, border: `2px solid ${C.red}`, borderRadius: 10,
      padding: "14px 20px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14,
    }}>
      <span style={{ fontSize: 24 }}>🥶</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.red }}>
          Dato congelado — sin lecturas nuevas del SN8
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          Último dato: <b>{cong.ultimo.toLocaleString("es-ES")}</b> · hace <b>{cong.horas}h</b>. Revisa el SN8 / MySQL nitrificacion1.
        </div>
      </div>
    </div>
  );
}

function ScoreSalud({data}) {
  if (!data||!data.length) return null;
  const s = calcularScore(data);
  if (!s) return null;
  const items = [
    {label:"AUR",icon:"🔬",valor:s.scores.aur},
    {label:"TRC",icon:"🧫",valor:s.scores.trc},
    {label:"Efic. soplante",icon:"💨",valor:s.scores.efic},
    {label:"Estabilidad",icon:"📊",valor:s.scores.anom},
  ];
  const circum = 2*Math.PI*36;
  const offset = circum*(1-s.global/100);
  return (
    <div style={{background:"#fff",borderRadius:16,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:24,flexWrap:"wrap",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f0f0f0"}}>
      <div style={{textAlign:"center",flexShrink:0,width:90}}>
        <svg width={90} height={90} style={{transform:"rotate(-90deg)"}}>
          <circle cx={45} cy={45} r={36} fill="none" stroke={C.gridLine} strokeWidth={8}/>
          <circle cx={45} cy={45} r={36} fill="none" stroke={s.color} strokeWidth={8} strokeDasharray={circum} strokeDashoffset={offset} strokeLinecap="round"/>
        </svg>
        <div style={{marginTop:-68,fontSize:22,fontWeight:900,color:s.color,fontFamily:"monospace"}}>{s.global}</div>
        <div style={{fontSize:10,color:C.muted,marginTop:42}}>/ 100</div>
        <div style={{fontSize:12,fontWeight:700,color:s.color,marginTop:2}}>{s.estado}</div>
      </div>
      <div style={{flex:1,display:"grid",gap:8,minWidth:180}}>
        {items.map(({label,icon,valor}) => {
          const c = valor>=80?C.green:valor>=60?C.greenLight:valor>=40?C.amber:C.red;
          return (
            <div key={label}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                <span style={{color:C.muted}}>{icon} {label}</span>
                <span style={{fontWeight:700,color:c,fontFamily:"monospace"}}>{valor}</span>
              </div>
              <div style={{height:6,background:C.gridLine,borderRadius:3,overflow:"hidden"}}>
                <div style={{width:`${valor}%`,height:"100%",background:c,borderRadius:3}}/>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{fontSize:11,color:C.muted,maxWidth:160,lineHeight:1.6}}>Score calculado sobre AUR, TRC, eficiencia de soplante y estabilidad de ciclos recientes.</div>
    </div>
  );
}

function Semaforo({data,pred,toxUmbral,alertasDisparadas,alertas}) {
  if (!data||!data.length) return null;
  const last=data.at(-1), toxProb=(pred?.predicciones?.tox_prob||0)*100, aur=last?.AUR||0;
  const diag = diagnosticarCausa(data,pred,alertas);
  const trc=last?.TRC||0, trcFuera=trc<5||trc>15;
  let estado="verde", msg="Sistema operando correctamente";
  if (alertasDisparadas?.some(a=>a.severidad==="critica")||toxProb>toxUmbral||diag) {
    estado="rojo";
    msg = diag ? `⚠️ Ciclo anómalo — desviación ${diag.desv>0?"+":""}${diag.desv}%` : alertasDisparadas?.find(a=>a.severidad==="critica")?.label||"⚠️ Alerta crítica";
  } else if (alertasDisparadas?.length>0||aur<1.0||trcFuera) {
    estado="ambar";
    msg = trcFuera ? `🧫 TRC fuera de rango (${trc.toFixed(1)}d)` : alertasDisparadas?.[0]?.label||"Vigilancia";
  }
  const col = {verde:C.green,ambar:C.yellow,rojo:C.red}[estado];
  return (
    <div style={{background:"#fff",borderRadius:16,padding:"20px 28px",display:"flex",alignItems:"center",gap:24,marginBottom:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f0f0f0"}}>
      <div style={{width:12,height:12,borderRadius:"50%",background:col,boxShadow:`0 0 0 4px ${col}22`,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:600,color:col,marginBottom:6,letterSpacing:"-0.01em"}}>{msg}</div>
        <div style={{display:"flex",gap:20,fontSize:12,color:C.muted,flexWrap:"wrap"}}>
          <span>AUR <b style={{color:C.text,fontWeight:600}}>{aur.toFixed(2)}</b> mg O₂/L·h</span>
          <span>TRC <b style={{color:trcFuera?trc<5?C.red:C.amber:C.text,fontWeight:600}}>{trc.toFixed(1)}</b> d</span>
          <span>SICTOX <b style={{color:C.text,fontWeight:600}}>{toxProb.toFixed(1)}%</b></span>
          {alertasDisparadas?.length>0&&<span>Alertas <b style={{color:C.red,fontWeight:600}}>{alertasDisparadas.length}</b></span>}
        </div>
      </div>
      <Badge color={col}>{estado.toUpperCase()}</Badge>
    </div>
  );
}

function DiagnosticoPanel({data,pred,alertas,trcMin=5,trcMax=15}) {
  if (!data?.length||!pred) return null;
  const last = data.at(-1);
  const diag = diagnosticarCausa(data,pred,alertas);
  const trc = last.TRC, trcAlerta = trc<trcMin||trc>trcMax;
  const trcColor = trc<trcMin?C.red:trc>trcMax?C.amber:C.green;
  const trcPreds = ["1c","3c","6h"].map(h=>({h,val:pred.predicciones?.[h]?.trc_pred})).filter(p=>p.val!=null);
  const trcSalida = trcPreds.find(p=>p.val<trcMin||p.val>trcMax);
  if (!diag&&!trcAlerta&&!trcSalida) return null;
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>🔍 Diagnóstico Automático</div>
      {diag && (
        <div style={{background:C.redFade,border:`1.5px solid ${C.red}`,borderRadius:10,padding:"14px 18px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.red}}>Ciclo anómalo detectado</div>
              <div style={{fontSize:12,color:C.muted}}>AUR real <b style={{color:C.text}}>{diag.aurReal.toFixed(2)}</b> vs predicho <b style={{color:C.text}}>{diag.aurPred.toFixed(2)}</b> — desviación <b style={{color:C.red}}>{diag.desv>0?"+":""}{diag.desv}%</b></div>
            </div>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:6}}>Causa probable:</div>
          {diag.causas.map((c,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#fff",borderRadius:6,marginBottom:4,border:`1px solid ${c.color}44`}}>
              <span style={{fontSize:16}}>{c.icono}</span>
              <span style={{fontSize:12,color:c.color,fontWeight:600}}>{c.texto}</span>
            </div>
          ))}
        </div>
      )}
      {trcAlerta && (
        <div style={{background:trcColor+"10",border:`1.5px solid ${trcColor}`,borderRadius:10,padding:"14px 18px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🧫</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:trcColor}}>{trc<trcMin?`TRC = ${trc.toFixed(1)}d — por debajo del mínimo. Riesgo de lavado de fango.`:`TRC = ${trc.toFixed(1)}d — por encima del máximo. Fango envejecido.`}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>{trc<trcMin?"Considera reducir la purga de fango.":"Considera aumentar la purga de fango."}</div>
            </div>
            <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:trcColor,fontFamily:"monospace"}}>{trc.toFixed(1)}</div><div style={{fontSize:10,color:C.muted}}>días</div></div>
          </div>
        </div>
      )}
      {trcSalida&&!trcAlerta && (
        <div style={{background:C.amberFade,border:`1.5px solid ${C.amber}`,borderRadius:10,padding:"14px 18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🔮</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.amber}}>TRC saldrá del rango óptimo en +{trcSalida.h}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>Predicción: <b style={{color:C.text}}>{trcSalida.val.toFixed(1)}d</b> · rango óptimo: {trcMin}–{trcMax}d.</div>
            </div>
            <div style={{textAlign:"center",marginLeft:"auto"}}><div style={{fontSize:24,fontWeight:900,color:C.amber,fontFamily:"monospace"}}>{trcSalida.val.toFixed(1)}</div><div style={{fontSize:10,color:C.muted}}>días pred.</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function useLluviaPrevista() {
  const [lluvia,setLluvia] = useState(null);
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=41.4773&longitude=2.0932&hourly=precipitation&forecast_days=2&timezone=Europe%2FMadrid")
      .then(r=>r.json()).then(d => {
        const times=d.hourly?.time||[], prec=d.hourly?.precipitation||[], now=new Date();
        const sumH = h => { let s=0; times.forEach((t,i)=>{ const diff=(new Date(t)-now)/3600000; if(diff>=0&&diff<=h) s+=prec[i]||0; }); return+s.toFixed(2); };
        setLluvia({h6:sumH(6),h12:sumH(12),h24:sumH(24),ok:true});
      }).catch(()=>setLluvia({ok:false}));
  }, []);
  return lluvia;
}

// Estado en tiempo (casi) real del modo de la depuradora (%MW1624), leído por
// sicair_predict.py cada hora y volcado a modo_historico.json en GitHub.
function useModoDepuradora() {
  const [modo,setModo] = useState(null);
  const [historico,setHistorico] = useState([]);
  const cargar = useCallback(() => {
    fetch("https://raw.githubusercontent.com/jmochoa74/sicair-martorell/main/modo_historico.json?t="+Date.now())
      .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
      .then(arr => {
        if (!Array.isArray(arr)||!arr.length) { setModo({ok:false}); return; }
        const ultimo = arr[arr.length-1];
        setModo({ok:true, modo:ultimo.modo, label:ultimo.modo_label, ts:ultimo.ts});
        setHistorico(arr);
      }).catch(()=>setModo({ok:false}));
  }, []);
  useEffect(() => { cargar(); const iv=setInterval(cargar,10*60000); return()=>clearInterval(iv); }, [cargar]);
  return {modo, historico};
}
function ModoDepuradoraBadge({modo}) {
  if (!modo?.ok) return null;
  const esSN8 = modo.modo===1;
  const col = esSN8?C.green:C.amber;
  const antig = modo.ts ? Math.round((Date.now()-new Date(modo.ts))/3600000) : null;
  return (
    <span title={antig!=null?`Desde hace ~${antig}h (${modo.ts?.slice(0,16).replace("T"," ")})`:""} style={{background:col+"18",color:col,border:`1px solid ${col}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}>
      {esSN8?"🔬":"🧪"} Modo {esSN8?"SN8":"Sondas"}
    </span>
  );
}

// Estado del modo recuperación (recovery.json), consultado con el mismo
// token que usa RecoveryPanel para activar/desactivar — visible de un
// vistazo en la cabecera, sin tener que entrar en Incidencias > Recovery.
function useRecoveryEstado() {
  const [estado, setEstado] = useState(null);
  const cargar = useCallback(() => { leerRecovery().then(setEstado); }, []);
  useEffect(() => { cargar(); const iv=setInterval(cargar,2*60000); return()=>clearInterval(iv); }, [cargar]);
  return estado;
}
function RecoveryBadge({estado}) {
  if (!estado) return null;
  const col = estado.activo ? C.amber : C.green;
  return (
    <span title={estado.activo?`+30% aireación · ${estado.ciclos} ciclos restantes`:"Aireación normal"} style={{background:col+"18",color:col,border:`1px solid ${col}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}>
      {estado.activo?`🔄 Recovery ACTIVO (${estado.ciclos})`:"✅ Recovery inactivo"}
    </span>
  );
}

const UMBRAL_MM=2, FACTOR_DIL=0.30;
function corregirLluvia(aurPred,minsPred,mm) {
  if (mm==null||mm<UMBRAL_MM) return {aurCorr:aurPred,minsCorr:minsPred,dilucion:false};
  return {aurCorr:+(aurPred*(1-FACTOR_DIL)).toFixed(3),minsCorr:+(minsPred*(1-FACTOR_DIL)).toFixed(0),dilucion:true,mm};
}

function PredPanel({pred,toxUmbral,data}) {
  if (!pred) return null;
  const p=pred.predicciones, m=pred.metricas;
  const toxPct = ((p.tox_prob||0)*100).toFixed(1);
  const toxColor = p.tox_prob>toxUmbral/100?C.red:p.tox_prob>(toxUmbral/100)*0.5?C.amber:C.green;
  const lluvia = useLluviaPrevista();
  const trhActual = data?.at(-1)?.TRH??null;
  const durH = data&&data.length>2 ? (()=>{ const diffs=data.slice(1).map((d,i)=>(d.datetime-data[i].datetime)/3600000).filter(x=>x>=1&&x<=3); return diffs.length?diffs.reduce((s,v)=>s+v,0)/diffs.length:1.6; })() : 1.6;
  const HORZ = [{key:"1c",label:"+1 ciclo",desc:`~${Math.round(durH*60)} min`},{key:"3c",label:"+3 ciclos",desc:`~${Math.round(durH*3*60)} min`},{key:"6h",label:"+6h",desc:`~${Math.round(6/durH)} ciclos`}];
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>🧠 Predicciones SICAIR</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Último dato: <b>{pred.ultimo_dato?.slice(0,16)}</b> · AUR: <b style={{color:C.green}}>{pred.ultimo_aur?.toFixed(2)} mg/L·h</b>{trhActual!=null&&<> · TRH: <b>{trhActual.toFixed(1)}h</b></>}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>SICTOX</div>
          <div style={{fontSize:24,fontWeight:800,color:toxColor,fontFamily:"monospace"}}>{toxPct}%</div>
          <Badge color={toxColor}>{p.tox_prob>(toxUmbral/100)?"⚠️ ALERTA":p.tox_prob>(toxUmbral/100)*0.5?"Vigilancia":"Normal"}</Badge>
        </div>
      </div>
      {lluvia?.ok && (
        <div style={{background:lluvia.h24>=UMBRAL_MM?C.blueFade:"#f0fdf4",border:`1.5px solid ${lluvia.h24>=UMBRAL_MM?C.blue:C.green}`,borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20}}>{lluvia.h24>=UMBRAL_MM?"🌧":"☀️"}</span>
          <div style={{flex:1,fontSize:12,fontWeight:700,color:lluvia.h24>=UMBRAL_MM?C.blue:C.green}}>{lluvia.h24>=UMBRAL_MM?"Lluvia prevista — estimaciones corregidas −30%":"Sin lluvia prevista"}</div>
          <div style={{display:"flex",gap:8}}>
            {[{h:"6h",mm:lluvia.h6},{h:"12h",mm:lluvia.h12},{h:"24h",mm:lluvia.h24}].map(({h,mm})=>(
              <div key={h} style={{textAlign:"center",background:"#fff",borderRadius:6,padding:"4px 8px",border:`1px solid ${mm>=UMBRAL_MM?C.blue:C.border}`}}>
                <div style={{fontSize:9,color:C.muted}}>+{h}</div>
                <div style={{fontSize:13,fontWeight:800,color:mm>=UMBRAL_MM?C.blue:C.muted,fontFamily:"monospace"}}>{mm}mm</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {HORZ.map(({key,label,desc}) => {
          const mm = lluvia?.ok?lluvia.h6:null;
          const c = corregirLluvia(p[key]?.aur_pred??0, p[key]?.mins_pred??0, mm);
          const dil = (p[key]?.dilucion_activa===true)||c.dilucion;
          return (
            <div key={key} style={{background:"#fff",border:`1.5px solid ${dil?C.blue:C.border}`,borderRadius:8,padding:"14px 16px",position:"relative"}}>
              {dil&&<div style={{position:"absolute",top:8,right:8}}><Badge color={C.blue}>🌧</Badge></div>}
              <div style={{marginBottom:8}}><div style={{fontSize:13,fontWeight:800}}>{label}</div><div style={{fontSize:10,color:C.muted}}>{desc}</div></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                <div><div style={{fontSize:10,color:C.muted}}>AUR</div><div style={{fontSize:18,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{c.aurCorr.toFixed(2)}</div><div style={{fontSize:10,color:C.muted}}>mg/L·h</div></div>
                <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted}}>Soplante</div><div style={{fontSize:18,fontWeight:800,color:C.amber,fontFamily:"monospace"}}>{c.minsCorr||"—"}</div><div style={{fontSize:10,color:C.muted}}>min/ciclo</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:10,color:C.muted}}>TRC</div><div style={{fontSize:18,fontWeight:800,color:C.purple,fontFamily:"monospace"}}>{p[key]?.trc_pred?.toFixed(1)||"—"}</div><div style={{fontSize:10,color:C.muted}}>días</div></div>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {m?.[key]?.mape_aur!=null&&<Badge color={C.green}>AUR {m[key].mape_aur}%</Badge>}
                {m?.[key]?.mape_mins!=null&&<Badge color={C.amber}>Min {m[key].mape_mins}%</Badge>}
                {m?.[key]?.mape_trc!=null&&<Badge color={C.purple}>TRC {m[key].mape_trc}%</Badge>}
                {p[key]?.prob_dilucion!=null&&<Badge color={C.blue}>💧 {(p[key].prob_dilucion*100).toFixed(0)}%</Badge>}
              </div>
            </div>
          );
        })}
      </div>
      {/* Desglose Hz por horizonte */}
      <div style={{marginTop:16}}>
        <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:10}}>⚡ Estimación consumo soplante por Hz</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {HORZ.map(({key,label})=>(
            <HzDesgloseCard key={key} mins={p[key]?.mins_pred} label={`SICAIR ${label}`} color={C.green}/>
          ))}
        </div>
        <div style={{fontSize:10,color:C.muted,marginTop:8}}>Distribución estimada: 20% a 65Hz · 40% a 50Hz · 40% a 40Hz · 2 soplantes fijas + 2 VSD</div>
      </div>
    </div>
  );
}

// ¿Hay un evento "recovery_auto" en diagnosticos_historico.json a menos de
// `ventanaMin` minutos de este ciclo? (los diagnósticos se registran cada
// ciclo del predict, ~100min, así que medio ciclo de margen los empareja)
function eventoRecoveryCercano(dt, diagHistorico, ventanaMin=50) {
  if (!dt||!diagHistorico?.length) return false;
  return diagHistorico.some(e => {
    if (!e.eventos?.some(ev=>ev.tipo==="recovery_auto")) return false;
    return Math.abs(new Date(e.ts)-dt)/60000 <= ventanaMin;
  });
}
// Modo (sn8/sondas) vigente en una fecha, según las transiciones de modo_historico.json
function modoEnFecha(dt, modoHistorico) {
  if (!dt||!modoHistorico?.length) return null;
  let last = null;
  for (const m of modoHistorico) { if (new Date(m.ts) <= dt) last = m; else break; }
  return last?.modo_label ?? null;
}
// Tramos contiguos en modo sondas dentro de la ventana visible del gráfico,
// como {x1,x2} en las mismas categorías (label) que usa el eje X.
function rangosSondas(hist, modoHistorico) {
  const ranges = []; let start = null;
  for (let i=0;i<hist.length;i++) {
    const enSondas = modoEnFecha(hist[i].datetime, modoHistorico)==="sondas";
    if (enSondas && start===null) start=i;
    if (!enSondas && start!==null) { ranges.push({x1:hist[start].label,x2:hist[i-1].label}); start=null; }
  }
  if (start!==null) ranges.push({x1:hist[start].label,x2:hist[hist.length-1].label});
  return ranges;
}

function HistoricoChart({data,pred,diagHistorico,modoHistorico}) {
  if (!data||!data.length) return null;
  const dA = detectAnomalias(data);
  const hist = dA.slice(-60).map((d,i)=>({
    label:d.label, datetime:d.datetime, aur:d.AUR,
    anomalia:d.anomalia?d.AUR:null,
    dilucion:d.dilucion>0?d.AUR:null,
    recovery:eventoRecoveryCercano(d.datetime,diagHistorico)?d.AUR:null,
    idx:i,
  }));
  const sondasRanges = rangosSondas(hist, modoHistorico);
  const reg = linReg(hist.map((d,i)=>({x:i,y:d.aur})));
  const histR = hist.map((d,i)=>({...d,tendencia:+(reg.m*i+reg.b).toFixed(3)}));
  const p=pred?.predicciones, last=hist.at(-1);
  const predPts = p&&last ? [{label:"+0",aur:last.aur},{label:"+1c",aurPred:p["1c"]?.aur_pred},{label:"+3c",aurPred:p["3c"]?.aur_pred},{label:"+6h",aurPred:p["6h"]?.aur_pred}] : [];
  const combined = [...histR,...predPts.slice(1)];
  const nAnom = dA.filter(d=>d.anomalia).length;
  // Datos de minutos para gráfica
  const histMins = dA.slice(-60).map(d=>({label:d.label, minsReal:d.minsReal, minsTeo:d.minsTeo||null}));
  const predMinsPts = p&&last ? [{label:"+0",minsReal:data.at(-1)?.minsReal},{label:"+1c",minsPred:p["1c"]?.mins_pred},{label:"+3c",minsPred:p["3c"]?.mins_pred},{label:"+6h",minsPred:p["6h"]?.mins_pred}] : [];
  const combinedMins = [...histMins,...predMinsPts.slice(1)];

  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:13,fontWeight:700}}>📈 Histórico + Predicciones</div>
        <div style={{display:"flex",gap:8}}>{nAnom>0&&<Badge color={C.red}>⚠️ {nAnom} anomalías</Badge>}<Badge color={reg.m>0?C.amber:C.green}>Tendencia {reg.m>0?"↑":"↓"} R²={reg.r2}</Badge></div>
      </div>
      <div style={{fontSize:11,color:C.muted,marginBottom:8}}>🔴 Anomalías · 🔵 Dilución · 🟠 Recovery · ⬜ fondo = modo sondas · — — Pred.</div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={combined} margin={{top:4,right:8,bottom:4,left:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
          <XAxis dataKey="label" tick={{fontSize:9,fill:C.muted}} interval={Math.floor(combined.length/8)} angle={-20} textAnchor="end" height={36}/>
          <YAxis domain={[0,6]} tick={{fontSize:9,fill:C.muted}}/><Tooltip content={<CT/>}/>
          {sondasRanges.map((r,i)=><ReferenceArea key={`sonda${i}`} x1={r.x1} x2={r.x2} fill={C.muted} fillOpacity={0.16} strokeOpacity={0} ifOverflow="visible"/>)}
          <Line dataKey="aur" stroke={C.green} strokeWidth={2} dot={false} name="AUR real" connectNulls/>
          <Line dataKey="anomalia" stroke={C.red} strokeWidth={0} dot={{r:5,fill:C.red}} name="Anomalía" connectNulls/>
          <Line dataKey="dilucion" stroke={C.blue} strokeWidth={0} dot={{r:5,fill:C.blue}} name="Dilución" connectNulls/>
          <Line dataKey="recovery" stroke={C.amber} strokeWidth={0} dot={{r:5,fill:C.amber,stroke:"#fff",strokeWidth:1}} name="Recovery" connectNulls/>
          <Line dataKey="aurPred" stroke={C.green} strokeWidth={2} strokeDasharray="6 3" dot={{r:5,fill:C.green}} name="AUR pred." connectNulls/>
          <Line dataKey="tendencia" stroke={C.amber} strokeWidth={1} strokeDasharray="3 3" dot={false} name="Tendencia" connectNulls/>
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{fontSize:12,fontWeight:600,color:C.muted,margin:"14px 0 6px"}}>💨 Minutos soplante — Fase VSD (inicial) + Fase Fija (final)</div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={histMins.map(d=>({
          label: d.label,
          minsVSD:  d.minsReal ? Math.round(d.minsReal*0.5) : null,
          minsFija: d.minsReal ? Math.round(d.minsReal*0.5) : null,
          minsPredTotal: d.minsPred || null,
        }))} margin={{top:4,right:8,bottom:4,left:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
          <XAxis dataKey="label" tick={{fontSize:9,fill:C.muted}} interval={Math.floor(histMins.length/8)} angle={-20} textAnchor="end" height={36}/>
          <YAxis domain={[0,180]} tick={{fontSize:9,fill:C.muted}} unit=" min"/>
          <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>
          <Bar dataKey="minsVSD"  stackId="real" fill={C.green} name="VSD inicial" radius={[0,0,0,0]}/>
          <Bar dataKey="minsFija" stackId="real" fill={C.blue}  name="Fija final"  radius={[3,3,0,0]}/>
          <Line dataKey="minsPredTotal" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3" dot={false} name="Total pred. SICAIR" connectNulls/>
        </ComposedChart>
      </ResponsiveContainer>
      {/* Desglose Hz último ciclo vs predicción */}
      {data&&data.length>0&&(
        <div style={{marginTop:16}}>
          <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:10}}>⚡ Desglose Hz — último ciclo real vs SICAIR +1c</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <HzDesgloseCard mins={data.at(-1)?.minsReal} label="Real último ciclo" color={C.amber}/>
            <HzDesgloseCard mins={pred?.predicciones?.["1c"]?.mins_pred} label="SICAIR +1c" color={C.green}/>
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:6}}>Estimación: 20% a 65Hz · 40% a 50Hz · 40% a 40Hz · 2 fijas ({VSD.kw_fija}kW) + 2 VSD</div>
        </div>
      )}
    </div>
  );
}

function CorrelacionPanel({data}) {
  if (!data||!data.length) return null;
  const pts = data.filter(d=>d.temp>0).map(d=>({x:d.temp,y:d.AUR}));
  if (pts.length<5) return <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px",marginBottom:14}}><div style={{fontSize:12,color:C.muted}}>Sin datos de temperatura en el CSV.</div></div>;
  const reg = linReg(pts.map(p=>({x:p.x,y:p.y})));
  const xMin=Math.min(...pts.map(p=>p.x)), xMax=Math.max(...pts.map(p=>p.x));
  const ld = [{x:xMin,y:+(reg.m*xMin+reg.b).toFixed(3)},{x:xMax,y:+(reg.m*xMax+reg.b).toFixed(3)}];
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700}}>🔬 Correlación AUR vs Tª</div>
        <div style={{display:"flex",gap:8}}><Badge color={C.purple}>R² = {reg.r2}</Badge><Badge color={C.blue}>{pts.length} pts</Badge></div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart margin={{top:8,right:16,bottom:16,left:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
          <XAxis dataKey="x" type="number" domain={[xMin-2,xMax+2]} tick={{fontSize:9,fill:C.muted}}/>
          <YAxis type="number" domain={[0,6]} tick={{fontSize:9,fill:C.muted}}/>
          <Tooltip formatter={(v,n)=>[v?.toFixed(3),n]}/>
          <Scatter data={pts} fill={C.green} opacity={0.65} name="Ciclos"/>
          <Line data={ld} dataKey="y" stroke={C.red} strokeWidth={2} dot={false} name="Regresión"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AhorroPanel({data,pred,historico,demoMode}) {
  if (!data||!data.length) return null;
  const tR=data.reduce((s,d)=>s+d.minsReal,0), tT=data.reduce((s,d)=>s+d.minsTeo,0);
  const ah=tR-tT, kwh=+(ah/60*7.5).toFixed(0), eur=+(kwh*0.15).toFixed(0), pct=+((ah/tR)*100).toFixed(1);
  const cruces = demoMode ? cruzarDemoDirecto(historico) : cruzarHistoricoConReal(historico,data);
  const tRs=cruces.reduce((s,c)=>s+c.minsReal,0), tPs=cruces.reduce((s,c)=>s+c.minsPred,0);
  const ahS=tRs-tPs, pctS=tRs?+((ahS/tRs)*100).toFixed(1):0;
  const KW=demoMode?55:7.5, EKW=demoMode?0.12:0.15;
  const kwhS=+(ahS/60*KW).toFixed(0), eurS=+(kwhS*EKW).toFixed(0);
  const sem = {};
  data.forEach(d => {
    const s = `S${Math.ceil((d.datetime-new Date(d.datetime.getFullYear(),0,1))/(7*86400000))}`;
    if (!sem[s]) sem[s]={sem:s,real:0,teo:0};
    sem[s].real+=d.minsReal; sem[s].teo+=d.minsTeo;
  });
  const MINIMO=10,FIABLE=50,n=cruces.length,pct2=Math.min(100,Math.round(n/FIABLE*100));
  const col2=n>=FIABLE?C.green:n>=MINIMO?C.amber:C.muted;
  const msg2=n>=FIABLE?"✅ Estadística fiable":n>=MINIMO?`Acumulando — faltan ${FIABLE-n} ciclos`:n>0?`Inicio — faltan ${MINIMO-n} ciclos`:"Pendiente de acumular ciclos";
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div><div style={{fontSize:14,fontWeight:700}}>💰 Ahorro Energético vs SICAIR</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>Minutos reales planta vs predicción SICAIR +1c · {cruces.length} ciclos</div></div>
        <Badge color={col2}>{n}/{FIABLE} ciclos</Badge>
      </div>
      {cruces.length>0 ? (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
            <KpiCard label="Min sobreaireo" value={ahS>0?`+${ahS.toLocaleString()}`:ahS.toLocaleString()} unit="min total" color={ahS>0?C.amber:C.green} icon="⏱"/>
            <KpiCard label="Energía" value={Math.abs(kwhS).toLocaleString()} unit="kWh" color={C.blue} icon="⚡"/>
            <KpiCard label="Impacto €" value={`${Math.abs(eurS).toLocaleString()} €`} unit={`@${EKW}€/kWh · ${KW}kW`} color={ahS>0?C.green:C.amber} icon="💶"/>
            <KpiCard label="Reducción" value={`${Math.abs(pctS)}%`} unit={`${cruces.length} ciclos`} color={ahS>0?C.green:C.amber} icon="📊"/>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={cruces.slice(-40)} margin={{top:4,right:8,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
              <XAxis dataKey="label" tick={{fontSize:9,fill:C.muted}} interval={Math.floor(Math.min(cruces.length,40)/6)} angle={-20} textAnchor="end" height={36}/>
              <YAxis tick={{fontSize:9,fill:C.muted}}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
              <Area dataKey="minsReal" fill={C.redFade} stroke={C.red} strokeWidth={2} dot={false} name="Real" connectNulls/>
              <Line dataKey="minsPred" stroke={C.green} strokeWidth={2} strokeDasharray="5 3" dot={{r:3,fill:C.green}} name="SICAIR +1c" connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div style={{background:C.amberFade,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"16px 20px",fontSize:13,color:C.amber,marginBottom:16}}>⏳ Acumulando ciclos de validación — disponible con {MINIMO}+ ciclos.</div>
      )}
      <div style={{marginTop:12,background:"#fff",border:`1.5px solid ${col2}44`,borderRadius:8,padding:"12px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:12,fontWeight:700,color:col2}}>{msg2}</div>
          <div style={{fontSize:12,fontWeight:800,color:col2,fontFamily:"monospace"}}>{n} / {FIABLE}</div>
        </div>
        <div style={{height:8,background:C.gridLine,borderRadius:4,overflow:"hidden"}}><div style={{width:`${pct2}%`,height:"100%",background:col2,borderRadius:4,transition:"width .4s"}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.muted}}><span>0</span><span style={{color:C.amber}}>mínimo ({MINIMO})</span><span style={{color:C.green}}>fiable ({FIABLE})</span></div>
      </div>
    </div>
  );
}

function ComparativaPanel({data}) {
  if (!data||data.length<2) return null;
  const ahora=data.at(-1)?.datetime, h7=new Date(ahora-7*24*3600*1000), h14=new Date(ahora-14*24*3600*1000);
  const eS=data.filter(d=>d.datetime>=h7), aS=data.filter(d=>d.datetime>=h14&&d.datetime<h7);
  const med = arr => arr.length?+(arr.reduce((s,d)=>s+d,0)/arr.length).toFixed(2):0;
  const st = arr => ({aur:med(arr.map(d=>d.AUR)),mins:med(arr.map(d=>d.minsReal)),rn:med(arr.map(d=>d.RN)),n:arr.length});
  const A=st(eS), B=st(aS), dl=(a,b)=>b?+(((a-b)/b)*100).toFixed(1):0;
  const filas=[{label:"AUR medio",a:A.aur,b:B.aur,unit:"mg/L·h",mejor:"up"},{label:"Min soplante",a:A.mins,b:B.mins,unit:"min",mejor:"down"},{label:"RN medio",a:A.rn,b:B.rn,unit:"mg N/L·h",mejor:"up"},{label:"Nº ciclos",a:A.n,b:B.n,unit:"ciclos",mejor:"up"}];
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>📅 Comparativa Semanal</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr"}}>
        {["Métrica","Esta semana","Semana anterior","Variación"].map(h=><div key={h} style={{fontSize:10,color:C.muted,textTransform:"uppercase",paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>{h}</div>)}
        {filas.map((f,i)=>{ const d=dl(f.a,f.b),mej=(f.mejor==="up"&&d>0)||(f.mejor==="down"&&d<0),col=d===0?C.muted:mej?C.green:C.amber; return [
          <div key={`l${i}`} style={{padding:"10px 0",fontSize:13,borderBottom:`1px solid ${C.gridLine}`}}>{f.label}</div>,
          <div key={`a${i}`} style={{padding:"10px 0",fontWeight:700,color:C.green,fontFamily:"monospace",borderBottom:`1px solid ${C.gridLine}`}}>{f.a} <span style={{fontSize:10,color:C.muted}}>{f.unit}</span></div>,
          <div key={`b${i}`} style={{padding:"10px 0",color:C.muted,fontFamily:"monospace",borderBottom:`1px solid ${C.gridLine}`}}>{f.b} <span style={{fontSize:10,color:C.muted}}>{f.unit}</span></div>,
          <div key={`d${i}`} style={{padding:"10px 0",borderBottom:`1px solid ${C.gridLine}`}}><Badge color={col}>{d>0?"+":""}{d}%</Badge></div>,
        ]; })}
      </div>
    </div>
  );
}

const GITHUB_TOKEN_DASH = import.meta.env.VITE_GITHUB_TOKEN;
const GITHUB_REPO_DASH  = 'jmochoa74/sicair-martorell';
const RECOVERY_CYCLES_DASH = 8;

async function activarRecovery(ciclos: number): Promise<{ok:boolean, msg:string}> {
  const url = `https://api.github.com/repos/${GITHUB_REPO_DASH}/contents/recovery.json`;
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN_DASH}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  try {
    // Obtener SHA si existe
    let sha: string|undefined;
    const get = await fetch(url, {headers});
    if (get.ok) { const d = await get.json(); sha = d.sha; }
    const payload = {activo: true, ciclos, updated: new Date().toISOString()};
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
    const body: any = {message: `Recovery activado — ${ciclos} ciclos`, content};
    if (sha) body.sha = sha;
    const put = await fetch(url, {method:'PUT', headers, body: JSON.stringify(body)});
    if (put.ok) return {ok:true, msg:`✅ Modo recuperación activado — ${ciclos} ciclos (~${Math.round(ciclos*100/60)}h)`};
    return {ok:false, msg:`❌ Error GitHub: ${put.status}`};
  } catch(e: any) {
    return {ok:false, msg:`❌ Error: ${e.message}`};
  }
}

async function leerRecovery(): Promise<{activo:boolean, ciclos:number}|null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO_DASH}/contents/recovery.json`;
  const headers = {'Authorization': `token ${GITHUB_TOKEN_DASH}`, 'Accept': 'application/vnd.github.v3+json'};
  try {
    const get = await fetch(url, {headers});
    if (!get.ok) return null;
    const d = await get.json();
    const payload = JSON.parse(atob(d.content.replace(/\n/g,'')));
    return {activo: payload.activo, ciclos: payload.ciclos};
  } catch { return null; }
}

function RecoveryPanel() {
  const [estado, setEstado] = useState<{activo:boolean,ciclos:number}|null>(null);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    leerRecovery().then(r => setEstado(r));
  }, []);

  const activar = async () => {
    setCargando(true); setMsg("");
    const res = await activarRecovery(RECOVERY_CYCLES_DASH);
    setMsg(res.msg);
    if (res.ok) setEstado({activo:true, ciclos:RECOVERY_CYCLES_DASH});
    setCargando(false);
  };

  const desactivar = async () => {
    setCargando(true); setMsg("");
    const url = `https://api.github.com/repos/${GITHUB_REPO_DASH}/contents/recovery.json`;
    const headers = {'Authorization': `token ${GITHUB_TOKEN_DASH}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json'};
    try {
      let sha: string|undefined;
      const get = await fetch(url, {headers});
      if (get.ok) { const d = await get.json(); sha = d.sha; }
      const payload = {activo: false, ciclos: 0, updated: new Date().toISOString()};
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
      const body: any = {message: 'Recovery desactivado manualmente', content};
      if (sha) body.sha = sha;
      await fetch(url, {method:'PUT', headers, body: JSON.stringify(body)});
      setEstado({activo:false, ciclos:0});
      setMsg("✅ Modo recuperación desactivado");
    } catch(e: any) { setMsg(`❌ Error: ${e.message}`); }
    setCargando(false);
  };

  return (
    <div style={{background:"#fff",border:`2px solid ${estado?.activo ? C.amber : C.border}`,borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px"}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>🔄 Modo Recuperación</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:20,lineHeight:1.6}}>
        Aumenta la aireación un <b>+30%</b> durante <b>{RECOVERY_CYCLES_DASH} ciclos (~13h)</b> tras un evento de subaireo (corte eléctrico, avería, etc.).<br/>
        SICAIR lo detecta automáticamente en el siguiente ciclo del pipeline.
      </div>
      <div style={{background: estado?.activo ? C.amberFade : "#f0fdf4", border:`1.5px solid ${estado?.activo ? C.amber : C.green}`, borderRadius:10, padding:"16px 20px", marginBottom:20, display:"flex", alignItems:"center", gap:16}}>
        <div style={{width:14,height:14,borderRadius:"50%",background:estado?.activo?C.amber:C.green,boxShadow:`0 0 8px 2px ${estado?.activo?C.amber:C.green}88`}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:estado?.activo?C.amber:C.green}}>
            {estado===null ? "Consultando estado..." : estado.activo ? `ACTIVO — ${estado.ciclos} ciclos restantes (~${Math.round(estado.ciclos*100/60)}h)` : "INACTIVO — aireación normal"}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>
            {estado?.activo ? "El pipeline aplicará +30% en cada ciclo hasta completar el contador" : "Activa tras un evento de subaireo para acelerar la recuperación biológica"}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={activar} disabled={cargando||estado?.activo===true}
          style={{background:estado?.activo?C.gridLine:C.amber,color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:estado?.activo||cargando?"default":"pointer",opacity:estado?.activo?0.5:1}}>
          {cargando?"⏳ Enviando...":"🔄 Activar recuperación (+30% · 8 ciclos)"}
        </button>
        {estado?.activo&&(
          <button onClick={desactivar} disabled={cargando}
            style={{background:"#fff",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ✕ Desactivar
          </button>
        )}
      </div>
      {msg&&<div style={{marginTop:12,fontSize:12,fontWeight:700,color:msg.startsWith("✅")?C.green:C.red}}>{msg}</div>}
    </div>
  );
}

function IncidenciasPanel({incidencias,setIncidencias,diagHistorico,setDiagHistorico,parseJSON}) {
  const [texto,setTexto]=useState(""),[tipo,setTipo]=useState("otro");
  const [fecha,setFecha]=useState(new Date().toISOString().slice(0,16)),[filtro,setFiltro]=useState("todos");
  const [vistadiag,setVistaDiag]=useState("manual"); // 'manual' | 'auto' | 'recovery'
  const agregar = () => { if(!texto.trim())return; setIncidencias(prev=>[{id:Date.now(),texto:texto.trim(),tipo,fecha},...prev]); setTexto(""); };
  const col = id => TIPOS_INC.find(t=>t.id===id)?.color||C.muted;
  const lbl = id => TIPOS_INC.find(t=>t.id===id)?.label||id;
  const filtradas = filtro==="todos"?incidencias:incidencias.filter(i=>i.tipo===filtro);

  // Diagnósticos automáticos con eventos
  const diagConEventos = (diagHistorico||[]).filter(d=>d.eventos?.length>0).slice(-50).reverse();
  const colorEvento = tipo => tipo.includes("anom")||tipo.includes("bajo")||tipo.includes("alto")?C.red:tipo.includes("trc")?C.amber:C.muted;

  return (
    <div style={{marginBottom:14}}>
      {/* Toggle manual / automático / recuperación */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <button onClick={()=>setVistaDiag("manual")} style={{background:vistadiag==="manual"?C.green:"#fff",color:vistadiag==="manual"?"#fff":C.muted,border:`1px solid ${vistadiag==="manual"?C.green:C.border}`,borderRadius:6,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📋 Incidencias manuales {incidencias.length>0&&`(${incidencias.length})`}</button>
        <button onClick={()=>setVistaDiag("auto")} style={{background:vistadiag==="auto"?C.purple:"#fff",color:vistadiag==="auto"?"#fff":C.muted,border:`1px solid ${vistadiag==="auto"?C.purple:C.border}`,borderRadius:6,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🤖 Diagnósticos automáticos {diagConEventos.length>0&&`(${diagConEventos.length})`}</button>
        <button onClick={()=>setVistaDiag("recovery")} style={{background:vistadiag==="recovery"?C.amber:"#fff",color:vistadiag==="recovery"?"#fff":C.muted,border:`1px solid ${vistadiag==="recovery"?C.amber:C.border}`,borderRadius:6,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔄 Modo recuperación</button>
      </div>

      {vistadiag==="manual"&&(
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>📋 Historial de Incidencias</div>
          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,padding:"16px",marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Tipo</div><select value={tipo} onChange={e=>setTipo(e.target.value)} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,background:"#fff"}}>{TIPOS_INC.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
              <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Fecha y hora</div><input type="datetime-local" value={fecha} onChange={e=>setFecha(e.target.value)} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,boxSizing:"border-box"}}/></div>
            </div>
            <textarea value={texto} onChange={e=>setTexto(e.target.value)} rows={2} placeholder="Descripción..." style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px",fontSize:13,resize:"vertical",boxSizing:"border-box",marginBottom:10}}/>
            <button onClick={agregar} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✅ Guardar</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>{[{id:"todos",label:"Todas"},...TIPOS_INC].map(t=>(<button key={t.id} onClick={()=>setFiltro(t.id)} style={{background:filtro===t.id?(t.color||C.green):"#fff",color:filtro===t.id?"#fff":C.muted,border:`1px solid ${filtro===t.id?(t.color||C.green):C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{t.label}</button>))}</div>
          {filtradas.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>Sin incidencias.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>{filtradas.map(inc=>(
            <div key={inc.id} style={{background:"#fff",border:`1px solid ${col(inc.tipo)}44`,borderRadius:8,padding:"12px 16px",borderLeft:`4px solid ${col(inc.tipo)}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><Badge color={col(inc.tipo)}>{lbl(inc.tipo)}</Badge><span style={{fontSize:11,color:C.muted}}>{inc.fecha?.replace("T"," ")}</span></div><div style={{fontSize:13}}>{inc.texto}</div></div>
              <button onClick={()=>setIncidencias(prev=>prev.filter(i=>i.id!==inc.id))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,marginLeft:12}}>✕</button>
            </div>
          ))}</div>
        </div>
      )}

      {vistadiag==="auto"&&(
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>🤖 Diagnósticos Automáticos</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Generados por SICAIR en cada actualización del Colab</div>
            </div>
            {!diagHistorico&&(
              <label style={{background:C.purple,color:"#fff",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                📂 Cargar diagnosticos_historico.json
                <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{const r=new FileReader();r.onload=ev=>{const j=parseJSON(ev.target.result);if(Array.isArray(j))setDiagHistorico(j);};r.readAsText(e.target.files[0]);}}/>
              </label>
            )}
            {diagHistorico&&<Badge color={C.purple}>{diagHistorico.length} entradas · {diagConEventos.length} con eventos</Badge>}
          </div>
          {!diagHistorico&&(
            <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"32px 0"}}>
              Carga <b>diagnosticos_historico.json</b> de Drive para ver el historial automático.<br/>
              <span style={{fontSize:11}}>Se genera en el Colab cada vez que ejecutas la celda ACTUALIZAR.</span>
            </div>
          )}
          {diagHistorico&&diagConEventos.length===0&&(
            <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"32px 0"}}>✅ Sin eventos registrados en el historial.</div>
          )}
          {diagConEventos.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {diagConEventos.map((d,i)=>(
                <div key={i} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",borderLeft:`4px solid ${colorEvento(d.eventos[0]?.tipo)}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
                    <span style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{d.ts?.slice(0,16).replace("T"," ")}</span>
                    <div style={{display:"flex",gap:8,fontSize:11}}>
                      <span>AUR: <b style={{color:C.green,fontFamily:"monospace"}}>{d.aur}</b></span>
                      <span>TRC: <b style={{color:C.purple,fontFamily:"monospace"}}>{d.trc}d</b></span>
                      <span>Sopl: <b style={{color:C.amber,fontFamily:"monospace"}}>{d.mins_real}min</b></span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {d.eventos.map((ev,j)=>(
                      <div key={j} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                        <span style={{fontSize:15}}>{ev.icono}</span>
                        <span style={{color:colorEvento(ev.tipo),fontWeight:600}}>{ev.texto}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {vistadiag==="recovery"&&<RecoveryPanel/>}
    </div>
  );
}

function AlertasPanel({alertas,setAlertas,disparadas,onTest}) {
  const upd = (id,key,val) => setAlertas(prev=>prev.map(a=>a.id===id?{...a,[key]:val}:a));
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700}}>🔔 Configuración de Alertas</div>
        <button onClick={onTest} style={{background:C.amber,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔊 Probar sonido</button>
      </div>
      <div style={{display:"grid",gap:10}}>{alertas.map(a=>(
        <div key={a.id} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",borderLeft:`4px solid ${a.severidad==="critica"?C.red:C.amber}`,opacity:a.activa?1:0.55}}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:20}}>{a.icon}</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{a.label}</div><Badge color={a.severidad==="critica"?C.red:C.amber}>{a.severidad}</Badge></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:C.muted}}>{a.tipo==="min"?"Mín:":"Máx:"}</span>
              <input type="number" value={a.valor} step={a.campo==="AUR"?0.1:1} onChange={e=>upd(a.id,"valor",parseFloat(e.target.value)||0)} style={{width:65,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:13,fontWeight:700,textAlign:"center"}}/>
              <span style={{fontSize:11,color:C.muted}}>{a.unit}</span>
            </div>
            {[{key:"sonido",label:"🔊"},{key:"activa",label:"On"}].map(({key,label})=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:11,color:C.muted}}>{label}</span>
                <div onClick={()=>upd(a.id,key,!a[key])} style={{width:36,height:20,borderRadius:10,background:a[key]?C.green:C.gridLine,cursor:"pointer",position:"relative",transition:"all .2s"}}>
                  <div style={{position:"absolute",top:2,left:a[key]?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}</div>
      {disparadas.length>0&&(
        <div style={{marginTop:16,background:C.redFade,border:`1px solid ${C.red}44`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:8}}>⚠️ Alertas disparadas</div>
          {disparadas.map(a=>(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span>{a.icon}</span><span style={{fontWeight:700,color:C.red}}>{a.label}</span>
              <span style={{color:C.muted,fontSize:12}}>valor: <b style={{fontFamily:"monospace"}}>{a.valorActual} {a.unit}</b></span>
              <Badge color={a.severidad==="critica"?C.red:C.amber}>{a.severidad}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertaBanner({alertas,onDismiss}) {
  if (!alertas.length) return null;
  return (
    <div style={{position:"fixed",top:70,right:20,zIndex:1500,maxWidth:380,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {alertas.map(a=>(
        <div key={a.id} style={{background:a.severidad==="critica"?C.red:C.amber,color:"#fff",borderRadius:10,padding:"12px 16px",boxShadow:"0 4px 20px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",gap:10,pointerEvents:"all"}}>
          <span style={{fontSize:20}}>{a.icon}</span>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{a.label}</div><div style={{fontSize:12,opacity:0.9}}>{a.valorActual} {a.unit}</div></div>
          <button onClick={()=>onDismiss(a.id)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      ))}
    </div>
  );
}

function DerivaPanel({deriva}) {
  if (!deriva) return null;
  const d=deriva.deriva||{}, ts=deriva.ts_entrenamiento?new Date(deriva.ts_entrenamiento):null;
  const diasDesde=ts?Math.floor((new Date()-ts)/86400000):null;
  const alerta=d.alerta||false, col=alerta?C.red:diasDesde>14?C.amber:C.green;
  const mapeCol=v=>v==null?C.muted:v<=10?C.green:v<=20?C.amber:C.red;
  return (
    <div style={{background:C.panel,border:`1.5px solid ${col}44`,borderRadius:10,padding:"20px 24px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:14,fontWeight:700}}>🧬 Salud del Modelo</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {alerta&&<Badge color={C.red}>⚠️ Deriva detectada</Badge>}
          {diasDesde!=null&&<Badge color={diasDesde>14?C.amber:C.green}>🕐 Entrenado hace {diasDesde} días</Badge>}
          {deriva.n_ciclos_entrenados>0&&<Badge color={C.blue}>📊 {deriva.n_ciclos_entrenados} ciclos</Badge>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        <KpiCard icon="🎯" label="MAPE entrenamiento" value={`${d.mape_train_aur??'—'}%`} unit="AUR +1c" color={mapeCol(d.mape_train_aur)}/>
        <KpiCard icon="📡" label="MAPE real" value={`${d.mape_real_aur??'—'}%`} unit={`${d.n_cruces??0} ciclos`} color={mapeCol(d.mape_real_aur)}/>
        <KpiCard icon="📈" label="Deriva" value={d.diferencia!=null?`${d.diferencia>0?"+":""}${d.diferencia}%`:"—"} unit="real − entrenamiento" color={d.diferencia>10?C.red:d.diferencia>5?C.amber:C.green}/>
      </div>
      {alerta?<div style={{background:C.redFade,border:`1px solid ${C.red}44`,borderRadius:8,padding:"12px 16px",fontSize:13}}><b style={{color:C.red}}>⚠️ Deriva &gt; 10 puntos.</b> Borra el .pkl de Drive para forzar reentrenamiento.</div>
      :diasDesde>14?<div style={{background:C.amberFade,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"12px 16px",fontSize:13}}><b style={{color:C.amber}}>⏰ {diasDesde} días desde el último entrenamiento.</b></div>
      :<div style={{background:"#f0fdf4",border:`1px solid ${C.green}44`,borderRadius:8,padding:"12px 16px",fontSize:13,color:C.green,fontWeight:700}}>✅ Modelo en buen estado.</div>}
    </div>
  );
}

function MultiPlantasPanel({reactores}) {
  const nombres = Object.keys(reactores);
  if (nombres.length<2) return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"32px 24px",marginBottom:14,textAlign:"center"}}>
      <div style={{fontSize:24,marginBottom:12}}>🏭</div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Vista Multiplantas</div>
      <div style={{fontSize:13,color:C.muted}}>Carga al menos 2 reactores para comparar plantas en paralelo.</div>
    </div>
  );
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>🏭 Comparativa — {nombres.length} reactores</div>
      <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>{["Reactor","Ciclos","AUR actual","AUR medio","Min sopl.","TRC actual","Estado"].map(h=>(<th key={h} style={{padding:"8px 12px",fontSize:10,color:C.muted,textTransform:"uppercase",fontWeight:700,textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead>
          <tbody>{nombres.map((n,i) => {
            const d=reactores[n], last=d.at(-1), aurMed=+(d.reduce((s,r)=>s+r.AUR,0)/d.length).toFixed(2);
            const col=RC[i], estado=last?.AUR>4?"Alta carga":last?.AUR<1?"Carga baja":"Normal", estCol=last?.AUR>4?C.amber:last?.AUR<1?C.blue:C.green;
            return (
              <tr key={n} style={{borderBottom:`1px solid ${C.gridLine}`}}>
                <td style={{padding:"10px 12px",fontWeight:700}}><span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:"50%",background:col,display:"inline-block"}}/>{n}</span></td>
                <td style={{padding:"10px 12px",textAlign:"right",color:C.muted}}>{d.length}</td>
                <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:col,fontFamily:"monospace"}}>{last?.AUR?.toFixed(2)||"—"}</td>
                <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace",color:C.muted}}>{aurMed}</td>
                <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace",color:C.amber}}>{last?.minsReal||"—"} min</td>
                <td style={{padding:"10px 12px",textAlign:"right",fontFamily:"monospace",color:C.purple}}>{last?.TRC?.toFixed(1)||"—"} d</td>
                <td style={{padding:"10px 12px",textAlign:"right"}}><Badge color={estCol}>{estado}</Badge></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px"}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>📈 AUR comparativo</div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart margin={{top:4,right:8,bottom:4,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
            <XAxis dataKey="label" type="category" allowDuplicatedCategory={false} tick={{fontSize:9,fill:C.muted}} interval={8} angle={-20} textAnchor="end" height={36}/>
            <YAxis domain={[0,8]} tick={{fontSize:9,fill:C.muted}}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
            {nombres.map((n,i)=>(<Line key={n} data={reactores[n].slice(-40).map(d=>({label:d.label,aur:d.AUR}))} dataKey="aur" stroke={RC[i]} strokeWidth={2} dot={false} name={n} connectNulls/>))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ROIMensualPanel({data,historico,demoMode}) {
  if (!data||!data.length) return null;
  const cruces = demoMode ? cruzarDemoDirecto(historico) : cruzarHistoricoConReal(historico,data);
  if (!cruces.length) return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"32px 24px",marginBottom:14,textAlign:"center"}}>
      <div style={{fontSize:24,marginBottom:12}}>🧠</div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>ROI Mensual SICAIR</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.7}}>Compara <b>lo que ha aireado la planta</b> vs <b>lo que habría aireado SICAIR</b>.<br/>Carga <b>prediccion_historico.json</b> para activar.</div>
      <Badge color={C.amber}>Mínimo recomendado: 50 ciclos</Badge>
    </div>
  );
  const KW=demoMode?55:7.5, EKW=demoMode?0.12:0.15;
  const KEY = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  const meses = {};
  cruces.forEach(c => { const k=KEY(c.ts); if(!meses[k])meses[k]={mes:k,real:0,sicair:0,n:0}; meses[k].real+=c.minsReal; meses[k].sicair+=c.minsPred; meses[k].n++; });
  const lista = Object.values(meses).map(m => {
    const ah=m.real-m.sicair, pct=+((ah/m.real)*100).toFixed(1);
    const kwh=+(ah/60*KW).toFixed(0), eur=+(kwh*EKW).toFixed(0);
    return {...m,ah,kwh,eur,pct};
  });
  const tR=lista.reduce((s,m)=>s+m.real,0), tS=lista.reduce((s,m)=>s+m.sicair,0), tAh=tR-tS, tPct=+((tAh/tR)*100).toFixed(1);
  const tKwh=+(tAh/60*KW).toFixed(0), tEur=+(tKwh*EKW).toFixed(0);
  const exportExcel = () => {
    import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs").then(XLSX => {
      const rows=lista.map(m=>({"Mes":m.mes,"Ciclos":m.n,"Min Real":m.real,"Min SICAIR":m.sicair,"Ahorro min":m.ah,"Ahorro %":m.pct,"kWh":m.kwh,"€":m.eur}));
      rows.push({"Mes":"TOTAL","Ciclos":cruces.length,"Min Real":tR,"Min SICAIR":tS,"Ahorro min":tAh,"Ahorro %":tPct,"kWh":tKwh,"€":tEur});
      const ws=XLSX.utils.json_to_sheet(rows), wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"ROI SICAIR");
      XLSX.writeFile(wb,`SICAIR_ROI_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  };
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div><div style={{fontSize:14,fontWeight:700}}>📆 ROI Mensual SICAIR</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>Algoritmo planta vs SICAIR +1c · {cruces.length} ciclos{demoMode?" · Planta demo 50k he":""}</div></div>
        <button onClick={exportExcel} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📥 Exportar Excel</button>
      </div>
      <div style={{background:tEur>0?"#f0fdf4":C.amberFade,border:`2px solid ${tEur>0?C.green:C.amber}`,borderRadius:12,padding:"20px 28px",marginBottom:16,display:"flex",alignItems:"center",gap:32,flexWrap:"wrap"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>💶 Ahorro acumulado</div>
          <div style={{fontSize:42,fontWeight:900,color:tEur>0?C.green:C.amber,fontFamily:"monospace",lineHeight:1}}>{Math.abs(tEur).toLocaleString()} €</div>
          <div style={{fontSize:11,color:C.muted,marginTop:4}}>usando SICAIR en lugar del algoritmo actual</div>
        </div>
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
          {[{l:"Min ahorrados",v:Math.abs(tAh).toLocaleString(),c:C.green},{l:"kWh",v:Math.abs(tKwh).toLocaleString(),c:C.blue},{l:"Reducción",v:`${Math.abs(tPct)}%`,c:C.green},{l:"Ciclos",v:cruces.length,c:C.muted}].map(({l,v,c})=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div></div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={lista} margin={{top:4,right:8,bottom:4,left:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
          <XAxis dataKey="mes" tick={{fontSize:9,fill:C.muted}}/><YAxis tick={{fontSize:9,fill:C.muted}} unit=" min"/>
          <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
          <Bar dataKey="real" name="Planta (real)" fill={C.amber} radius={[3,3,0,0]}/>
          <Bar dataKey="sicair" name="SICAIR (pred.)" fill={C.green} radius={[3,3,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ValidacionPanel({data,demoMode,historico}) {
  const [histRaw,setHistRaw] = useState(null);
  useEffect(() => {
    if (historico && Array.isArray(historico) && !demoMode) setHistRaw(historico);
  }, [historico, demoMode]);
  const [valRows,setValRows] = useState([]);
  const [horizFiltro,setHorizFiltro] = useState("todos");
  const [paginaActual,setPaginaActual] = useState(0);
  const ROWS_PAG = 12;

  useEffect(() => {
    if (demoMode&&data&&data.length) setValRows(generarDemoValidacion(data));
  }, [demoMode,data]);

  const handleHistJSON = useCallback(raw => {
    try { const j=JSON.parse(raw); if(!Array.isArray(j)){alert("El JSON debe ser un array.");return;} setHistRaw(j); }
    catch { alert("JSON inválido."); }
  }, []);

  useEffect(() => {
    if (!histRaw||!data||demoMode) return;
    const resultados=[], vistos=new Set();
    for (const entrada of histRaw) {
      for (const h of ["1c","3c","6h"]) {
        const tsObj = entrada[`ts_objetivo_${h}`]??(h==="1c"?(()=>{ const base=new Date(entrada.ultimo_dato_ts??entrada.ts_prediccion); return isNaN(base)?null:new Date(base.getTime()+3600000).toISOString(); })():null);
        const predAUR = (entrada[`pred_${h}`]??entrada.predicciones?.[h])?.aur_pred;
        const predMins = (entrada[`pred_${h}`]??entrada.predicciones?.[h])?.mins_pred;
        if (!tsObj||predAUR==null) continue;
        const objetivo = new Date(typeof tsObj==="number"?tsObj*1000:tsObj);
        const clave = `${objetivo.toISOString().slice(0,16)}_${h}`;
        if (vistos.has(clave)) continue; vistos.add(clave);
        const vecino = data.reduce((m,d)=>{ const diff=Math.abs(d.datetime-objetivo); return(!m||diff<Math.abs(m.datetime-objetivo))?d:m; }, null);
        if (!vecino||Math.abs(vecino.datetime-objetivo)/60000>60) continue;
        const errAUR = +(Math.abs(predAUR-vecino.AUR)/vecino.AUR*100).toFixed(1);
        resultados.push({ts_obj:objetivo,horizonte:h,aur_pred:+predAUR.toFixed(3),aur_real:+vecino.AUR.toFixed(3),mins_pred:predMins!=null?+predMins.toFixed(0):null,mins_real:vecino.minsReal,err_aur_pct:errAUR,acierto:errAUR<=20,sesgo:+(predAUR-vecino.AUR).toFixed(3)});
      }
    }
    const ordenados = resultados.sort((a,b)=>a.ts_obj-b.ts_obj);
    setValRows(ordenados);
    // Arrancar en la última página (datos más recientes) en vez de la primera.
    setPaginaActual(Math.max(0,Math.ceil(ordenados.length/ROWS_PAG)-1));
  }, [histRaw,data,demoMode]);

  const filtradas = horizFiltro==="todos" ? valRows : valRows.filter(r=>r.horizonte===horizFiltro);
  const totalPags = Math.ceil(filtradas.length/ROWS_PAG);
  // Al cambiar de filtro de horizonte, ir también a la última página de ese
  // subconjunto (si no, se vuelve a la 1 y hay que darle otra vez a ▶ muchas veces).
  const filtrarYUltimaPagina = h => {
    setHorizFiltro(h);
    const n = h==="todos" ? valRows.length : valRows.filter(r=>r.horizonte===h).length;
    setPaginaActual(Math.max(0,Math.ceil(n/ROWS_PAG)-1));
  };
  const pagina = filtradas.slice(paginaActual*ROWS_PAG,(paginaActual+1)*ROWS_PAG);
  const metricas = ["1c","3c","6h"].map(h => {
    const sub = valRows.filter(r=>r.horizonte===h); if(!sub.length) return {h,n:0};
    const mapeAUR=+(sub.reduce((s,r)=>s+r.err_aur_pct,0)/sub.length).toFixed(1);
    const sesgoProm=+(sub.reduce((s,r)=>s+r.sesgo,0)/sub.length).toFixed(3);
    const aciertos=sub.filter(r=>r.acierto).length;
    return {h,n:sub.length,mapeAUR,sesgoProm,aciertos,pctAciertos:+((aciertos/sub.length)*100).toFixed(0)};
  }).filter(m=>m.n>0);
  const colorErr = pct => pct<=10?C.green:pct<=20?C.amber:C.red;

  return (
    <div style={{marginBottom:14}}>
      {!demoMode&&!histRaw&&(
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>🎯 Validar predicciones vs datos reales</div>
          {!data&&<div style={{background:C.amberFade,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.amber,marginBottom:12}}>⚠️ Carga primero el CSV real (R1).</div>}
          <DropZone onFile={handleHistJSON} accept=".json" color={C.purple} done={false} label="prediccion_historico.json" sublabel="Array de predicciones históricas"/>
        </div>
      )}
      {valRows.length===0&&(histRaw||demoMode)&&(
        <div style={{background:C.amberFade,border:`1px solid ${C.amber}44`,borderRadius:10,padding:"16px 20px",fontSize:13,display:"flex",alignItems:"center",gap:12}}>
          ⚠️ Sin datos de validación.
          {!demoMode&&<button onClick={()=>{setHistRaw(null);setValRows([]);}} style={{background:"#fff",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>🗑 Quitar</button>}
        </div>
      )}
      {valRows.length>0&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${metricas.length},1fr)`,gap:12,marginBottom:14}}>
            {metricas.map(m=>{
              const conMins=valRows.filter(r=>r.horizonte===m.h&&r.mins_pred!=null&&r.mins_real!=null);
              const mapeMins=conMins.length?+(conMins.reduce((s,r)=>s+Math.abs(r.mins_pred-r.mins_real)/r.mins_real*100,0)/conMins.length).toFixed(1):null;
              const sesgoMins=conMins.length?+(conMins.reduce((s,r)=>s+(r.mins_pred-r.mins_real),0)/conMins.length).toFixed(1):null;
              const aciertMins=conMins.length?+(conMins.filter(r=>Math.abs(r.mins_pred-r.mins_real)/r.mins_real*100<=20).length/conMins.length*100).toFixed(0):null;
              return (
              <div key={m.h} style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"16px 18px",borderTop:`3px solid ${colorErr(m.mapeAUR)}`}}>
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",marginBottom:10}}>+{m.h} · {m.n} puntos</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#333",marginBottom:6}}>AUR mg O₂/L·h</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    <div><div style={{fontSize:9,color:C.muted}}>MAPE</div><div style={{fontSize:18,fontWeight:700,color:colorErr(m.mapeAUR)}}>{m.mapeAUR}%</div></div>
                    <div><div style={{fontSize:9,color:C.muted}}>Acierto</div><div style={{fontSize:18,fontWeight:700,color:m.pctAciertos>=70?C.green:C.amber}}>{m.pctAciertos}%</div></div>
                    <div><div style={{fontSize:9,color:C.muted}}>Sesgo</div><div style={{fontSize:13,fontWeight:600,color:Math.abs(m.sesgoProm)<0.3?C.green:C.amber}}>{m.sesgoProm>0?"+":""}{m.sesgoProm}</div></div>
                  </div>
                </div>
                {mapeMins!=null&&<div style={{borderTop:"1px solid #f4f4f4",paddingTop:8}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#333",marginBottom:6}}>Minutos soplante</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    <div><div style={{fontSize:9,color:C.muted}}>MAPE</div><div style={{fontSize:18,fontWeight:700,color:colorErr(mapeMins)}}>{mapeMins}%</div></div>
                    <div><div style={{fontSize:9,color:C.muted}}>Acierto</div><div style={{fontSize:18,fontWeight:700,color:aciertMins>=70?C.green:C.amber}}>{aciertMins}%</div></div>
                    <div><div style={{fontSize:9,color:C.muted}}>Sesgo</div><div style={{fontSize:13,fontWeight:600,color:Math.abs(sesgoMins)<5?C.green:C.amber}}>{sesgoMins>0?"+":""}{sesgoMins} min</div></div>
                  </div>
                </div>}
              </div>
            );})}
          </div>
          <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700}}>📊 AUR Predicho vs Real</div>
              <div style={{display:"flex",gap:6}}>{["todos","1c","3c","6h"].map(h=>(<button key={h} onClick={()=>filtrarYUltimaPagina(h)} style={{background:horizFiltro===h?C.green:"#fff",color:horizFiltro===h?"#fff":C.muted,border:`1px solid ${horizFiltro===h?C.green:C.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{h==="todos"?"Todos":`+${h}`}</button>))}</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={filtradas.slice(-60).map(r=>({label:r.ts_obj.toISOString().slice(5,16).replace("T"," "),pred:r.aur_pred,real:r.aur_real,error:r.err_aur_pct}))} margin={{top:4,right:8,bottom:4,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
                <XAxis dataKey="label" tick={{fontSize:9,fill:C.muted}} interval={8} angle={-20} textAnchor="end" height={36}/>
                <YAxis yAxisId="aur" domain={[0,6]} tick={{fontSize:9,fill:C.muted}}/>
                <YAxis yAxisId="err" orientation="right" domain={[0,60]} tick={{fontSize:9,fill:C.muted}} unit="%"/>
                <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
                <Area yAxisId="aur" dataKey="real" fill={C.greenFade} stroke={C.green} strokeWidth={2} dot={false} name="AUR real" connectNulls/>
                <Line yAxisId="aur" dataKey="pred" stroke={C.purple} strokeWidth={2} strokeDasharray="6 3" dot={{r:3,fill:C.purple}} name="AUR pred." connectNulls/>
                <Bar yAxisId="err" dataKey="error" fill={C.amber} opacity={0.35} name="Error %"/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700}}>💨 Minutos Predichos vs Reales</div>
              <div style={{display:"flex",gap:6}}>{["todos","1c","3c","6h"].map(h=>(<button key={h} onClick={()=>filtrarYUltimaPagina(h)} style={{background:horizFiltro===h?C.amber:"#fff",color:horizFiltro===h?"#fff":C.muted,border:`1px solid ${horizFiltro===h?C.amber:C.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{h==="todos"?"Todos":`+${h}`}</button>))}</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={filtradas.filter(r=>r.mins_pred!=null).slice(-60).map(r=>({label:r.ts_obj.toISOString().slice(5,16).replace("T"," "),pred:r.mins_pred,real:r.mins_real,error:r.mins_pred!=null&&r.mins_real!=null?+(Math.abs(r.mins_pred-r.mins_real)/r.mins_real*100).toFixed(1):null}))} margin={{top:4,right:8,bottom:4,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
                <XAxis dataKey="label" tick={{fontSize:9,fill:C.muted}} interval={8} angle={-20} textAnchor="end" height={36}/>
                <YAxis yAxisId="mins" domain={[0,180]} tick={{fontSize:9,fill:C.muted}} unit=" min"/>
                <YAxis yAxisId="err" orientation="right" domain={[0,80]} tick={{fontSize:9,fill:C.muted}} unit="%"/>
                <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
                <Area yAxisId="mins" dataKey="real" fill={C.amberFade} stroke={C.amber} strokeWidth={2} dot={false} name="Min real" connectNulls/>
                <Line yAxisId="mins" dataKey="pred" stroke={C.green} strokeWidth={2} strokeDasharray="6 3" dot={{r:3,fill:C.green}} name="Min pred." connectNulls/>
                <Bar yAxisId="err" dataKey="error" fill={C.blue} opacity={0.25} name="Error %"/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"18px 20px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700}}>📋 Detalle ({filtradas.length} puntos)</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setPaginaActual(0)} disabled={paginaActual===0} title="Primera página (datos más antiguos)" style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}>⏮</button>
                <button onClick={()=>setPaginaActual(p=>Math.max(0,p-1))} disabled={paginaActual===0} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}>◀</button>
                <span style={{fontSize:12,color:C.muted}}>{paginaActual+1} / {Math.max(1,totalPags)}</span>
                <button onClick={()=>setPaginaActual(p=>Math.min(totalPags-1,p+1))} disabled={paginaActual>=totalPags-1} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}>▶</button>
                <button onClick={()=>setPaginaActual(totalPags-1)} disabled={paginaActual>=totalPags-1} title="Última página (datos más recientes)" style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}>⏭</button>
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>{["","Ts objetivo","Hor.","AUR pred.","AUR real","Error AUR","Sesgo AUR","Min pred.","Min real","Error Min"].map((h,i)=>(<th key={i} style={{textAlign:i>2?"center":"left",padding:"8px 10px",fontSize:10,color:C.muted,textTransform:"uppercase",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead>
                <tbody>{pagina.map((r,i)=>{
                  const errMins=r.mins_pred!=null&&r.mins_real!=null?+(Math.abs(r.mins_pred-r.mins_real)/r.mins_real*100).toFixed(1):null;
                  return (
                  <tr key={i} style={{borderBottom:`1px solid ${C.gridLine}`,background:r.acierto?"transparent":C.redFade}}>
                    <td style={{padding:"8px 10px"}}>{r.acierto?"✅":"❌"}</td>
                    <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{r.ts_obj.toISOString().slice(0,16).replace("T"," ")}</td>
                    <td style={{padding:"8px 10px"}}><Badge color={C.purple}>+{r.horizonte}</Badge></td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontFamily:"monospace"}}>{r.aur_pred}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:700,fontFamily:"monospace",color:C.green}}>{r.aur_real}</td>
                    <td style={{padding:"8px 10px",textAlign:"center"}}><Badge color={colorErr(r.err_aur_pct)}>{r.err_aur_pct}%</Badge></td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontFamily:"monospace",fontSize:11,color:r.sesgo>0.5?C.amber:r.sesgo<-0.5?C.blue:C.green,fontWeight:700}}>{r.sesgo>0?"+":""}{r.sesgo}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontFamily:"monospace",color:C.amber,fontWeight:700}}>{r.mins_pred!=null?Math.round(r.mins_pred):"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontFamily:"monospace",fontWeight:700}}>{r.mins_real!=null?r.mins_real:"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"center"}}>{errMins!=null?<Badge color={colorErr(errMins)}>{errMins}%</Badge>:<span style={{color:C.muted}}>—</span>}</td>
                  </tr>
                )})}</tbody>
              </table>
            </div>
          </div>
          {!demoMode&&<button onClick={()=>{setHistRaw(null);setValRows([]);}} style={{background:"#fff",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🗑 Quitar validación</button>}
        </>
      )}
    </div>
  );
}

function ExportCSV({data}) {
  if (!data||!data.length) return null;
  const minDate=data[0]?.datetime?.toISOString().slice(0,10), maxDate=data.at(-1)?.datetime?.toISOString().slice(0,10);
  const [desde,setDesde]=useState(minDate),[hasta,setHasta]=useState(maxDate),[txt,setTxt]=useState(null),[n,setN]=useState(0);
  const exportar = () => {
    const f=data.filter(d=>{const ds=d.datetime.toISOString().slice(0,10);return ds>=desde&&ds<=hasta;});
    if(!f.length){alert("Sin datos.");return;}
    const hdr="Fecha;Hora;AUR;RN;TRC;TRH;Min Total Rea Sopl;Min Total Teo Sopl";
    setTxt([hdr,...f.map(d=>[d.datetime.toISOString().slice(0,10),d.datetime.toISOString().slice(11,19),d.AUR,d.RN,d.TRC,d.TRH,d.minsReal,d.minsTeo].join(";"))].join("\n")); setN(f.length);
  };
  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"20px 24px",marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>📤 Exportar CSV Filtrado</div>
      <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:16,flexWrap:"wrap"}}>
        <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Desde</div><input type="date" value={desde} min={minDate} max={hasta} onChange={e=>setDesde(e.target.value)} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13}}/></div>
        <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Hasta</div><input type="date" value={hasta} min={desde} max={maxDate} onChange={e=>setHasta(e.target.value)} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13}}/></div>
        <button onClick={exportar} style={{background:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬇ Generar</button>
      </div>
      {txt&&(<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:12,color:C.green,fontWeight:700}}>✅ {n} registros</div><button onClick={()=>navigator.clipboard?.writeText(txt)} style={{background:C.green,color:"#fff",border:"none",borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📋 Copiar</button></div>
        <textarea readOnly value={txt} rows={6} style={{width:"100%",fontFamily:"monospace",fontSize:11,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px",resize:"vertical",boxSizing:"border-box"}}/>
      </div>)}
    </div>
  );
}

function OnboardingPanel({reactores,pred,historico,deriva,onSkip,handleCSV,handleXLSX,handleJSON,parseJSON,setHistorico,setDeriva,nombres,addingR,setAddingR,newRN,setNewRN}) {
  const pasos = [
    {hecho:Object.keys(reactores).length>0,icon:"📊",label:"Datos SN8",desc:"CSV o Excel de tasas_nitrificacion"},
    {hecho:!!pred,icon:"🧠",label:"Modelo",desc:"prediccion_sicair.json del Colab"},
    {hecho:!!historico,icon:"📈",label:"Historial",desc:"prediccion_historico.json para ROI"},
    {hecho:!!deriva,icon:"🧬",label:"Salud modelo",desc:"deriva_modelo.json"},
  ];
  const hechos=pasos.filter(p=>p.hecho).length, pct=Math.round(hechos/pasos.length*100);
  return (
    <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:"24px 28px",marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:12}}>
        <div><div style={{fontSize:15,fontWeight:800}}>📂 Cargar archivos</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Arrastra los archivos para activar SICAIR 3.0</div></div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:12,color:pct===100?C.green:C.muted,fontWeight:700}}>{hechos}/{pasos.length} cargados</span>
          {hechos>=2&&<button onClick={onSkip} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cerrar ✕</button>}
        </div>
      </div>
      <div style={{height:6,background:C.gridLine,borderRadius:4,overflow:"hidden",marginBottom:16}}><div style={{width:`${pct}%`,height:"100%",background:pct===100?C.green:C.amber,borderRadius:4,transition:"width .4s"}}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:10}}>
        <DropZone onFile={r=>handleCSV(r,"R1")} onBinary={b=>handleXLSX(b,"R1")} accept=".csv,.tsv,.txt,.xlsx,.xls" color={RC[0]} done={!!reactores["R1"]} label="CSV o Excel R1" sublabel="tasas_nitrificacion.xlsx"/>
        <DropZone onFile={handleJSON} accept=".json" color={C.purple} done={!!pred} label="prediccion_sicair.json" sublabel="Generado por el Colab"/>
        <DropZone onFile={raw=>{const j=parseJSON(raw);if(Array.isArray(j))setHistorico(j);}} accept=".json" color={C.amber} done={!!historico} label="prediccion_historico.json" sublabel={historico?`${historico.length} entradas`:"Historial acumulado"}/>
        <DropZone onFile={raw=>{const j=parseJSON(raw);if(j?.deriva!==undefined)setDeriva(j);}} accept=".json" color={C.red} done={!!deriva} label="deriva_modelo.json" sublabel={deriva?`Δ ${deriva.deriva?.diferencia??'—'}%`:"Salud del modelo"}/>
      </div>
      {nombres.filter(n=>n!=="R1").map((n,i)=>(<DropZone key={n} onFile={r=>handleCSV(r,n)} onBinary={b=>handleXLSX(b,n)} accept=".csv,.tsv,.txt,.xlsx,.xls" color={RC[i+1]} done={true} label={`CSV/Excel ${n}`} sublabel={`${reactores[n].length} registros`}/>))}
      {!addingR?(<div onClick={()=>setAddingR(true)} style={{border:`2px dashed ${C.border}`,borderRadius:10,background:"#fafafa",padding:"10px",textAlign:"center",cursor:"pointer",marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{fontSize:16}}>➕</span><span style={{fontSize:11,fontWeight:700,color:C.muted}}>Añadir reactor</span></div>)
      :(<div style={{border:`2px dashed ${C.blue}`,borderRadius:10,background:C.blueFade,padding:"12px",marginTop:4,display:"flex",flexDirection:"column",gap:8}}>
        <input value={newRN} onChange={e=>setNewRN(e.target.value)} placeholder="R2, R3..." style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",fontSize:12}}/>
        <DropZone onFile={r=>{handleCSV(r,newRN);setAddingR(false);}} onBinary={b=>{handleXLSX(b,newRN);setAddingR(false);}} accept=".csv,.tsv,.txt,.xlsx,.xls" color={C.blue} done={false} label={`Cargar ${newRN}`} sublabel="CSV o Excel"/>
        <button onClick={()=>setAddingR(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>Cancelar</button>
      </div>)}
    </div>
  );
}

function ModoQuiosco({data,pred,toxUmbral,incidencias,alertasDisparadas,onClose}) {
  const [,setTick] = useState(0);
  useEffect(()=>{ const iv=setInterval(()=>setTick(t=>t+1),1000); return()=>clearInterval(iv); },[]);
  const now=new Date(), last=data?.at(-1), toxProb=(pred?.predicciones?.tox_prob||0)*100, aur=last?.AUR||0;
  let estado="verde", msg="SISTEMA NORMAL";
  if (alertasDisparadas?.some(a=>a.severidad==="critica")||toxProb>toxUmbral) { estado="rojo"; msg="⚠️ ALERTA CRÍTICA"; }
  else if (alertasDisparadas?.length>0||aur<1.0) { estado="ambar"; msg="⚡ VIGILANCIA"; }
  const col={verde:C.green,ambar:C.yellow,rojo:C.red}[estado], p=pred?.predicciones;
  return (
    <div style={{position:"fixed",inset:0,background:"#0d1117",zIndex:2000,display:"flex",flexDirection:"column",color:"#fff",fontFamily:"system-ui,sans-serif",padding:"24px 32px",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,borderBottom:"1px solid #2d3748",paddingBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}><SensaraLogo size={44}/><div><div style={{fontSize:18,fontWeight:800}}>SIC<span style={{color:C.green}}>AIR</span> 3.0</div><div style={{fontSize:12,color:"#6b7280"}}>Martorell · EDAR</div></div></div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:C.green}}>{now.toLocaleTimeString("es-ES")}</div><div style={{fontSize:12,color:"#6b7280"}}>{now.toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long"})}</div></div>
          <button onClick={onClose} style={{background:"#2d3748",color:"#9ca3af",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✕ Salir</button>
        </div>
      </div>
      <div style={{background:col+"18",border:`2px solid ${col}`,borderRadius:16,padding:"16px 28px",marginBottom:20,display:"flex",alignItems:"center",gap:24}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:col,boxShadow:`0 0 20px 6px ${col}66`}}/>
        <div style={{fontSize:22,fontWeight:900,color:col,letterSpacing:1}}>{msg}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:28}}>
          {[{l:"AUR",v:aur.toFixed(2),u:"mg O₂/L·h",c:C.green},{l:"Soplante",v:last?.minsReal||"—",u:"min/ciclo",c:C.amber},{l:"SICTOX",v:toxProb.toFixed(1)+"%",u:"tox. pred.",c:toxProb>toxUmbral?C.red:C.green}].map(({l,v,u,c})=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontSize:10,color:"#6b7280",textTransform:"uppercase"}}>{l}</div><div style={{fontSize:32,fontWeight:900,color:c,fontFamily:"monospace"}}>{v}</div><div style={{fontSize:11,color:"#6b7280"}}>{u}</div></div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,flex:1,minHeight:0}}>
        <div style={{background:"#161b22",borderRadius:12,padding:"16px 20px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#9ca3af",marginBottom:8}}>AUR — últimos 40 ciclos</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={data?.slice(-40).map(d=>({label:d.label,aur:d.AUR}))||[]} margin={{top:4,right:4,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748"/>
              <XAxis dataKey="label" tick={{fontSize:8,fill:"#4b5563"}} interval={8} angle={-20} textAnchor="end" height={30}/>
              <YAxis domain={[0,6]} tick={{fontSize:8,fill:"#4b5563"}}/>
              <Area dataKey="aur" fill={C.greenFade} stroke={C.green} strokeWidth={2} dot={false} connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
          {p&&<div style={{display:"flex",gap:10,marginTop:12}}>{[{k:"1c",l:"+1 ciclo"},{k:"3c",l:"+3 ciclos"},{k:"6h",l:"+6h"}].map(({k,l})=>(
            <div key={k} style={{flex:1,background:"#0d1117",borderRadius:8,padding:"8px",textAlign:"center",border:"1px solid #2d3748"}}>
              <div style={{fontSize:10,color:"#6b7280"}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color:C.green,fontFamily:"monospace"}}>{p[k]?.aur_pred?.toFixed(2)||"—"}</div>
              <div style={{fontSize:10,color:C.amber,fontFamily:"monospace"}}>{p[k]?.mins_pred?.toFixed(0)||"—"} min</div>
            </div>
          ))}</div>}
        </div>
        <div style={{background:"#161b22",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",marginBottom:10}}>📋 Últimas incidencias</div>
          {!incidencias?.slice(0,4).length&&<div style={{fontSize:12,color:"#4b5563"}}>Sin incidencias.</div>}
          {incidencias?.slice(0,4).map(inc=>(
            <div key={inc.id} style={{borderLeft:`3px solid ${TIPOS_INC.find(t=>t.id===inc.tipo)?.color||C.muted}`,paddingLeft:10,marginBottom:10}}>
              <div style={{fontSize:10,color:"#6b7280"}}>{inc.fecha?.replace("T"," ")}</div>
              <div style={{fontSize:12,color:"#e2e8f0"}}>{inc.texto}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function generarInforme(data,pred,toxUmbral,incidencias,alertasDisparadas) {
  if (!data) return "";
  const ahora=new Date().toLocaleString("es-ES"), last=data.at(-1), p=pred?.predicciones;
  const tR=data.reduce((s,d)=>s+d.minsReal,0), tT=data.reduce((s,d)=>s+d.minsTeo,0);
  const ah=tR-tT, kwh=+(ah/60*7.5).toFixed(0), eur=+(kwh*0.15).toFixed(0);
  const s=calcularScore(data);
  const incStr=incidencias?.slice(0,5).map(i=>`  [${i.fecha?.replace("T"," ")}] ${TIPOS_INC.find(t=>t.id===i.tipo)?.label||i.tipo}: ${i.texto}`).join("\n")||"  Sin incidencias";
  const alertStr=alertasDisparadas?.length?alertasDisparadas.map(a=>`  ⚠️ ${a.label}: ${a.valorActual} ${a.unit}`).join("\n"):"  Sin alertas activas";
  return `INFORME SICAIR 3.0 — SENSARA\nGenerado: ${ahora}\n${"═".repeat(40)}\nSCORE DE SALUD: ${s?.global??'—'}/100 — ${s?.estado??'—'}\nESTADO: AUR ${last?.AUR?.toFixed(2)??"—"} mg/L·h · TRC ${last?.TRC?.toFixed(1)??"—"} d · Sopl. ${last?.minsReal??"—"} min\nALERTAS:\n${alertStr}\nPREDICCIONES:\n  +1c: AUR ${p?.["1c"]?.aur_pred?.toFixed(2)??"—"} · ${p?.["1c"]?.mins_pred?.toFixed(0)??"—"} min · TRC ${p?.["1c"]?.trc_pred?.toFixed(1)??"—"} d\n  +3c: AUR ${p?.["3c"]?.aur_pred?.toFixed(2)??"—"} · ${p?.["3c"]?.mins_pred?.toFixed(0)??"—"} min · TRC ${p?.["3c"]?.trc_pred?.toFixed(1)??"—"} d\n  +6h: AUR ${p?.["6h"]?.aur_pred?.toFixed(2)??"—"} · ${p?.["6h"]?.mins_pred?.toFixed(0)??"—"} min · TRC ${p?.["6h"]?.trc_pred?.toFixed(1)??"—"} d\nAHORRO: ${ah.toLocaleString()} min · ${Math.abs(kwh).toLocaleString()} kWh · ${Math.abs(eur).toLocaleString()} €\nINCIDENCIAS:\n${incStr}\n${"═".repeat(40)}\nSENSARA · sensaratech.com · Logroño`;
}


function generarInformePDF(data, pred, historico, incidencias, periodo, diagHistorico=null) {
  if (!data || !data.length) return;
  const ahora = new Date();
  let desde, label;
  if (periodo==="dia")    { desde=new Date(ahora-86400000);           label="Último día"; }
  else if (periodo==="semana") { desde=new Date(ahora-7*86400000);   label="Última semana"; }
  else if (periodo==="mes")    { desde=new Date(ahora-30*86400000);  label="Último mes"; }
  else                         { desde=new Date(ahora-365*86400000); label="Último año"; }
  const df = data.filter(d => d.datetime >= desde);
  if (!df.length) { alert("Sin datos para el período seleccionado."); return; }
  const aurMed = +(df.reduce((s,d)=>s+d.AUR,0)/df.length).toFixed(2);
  const minsMed = +(df.reduce((s,d)=>s+d.minsReal,0)/df.length).toFixed(0);
  const trcMed = +(df.reduce((s,d)=>s+d.TRC,0)/df.length).toFixed(1);
  const conF = df.filter(d=>d.minsFormula!=null);
  const sobMin = conF.length ? +(conF.reduce((s,d)=>s+(d.minsReal-(d.minsFormula||0)),0)/conF.length).toFixed(0) : 0;
  const ahMin = df.reduce((s,d)=>s+d.minsReal,0) - conF.reduce((s,d)=>s+(d.minsFormula||0),0);
  const ahKwh = +(ahMin/60*7.5).toFixed(0);
  const ahEur = +(ahKwh*0.15).toFixed(0);
  const incP  = (incidencias||[]).filter(i=>new Date(i.fecha)>=desde);
  const diagP = (diagHistorico||[]).filter(d=>d.eventos?.length>0&&new Date(d.ts)>=desde);
  const p = pred?.predicciones;
  const step = Math.max(1, Math.floor(df.length/80));
  const dfR = df.filter((_,i)=>i%step===0);
  const fmtLbl = d => {
    const dt = d.datetime;
    if (periodo==="dia") return dt.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
    if (periodo==="semana") return `${dt.getDate()}/${dt.getMonth()+1}`;
    return `${dt.getDate()}/${dt.getMonth()+1}`;
  };
  function svgLinea(datos, color, titulo, unit) {
    if (!datos.length) return "";
    const W=680, H=130, PL=36, PR=12, PT=24, PB=28;
    const vals = datos.map(d=>d.y), mx = Math.max(...vals)*1.15||1;
    const xS = (i) => PL+(i/(datos.length-1||1))*(W-PL-PR);
    const yS = (v) => PT+(1-v/mx)*(H-PT-PB);
    const pts = datos.map((d,i)=>`${xS(i).toFixed(1)},${yS(d.y).toFixed(1)}`).join(" ");
    const fill = `${PL},${H-PB} ${pts} ${xS(datos.length-1).toFixed(1)},${H-PB}`;
    const step2 = Math.max(1,Math.floor(datos.length/6));
    const xl = datos.filter((_,i)=>i%step2===0||i===datos.length-1).map((d,_,arr)=>{
      const i=datos.indexOf(d), x=xS(i);
      return `<text x="${x.toFixed(0)}" y="${H-6}" font-size="8" fill="#bbb" text-anchor="middle">${d.label}</text>`;
    }).join("");
    const yl = [0,0.5,1].map(f=>{
      const v=(mx*f).toFixed(1), y=yS(mx*f);
      return `<text x="${PL-4}" y="${y.toFixed(0)}" font-size="8" fill="#bbb" text-anchor="end" dominant-baseline="middle">${v}</text><line x1="${PL}" y1="${y.toFixed(0)}" x2="${W-PR}" y2="${y.toFixed(0)}" stroke="#f0f0f0" stroke-width="1"/>`;
    }).join("");
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#fafafa" rx="6"/>
      ${yl}${xl}
      <polygon points="${fill}" fill="${color}15"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <text x="${PL}" y="15" font-size="10" font-weight="600" fill="#333">${titulo}</text>
      <text x="${W-PR}" y="15" font-size="9" fill="#aaa" text-anchor="end">${unit}</text>
    </svg>`;
  }
  function svgDoble(real, formula) {
    if (!real.length) return "";
    const W=680, H=130, PL=36, PR=12, PT=24, PB=28;
    const vals=[...real.map(d=>d.y),...formula.map(d=>d.y)], mx=Math.max(...vals)*1.15||1;
    const xS=(i,len)=>PL+(i/(len-1||1))*(W-PL-PR), yS=(v)=>PT+(1-v/mx)*(H-PT-PB);
    const pts1=real.map((d,i)=>`${xS(i,real.length).toFixed(1)},${yS(d.y).toFixed(1)}`).join(" ");
    const pts2=formula.map((d,i)=>`${xS(i,formula.length).toFixed(1)},${yS(d.y).toFixed(1)}`).join(" ");
    const step2=Math.max(1,Math.floor(real.length/6));
    const xl=real.filter((_,i)=>i%step2===0).map(d=>{
      const i=real.indexOf(d), x=xS(i,real.length);
      return `<text x="${x.toFixed(0)}" y="${H-6}" font-size="8" fill="#bbb" text-anchor="middle">${d.label}</text>`;
    }).join("");
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#fafafa" rx="6"/>
      ${xl}
      <polyline points="${pts1}" fill="none" stroke="#c2410c" stroke-width="2"/>
      <polyline points="${pts2}" fill="none" stroke="#2d7a27" stroke-width="2" stroke-dasharray="5,3"/>
      <text x="${PL}" y="15" font-size="10" font-weight="600" fill="#333">Minutos soplante real vs SICAIR</text>
      <circle cx="${W-130}" cy="12" r="4" fill="#c2410c"/>
      <text x="${W-123}" y="16" font-size="9" fill="#555">Real</text>
      <line x1="${W-90}" y1="12" x2="${W-76}" y2="12" stroke="#2d7a27" stroke-width="2" stroke-dasharray="4,2"/>
      <text x="${W-72}" y="16" font-size="9" fill="#555">SICAIR</text>
    </svg>`;
  }
  const dAUR  = dfR.map(d=>({y:d.AUR, label:fmtLbl(d)}));
  const dReal = dfR.map(d=>({y:d.minsReal, label:fmtLbl(d)}));
  const dForm = dfR.filter(d=>d.minsFormula!=null).map(d=>({y:d.minsFormula, label:fmtLbl(d)}));
  const dTRC  = dfR.map(d=>({y:d.TRC, label:fmtLbl(d)}));
  const svgAUR  = svgLinea(dAUR,  "#2d7a27", "AUR — Tasa de Nitrificación", "mg O₂/L·h");
  const svgMins = svgDoble(dReal, dForm);
  const svgTRC  = svgLinea(dTRC,  "#1d4ed8", "TRC — Tiempo de Retención de Fango", "días");
  // Resumen diario para PDF
  const crP = cruzarHistoricoConReal(historico||[], data);
  const dRealPDF = {}, dPredPDF = {};
  df.forEach(d => { const k=d.datetime.toISOString().slice(0,10); if(!dRealPDF[k])dRealPDF[k]=0; dRealPDF[k]+=d.minsReal; });
  crP.filter(c=>c.ts>=desde).forEach(c => { const k=c.ts.toISOString().slice(0,10); if(!dPredPDF[k])dPredPDF[k]=0; dPredPDF[k]+=c.minsPred; });
  const diasPDF = Object.keys(dRealPDF).sort().map(dia => {
    const real=Math.round(dRealPDF[dia]), pred=dPredPDF[dia]?Math.round(dPredPDF[dia]):null;
    const diff=pred?real-pred:null, pct=pred?+((diff/real)*100).toFixed(1):null;
    const kwh=diff?+(diff/60*7.5).toFixed(0):null, eur=kwh?+(kwh*0.15).toFixed(0):null;
    return {dia,real,pred,diff,pct,kwh,eur};
  });
  const totDiffPDF = diasPDF.filter(d=>d.diff!=null).reduce((s,d)=>s+(d.diff||0),0);

  const existente = document.getElementById("sicair-pdf-frame");
  if (existente) existente.remove();
  const btnOld = document.getElementById("sicair-close-btn");
  if (btnOld) btnOld.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "sicair-pdf-frame";
  iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;border:none;background:#fff;";
  document.body.appendChild(iframe);
  const cerrar = document.createElement("button");
  cerrar.id = "sicair-close-btn";
  cerrar.textContent = "✕ Cerrar";
  cerrar.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;background:#111;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;";
  cerrar.onclick = () => { iframe.remove(); cerrar.remove(); };
  document.body.appendChild(cerrar);
  const win = iframe.contentWindow;
  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Informe SICAIR 3.0</title>
  <style>
    @page{margin:14mm;size:A4}*{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px 24px}
    h1{font-size:22px;font-weight:700;color:#2d7a27;margin-bottom:3px;letter-spacing:-0.5px}
    .sub{font-size:11px;color:#888;margin-bottom:14px}
    hr{border:none;border-top:1px solid #f0f0f0;margin:14px 0}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
    .kpi{background:#fafafa;border-left:3px solid #2d7a27;padding:8px 12px;border-radius:6px}
    .kpi.a{border-color:#c2410c}.kpi.b{border-color:#1d4ed8}
    .kv{font-size:18px;font-weight:700;color:#111;margin:2px 0}
    .kl{font-size:8px;color:#aaa;text-transform:uppercase;letter-spacing:.05em}
    .ahorro{background:#f0fdf4;border:1px solid #4a9c3f;border-radius:8px;padding:10px 14px;margin:12px 0;display:flex;gap:20px;align-items:center}
    .av{font-size:18px;font-weight:700;color:#2d7a27}
    .st{font-size:10px;font-weight:700;color:#444;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em}
    .chart{margin:6px 0 12px}
    .pred{display:flex;gap:10px;margin:8px 0}
    .pc{flex:1;background:#fafafa;border-radius:8px;padding:8px;text-align:center}
    .pv{font-size:15px;font-weight:700;color:#2d7a27}
    .pm{font-size:11px;color:#c2410c;font-weight:600;margin-top:2px}
    .inc{border-left:3px solid #c2410c;padding:5px 8px;margin:3px 0;background:#fff8f5;border-radius:0 4px 4px 0;font-size:10px}
    .foot{font-size:9px;color:#ccc;margin-top:20px;padding-top:10px;border-top:1px solid #f0f0f0}
    .pbtn{background:#2d7a27;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:12px;cursor:pointer;margin:12px 0}
    @media print{.pbtn{display:none}}
  </style></head><body>
  <h1>Informe SICAIR 3.0</h1>
  <div class="sub">EDAR Martorell (Acciona) · ${label} · ${desde.toLocaleDateString("es-ES")} → ${ahora.toLocaleDateString("es-ES")} · ${df.length} ciclos</div>
  <button class="pbtn" onclick="window.print()">🖨 Guardar como PDF</button>
  <hr/>
  <div class="st">KPIs del período</div>
  <div class="kpis">
    <div class="kpi"><div class="kl">AUR medio</div><div class="kv">${aurMed}</div><div class="kl">mg O₂/L·h</div></div>
    <div class="kpi a"><div class="kl">Min. soplante</div><div class="kv">${minsMed}</div><div class="kl">min/ciclo</div></div>
    <div class="kpi b"><div class="kl">TRC medio</div><div class="kv">${trcMed}</div><div class="kl">días</div></div>
    <div class="kpi a"><div class="kl">Sobreaireo</div><div class="kv">${sobMin}</div><div class="kl">min/ciclo</div></div>
  </div>
  <div class="ahorro">
    <div><div class="kl">Ahorro min</div><div class="av">${Math.abs(ahMin).toLocaleString()}</div></div>
    <div><div class="kl">kWh</div><div class="av">${Math.abs(ahKwh).toLocaleString()}</div></div>
    <div><div class="kl">Impacto €</div><div class="av">${Math.abs(ahEur).toLocaleString()} €</div></div>
    <div style="flex:1;font-size:10px;color:#2d7a27">Estimación @0.15€/kWh · 7.5kW</div>
  </div>
  <hr/>
  <div class="st">AUR — Evolución</div><div class="chart">${svgAUR}</div>
  <div class="st">Minutos soplante — Real vs SICAIR</div><div class="chart">${svgMins}</div>
  <div class="st">TRC — Tiempo de Retención de Fango</div><div class="chart">${svgTRC}</div>
  <hr/>
  ${diasPDF.length>0?`<div class="st">Resumen diario — Minutos Real vs SICAIR</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px">
    <thead><tr style="background:#2d7a27;color:#fff">
      <th style="padding:5px 8px;text-align:left">Fecha</th>
      <th style="padding:5px 8px;text-align:right">Min Real</th>
      <th style="padding:5px 8px;text-align:right">Min SICAIR</th>
      <th style="padding:5px 8px;text-align:right">Diferencia</th>
      <th style="padding:5px 8px;text-align:right">Ahorro %</th>
      <th style="padding:5px 8px;text-align:right">kWh</th>
      <th style="padding:5px 8px;text-align:right">€</th>
    </tr></thead>
    <tbody>
      ${diasPDF.map((d,i)=>`<tr style="background:${i%2===0?"#fff":"#fafafa"};border-bottom:1px solid #f0f0f0">
        <td style="padding:5px 8px;font-weight:600">${d.dia}</td>
        <td style="padding:5px 8px;text-align:right;color:#c2410c;font-weight:700">${d.real.toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#2d7a27;font-weight:700">${d.pred!=null?d.pred.toLocaleString():"—"}</td>
        <td style="padding:5px 8px;text-align:right;color:${d.diff>0?"#c2410c":"#2d7a27"};font-weight:700">${d.diff!=null?(d.diff>0?"+":"")+d.diff.toLocaleString():"—"}</td>
        <td style="padding:5px 8px;text-align:right;color:${d.pct>0?"#c2410c":"#2d7a27"}">${d.pct!=null?(d.pct>0?"+":"")+d.pct+"%":"—"}</td>
        <td style="padding:5px 8px;text-align:right;color:#1d4ed8">${d.kwh!=null?Math.abs(d.kwh):"—"}</td>
        <td style="padding:5px 8px;text-align:right">${d.eur!=null?Math.abs(d.eur)+" €":"—"}</td>
      </tr>`).join("")}
      <tr style="background:#f0fdf4;font-weight:700;border-top:2px solid #2d7a27">
        <td style="padding:5px 8px">TOTAL</td>
        <td style="padding:5px 8px;text-align:right;color:#c2410c">${diasPDF.reduce((s,d)=>s+d.real,0).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#2d7a27">${diasPDF.filter(d=>d.pred).reduce((s,d)=>s+(d.pred||0),0).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:${totDiffPDF>0?"#c2410c":"#2d7a27"}">${totDiffPDF>0?"+":""}${totDiffPDF.toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right"></td>
        <td style="padding:5px 8px;text-align:right;color:#1d4ed8">${Math.abs(+(totDiffPDF/60*7.5).toFixed(0)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.abs(+(totDiffPDF/60*7.5*0.15).toFixed(0)).toLocaleString()} €</td>
      </tr>
    </tbody>
  </table>`:""}
  ${p?`<div class="st">Predicción actual</div><div class="pred">
    ${["1c","3c","6h"].map(h=>`<div class="pc"><div class="kl">+${h}</div><div class="pv">${p[h]?.aur_pred?.toFixed(2)||"—"}</div><div class="kl">mg O₂/L·h</div><div class="pm">${p[h]?.mins_pred?.toFixed(0)||"—"} min</div></div>`).join("")}
  </div><hr/>`:""}
  <div class="st">Incidencias manuales (${incP.length})</div>
  ${incP.length===0?'<div style="color:#aaa;font-size:10px">Sin incidencias manuales en el período.</div>':incP.slice(0,15).map(i=>`<div class="inc"><b>${i.fecha?.replace("T"," ")||""}</b> · ${i.tipo.toUpperCase()} · ${i.texto}</div>`).join("")}
  ${diagP.length>0?`<div class="st" style="margin-top:14px">Diagnósticos automáticos SICAIR (${diagP.length})</div>
  ${diagP.slice(0,20).map(d=>`<div class="inc" style="border-color:#1d4ed8;background:#eff6ff">
    <b>${d.ts?.slice(0,16).replace("T"," ")||""}</b> · AUR ${d.aur} · TRC ${d.trc}d · ${d.mins_real}min<br/>
    ${d.eventos?.map(e=>`${e.icono} ${e.texto}`).join(" · ")||""}
  </div>`).join("")}`:""}
  <div class="foot">SENSARA · sensaratech.com · Logroño, La Rioja · SICAIR 3.0 · ${ahora.toLocaleString("es-ES")}</div>
  </body></html>`);
  win.document.close();
}


function ModeloFisicoPanel({pred, data}) {
  const minsPred1c = pred?.predicciones?.["1c"]?.mins_pred;
  const minsReal   = data?.at(-1)?.minsReal;
  const ciclo1c    = calcCiclo(minsPred1c);
  const cicloReal  = calcCiclo(minsReal);

  // Curva VSD para gráfica
  const curvaData = VSD.escalones.map(e=>({hz:e.hz, kw:e.kw, q:e.q}));

  // kWh por ciclo — VSD fase inicial + Fija fase final
  const calcKwhCiclo = (mins) => {
    if (!mins) return null;
    const c = calcCiclo(mins);
    const kwhVSD = VSD.escalones.reduce((s,e)=>s+(c.minsVSD*e.pct/60*e.kw),0);
    const kwhFija = c.minsFija/60*VSD.kw_fija;
    return { kwhVSD:+kwhVSD.toFixed(2), kwhFija:+kwhFija.toFixed(2), total:+(kwhVSD+kwhFija).toFixed(2) };
  };

  const kwh1c   = calcKwhCiclo(minsPred1c);
  const kwhReal = calcKwhCiclo(minsReal);

  return (
    <div style={{marginBottom:14}}>
      {/* Banner estrategia */}
      <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"16px 24px",marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>⚡ Estrategia de Soplantes — EDAR Martorell</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
          <div style={{background:"#eff6ff",border:"1px solid #1d4ed8",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>FASE INICIAL (50%)</div>
            <div style={{fontSize:16,fontWeight:700,color:C.blue}}>Fija activa</div>
            <div style={{fontSize:11,color:C.muted}}>{VSD.kw_fija} kW constante</div>
          </div>
          <div style={{background:"#f0fdf4",border:"1px solid #4a9c3f",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>FASE FINAL (50%)</div>
            <div style={{fontSize:16,fontWeight:700,color:C.green}}>VSD activa</div>
            <div style={{fontSize:11,color:C.muted}}>Hz variable · 3 tramos</div>
          </div>
          <div style={{background:"#fafafa",border:"1px solid #f0f0f0",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>ROTACIÓN</div>
            <div style={{fontSize:16,fontWeight:700,color:C.purple}}>Par A / Par B</div>
            <div style={{fontSize:11,color:C.muted}}>S1+S4 ↔ S2+S5 (cada ciclo)</div>
          </div>
        </div>
        <div style={{background:"#fafafa",borderRadius:8,padding:"8px 14px",fontSize:11,color:C.muted,display:"flex",gap:20}}>
          <span>⚠️ Mínimo por fase: <b style={{color:C.text}}>{VSD.min_fase} min</b></span>
          <span>🔧 5ª soplante de refuerzo disponible</span>
          <span>🔄 Rotación automática cada ciclo</span>
        </div>
      </div>

      {/* Comparativa predicción vs real */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        {[
          {label:"SICAIR +1c (predicción)", mins:minsPred1c, ciclo:ciclo1c, kwh:kwh1c, color:C.green},
          {label:"Último ciclo real",        mins:minsReal,   ciclo:cicloReal, kwh:kwhReal, color:C.amber},
        ].map(({label,mins,ciclo,kwh,color})=>(
          <div key={label} style={{background:"#fff",border:`1px solid ${color}33`,borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:12,fontWeight:700,color,marginBottom:12}}>{label}</div>
            {mins ? (<>
              {/* Línea de tiempo del ciclo */}
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",height:32,borderRadius:8,overflow:"hidden",marginBottom:6}}>
                  <div style={{width:`${ciclo.minsFija/ciclo.minsTotal*100}%`,background:C.blue,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:10,color:"#fff",fontWeight:700}}>Fija {ciclo.minsFija}min</span>
                  </div>
                  <div style={{width:`${ciclo.minsVSD/ciclo.minsTotal*100}%`,background:C.green,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:10,color:"#fff",fontWeight:700}}>VSD {ciclo.minsVSD}min</span>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}>
                  <span>0 min</span><span>Total: <b style={{color:C.text}}>{ciclo.minsTotal} min</b></span>
                </div>
              </div>

              {/* Desglose VSD por Hz */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:600,color:C.muted,marginBottom:6}}>Fase VSD — {ciclo.minsVSD} min:</div>
                {VSD.escalones.map(e=>{
                  const mHz = +(ciclo.minsVSD*e.pct).toFixed(1);
                  const kwhHz = +(mHz/60*e.kw).toFixed(2);
                  return (
                    <div key={e.hz} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{width:40,textAlign:"center",background:e.hz===65?"#fef3c7":e.hz===50?"#dbeafe":"#f0fdf4",borderRadius:5,padding:"2px 0",fontSize:10,fontWeight:700,color:e.hz===65?C.amber:e.hz===50?C.blue:C.green,flexShrink:0}}>{e.hz}Hz</div>
                      <div style={{flex:1,height:5,background:"#f0f0f0",borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:`${e.pct*100}%`,height:"100%",background:e.hz===65?C.amber:e.hz===50?C.blue:C.green,borderRadius:3}}/>
                      </div>
                      <div style={{fontSize:10,color:C.muted,minWidth:110,textAlign:"right"}}><b style={{color:C.text}}>{mHz}min</b> · {e.kw}kW · <b style={{color:C.amber}}>{kwhHz}kWh</b></div>
                    </div>
                  );
                })}
              </div>

              {/* Fase fija */}
              <div style={{background:"#eff6ff",borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:C.blue,fontWeight:600}}>Fase Fija ({VSD.kw_fija}kW)</span>
                <span style={{fontSize:10,color:C.muted}}><b style={{color:C.text}}>{ciclo.minsFija} min</b> · <b style={{color:C.amber}}>{kwh?.kwhFija} kWh</b></span>
              </div>

              {/* Total kWh */}
              <div style={{background:"#fafafa",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:11,fontWeight:600,color:"#333"}}>Total ciclo</span>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.amber}}>{kwh?.total} kWh</div>
                  <div style={{fontSize:9,color:C.muted}}>{kwh?.kwhVSD}kWh VSD + {kwh?.kwhFija}kWh Fija</div>
                </div>
              </div>
            </>) : <div style={{color:C.muted,fontSize:12}}>Sin datos</div>}
          </div>
        ))}
      </div>

      {/* Curvas soplantes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Curva S4 VSD-A */}
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:2}}>S4 VSD-A — ZS4 45kW</div>
          <div style={{fontSize:10,color:C.muted,marginBottom:10}}>Par A · 93%/71%/57% de 71.15Hz · {VSD.s4.escalones.map(e=>`${e.hz.toFixed(1)}Hz`).join(" · ")}</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={VSD.s4.escalones.map(e=>({hz:e.hz,kw:e.kw,q:e.q}))} margin={{top:4,right:36,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
              <XAxis dataKey="hz" tick={{fontSize:9,fill:C.muted}} unit="Hz"/>
              <YAxis yAxisId="kw" domain={[0,55]} tick={{fontSize:9,fill:C.muted}} unit="kW"/>
              <YAxis yAxisId="q" orientation="right" domain={[0,3200]} tick={{fontSize:9,fill:C.muted}} unit="m³/h"/>
              <Tooltip content={<CT/>}/>
              <Line yAxisId="kw" dataKey="kw" stroke={C.green} strokeWidth={2} dot={{r:5,fill:C.green,stroke:"#fff",strokeWidth:2}} name="kW" connectNulls/>
              <Line yAxisId="q" dataKey="q" stroke={C.blue} strokeWidth={2} strokeDasharray="5 3" dot={{r:4,fill:C.blue,stroke:"#fff",strokeWidth:2}} name="m³/h" connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{marginTop:8,display:"flex",gap:6}}>
            {VSD.s4.escalones.map(e=>(
              <div key={e.hz} style={{flex:1,textAlign:"center",background:"#f0fdf4",borderRadius:8,padding:"5px 3px"}}>
                <div style={{fontSize:9,color:C.muted,fontWeight:600}}>{e.hz} Hz</div>
                <div style={{fontSize:11,fontWeight:700,color:C.green}}>{e.kw} kW</div>
                <div style={{fontSize:9,color:C.muted}}>{e.q} m³/h</div>
              </div>
            ))}
          </div>
        </div>
        {/* Curva S5 VSD-B */}
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:2}}>S5 VSD-B — ZS55+ (134Hz máx)</div>
          <div style={{fontSize:10,color:C.muted,marginBottom:10}}>Par B · 75%/60%/45% de 134Hz · {VSD.s5.escalones.map(e=>`${e.hz}Hz`).join(" · ")}</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={VSD.s5.escalones.map(e=>({hz:e.hz,kw:e.kw,q:e.q}))} margin={{top:4,right:36,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
              <XAxis dataKey="hz" tick={{fontSize:9,fill:C.muted}} unit="Hz" tickFormatter={v=>v.toFixed(0)}/>
              <YAxis yAxisId="kw" domain={[0,55]} tick={{fontSize:9,fill:C.muted}} unit="kW"/>
              <YAxis yAxisId="q" orientation="right" domain={[0,2000]} tick={{fontSize:9,fill:C.muted}} unit="m³/h"/>
              <Tooltip content={<CT/>}/>
              <Line yAxisId="kw" dataKey="kw" stroke={C.purple} strokeWidth={2} dot={{r:5,fill:C.purple,stroke:"#fff",strokeWidth:2}} name="kW" connectNulls/>
              <Line yAxisId="q" dataKey="q" stroke={C.amber} strokeWidth={2} strokeDasharray="5 3" dot={{r:4,fill:C.amber,stroke:"#fff",strokeWidth:2}} name="m³/h" connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{marginTop:8,display:"flex",gap:6}}>
            {VSD.s5.escalones.map(e=>(
              <div key={e.hz} style={{flex:1,textAlign:"center",background:"#faf5ff",borderRadius:8,padding:"5px 3px"}}>
                <div style={{fontSize:9,color:C.muted,fontWeight:600}}>{e.hz.toFixed(0)}Hz</div>
                <div style={{fontSize:11,fontWeight:700,color:C.purple}}>{e.kw} kW</div>
                <div style={{fontSize:9,color:C.muted}}>{e.q} m³/h</div>
              </div>
            ))}
          </div>
        </div>

        {/* Soplantes Fijas */}
        <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.blue,marginBottom:4}}>Soplantes 1, 2 y 3 — Fijas ZS4 75kW</div>
          <div style={{fontSize:10,color:C.muted,marginBottom:10}}>Fase final · arranque directo a red 50Hz · sin variador</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            {[
              {nombre:"Soplante 1", rol:"Fase inicial — Par A (con Soplante 4)", color:C.blue},
              {nombre:"Soplante 2", rol:"Fase inicial — Par B (con Soplante 5)", color:C.blue},
              {nombre:"Soplante 3", rol:"Refuerzo / Avería", color:C.muted},
            ].map(s=>(
              <div key={s.nombre} style={{background:"#fafafa",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,border:`1px solid ${s.color}22`}}>
                <div style={{width:36,height:36,borderRadius:8,background:s.color+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:16}}>💨</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#333"}}>{s.nombre}</div>
                  <div style={{fontSize:10,color:C.muted}}>{s.rol}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:700,color:s.color}}>{VSD.kw_fija} kW</div>
                  <div style={{fontSize:10,color:C.muted}}>{VSD.q_fija} m³/h</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 14px",fontSize:10,color:C.blue}}>
            <b>Punto de operación único:</b> 50 Hz (red) · {VSD.kw_fija} kW · {VSD.q_fija} m³/h<br/>
            <span style={{color:C.muted}}>Sin regulación de velocidad — ON/OFF directo</span>
          </div>
        </div>
      </div>
    </div>
  );
}


function ResumenDiarioPanel({data, historico, demoMode}) {
  if (!data || !data.length) return null;

  // Cruzar datos reales con predicciones históricas
  const cruces = demoMode ? cruzarDemoDirecto(historico) : cruzarHistoricoConReal(historico, data);

  // Agrupar por día
  const diasReal = {};
  data.forEach(d => {
    const dia = d.datetime.toISOString().slice(0,10);
    if (!diasReal[dia]) diasReal[dia] = {real:0, n:0};
    diasReal[dia].real += d.minsReal;
    diasReal[dia].n++;
  });

  const diasPred = {};
  cruces.forEach(c => {
    const dia = c.ts.toISOString().slice(0,10);
    if (!diasPred[dia]) diasPred[dia] = {pred:0, n:0};
    diasPred[dia].pred += c.minsPred;
    diasPred[dia].n++;
  });

  // Combinar
  const dias = Object.keys(diasReal).sort().slice(-14).map(dia => {
    const r = diasReal[dia] || {real:0,n:0};
    const p = diasPred[dia] || {pred:null,n:0};
    const diff = p.pred ? r.real - p.pred : null;
    const pct  = p.pred ? +((diff/r.real)*100).toFixed(1) : null;
    const kwh  = diff ? +(diff/60*7.5).toFixed(0) : null;
    const eur  = kwh ? +(kwh*0.15).toFixed(0) : null;
    return { dia, real: Math.round(r.real), pred: p.pred ? Math.round(p.pred) : null, diff, pct, kwh, eur, nReal:r.n, nPred:p.n };
  });

  const totReal = dias.reduce((s,d)=>s+d.real,0);
  const totPred = dias.filter(d=>d.pred).reduce((s,d)=>s+(d.pred||0),0);
  const totDiff = totReal - totPred;
  const totKwh  = +(totDiff/60*7.5).toFixed(0);
  const totEur  = +(totKwh*0.15).toFixed(0);

  const colorDiff = v => v==null?C.muted:v>0?C.amber:C.green;

  return (
    <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:16,padding:"20px 24px",marginBottom:14,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>📅 Resumen Diario — Minutos Reales vs SICAIR</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Últimos 14 días · {cruces.length} ciclos con predicción</div>
        </div>
        {totPred>0&&<div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[
            {lbl:"Total real",  val:`${totReal.toLocaleString()} min`, color:C.amber},
            {lbl:"Total SICAIR",val:`${totPred.toLocaleString()} min`, color:C.green},
            {lbl:"Diferencia",  val:`${totDiff>0?"+":""}${totDiff.toLocaleString()} min`, color:colorDiff(totDiff)},
            {lbl:"kWh",         val:`${Math.abs(totKwh).toLocaleString()}`, color:C.blue},
            {lbl:"€",           val:`${Math.abs(totEur).toLocaleString()} €`, color:colorDiff(totDiff)},
          ].map(({lbl,val,color})=>(
            <div key={lbl} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{lbl}</div>
              <div style={{fontSize:16,fontWeight:700,color}}>{val}</div>
            </div>
          ))}
        </div>}
      </div>

      {/* Gráfica barras diarias */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dias} margin={{top:4,right:8,bottom:4,left:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
          <XAxis dataKey="dia" tick={{fontSize:9,fill:C.muted}} tickFormatter={v=>v.slice(5)}/>
          <YAxis tick={{fontSize:9,fill:C.muted}} unit=" min"/>
          <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>
          <Bar dataKey="real" name="Real" fill={C.amber} radius={[3,3,0,0]} opacity={0.85}/>
          <Bar dataKey="pred" name="SICAIR" fill={C.green} radius={[3,3,0,0]} opacity={0.85}/>
        </BarChart>
      </ResponsiveContainer>

      {/* Tabla detalle */}
      <div style={{overflowX:"auto",marginTop:12}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{borderBottom:`2px solid ${C.border}`}}>
              {["Fecha","Ciclos","Min Real","Min SICAIR","Diferencia","Ahorro %","kWh","€"].map(h=>(
                <th key={h} style={{padding:"8px 10px",fontSize:10,color:C.muted,textTransform:"uppercase",fontWeight:700,textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map((d,i)=>(
              <tr key={d.dia} style={{borderBottom:`1px solid ${C.gridLine}`,background:i%2===0?"#fff":"#fafafa"}}>
                <td style={{padding:"8px 10px",fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{d.dia}</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.muted}}>{d.nReal}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:C.amber,fontFamily:"monospace"}}>{d.real.toLocaleString()}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:C.green,fontFamily:"monospace"}}>{d.pred?.toLocaleString()||"—"}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:colorDiff(d.diff)}}>{d.diff!=null?(d.diff>0?"+":"")+d.diff.toLocaleString():"—"}</td>
                <td style={{padding:"8px 10px",textAlign:"right"}}>{d.pct!=null?<Badge color={colorDiff(d.diff)}>{d.pct>0?"+":""}{d.pct}%</Badge>:"—"}</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.blue,fontFamily:"monospace"}}>{d.kwh!=null?Math.abs(d.kwh):"—"}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:colorDiff(d.diff)}}>{d.eur!=null?Math.abs(d.eur)+" €":"—"}</td>
              </tr>
            ))}
            {totPred>0&&(
              <tr style={{borderTop:`2px solid ${C.border}`,background:"#f9f9f9",fontWeight:700}}>
                <td style={{padding:"8px 10px",color:C.text}}>TOTAL</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.muted}}>{dias.reduce((s,d)=>s+d.nReal,0)}</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.amber,fontFamily:"monospace"}}>{totReal.toLocaleString()}</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.green,fontFamily:"monospace"}}>{totPred.toLocaleString()}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:colorDiff(totDiff)}}>{totDiff>0?"+":""}{totDiff.toLocaleString()}</td>
                <td style={{padding:"8px 10px",textAlign:"right"}}><Badge color={colorDiff(totDiff)}>{totDiff>0?"+":""}{+((totDiff/totReal)*100).toFixed(1)}%</Badge></td>
                <td style={{padding:"8px 10px",textAlign:"right",color:C.blue,fontFamily:"monospace"}}>{Math.abs(totKwh).toLocaleString()}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontFamily:"monospace",color:colorDiff(totDiff)}}>{Math.abs(totEur).toLocaleString()} €</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!cruces.length&&<div style={{background:C.amberFade,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"12px 16px",fontSize:12,color:C.amber,marginTop:8}}>⏳ Acumulando ciclos de validación — disponible con más datos.</div>}
    </div>
  );
}

function InformeModal({texto,onClose}) {
  const imprimir = () => {
    const win=window.open("","_blank","width=900,height=1000"); if(!win)return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Informe SICAIR 3.0</title><style>body{font-family:'Courier New',monospace;font-size:11.5px;line-height:1.65;margin:20mm}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${texto.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></body></html>`);
    win.document.close(); win.focus(); setTimeout(()=>{win.print();win.close();},500);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:660,width:"90%",maxHeight:"82vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700}}>📄 Informe SICAIR 3.0</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={imprimir} style={{background:C.red,color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🖨 PDF</button>
            <button onClick={()=>navigator.clipboard?.writeText(texto)} style={{background:C.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📋 Copiar</button>
            <button onClick={onClose} style={{background:C.panel,color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <pre style={{fontFamily:"monospace",fontSize:12,color:C.text,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0}}>{texto}</pre>
      </div>
    </div>
  );
}

// ── GitHub URLs ───────────────────────────────────────────────────
const GITHUB_RAW = 'https://raw.githubusercontent.com/jmochoa74/sicair-martorell/main';
function githubUrl(file) { return `${GITHUB_RAW}/${file}?t=${Date.now()}`; }


// ── Calidad Efluente Panel ────────────────────────────────────────
const NH4_LIM = [{max:5,color:"#4a9c3f",label:"Correcto"},{max:10,color:"#f9a825",label:"Aviso"},{max:20,color:"#e65100",label:"Alto"},{max:999,color:"#c62828",label:"Crítico"}];
const NO3_LIM = [{max:10,color:"#4a9c3f",label:"Correcto"},{max:25,color:"#f9a825",label:"Aviso"},{max:50,color:"#e65100",label:"Alto"},{max:999,color:"#c62828",label:"Crítico"}];
const colLim = (v,L) => (L.find(l=>v<=l.max)||L.at(-1)).color;
const lblLim = (v,L) => (L.find(l=>v<=l.max)||L.at(-1)).label;

function CalidadEfluentePanel({calidad, setCalidad, data}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0,10));
  const [nh4, setNh4] = useState("");
  const [no3, setNo3] = useState("");
  const [nota, setNota] = useState("");
  const [vista, setVista] = useState("tabla");

  const agregar = () => {
    const n4=parseFloat(nh4), n3=parseFloat(no3);
    if (isNaN(n4)||isNaN(n3)) return;
    setCalidad([{id:Date.now(),fecha,nh4:n4,no3:n3,nota:nota.trim()},...calidad]);
    setNh4(""); setNo3(""); setNota("");
  };

  const ult = calidad[0];

  return (
    <div style={{marginBottom:14}}>
      {ult && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div style={{background:C.panel,border:`2px solid ${colLim(ult.nh4,NH4_LIM)}`,borderRadius:10,padding:"16px 20px",textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>NH₄ efluente — último análisis</div>
            <div style={{fontSize:36,fontWeight:900,color:colLim(ult.nh4,NH4_LIM),fontFamily:"monospace"}}>{ult.nh4?.toFixed(1)}</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>mg/L · {ult.fecha}</div>
            <Badge color={colLim(ult.nh4,NH4_LIM)}>{lblLim(ult.nh4,NH4_LIM)}</Badge>
          </div>
          <div style={{background:C.panel,border:`2px solid ${colLim(ult.no3,NO3_LIM)}`,borderRadius:10,padding:"16px 20px",textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>NO₃ efluente — último análisis</div>
            <div style={{fontSize:36,fontWeight:900,color:colLim(ult.no3,NO3_LIM),fontFamily:"monospace"}}>{ult.no3?.toFixed(1)}</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>mg/L · {ult.fecha}</div>
            <Badge color={colLim(ult.no3,NO3_LIM)}>{lblLim(ult.no3,NO3_LIM)}</Badge>
          </div>
        </div>
      )}

      <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 24px",marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>🧪 Registrar análisis de laboratorio</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Fecha muestra</div>
            <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>NH₄ (mg/L)</div>
            <input type="number" value={nh4} onChange={e=>setNh4(e.target.value)} placeholder="ej. 2.5" step="0.1"
              style={{width:"100%",border:`2px solid ${nh4?colLim(parseFloat(nh4),NH4_LIM):C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>NO₃ (mg/L)</div>
            <input type="number" value={no3} onChange={e=>setNo3(e.target.value)} placeholder="ej. 8.0" step="0.1"
              style={{width:"100%",border:`2px solid ${no3?colLim(parseFloat(no3),NO3_LIM):C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Nota (opcional)</div>
            <input type="text" value={nota} onChange={e=>setNota(e.target.value)} placeholder="Observaciones..."
              style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:13,boxSizing:"border-box"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <button onClick={agregar} disabled={!nh4||!no3}
            style={{background:nh4&&no3?C.green:C.gridLine,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:nh4&&no3?"pointer":"default"}}>
            ✅ Guardar análisis
          </button>
          <div style={{fontSize:11,color:C.muted}}>Límites NH₄: &lt;5✅ &lt;10⚠️ &gt;10🔴 · NO₃: &lt;10✅ &lt;25⚠️ &gt;25🔴</div>
        </div>
      </div>

      {calidad.length > 0 && (
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700}}>📊 Histórico calidad efluente ({calidad.length} análisis)</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setVista("tabla")} style={{background:vista==="tabla"?C.green:"#fff",color:vista==="tabla"?"#fff":C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📋 Tabla</button>
              <button onClick={()=>setVista("grafico")} style={{background:vista==="grafico"?C.green:"#fff",color:vista==="grafico"?"#fff":C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📈 Gráfico</button>
            </div>
          </div>
          {vista==="tabla" && (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                {["Fecha","NH₄ (mg/L)","Estado","NO₃ (mg/L)","Estado","Nota",""].map((h,i)=>(
                  <th key={i} style={{padding:"8px 10px",fontSize:10,color:C.muted,textTransform:"uppercase",fontWeight:700,textAlign:"left"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{calidad.map(r=>(
                <tr key={r.id} style={{borderBottom:`1px solid ${C.gridLine}`}}>
                  <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11}}>{r.fecha}</td>
                  <td style={{padding:"8px 10px",fontWeight:800,color:colLim(r.nh4,NH4_LIM),fontFamily:"monospace"}}>{r.nh4?.toFixed(1)}</td>
                  <td style={{padding:"8px 10px"}}><Badge color={colLim(r.nh4,NH4_LIM)}>{lblLim(r.nh4,NH4_LIM)}</Badge></td>
                  <td style={{padding:"8px 10px",fontWeight:800,color:colLim(r.no3,NO3_LIM),fontFamily:"monospace"}}>{r.no3?.toFixed(1)}</td>
                  <td style={{padding:"8px 10px"}}><Badge color={colLim(r.no3,NO3_LIM)}>{lblLim(r.no3,NO3_LIM)}</Badge></td>
                  <td style={{padding:"8px 10px",fontSize:11,color:C.muted}}>{r.nota}</td>
                  <td style={{padding:"8px 10px"}}><button onClick={()=>setCalidad(calidad.filter(x=>x.id!==r.id))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {vista==="grafico" && (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={[...calidad].reverse().map(r=>({fecha:r.fecha,nh4:r.nh4,no3:r.no3}))} margin={{top:4,right:8,bottom:4,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gridLine}/>
                <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.muted}} angle={-20} textAnchor="end" height={36}/>
                <YAxis yAxisId="nh4" tick={{fontSize:9,fill:C.muted}}/>
                <YAxis yAxisId="no3" orientation="right" tick={{fontSize:9,fill:C.muted}}/>
                <Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:11}}/>
                <Line yAxisId="nh4" dataKey="nh4" stroke={C.green} strokeWidth={2} dot={{r:5,fill:C.green}} name="NH₄ mg/L" connectNulls/>
                <Line yAxisId="no3" dataKey="no3" stroke={C.blue} strokeWidth={2} dot={{r:5,fill:C.blue}} name="NO₃ mg/L" connectNulls/>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Comparativa laboratorio vs minutos SICAIR */}
      {calidad.length > 0 && (
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px",marginTop:14}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>📊 Comparativa calidad vs minutos aireación</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:`2px solid ${C.border}`}}>
                {["Fecha","Min/ciclo medio","NH₄ (mg/L)","Estado NH₄","NO₃ (mg/L)","Estado NO₃","Nota"].map((h,i)=>(
                  <th key={i} style={{padding:"8px 10px",fontSize:10,color:C.muted,textTransform:"uppercase",fontWeight:700,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{calidad.map(r => {
                const ciclosDia = (data||[]).filter(d => d.datetime?.toISOString().slice(0,10) === r.fecha);
                const minsMedio = ciclosDia.length ? Math.round(ciclosDia.reduce((s,d)=>s+d.minsReal,0)/ciclosDia.length) : null;
                const minsColor = minsMedio==null?C.muted:minsMedio<=90?C.green:minsMedio<=120?C.amber:C.red;
                return (
                  <tr key={r.id} style={{borderBottom:`1px solid ${C.gridLine}`}}>
                    <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11,fontWeight:700}}>{r.fecha}</td>
                    <td style={{padding:"8px 10px"}}>
                      {minsMedio!=null
                        ? <span style={{fontWeight:800,color:minsColor,fontFamily:"monospace"}}>{minsMedio} min <span style={{fontSize:10,color:C.muted}}>({ciclosDia.length} ciclos)</span></span>
                        : <span style={{color:C.muted,fontSize:11}}>Sin datos en BD</span>}
                    </td>
                    <td style={{padding:"8px 10px",fontWeight:800,color:colLim(r.nh4,NH4_LIM),fontFamily:"monospace"}}>{r.nh4?.toFixed(1)}</td>
                    <td style={{padding:"8px 10px"}}><Badge color={colLim(r.nh4,NH4_LIM)}>{lblLim(r.nh4,NH4_LIM)}</Badge></td>
                    <td style={{padding:"8px 10px",fontWeight:800,color:colLim(r.no3,NO3_LIM),fontFamily:"monospace"}}>{r.no3?.toFixed(1)}</td>
                    <td style={{padding:"8px 10px"}}><Badge color={colLim(r.no3,NO3_LIM)}>{lblLim(r.no3,NO3_LIM)}</Badge></td>
                    <td style={{padding:"8px 10px",fontSize:11,color:C.muted}}>{r.nota}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div style={{marginTop:10,fontSize:11,color:C.muted}}>
            🟢 Min/ciclo ≤90 = SICAIR eficiente · 🟡 ≤120 = aceptable · 🔴 &gt;120 = sobreaireo
          </div>
          {(() => {
            const conMins = calidad.filter(r => (data||[]).some(d => d.datetime?.toISOString().slice(0,10) === r.fecha));
            if (conMins.length < 2) return null;
            const minsMedios = conMins.map(r => {
              const ciclosDia = (data||[]).filter(d => d.datetime?.toISOString().slice(0,10) === r.fecha);
              return ciclosDia.length ? Math.round(ciclosDia.reduce((s,d)=>s+d.minsReal,0)/ciclosDia.length) : null;
            }).filter(Boolean);
            const minsMin = Math.min(...minsMedios), minsMax = Math.max(...minsMedios);
            const nh4Max = Math.max(...conMins.map(r=>r.nh4));
            const todosOk = conMins.every(r=>r.nh4<=5&&r.no3<=10);
            if (!todosOk) return null;
            return (
              <div style={{marginTop:12,background:"#f0fdf4",border:"1.5px solid #4a9c3f",borderRadius:8,padding:"12px 16px",fontSize:12,color:"#1a3a1a",lineHeight:1.7}}>
                <b>📌 Conclusión automática:</b> En los {conMins.length} días analizados, la planta aireó entre <b>{minsMin} y {minsMax} min/ciclo</b> manteniendo siempre NH₄ ≤ <b>{nh4Max.toFixed(1)} mg/L</b> — dentro del límite legal. Esto confirma que con <b>~{minsMin} min/ciclo</b> se garantiza la calidad del efluente, con un ahorro potencial de <b>{minsMax-minsMin} min/ciclo</b> respecto al máximo observado.
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [reactores,   setReactores]   = useState({});
  const [pred,        setPred]        = useState(null);
  const [historico,   setHistorico]   = useState(null);
  const [deriva,      setDeriva]      = useState(null);
  const [diagHistorico, setDiagHistorico] = useState(null);
  const [showOnboard, setShowOnboard] = useState(true);
  const [demoMode,    setDemoMode]    = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError,   setAutoError]   = useState(null);
  const [informePDF,  setInformePDF]  = useState(false);
  const [tab,         setTab]         = useState("pred");
  const [toxUmbral,   setToxUmbral]   = useState(40);
  const [informe,     setInforme]     = useState(null);
  const [quiosco,     setQuiosco]     = useState(false);
  const [incidencias, setIncidencias] = useState(() => { try { return JSON.parse(localStorage.getItem("sicair_incidencias")||"[]"); } catch { return []; } });
  const [calidad,     setCalidad]     = useState(() => { try { return JSON.parse(localStorage.getItem("sicair_calidad")||"[]"); } catch { return []; } });
  const [alertas,     setAlertas]     = useState(ALERT_DEF);
  const [alertasDisp, setAlertasDisp] = useState([]);
  const [dismissed,   setDismissed]   = useState(new Set());
  const [addingR,     setAddingR]     = useState(false);
  const [newRN,       setNewRN]       = useState("R2");
  const prevDispRef = useRef([]);
  const {modo: modoDepuradora, historico: modoHistorico} = useModoDepuradora();
  const recoveryEstado = useRecoveryEstado();

  const nombres = Object.keys(reactores);
  const data = nombres.length>0 ? reactores[nombres[0]] : null;

  useEffect(() => {
    const dd=generarDemoData(), dp=generarDemoPred(dd), dh=generarDemoHistorico();
    setReactores({"DEMO":dd}); setPred(dp); setHistorico(dh);
    setDemoMode(true); setShowOnboard(false); setTab("pred");
  }, []);

  const salirDemo = () => {
    setReactores({}); setPred(null); setHistorico(null); setDeriva(null);
    setDemoMode(false); setShowOnboard(false); setTab("pred");
    setTimeout(() => cargarDesdeGitHub(), 100);
  };

  const cargarDesdeGitHub = useCallback(async () => {
    setAutoLoading(true); setAutoError(null);
    try {
      const [rPred, rHist, rCiclos, rDiag] = await Promise.all([
        fetch(githubUrl('prediccion_sicair.json')),
        fetch(githubUrl('prediccion_historico.json')),
        fetch(githubUrl('datos_ciclos.json')),
        fetch(githubUrl('diagnosticos_historico.json')).catch(()=>null),
      ]);
      if (!rPred.ok || !rCiclos.ok) throw new Error("Error cargando datos");
      const [jPred, jHist, jCiclos] = await Promise.all([
        rPred.json(), rHist.json(), rCiclos.json()
      ]);
      if (jPred?.predicciones) setPred(jPred);
      if (Array.isArray(jHist)) setHistorico(jHist);
      if (rDiag?.ok) { const jDiag = await rDiag.json(); if (Array.isArray(jDiag)) setDiagHistorico(jDiag); }
      if (jCiclos?.ciclos) {
        const rows = jCiclos.ciclos.map(c => ({
          ...c, datetime: new Date(c.datetime),
        })).filter(c => c.AUR > 0 && c.minsReal > 0 && c.minsReal < 400);
        if (rows.length) { setReactores({"R1": rows}); setDemoMode(false); setShowOnboard(false); setTab("pred"); }
      }
    } catch(e) { setAutoError("Error cargando desde GitHub"); }
    setAutoLoading(false);
  }, []);

  useEffect(() => { cargarDesdeGitHub(); }, []);

  useEffect(() => {
    if (!data) return;
    const nuevas = evaluarAlertas(alertas,data,pred);
    setAlertasDisp(nuevas);
    nuevas.forEach(a => { if(!prevDispRef.current.find(p=>p.id===a.id)&&!dismissed.has(a.id)&&a.sonido) playAlertTone(a.severidad==="critica"?"critical":"warning"); });
    prevDispRef.current = nuevas;
  }, [data,pred,alertas]);

  const alertasVis = alertasDisp.filter(a=>!dismissed.has(a.id));
  const handleCSV = useCallback((raw,n="R1") => { const rows=parseCSV(raw,n); if(!rows.length){alert("Sin datos válidos.");return;} setDemoMode(false); setHistorico(null); setPred(null); setReactores(prev=>({...prev,[n]:rows})); }, []);
  const handleXLSX = useCallback((buf,n="R1") => { parseXLSX(buf,n).then(rows=>{ if(!rows.length){alert("Sin datos válidos.");return;} setDemoMode(false); setHistorico(null); setPred(null); setReactores(prev=>({...prev,[n]:rows})); }).catch(e=>alert("Error: "+e.message)); }, []);
  const handleJSON = useCallback(raw => {
    const j=parseJSON(raw); if(!j) return;
    if(Array.isArray(j)){
      // distinguir historial predicciones vs historial diagnósticos
      if(j[0]?.eventos!==undefined) setDiagHistorico(j);
      else setHistorico(j);
      return;
    }
    if(j.deriva!==undefined){setDeriva(j);return;}
    setPred(j); setTab("pred");
  }, []);

  const tabs = [
    {id:"pred",        label:"🧠 Predicciones",  disabled:!pred},
    {id:"semana",      label:"📅 Semanal",        disabled:!data},
    {id:"calidad",     label:"🧪 Calidad efluente", disabled:false},
    {id:"incidencias", label:"📋 Incidencias",    disabled:false, badge:incidencias.length},
    {id:"alertas",     label:"🔔 Alertas",        disabled:false, badge:alertasVis.length, badgeColor:alertasVis.some(a=>a.severidad==="critica")?C.red:C.amber},
    {id:"validacion",  label:"🎯 Validación",     disabled:false},
    {id:"exportar",    label:"📤 Exportar CSV",   disabled:!data||demoMode},
    {id:"diario",      label:"📅 Resumen diario",  disabled:!data},
    {id:"soplante",    label:"⚡ Soplante VSD",    disabled:!pred},
  ];

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"system-ui,sans-serif"}}>
      {quiosco&&<ModoQuiosco data={data} pred={pred} toxUmbral={toxUmbral} incidencias={incidencias} alertasDisparadas={alertasDisp} onClose={()=>setQuiosco(false)}/>}
      {informe&&<InformeModal texto={informe} onClose={()=>setInforme(null)}/>}
      {informePDF&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setInformePDF(false)}>
          <div style={{background:"#fff",borderRadius:20,padding:"32px 36px",width:360,boxShadow:"0 8px 40px rgba(0,0,0,0.18)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:6,color:"#111"}}>📄 Generar Informe PDF</div>
            <div style={{fontSize:12,color:"#888",marginBottom:24}}>Selecciona el período del informe</div>
            {[
              {id:"dia",label:"Último día",desc:"~14-15 ciclos"},
              {id:"semana",label:"Última semana",desc:"~100 ciclos"},
              {id:"mes",label:"Último mes",desc:"~420 ciclos"},
              {id:"anio",label:"Último año",desc:"~5.000 ciclos"},
            ].map(p=>(
              <button key={p.id} onClick={()=>{generarInformePDF(data,pred,historico,incidencias,p.id,diagHistorico);setInformePDF(false);}}
                style={{width:"100%",background:"#fafafa",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 18px",marginBottom:10,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,color:"#111",fontSize:13}}>{p.label}</span>
                <span style={{fontSize:11,color:"#888"}}>{p.desc} →</span>
              </button>
            ))}
            <button onClick={()=>setInformePDF(false)} style={{width:"100%",background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",marginTop:4}}>Cancelar</button>
          </div>
        </div>
      )}
      <AlertaBanner alertas={alertasVis} onDismiss={id=>setDismissed(prev=>new Set([...prev,id]))}/>

      <div style={{background:"#fff",borderBottom:"1px solid #f0f0f0",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <SensaraLogo size={34}/>
          <div style={{width:1,height:24,background:"#e8e8e8"}}/>
          <div><div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.02em",color:C.text}}>SIC<span style={{color:C.green}}>AIR</span> <span style={{fontWeight:300,color:"#bbb"}}>3.0</span></div><div style={{fontSize:10,color:C.muted,letterSpacing:"0.03em",marginTop:1}}>Martorell · EDAR</div></div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {nombres.map((n,i)=><Badge key={n} color={RC[i]}>{n}: {reactores[n].length}</Badge>)}
          {pred&&!demoMode&&<Badge color={C.purple}>🧠 Modelo cargado</Badge>}
          {!demoMode&&<ModoDepuradoraBadge modo={modoDepuradora}/>}
          {!demoMode&&<RecoveryBadge estado={recoveryEstado}/>}
          {alertasDisp.length>0&&<Badge color={alertasDisp.some(a=>a.severidad==="critica")?C.red:C.amber}>🔔 {alertasDisp.length}</Badge>}
          <div style={{display:"flex",alignItems:"center",gap:6,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px"}}>
            <span style={{fontSize:11,color:C.muted}}>SICTOX:</span>
            <input type="range" min={10} max={80} value={toxUmbral} onChange={e=>setToxUmbral(+e.target.value)} style={{width:54,accentColor:C.green}}/>
            <span style={{fontSize:12,fontWeight:700,color:C.green,fontFamily:"monospace",minWidth:30}}>{toxUmbral}%</span>
          </div>
          <button onClick={()=>setQuiosco(true)} style={{background:"#0d1117",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🖥 Quiosco</button>
          <button onClick={cargarDesdeGitHub} disabled={autoLoading} style={{background:autoLoading?"#f0f0f0":C.green,color:autoLoading?"#999":"#fff",border:"none",borderRadius:20,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:autoLoading?"default":"pointer"}}>
            {autoLoading?"⏳":"↻"} Actualizar
          </button>
          {data&&<button onClick={()=>setInformePDF(true)} style={{background:"#fff",color:C.green,border:`1px solid ${C.green}`,borderRadius:20,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📄 Informe</button>}
        </div>
      </div>

      <div style={{padding:"28px 40px",maxWidth:1280,margin:"0 auto"}}>
        {showOnboard&&<OnboardingPanel reactores={reactores} pred={pred} historico={historico} deriva={deriva} onSkip={()=>setShowOnboard(false)} handleCSV={handleCSV} handleXLSX={handleXLSX} handleJSON={handleJSON} parseJSON={parseJSON} setHistorico={setHistorico} setDeriva={setDeriva} nombres={nombres} addingR={addingR} setAddingR={setAddingR} newRN={newRN} setNewRN={setNewRN}/>}
        {!showOnboard&&<button onClick={()=>setShowOnboard(true)} style={{background:C.panel,color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:14}}>⚙️ Cargar archivos</button>}
        {demoMode&&<DemoBanner onExit={salirDemo}/>}
        {pred&&!demoMode&&<DatoCongeladoBanner pred={pred}/>}
        <MeteoPanel/>
        {data&&<Semaforo data={data} pred={pred} toxUmbral={toxUmbral} alertasDisparadas={alertasDisp} alertas={alertas}/>}
        {data&&<ScoreSalud data={data}/>}
        {data&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
            <KpiCard icon="🔬" label="AUR actual"    value={data.at(-1)?.AUR?.toFixed(2)||"—"}                     unit="mg O₂/L·h" color={C.green}/>
            <KpiCard icon="💨" label="Min soplante"  value={data.at(-1)?.minsReal||"—"}                            unit="min/ciclo"  color={C.amber}/>
            <KpiCard icon="🔮" label="AUR pred. +1c" value={pred?.predicciones?.["1c"]?.aur_pred?.toFixed(2)||"—"} unit="mg O₂/L·h" color={C.greenLight}/>
            <KpiCard icon="🧫" label="TRC pred. +1c" value={pred?.predicciones?.["1c"]?.trc_pred?.toFixed(1)||"—"} unit="días"       color={C.purple}/>
            <KpiCard icon="🔔" label="Alertas"       value={alertasDisp.length||"0"} unit={alertasDisp.length?"⚠️ revisar":"✅ todo OK"} color={alertasDisp.length?C.red:C.green}/>
          </div>
        )}

        <div style={{display:"flex",gap:4,marginBottom:20,flexWrap:"wrap",borderBottom:"1px solid #f0f0f0",paddingBottom:0}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>!t.disabled&&setTab(t.id)} style={{
              background:"transparent",color:tab===t.id?C.green:t.disabled?"#d0d0d0":C.muted,
              border:"none",borderBottom:tab===t.id?`2px solid ${C.green}`:"2px solid transparent",
              padding:"10px 16px",fontSize:12,fontWeight:tab===t.id?600:400,
              cursor:t.disabled?"default":"pointer",transition:"all .15s",
              position:"relative",marginBottom:-1,letterSpacing:"0.01em",whiteSpace:"nowrap",
            }}>
              {t.label}{t.badge>0&&<span style={{marginLeft:6,background:t.badgeColor||C.amber,color:"#fff",borderRadius:20,padding:"1px 6px",fontSize:9,fontWeight:700}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {tab==="pred"        &&pred&&<PredPanel pred={pred} toxUmbral={toxUmbral} data={data}/>}
        {tab==="pred"        &&pred&&data&&<DiagnosticoPanel data={data} pred={pred} alertas={alertas}/>}
        {tab==="pred"        &&pred&&data&&<HistoricoChart data={data} pred={pred} diagHistorico={diagHistorico} modoHistorico={modoHistorico}/>}
        {tab==="semana"      &&data&&<ComparativaPanel data={data}/>}
        {tab==="calidad"     &&<CalidadEfluentePanel calidad={calidad} setCalidad={v=>{setCalidad(v);try{localStorage.setItem("sicair_calidad",JSON.stringify(v));}catch{}}} data={data}/>}
        {tab==="incidencias" &&<IncidenciasPanel incidencias={incidencias} setIncidencias={setIncidencias} diagHistorico={diagHistorico} setDiagHistorico={setDiagHistorico} parseJSON={parseJSON}/>}
        {tab==="alertas"     &&<AlertasPanel alertas={alertas} setAlertas={setAlertas} disparadas={alertasDisp} onTest={()=>playAlertTone("critical")}/>}
        {tab==="validacion"  &&<ValidacionPanel data={data} demoMode={demoMode} historico={historico}/>}
        {tab==="exportar"    &&data&&!demoMode&&<ExportCSV data={data}/>}
        {tab==="diario"      &&data&&<ResumenDiarioPanel data={data} historico={historico} demoMode={demoMode}/>}
        {tab==="soplante"    &&pred&&<ModeloFisicoPanel pred={pred} data={data}/>}

        <div style={{marginTop:40,textAlign:"center",fontSize:11,color:"#ccc",paddingTop:24,borderTop:"1px solid #f4f4f4",display:"flex",justifyContent:"center",alignItems:"center",gap:8}}>
          <SensaraLogo size={18}/>
          <span><span style={{color:C.green,fontWeight:700}}>SENSARA</span> · sensaratech.com · Logroño, La Rioja · SICAIR 3.0</span>
        </div>
      </div>
    </div>
  );
}
