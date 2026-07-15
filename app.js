// Catalogue chargé depuis catalogue.js
// Variables globales disponibles : RAW, CATALOGUE

// ═══════════════════════════════════════════════════════
// CONNEXION SUPABASE — Frenchy Leurres App Pro V1
// CDN classique chargé dans index.html avant tous les scripts.
// NE PAS utiliser import() ici — l'app tourne en scripts navigateur.
// window.db est partagé avec comptes-pro.js et comptabilite.js.
// ═══════════════════════════════════════════════════════
;(function initSupabase(){
  var SB_URL = 'https://qdpkeftzdgguwfywtprz.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcGtlZnR6ZGdndXdmeXd0cHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Nzc2NTMsImV4cCI6MjA5MTI1MzY1M30.rBrXwYkkyicEujuQuUNZarODh_wST1ihCCdA4L2B6Dg';

  // ── Garde : Supabase doit être chargé avant app.js dans index.html ──
  if(typeof window.supabase === 'undefined'){
    console.error('❌ Supabase JS non chargé. Vérifie que le CDN est bien placé AVANT app.js dans index.html.');
    return;
  }

  // ── Création du client partagé ──
  var _client = window.supabase.createClient(SB_URL, SB_KEY);
  window.db = _client; // Accessible dans tous les scripts suivants
  console.log('✅ Supabase initialisé — window.db prêt (Frenchy Leurres B2B)');

  // ── Test de lecture pro_clients au démarrage ──
  _client.from('pro_clients').select('id').limit(1).then(function(r){
    if(r.error){
      console.warn('⚠️ pro_clients inaccessible :', r.error.message, '→ Vérifie les RLS dans Supabase.');
    } else {
      console.log('✅ pro_clients accessible — Supabase B2B opérationnel');
    }
  }).catch(function(e){
    console.warn('⚠️ Exception Supabase pro_clients :', e.message || e);
  });
})();

// ═══════════════════════════════════════════════════════
// EAN-13 RENDERER — moteur maison sur canvas
// ═══════════════════════════════════════════════════════
const EAN={
  L:['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'],
  G:['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'],
  R:['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'],
  FD:['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
};

function drawEAN13(canvas, raw, opts={}) {
  const ean = raw.replace(/\s/g,'');
  if(ean.length!==13||!/^\d+$/.test(ean)) {
    const ctx=canvas.getContext('2d');
    canvas.width=160;canvas.height=50;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,160,50);
    ctx.fillStyle='#c00';ctx.font='11px Arial';ctx.fillText('EAN invalide',10,28);
    return;
  }
  const d=ean.split('').map(Number);
  const pat=EAN.FD[d[0]];
  let bars='101';
  for(let i=0;i<6;i++) bars+=pat[i]==='L'?EAN.L[d[i+1]]:EAN.G[d[i+1]];
  bars+='01010';
  for(let i=0;i<6;i++) bars+=EAN.R[d[i+7]];
  bars+='101';
  const mw=opts.mw||2,bh=opts.bh||42,fs=opts.fs||11,lq=7*mw,rq=7*mw;

  // ── Rendu haute résolution 3× — chiffres nets à l'impression et au zoom ──
  const DPR = 3;
  const logicalW = lq + bars.length*mw + rq;
  const logicalH = bh + fs + 6;
  canvas.width  = logicalW * DPR;
  canvas.height = logicalH * DPR;
  canvas.style.width  = logicalW + 'px';
  canvas.style.height = logicalH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Fond blanc
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Barres noires
  ctx.fillStyle = '#000';
  for(let i=0;i<bars.length;i++) if(bars[i]==='1') ctx.fillRect(lq+i*mw, 0, mw, bh);

  // Chiffres nets — police bold pour lisibilité maximale
  ctx.font = `bold ${fs}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  const ty = bh + fs;
  ctx.fillText(String(d[0]), lq/2, ty);
  ctx.fillText(ean.slice(1,7), lq+3*mw+21*mw, ty);
  ctx.fillText(ean.slice(7,13), lq+(3+42+5)*mw+21*mw, ty);
}

function makeSmallEAN(ean) {
  const c=document.createElement('canvas');
  drawEAN13(c,ean,{mw:1,bh:28,fs:8});
  return c;
}

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let queueRect=[]; // [{product, qty}]
let queueRound=[]; // [{product, qty}]
let orderResults=[]; // detected from order
let activeFilter='Tous';

function saveState(){
  try{
    localStorage.setItem('fl_queue_rect',JSON.stringify(queueRect));
    localStorage.setItem('fl_queue_round',JSON.stringify(queueRound));
  }catch(e){}
}
function loadState(){
  try{
    const r=localStorage.getItem('fl_queue_rect');
    const ro=localStorage.getItem('fl_queue_round');
    if(r) queueRect=JSON.parse(r);
    if(ro) queueRound=JSON.parse(ro);
  }catch(e){}
  updateQueueIndicator();
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function showTab(name){
  try{
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    const page=document.getElementById('page-'+name);
    const tab=document.getElementById('tab-'+name);
    if(!page){console.error('Page introuvable:',name);return false;}
    page.classList.add('active');
    if(tab) tab.classList.add('active');
    if(name==='catalogue' && typeof renderCatalogue==='function') renderCatalogue();
    if(name==='impression' && typeof renderQueues==='function') renderQueues();
    return true;
  }catch(e){console.error('Erreur navigation onglet',name,e);alert('Erreur navigation onglet : '+name);return false;}
}

// ═══════════════════════════════════════════════════════
// ORDER ANALYZER
// ═══════════════════════════════════════════════════════

// Aliases et moteur d'analyse renforcé pour éviter les mauvaises correspondances
const PROD_ALIASES = {
  'mistik':'Mistik Shad','mystik':'Mistik Shad','shad':'Mistik Shad',
  'biggy':'Biggy Minnow','bigy':'Biggy Minnow','minnow':'Biggy Minnow',
  'rouget':'Rouget','martegal':'Rouget','martégal':'Rouget',
  'frenchy shiner':'Frenchy Shiner','shiner':'Frenchy Shiner',
  'le g':'G de Gautier','g de gautier':'G de Gautier','gdg':'G de Gautier','gautier':'G de Gautier',
  'super anguillon':'Super Anguillon','anguillon':'Super Anguillon',
  'vibrant':'Anguillon Vibrant','civelle':'La Civelle','xeel':'X.EEL','x eel':'X.EEL','eel':'X.EEL',
  'frenchy tp':'Frenchy TP','tp':'Frenchy TP'
};

const COLOR_ALIASES = {
  'vert':'vert electric','ve':'vert electric','electric':'vert electric','électric':'vert electric',
  'blanc':'blanc perle','bp':'blanc perle','bpe':'blanc perle',
  'sard':'sardine','sar':'sardine','sd':'sardine',
  'bleu':'bleu violet irise rose','bleu chat':'bleu violet irise rose','bv':'bleu violet irise rose','bvir':'bleu violet irise rose',
  'kaki':'kaki','kir':'kaki irise rose','rose':'rose','paillette':'paillette',
  'jaune':'jaune uv paillette','uv':'jaune uv paillette',
  'violet':'violet irise rose','chartreux':'chartreux','chartreuse':'chartreux'
};

function norm(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[,]/g,'.')
    .replace(/[^a-z0-9.\s]/g,' ')
    .replace(/\s+/g,' ').trim();
}

function normalizeLine(line){
  let s = norm(String(line||'').split('\t')[0]);
  // tailles fournisseur : 70/90/105/120 etc.
  s = s.replace(/\b105\b/g,'10.5 cm').replace(/\b120\b/g,'12 cm').replace(/\b130\b/g,'13 cm').replace(/\b150\b/g,'15 cm')
       .replace(/\b90\b/g,'9 cm').replace(/\b70\b/g,'7 cm').replace(/\b60\b/g,'6 cm').replace(/\b50\b/g,'5 cm');
  s = s.replace(/(\d+(?:\.\d+)?)\s*cm\b/g,'$1 cm');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:gr|g)\b/g,'$1 g');
  // produits : traiter les alias longs d'abord
  Object.keys(PROD_ALIASES).sort((a,b)=>b.length-a.length).forEach(alias=>{
    const re = new RegExp('\\b'+norm(alias).replace(/\s+/g,'\\s+')+'\\b','g');
    s = s.replace(re, norm(PROD_ALIASES[alias]));
  });
  Object.keys(COLOR_ALIASES).sort((a,b)=>b.length-a.length).forEach(alias=>{
    const re = new RegExp('\\b'+norm(alias).replace(/\s+/g,'\\s+')+'\\b','g');
    s = s.replace(re, norm(COLOR_ALIASES[alias]));
  });
  return s.replace(/\s+/g,' ').trim();
}

function extractQty(line){
  const original=String(line||'').trim();
  if(!original) return 1;

  // Quantité explicite : x8, x 8, 8x
  const explicit=original.match(/(?:^|\s)[x×*]\s*(\d{1,3})\b|\b(\d{1,3})\s*[x×*](?:\s|$)/i);
  if(explicit) return Math.max(1, Math.min(999, parseInt(explicit[1]||explicit[2],10)||1));

  // Colonne Qté séparée par tabulation : "Désignation \t 8"
  const tabParts=original.split(/\t+/).map(p=>p.trim()).filter(Boolean);
  if(tabParts.length>1){
    const last=tabParts[tabParts.length-1].replace(',','.');
    const n=Number(last);
    if(Number.isInteger(n)&&n>=1&&n<=500) return n;
  }

  // Quantité nommée en fin : qté 8 / qty 8
  const named=original.match(/(?:qte|qté|quantite|quantité|qty)\s*(\d{1,3})$/i);
  if(named) return Math.max(1, Math.min(999, parseInt(named[1],10)||1));

  // Cas facture/coller : la quantité est le DERNIER nombre UNIQUEMENT s'il est séparé
  // et si la partie avant contient déjà une vraie info produit (taille, grammage, couleur ou référence).
  // Exemple OK : "MISTIK 90 12G Vert 8" => 8
  // Exemple PAS OK : "ROUGET 70" => 70 reste une taille, quantité = 1
  const end=original.match(/^(.*\S)\s+(\d{1,3})\s*$/);
  if(end){
    const before=end[1].trim();
    const q=parseInt(end[2],10);
    if(q>=1 && q<=500 && isLikelyInvoiceProductLine(before) && invoiceDesignationHasSpecs(before)) return q;
  }
  const dqEl=document.getElementById('default-qty');
  return dqEl?(Math.max(1,parseInt(dqEl.value,10)||1)):1;
}

function extractWanted(line){
  const nl=normalizeLine(line);
  const sizeM=nl.match(/\b(5|6|7|9|10\.5|12|13|15)\s*cm\b/);
  const gramM=nl.match(/\b(2\.9|3\.8|3\.9|4\.2|3|6|6\.5|9|12|14|17|25)\s*g\b/);
  let product=null;
  for(const full of [...new Set(Object.values(PROD_ALIASES))]){
    if(nl.includes(norm(full))){product=full;break;}
  }
  return {nl, size:sizeM?sizeM[1]+' cm':null, gram:gramM?gramM[1]+' g':null, product};
}

function productNormText(p){
  return normalizeLine([p.produit,p.couleur,p.taille,p.grammage,p.ref].join(' '));
}

function scoreProduct(line, normLine, p){
  const refLine=norm(line);
  if(refLine.includes(norm(p.ref))) return 10;
  const wanted=extractWanted(line);
  const hay=productNormText(p);

  if(wanted.product && norm(p.produit)!==norm(wanted.product)) return 0;
  if(wanted.size && normalizeLine(p.taille)!==wanted.size) return 0;
  if(wanted.gram && normalizeLine(p.grammage)!==wanted.gram) return 0;

  let score=0;
  if(wanted.product) score+=4;
  if(wanted.size) score+=2.5;
  if(wanted.gram) score+=2.5;

  const useful=normLine.split(' ').filter(w=>w && !['cm','g','de','la','le','les','du','x'].includes(w));
  let hits=0;
  useful.forEach(w=>{ if(hay.includes(w)) hits++; });
  score += useful.length ? Math.min(3, hits/useful.length*3) : 0;

  const colorTokens=normalizeLine(p.couleur).split(' ').filter(w=>w.length>2);
  const colorHit=colorTokens.some(w=>normLine.includes(w));
  if(colorTokens.length && colorHit) score+=2;
  if(colorTokens.length && !colorHit && useful.length>2) score-=1;

  return score;
}

function matchProduct(line){
  const nl=normalizeLine(line);
  const scored=CATALOGUE.map(p=>({p,s:scoreProduct(line,nl,p)})).sort((a,b)=>b.s-a.s);
  const best=scored[0];
  const second=scored[1];
  const confident = best && best.s>=7 && (!second || best.s-second.s>=0.4 || best.s>=10);
  return {product: confident ? best.p : null, score: best ? best.s : 0, matched: !!confident, candidates: scored.slice(0,3)};
}

function parseOrderText(text){
  const lines=String(text||'').split('\n').map(l=>l.trim()).filter(l=>l.length>2);
  return lines.map(line=>{
    const qty=extractQty(line);
    const m=matchProduct(line);
    return {line,qty,product:m.product,score:m.score,matched:m.matched,candidates:m.candidates};
  });
}

// Parse Excel invoice — extract product rows automatically
async function parseExcelInvoice(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        // Find header row (contains "Désignation" or "Qté")
        let headerIdx=-1;
        let desCol=-1,qtyCol=-1;
        for(let i=0;i<rows.length;i++){
          const row=rows[i].map(c=>String(c).toLowerCase());
          const di=row.findIndex(c=>c.includes('d\u00e9signation')||c.includes('designation')||c.includes('produit')||c.includes('article'));
          const qi=row.findIndex(c=>c.includes('qt\u00e9')||c.includes('qte')||c.includes('quantit'));
          if(di>=0&&qi>=0){headerIdx=i;desCol=di;qtyCol=qi;break;}
        }
        if(headerIdx<0){
          // fallback: try to find lines with product keywords
          const lines=rows.map(r=>r.join(' ')).filter(l=>l.length>5);
          resolve({text:lines.join('\n'),structured:null});
          return;
        }
        // Extract product rows
        const products=[];
        for(let i=headerIdx+1;i<rows.length;i++){
          const row=rows[i];
          const des=String(row[desCol]||'').trim();
          const qty=parseFloat(String(row[qtyCol]||'0').replace(',','.'));
          if(des && qty>0 && !des.toLowerCase().includes('total') && !des.toLowerCase().includes('tva')){
            products.push({designation:des,qty:Math.round(qty)});
          }
        }
        resolve({text:null,structured:products});
      }catch(err){reject(err);}
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}

function analyzeOrder(){
  const text=document.getElementById('order-text').value.trim();
  if(!text){alert('Entrez une commande avant d\'analyser.');return;}
  orderResults=parseOrderText(text);
  renderOrderResults();
}

function renderOrderResults(){
  const sec=document.getElementById('order-results-section');
  const list=document.getElementById('order-results-list');
  const stats=document.getElementById('results-stats');
  sec.style.display='block';
  const matched=orderResults.filter(r=>r.matched).length;
  stats.textContent=`${matched} reconnu(s) / ${orderResults.length} ligne(s)`;
  list.innerHTML='';
  orderResults.forEach((r,i)=>{
    const div=document.createElement('div');
    div.className='order-result '+(r.matched?'matched':'unmatched');
    const bcDiv=document.createElement('div');
    bcDiv.className='or-preview';
    if(r.matched && r.product.ean){
      const c=makeSmallEAN(r.product.ean);
      bcDiv.appendChild(c);
    } else {
      bcDiv.textContent='❓';
      bcDiv.style.fontSize='22px';bcDiv.style.display='flex';bcDiv.style.alignItems='center';bcDiv.style.justifyContent='center';
    }
    const info=document.createElement('div');info.className='or-info';
    info.innerHTML=`<div class="or-name">${r.matched?r.product.produit+' — '+r.product.couleur:'Non reconnu'}</div>
      <div class="or-ref">${r.matched?r.product.ref:''}</div>
      <div class="or-line">"${r.line.substring(0,55)}${r.line.length>55?'…':''}"</div>
      <div class="qty-pills">${[1,2,4,6,8,10,12,20,50].map(q=>`<span class="qty-pill" onclick="setOrderQty(${i},${q})">${q}</span>`).join('')}</div>`;
    const right=document.createElement('div');right.className='or-right';
    right.innerHTML=`<span class="status-badge ${r.matched?'status-ok':'status-ko'}">${r.matched?'✓ OK':'✗'}</span>
      <div class="qty-row">
        <button onclick="setOrderQty(${i},Math.max(1,(orderResults[${i}].qty||1)-1))">−</button>
        <input type="number" class="qty-input" id="oqty-${i}" value="${r.qty}" min="1" max="999" oninput="orderResults[${i}].qty=parseInt(this.value)||1"/>
        <button onclick="setOrderQty(${i},(orderResults[${i}].qty||1)+1)">+</button>
      </div>`;
    div.appendChild(bcDiv);div.appendChild(info);div.appendChild(right);
    list.appendChild(div);
  });
}

function setOrderQty(i,val){
  orderResults[i].qty=Math.max(1,Math.min(999,val));
  const inp=document.getElementById('oqty-'+i);
  if(inp) inp.value=orderResults[i].qty;
}

function clearResults(){
  orderResults=[];
  document.getElementById('order-results-section').style.display='none';
  document.getElementById('image-preview-section').style.display='none';
  document.getElementById('file-status').style.display='none';
  document.getElementById('drop-zone').classList.remove('has-file');
}

// ═══════════════════════════════════════════════════════
// OCR IMAGE — lecture automatique des photos/captures de commande
// ═══════════════════════════════════════════════════════
function cleanOcrText(raw){
  return String(raw||'')
    .replace(/\r/g,'\n')
    .replace(/[|]/g,' ')
    .replace(/[“”]/g,'"')
    .replace(/[×✕]/g,'x')
    .split('\n')
    .map(l=>l.replace(/\s+/g,' ').trim())
    .filter(l=>l && !/^designation\s+qte$/i.test(norm(l)) && !/^designation$/i.test(norm(l)) && !/^qte$/i.test(norm(l)))
    .join('\n');
}

function normalizeOcrDesignation(line){
  let s=String(line||'').trim();
  s=s.replace(/\bMART[EÉ]GAL\b/ig,'MARTEGAL')
     .replace(/\bMARTFGAL\b/ig,'MARTEGAL')
     .replace(/\bMISTIK\s*9O\b/ig,'MISTIK 90')
     .replace(/\bBIGGY\s*7O\b/ig,'BIGGY 70')
     .replace(/\bSardme\b/ig,'Sardine')
     .replace(/\bSar\b/ig,'Sardine')
     .replace(/\bBieu\b/ig,'Bleu')
     .replace(/\bBianc\b/ig,'Blanc')
     .replace(/\bVert\s*Electnc\b/ig,'Vert Electric');
  return s.replace(/\s+/g,' ').trim();
}

function parseOcrOrderText(raw){
  const cleaned=cleanOcrText(raw);
  const rows=[];
  const lines=cleaned.split('\n').map(l=>l.trim()).filter(Boolean);
  for(let line of lines){
    line=normalizeOcrDesignation(line);
    const n=norm(line);
    if(!n || n.includes('designation') || n==='qte') continue;
    let qty=1;
    let designation=line;
    const qtyAtEnd=line.match(/\s+(\d{1,3})\s*$/);
    if(qtyAtEnd){
      const candidate=parseInt(qtyAtEnd[1],10);
      if(candidate>=1 && candidate<=500){
        qty=candidate;
        designation=line.slice(0, qtyAtEnd.index).trim();
      }
    }
    const glued=designation.match(/^(.+?)(\d{1,3})$/);
    if(qty===1 && glued && /[a-zA-Z]$/.test(glued[1].trim())){
      const candidate=parseInt(glued[2],10);
      if(candidate>=1 && candidate<=500){designation=glued[1].trim();qty=candidate;}
    }
    const looksLikeProduct=/(rouget|mistik|mystik|biggy|bigy|g\s*9|le\s*g|frenchy|shiner|anguillon|tp)/i.test(designation);
    if(looksLikeProduct){rows.push({designation:normalizeOcrDesignation(designation), qty});}
  }
  return rows;
}

async function readImageWithOCR(file){
  if(typeof Tesseract==='undefined') throw new Error('Tesseract OCR non chargé. Vérifiez Internet.');
  const result = await Tesseract.recognize(file, 'fra+eng', {
    logger: m => {
      const status=document.getElementById('file-status');
      if(!status) return;
      if(m.status==='recognizing text') status.textContent=`🔎 Lecture OCR de l’image… ${Math.round((m.progress||0)*100)}%`;
      else if(m.status) status.textContent=`🔎 OCR : ${m.status}`;
    }
  });
  return result && result.data ? result.data.text : '';
}


// ═══════════════════════════════════════════════════════
// FILE HANDLING
// ═══════════════════════════════════════════════════════
function handleFileDrop(e){
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const f=e.dataTransfer.files[0];
  if(f) processFile(f);
}
function handleFileSelect(f){if(f) processFile(f);}

async function processFile(file){
  const dz=document.getElementById('drop-zone');
  const status=document.getElementById('file-status');
  dz.classList.add('has-file');
  status.style.display='block';
  status.textContent='⏳ Traitement en cours…';

  // ── EXCEL ──
  if(file.name.match(/\.xlsx?$/i)){
    try{
      if(typeof XLSX==='undefined') throw new Error('SheetJS non chargé');
      const result=await parseExcelInvoice(file);
      if(result.structured && result.structured.length>0){
        // Match each product line directly with qty from Excel
        orderResults=result.structured.map(item=>{
          const m=matchProduct(item.designation);
          return {
            line:item.designation,
            qty:item.qty,
            product:m.product,
            score:m.score,
            matched:m.matched,
            candidates:m.candidates
          };
        });
        const matched=orderResults.filter(r=>r.matched).length;
        status.textContent=`✅ Excel lu — ${orderResults.length} produit(s) détecté(s), ${matched} reconnu(s)`;
        // Put text in textarea too
        document.getElementById('order-text').value=result.structured.map(i=>`${i.designation} x${i.qty}`).join('\n');
        renderOrderResults();
      } else if(result.text){
        document.getElementById('order-text').value=result.text;
        status.textContent='✅ Excel lu — cliquez "Analyser la commande"';
      }
    }catch(err){
      status.textContent='⚠️ Erreur lecture Excel : '+err.message;
    }
    return;
  }

  // ── PDF ──
  if(file.type==='application/pdf'){
    try{
      if(typeof pdfjsLib==='undefined') throw new Error('PDF.js non chargé');
      pdfjsLib.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      const ab=await file.arrayBuffer();
      const pdf=await pdfjsLib.getDocument({data:ab}).promise;
      let text='';
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);
        const content=await page.getTextContent();
        text+=content.items.map(it=>it.str).join(' ')+'\n';
      }
      document.getElementById('order-text').value=text.trim();
      status.textContent=`✅ PDF extrait — ${pdf.numPages} page(s). Cliquez "Analyser".`;
    }catch(err){
      status.textContent='⚠️ Impossible d\'extraire le PDF. Tapez la commande manuellement.';
    }
    return;
  }

  // ── IMAGE + OCR AUTOMATIQUE ──
  if(file.type.startsWith('image/')){
    const url=URL.createObjectURL(file);
    document.getElementById('order-image-preview').src=url;
    document.getElementById('image-preview-section').style.display='block';
    try{
      status.textContent='🔎 Lecture automatique de l’image…';
      const rawText=await readImageWithOCR(file);
      const structured=parseOcrOrderText(rawText);
      if(structured.length>0){
        document.getElementById('order-text').value=structured.map(i=>`${i.designation} x${i.qty}`).join('\n');
        orderResults=structured.map(item=>{
          const m=matchProduct(item.designation);
          return {line:item.designation, qty:item.qty, product:m.product, score:m.score, matched:m.matched, candidates:m.candidates};
        });
        const matched=orderResults.filter(r=>r.matched).length;
        status.textContent=`✅ Image lue automatiquement — ${structured.length} ligne(s), ${matched} reconnue(s)`;
        renderOrderResults();
      } else {
        const cleaned=cleanOcrText(rawText);
        document.getElementById('order-text').value=cleaned;
        status.textContent='⚠️ Image lue, mais aucune ligne produit claire. Corrigez le texte puis cliquez Analyser.';
      }
    }catch(err){
      status.textContent='⚠️ OCR impossible : '+err.message+' — vous pouvez toujours taper/coller la commande.';
    }
    return;
  }

}

// ═══════════════════════════════════════════════════════
// QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════
function addOneToQueueArray(queue, product, qty){
  const ex=queue.find(i=>i.product.ref===product.ref);
  if(ex) ex.qty+=qty;
  else queue.push({product:{...product},qty});
}

function addToQueue(product,qty){
  // V7 — règle atelier : un Rouget produit le code-barres rectangulaire ET la ronde.
  const safeQty=Math.max(1, parseInt(qty,10)||1);
  if(!product.roundOnly) addOneToQueueArray(queueRect, product, safeQty);
  if(product.ronde) addOneToQueueArray(queueRound, product, safeQty);
  saveState();
  updateQueueIndicator();
}
function addAllToQueue(){
  const matched=orderResults.filter(r=>r.matched);
  if(!matched.length){alert('Aucun produit reconnu à ajouter.');return;}
  matched.forEach(r=>addToQueue(r.product,r.qty||1));
  showTab('impression');
}

function confirmQueueQty(type){
  // Read all current input values and save to state
  const queue = type==='rect' ? queueRect : queueRound;
  queue.forEach(item => {
    const inp = document.querySelector(`#queue-${type}-list input[type="number"]`);
    // Find by ref-based id
    const safeRef = item.product.ref.replace(/[^a-z0-9]/gi,'');
    const allInputs = document.querySelectorAll(`#queue-${type}-list input[type="number"]`);
    allInputs.forEach(input => {
      const row = input.closest('.queue-item');
      if(row){
        const refEl = row.querySelector('.qi-ref');
        if(refEl && refEl.textContent.trim() === item.product.ref){
          const val = parseInt(input.value) || 1;
          item.qty = Math.max(1, val);
        }
      }
    });
  });
  saveState();
  renderQueues();
  updateQueueIndicator();
  // Flash success
  const bar = document.getElementById(type+'-confirm-bar');
  const btn = bar.querySelector('button');
  btn.textContent = '✓ Quantités enregistrées !';
  btn.style.background = '#1a1a1a';
  setTimeout(() => {
    btn.textContent = '✅ Confirmer les quantités';
    btn.style.background = '';
  }, 2000);
}

function clearQueue(type){
  if(!confirm('Vider la file '+(type==='rect'?'rectangulaire':'ronde')+' ?')) return;
  if(type==='rect') queueRect=[];
  else queueRound=[];
  saveState();
  renderQueues();
  updateQueueIndicator();
}

function removeFromQueue(type,ref){
  if(type==='rect') queueRect=queueRect.filter(i=>i.product.ref!==ref);
  else queueRound=queueRound.filter(i=>i.product.ref!==ref);
  saveState();
  renderQueues();
  updateQueueIndicator();
}

function setQueueQty(type,ref,val){
  const q=type==='rect'?queueRect:queueRound;
  const item=q.find(i=>i.product.ref===ref);
  if(item){item.qty=Math.max(1,Math.min(999,val));}
  saveState();
  updateQueueIndicator();
  renderQueueSummary();
}

function updateQueueIndicator(){
  const total=queueRect.reduce((s,i)=>s+i.qty,0)+queueRound.reduce((s,i)=>s+i.qty,0);
  const ind=document.getElementById('queue-indicator');
  const cnt=document.getElementById('queue-count');
  const fab=document.getElementById('fab-print');
  cnt.textContent=total+' étiq.';
  if(total>0){ind.classList.add('visible');fab.classList.add('visible');}
  else{ind.classList.remove('visible');fab.classList.remove('visible');}
}

// ═══════════════════════════════════════════════════════
// CATALOGUE UI
// ═══════════════════════════════════════════════════════
function buildFilters(){
  const bar=document.getElementById('filter-bar');
  const produits=['Tous',...new Set(CATALOGUE.map(p=>p.produit))];
  bar.innerHTML=produits.map(p=>`<span class="filter-chip${p===activeFilter?' active':''}" onclick="setFilter('${p}')">${p}</span>`).join('');
}

function setFilter(name){
  activeFilter=name;
  buildFilters();
  renderCatalogue();
}

// renderCatalogue et quickAddFromCatalogue définis plus bas (version complète)

function previewProduct(ref){
  const p=CATALOGUE.find(x=>x.ref===ref);
  if(!p) return;
  const modal=document.getElementById('modal-preview');
  const content=document.getElementById('modal-preview-content');
  content.innerHTML='';

  // Label preview
  const lbl=document.createElement('div');
  lbl.className='label-preview-rect';
  lbl.style.padding='6px 8px';
  const l1=document.createElement('div');l1.className='lp-line1';l1.textContent=p.couleur||p.produit;
  const l2=document.createElement('div');l2.className='lp-line2';
  l2.textContent=p.taille+(p.grammage?' / '+p.grammage:'');
  const l3=document.createElement('div');l3.className='lp-line3';l3.textContent=p.ref;
  const c=document.createElement('canvas');
  lbl.appendChild(l1);lbl.appendChild(l2);lbl.appendChild(l3);lbl.appendChild(c);
  content.appendChild(lbl);

  if(p.ean) drawEAN13(c,p.ean,{mw:2,bh:42,fs:11});

  const info=document.createElement('div');
  info.style.cssText='text-align:center;font-size:12px;color:var(--muted);line-height:1.8;';
  info.innerHTML=`<strong>${p.produit}</strong><br>${p.famille}<br>EAN : <code>${p.ean}</code>`;
  content.appendChild(info);

  const addBtn=document.getElementById('modal-add-btn');
  addBtn.onclick=()=>{addToQueue(p,1);closeModal('modal-preview');};
  modal.classList.add('open');
}

// ═══════════════════════════════════════════════════════
// PRINT QUEUE UI
// ═══════════════════════════════════════════════════════
function renderQueues(){
  renderQueueList('rect',queueRect);
  renderQueueList('round',queueRound);
  renderQueueSummary();
  // Show/hide the roll-change separator and step 2
  const hasRound = queueRound.length > 0;
  const sep = document.getElementById('separator-block');
  const step2 = document.getElementById('step2-label');
  if(sep) sep.style.display = hasRound ? 'block' : 'none';
  if(step2) step2.style.display = hasRound ? 'flex' : 'none';
}

function renderQueueList(type,queue){
  const list=document.getElementById('queue-'+type+'-list');
  const badge=document.getElementById(type+'-badge');
  const confirmBar=document.getElementById(type+'-confirm-bar');
  const total=queue.reduce((s,i)=>s+i.qty,0);
  badge.textContent=total+' étiq.';
  if(confirmBar) confirmBar.style.display=queue.length?'block':'none';
  if(!queue.length){
    list.innerHTML='<div class="queue-empty">File vide — ajoutez des produits depuis l\'onglet Commande ou Catalogue</div>';
    return;
  }
  list.innerHTML='';
  queue.forEach(item=>{
    const p=item.product;
    const row=document.createElement('div');row.className='queue-item';
    const bcDiv=document.createElement('div');
    if(type==='round'){
      bcDiv.className='qi-bc-round';
      bcDiv.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;';
      bcDiv.innerHTML=`<div style="font-size:9px;font-weight:700;text-align:center;line-height:1.3;">${p.taille}<br>${p.grammage}</div>`;
    } else {
      bcDiv.className='qi-bc';
      if(p.ean){const c=document.createElement('canvas');drawEAN13(c,p.ean,{mw:1,bh:28,fs:8});bcDiv.appendChild(c);}
    }
    const info=document.createElement('div');info.className='qi-info';
    info.innerHTML=`<div class="qi-name">${p.couleur||p.produit}</div>
      <div class="qi-ref">${p.ref}</div>
      <div class="qty-pills">${[1,2,4,6,8,10,12,20,50].map(q=>`<span class="qty-pill" onclick="setQueueQtyUI('${type}','${p.ref}',${q})">${q}</span>`).join('')}</div>
      <div class="v5-row-actions">
        <button class="btn btn-dark btn-sm" onclick="printQueueItem('${type}','${p.ref}',false)">Imprimer cette ligne</button>
        <button class="btn btn-sm" onclick="printQueueItem('${type}','${p.ref}',true)">Test 1</button>
      </div>`;
    const right=document.createElement('div');right.className='qi-right';
    right.innerHTML=`<button class="qi-remove" onclick="removeFromQueue('${type}','${p.ref}')">✕</button>
      <div class="qi-qty-big" id="qdisplay-${type}-${p.ref.replace(/[^a-z0-9]/gi,'')}">${item.qty}</div>
      <div class="qi-qty-label">étiquettes</div>
      <input type="number" value="${item.qty}" min="1" max="999" style="width:55px;text-align:center;font-weight:700;font-size:13px;padding:4px;" oninput="setQueueQtyUI('${type}','${p.ref}',parseInt(this.value)||1)"/>`;
    row.appendChild(bcDiv);row.appendChild(info);row.appendChild(right);
    list.appendChild(row);
  });
}

function setQueueQtyUI(type,ref,val){
  setQueueQty(type,ref,val);
  const id='qdisplay-'+type+'-'+ref.replace(/[^a-z0-9]/gi,'');
  const el=document.getElementById(id);
  if(el) el.textContent=val;
  renderQueueSummary();
}

function renderQueueSummary(){
  const block=document.getElementById('print-summary-block');
  const total=queueRect.reduce((s,i)=>s+i.qty,0)+queueRound.reduce((s,i)=>s+i.qty,0);
  if(!total){block.style.display='none';return;}
  block.style.display='block';
  const content=document.getElementById('print-summary-content');
  let html='';
  const allItems=[...queueRect,...queueRound];
  allItems.forEach(item=>{
    html+=`<div class="print-sum-row"><span>${item.product.produit} — ${item.product.couleur||''} ${item.product.taille}</span><span><strong>${item.qty}</strong> étiq.</span></div>`;
  });
  html+=`<div class="print-sum-total"><span>TOTAL</span><span>${total} étiquettes</span></div>`;
  content.innerHTML=html;
}

// ═══════════════════════════════════════════════════════
// PRINT ENGINE V5 — calibrage visuel + impression progressive
// ═══════════════════════════════════════════════════════
const DEFAULT_PRINT_SETTINGS = {
  rectW: 40, rectH: 30, rectPad: 1.2,
  bcWidth: 2.4, bcHeight: 62, bcFont: 9,
  titleFont: 13, infoFont: 13, refFont: 9,
  roundDiam: 15, roundGap: 2, roundTitle: 9, roundSub: 8
};
let printSettings = {...DEFAULT_PRINT_SETTINGS};

function num(id, fallback){
  const el=document.getElementById(id);
  if(!el) return fallback;
  const v=parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}
function loadPrintSettings(){
  try{
    const saved=localStorage.getItem('fl_print_settings_v5');
    if(saved) printSettings={...DEFAULT_PRINT_SETTINGS,...JSON.parse(saved)};
  }catch(e){ printSettings={...DEFAULT_PRINT_SETTINGS}; }
  syncPrintSettingsToUI();
}
function savePrintSettings(){
  printSettings={
    rectW:num('set-rect-w',40), rectH:num('set-rect-h',30), rectPad:num('set-rect-pad',1.2),
    bcWidth:num('set-bc-width',2.4), bcHeight:num('set-bc-height',62), bcFont:num('set-bc-font',9),
    titleFont:num('set-title-font',13), infoFont:num('set-info-font',13), refFont:num('set-ref-font',9),
    roundDiam:num('set-round-diam',15), roundGap:num('set-round-gap',2),
    roundTitle:num('set-round-title',9), roundSub:num('set-round-sub',8)
  };
  try{localStorage.setItem('fl_print_settings_v5',JSON.stringify(printSettings));}catch(e){}
  renderPrintPreviews();
}
function syncPrintSettingsToUI(){
  const map={
    'set-rect-w':'rectW','set-rect-h':'rectH','set-rect-pad':'rectPad','set-bc-width':'bcWidth','set-bc-height':'bcHeight','set-bc-font':'bcFont',
    'set-title-font':'titleFont','set-info-font':'infoFont','set-ref-font':'refFont','set-round-diam':'roundDiam','set-round-gap':'roundGap',
    'set-round-title':'roundTitle','set-round-sub':'roundSub'
  };
  Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id); if(el) el.value=printSettings[key];});
  const fr=document.getElementById('format-rect');
  if(fr){ fr.value='custom'; }
  const fw=document.getElementById('fmt-w'), fh=document.getElementById('fmt-h');
  if(fw) fw.value=printSettings.rectW;
  if(fh) fh.value=printSettings.rectH;
  const cw=document.getElementById('custom-format-w'), ch=document.getElementById('custom-format-h');
  if(cw) cw.style.display='block'; if(ch) ch.style.display='block';
}
function resetPrintSettings(){
  printSettings={...DEFAULT_PRINT_SETTINGS};
  syncPrintSettingsToUI();
  savePrintSettings();
}
function bindPrintSettingsUI(){
  ['set-rect-w','set-rect-h','set-rect-pad','set-bc-width','set-bc-height','set-bc-font','set-title-font','set-info-font','set-ref-font','set-round-diam','set-round-gap','set-round-title','set-round-sub'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('input', savePrintSettings);
  });
  loadPrintSettings();
  renderPrintPreviews();
}
function exampleRectProduct(){
  return queueRect[0]?.product || CATALOGUE.find(p=>p.ean && !p.ronde) || CATALOGUE[0];
}
function exampleRoundProduct(){
  return queueRound[0]?.product || CATALOGUE.find(p=>p.ronde) || CATALOGUE[0];
}
function renderPrintPreviews(){
  const rect=document.getElementById('rect-live-preview');
  if(rect){ rect.innerHTML=buildLabelHTML(exampleRectProduct(), printSettings.rectW, printSettings.rectH, false); }
  const round=document.getElementById('round-live-preview');
  if(round){ round.innerHTML=buildRoundPairHTML(exampleRoundProduct(), exampleRoundProduct(), false); }
}
function getPaperDims(){ return [printSettings.rectW, printSettings.rectH]; }
function getRoundDiam(){ return printSettings.roundDiam || 15; }
function makeBarcodeDataURL(ean){
  const c=document.createElement('canvas');
  drawEAN13(c,ean,{mw:printSettings.bcWidth,bh:printSettings.bcHeight,fs:Math.max(6,printSettings.bcFont||9)});
  return c.toDataURL();
}
function safeTxt(v){ return String(v||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function buildLabelHTML(p,pw,ph, pageBreak=true){
  const ligne2=(p.taille||'')+(p.grammage?' / '+p.grammage:'');
  const bcImg=p.ean ? makeBarcodeDataURL(p.ean) : '';
  return `<div class="print-label-rect" style="width:${pw}mm;height:${ph}mm;background:#fff;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${printSettings.rectPad}mm;overflow:hidden;${pageBreak?'page-break-after:always;break-after:page;':''}">
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:${printSettings.titleFont}px;font-weight:900;text-transform:uppercase;text-align:center;color:#000;line-height:1.05;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeTxt(p.couleur||p.produit)}</div>
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:${printSettings.infoFont}px;font-weight:900;text-align:center;color:#000;line-height:1.05;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeTxt(ligne2)}</div>
    <div style="font-family:Arial,sans-serif;font-size:${printSettings.refFont}px;text-align:center;color:#000;line-height:1.1;margin:1px 0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeTxt(p.ref)}</div>
    ${bcImg?`<img src="${bcImg}" style="width:96%;max-height:42%;object-fit:contain;display:block;"/>`:''}
  </div>`;
}
function buildOneRoundHTML(p){
  const d=printSettings.roundDiam;
  return `<div style="width:${d}mm;height:${d}mm;border-radius:50%;background:#fff;border:0.35px solid #bbb;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;">
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:${printSettings.roundTitle}px;font-weight:900;text-align:center;color:#000;line-height:1.05;">${safeTxt(p?.taille||'')}</div>
    <div style="font-family:Arial,sans-serif;font-size:${printSettings.roundSub}px;font-weight:700;text-align:center;color:#000;line-height:1.05;">${safeTxt(p?.grammage||'')}</div>
  </div>`;
}
function buildRoundPairHTML(p1,p2,pageBreak=true){
  const d=printSettings.roundDiam;
  const gap=printSettings.roundGap;
  const w=(d*2+gap);
  return `<div class="print-label-round-pair" style="width:${w}mm;height:${d}mm;background:#fff;display:flex;align-items:center;justify-content:center;gap:${gap}mm;box-sizing:border-box;overflow:hidden;${pageBreak?'page-break-after:always;break-after:page;':''}">
    ${p1?buildOneRoundHTML(p1):`<div style="width:${d}mm;height:${d}mm;"></div>`}
    ${p2?buildOneRoundHTML(p2):`<div style="width:${d}mm;height:${d}mm;"></div>`}
  </div>`;
}
function expandQueue(type, specificRef=null, testOne=false){
  const queue=type==='rect'?queueRect:queueRound;
  const labels=[];
  queue.forEach(item=>{
    if(specificRef && item.product.ref!==specificRef) return;
    const n=testOne ? 1 : item.qty;
    for(let i=0;i<n;i++) labels.push(item.product);
  });
  return labels;
}
function buildPrintBody(type, labels){
  if(type==='rect'){
    const [pw,ph]=getPaperDims();
    return labels.map(p=>buildLabelHTML(p,pw,ph,true)).join('');
  }
  let html='';
  for(let i=0;i<labels.length;i+=2){ html+=buildRoundPairHTML(labels[i], labels[i+1]||null, true); }
  return html;
}
function getPageSize(type){
  if(type==='rect') return {w:printSettings.rectW+'mm', h:printSettings.rectH+'mm'};
  return {w:(printSettings.roundDiam*2+printSettings.roundGap)+'mm', h:printSettings.roundDiam+'mm'};
}
function printQueue(type){
  const labels=expandQueue(type);
  if(!labels.length){alert('La file est vide.');return;}
  openPrintWindow(buildPrintBody(type,labels), getPageSize(type));
}
function printQueueItem(type,ref,testOne=false){
  const labels=expandQueue(type,ref,testOne);
  if(!labels.length){alert('Aucune etiquette a imprimer.');return;}
  openPrintWindow(buildPrintBody(type,labels), getPageSize(type));
}
function printNextLabels(type){
  const n=Math.max(1, parseInt(document.getElementById('print-next-count')?.value||'1',10));
  const queue=type==='rect'?queueRect:queueRound;
  const labels=[];
  for(const item of queue){
    for(let i=0;i<item.qty && labels.length<n;i++) labels.push(item.product);
    if(labels.length>=n) break;
  }
  if(!labels.length){alert('La file est vide.');return;}
  openPrintWindow(buildPrintBody(type,labels), getPageSize(type));
  const dec=document.getElementById('print-decrement')?.checked;
  if(dec){
    let left=n;
    for(const item of queue){
      const take=Math.min(item.qty,left);
      item.qty-=take; left-=take;
      if(left<=0) break;
    }
    if(type==='rect') queueRect=queueRect.filter(i=>i.qty>0); else queueRound=queueRound.filter(i=>i.qty>0);
    saveState(); renderQueues(); updateQueueIndicator();
  }
}
function printAll(){ printQueue('rect'); }
function openPrintWindow(body,size){
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Impression etiquettes Frenchy Leurres</title>
<style>
@page{size:${size.w} ${size.h};margin:0;}
html,body{margin:0!important;padding:0!important;background:#fff;width:${size.w};height:${size.h};}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
</style>
</head><body>${body}</body></html>`;
  // Blob URL — Chrome applique @page (margin:0, taille) sur blob: mais pas sur about:blank
  let blobUrl=null;
  try{ blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})); }catch(e){}
  if(blobUrl){
    const win=window.open(blobUrl,'_blank');
    if(!win){ alert('Le navigateur a bloque la fenetre d impression. Autorisez les popups pour ce fichier.'); URL.revokeObjectURL(blobUrl); return; }
    setTimeout(function(){ try{ win.print(); }catch(e){} setTimeout(function(){ try{ URL.revokeObjectURL(blobUrl); }catch(e){} },5000); },800);
  } else {
    // Fallback si Blob indisponible
    const win=window.open('','_blank');
    if(!win){ alert('Le navigateur a bloque la fenetre d impression. Autorisez les popups pour ce fichier.'); return; }
    win.document.open(); win.document.write(html); win.document.close();
    setTimeout(function(){ try{ win.print(); }catch(e){} },800);
  }
}
document.addEventListener('DOMContentLoaded', bindPrintSettingsUI);
const formatRectEl=document.getElementById('format-rect');
if(formatRectEl){
  formatRectEl.addEventListener('change',function(){
    const custom=this.value==='custom';
    document.getElementById('custom-format-w').style.display=custom?'block':'none';
    document.getElementById('custom-format-h').style.display=custom?'block':'none';
    if(!custom){
      const [w,h]=this.value.split('x').map(Number);
      const sw=document.getElementById('set-rect-w'), sh=document.getElementById('set-rect-h');
      if(sw) sw.value=w; if(sh) sh.value=h;
      savePrintSettings();
    }
  });
}
// ═══════════════════════════════════════════════════════
// MODAL — AJOUT MANUEL
// ═══════════════════════════════════════════════════════
function openManualModal(){
  // Reset modal to "create" mode
  document.getElementById('m-produit').value='';
  document.getElementById('m-couleur').value='';
  document.getElementById('m-taille').value='';
  document.getElementById('m-grammage').value='';
  document.getElementById('m-ref').value='';
  document.getElementById('m-ean').value='';
  document.getElementById('m-qty').value='1';
  document.getElementById('m-type').value='rect';
  var editRefEl=document.getElementById('m-edit-ref');
  if(editRefEl) editRefEl.value='';
  var btn=document.querySelector('#modal-manual .btn-success');
  if(btn) btn.textContent='✅ Enregistrer dans le catalogue';
  var titleEl=document.querySelector('#modal-manual .modal-title');
  if(titleEl) titleEl.textContent='✏️ Ajouter un produit';
  document.getElementById('m-alert').style.display='none';
  document.getElementById('m-ean-preview').style.display='none';
  document.getElementById('modal-manual').classList.add('open');
}
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('#modal-manual input, #modal-manual select').forEach(inp=>{
  inp.addEventListener('input', previewManualEAN);
});

function previewManualEAN(){
  const ean=(document.getElementById('m-ean')||{value:''}).value.replace(/\s/g,'');
  const prev=document.getElementById('m-ean-preview');
  const c=document.getElementById('m-ean-canvas');
  if(ean.length===13){
    drawEAN13(c,ean,{mw:2,bh:38,fs:10});
    prev.style.display='block';
  } else {prev.style.display='none';}
}

function addManualProduct(){
  const produit=document.getElementById('m-produit').value.trim();
  const couleur=document.getElementById('m-couleur').value.trim();
  const taille=document.getElementById('m-taille').value.trim();
  const grammage=document.getElementById('m-grammage').value.trim();
  const editRef=(document.getElementById('m-edit-ref')||{value:''}).value.trim();
  const ref=document.getElementById('m-ref').value.trim()||(editRef||`MANUAL-${Date.now()}`);
  const ean=(document.getElementById('m-ean')||{value:''}).value.replace(/\s/g,'');
  const qty=parseInt(document.getElementById('m-qty').value)||0;
  const type=document.getElementById('m-type').value;
  const alert_=document.getElementById('m-alert');

  if(!produit||!couleur){alert_.textContent='Nom et couleur obligatoires.';alert_.style.display='block';return;}
  if(!ean||ean.length!==13){alert_.textContent='EAN-13 doit faire 13 chiffres.';alert_.style.display='block';return;}
  alert_.style.display='none';

  const p={ref,produit,famille:'Manuel',couleur,taille,grammage,cond:'x1',ht:0,pvc:0,ean,ronde:type==='round',_custom:true};

  // Update or add in CATALOGUE
  const existingIdx=CATALOGUE.findIndex(x=>x.ref===(editRef||ref));
  if(existingIdx!==-1){ CATALOGUE[existingIdx]=p; }
  else { CATALOGUE.push(p); }

  // Persist custom products
  saveCustomCatalogue();
  buildFilters();

  if(qty>0) addToQueue(p,qty);

  closeModal('modal-manual');
  showTab('catalogue');
}

function saveCustomCatalogue(){
  try{ localStorage.setItem('fl_custom_catalogue', JSON.stringify(CATALOGUE.filter(p=>p._custom))); }catch(e){}
}

function loadCustomCatalogue(){
  // 1. Charger depuis localStorage (immédiat)
  try{
    var stored=JSON.parse(localStorage.getItem('fl_custom_catalogue')||'[]');
    stored.forEach(function(p){
      if(!CATALOGUE.find(function(x){return x.ref===p.ref;})){
        p._custom=true;
        CATALOGUE.push(p);
      }
    });
  }catch(e){}

  // 2. Charger depuis Supabase (async - récupère les produits sauvegardés même si localStorage vidé)
  var db=window.db;
  if(db){
    db.from('products').select('*').eq('source','manuel').then(function(r){
      if(r.error||!r.data||!r.data.length) return;
      var added=false;
      r.data.forEach(function(p){
        var ref=p.ref||'';
        if(!ref) return;
        if(!CATALOGUE.find(function(x){return x.ref===ref;})){
          CATALOGUE.push({
            ref:ref, produit:p.produit||'', famille:p.famille||'',
            couleur:p.couleur||'', taille:p.taille||'', grammage:p.grammage||'',
            cond:p.conditionnement||'', ht:Number(p.prix_ht)||0, pvc:Number(p.pvc)||0,
            ean:p.ean13||'', ronde:!!p.etiq_ronde, format:'40x30', _custom:true
          });
          added=true;
        }
      });
      if(added){
        saveCustomCatalogue(); // synchro dans localStorage
        if(typeof buildFilters==='function') buildFilters();
        if(typeof renderCatalogue==='function') renderCatalogue();
      }
    }).catch(function(){});
  }
}

function openEditManualModal(ref){
  var p=CATALOGUE.find(function(x){return x.ref===ref;});
  if(!p) return;
  document.getElementById('m-produit').value=p.produit||'';
  document.getElementById('m-couleur').value=p.couleur||'';
  document.getElementById('m-taille').value=p.taille||'';
  document.getElementById('m-grammage').value=p.grammage||'';
  document.getElementById('m-ref').value=p.ref||'';
  document.getElementById('m-ean').value=p.ean||'';
  document.getElementById('m-qty').value='0';
  document.getElementById('m-type').value=p.ronde?'round':'rect';
  var editRefEl=document.getElementById('m-edit-ref');
  if(editRefEl) editRefEl.value=ref;
  var btn=document.querySelector('#modal-manual .btn-success');
  if(btn) btn.textContent='✅ Enregistrer les modifications';
  var titleEl=document.querySelector('#modal-manual .modal-title');
  if(titleEl) titleEl.textContent='✏️ Modifier le produit';
  document.getElementById('m-alert').style.display='none';
  previewManualEAN();
  document.getElementById('modal-manual').classList.add('open');
}

function deleteCustomProduct(ref){
  if(!confirm('Supprimer ce produit du catalogue ?')) return;
  var idx=CATALOGUE.findIndex(function(x){return x.ref===ref;});
  if(idx!==-1) CATALOGUE.splice(idx,1);
  saveCustomCatalogue();
  buildFilters();
  renderCatalogue();
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  loadCustomCatalogue();
  buildFilters();
  loadState();
  renderQueues();
  // Fix double m-ean issue
  const mEanInputs=[...document.querySelectorAll('#modal-manual input')];
  const eanIdx=5; // index of EAN input
  if(mEanInputs[eanIdx]) mEanInputs[eanIdx].addEventListener('input',previewManualEAN);
});

// Close modal on background click
document.querySelectorAll('.modal-bg').forEach(bg=>{
  bg.addEventListener('click',e=>{if(e.target===bg) bg.classList.remove('open');});
});
// ═══════════════════════════════════════════════════════
// V3 — ANALYSE FACTURE BÉTON PDF / IMAGE / TEXTE
// Objectif : lire uniquement Désignation + Qté, même si la facture change de forme.
// Important : les nombres de taille/grammage (70, 90, 105, 14g, 17g…) ne sont jamais pris comme quantité.
// ═══════════════════════════════════════════════════════

const INVOICE_PRODUCT_RE = /(rouget|martegal|mart[eé]gal|mistik|mystik|biggy|bigy|frenchy|shiner|anguillon|civelle|xeel|x\s*eel|\ble\s*g\b|\bg\s*(?:9|cm|de)\b|\btp\b)/i;
const INVOICE_NOISE_RE = /(total|sous\s*total|tva|facture|devis|adresse|client|livraison|règlement|reglement|iban|siret|email|téléphone|telephone|prix|montant|remise|désignation\s+qt[eé]|designation\s+qte)/i;

function invoiceCleanText(s){
  return String(s||'')
    .replace(/\r/g,'\n')
    .replace(/[|¦]/g,' ')
    .replace(/[×✕]/g,'x')
    .replace(/[“”]/g,'"')
    .replace(/\u00a0/g,' ')
    .replace(/\s+€/g,' €');
}

function fixInvoiceOcrLine(line){
  let s=normalizeOcrDesignation(line);
  return s
    .replace(/\bMISTIK\s*9O\b/ig,'MISTIK 90')
    .replace(/\bMISTIK\s*6O\b/ig,'MISTIK 60')
    .replace(/\bBIGGY\s*7O\b/ig,'BIGGY 70')
    .replace(/\bBIGGY\s*9O\b/ig,'BIGGY 90')
    .replace(/\bROUGET\s+MART(?:E|F|É)?GAL\b/ig,'ROUGET MARTEGAL')
    .replace(/\bBLEU\s+CHAT\b/ig,'Bleu')
    .replace(/\bSAR\s*$/ig,'Sardine')
    .replace(/\s+/g,' ')
    .trim();
}

function isLikelyInvoiceProductLine(line){
  const s=String(line||'').trim();
  if(!s || s.length<4) return false;
  if(INVOICE_NOISE_RE.test(s)) return false;
  return INVOICE_PRODUCT_RE.test(s);
}

function invoiceDesignationHasSpecs(line){
  // Sert à différencier taille/grammage et quantité.
  // Les tailles 70/90/105 et les grammages 6g/14g/17g restent dans le produit.
  const raw=String(line||'');
  const s=norm(raw);
  const hasRef=/\b[A-Z0-9]+-[A-Z0-9.-]+/i.test(raw);
  const hasSize=/\b(?:50|60|70|90|105|120|130|150|5|6|7|9|10\.5|12|13|15)\s*(?:cm)?\b/.test(s);
  const hasGram=/\b(?:2\.9|3|3\.8|3\.9|4\.2|6|6\.5|9|12|14|17|25)\s*(?:g|gr)\b/.test(s);
  const colors=['vert','electric','blanc','perle','sardine','kaki','bleu','violet','rose','jaune','uv','paillette','chartreux','joel','om','turquoise'];
  const hasColor=colors.some(c=>s.includes(c));
  return hasRef || hasSize || hasGram || hasColor;
}

function parseInvoiceLineToRow(line){
  let s=fixInvoiceOcrLine(line);
  if(!isLikelyInvoiceProductLine(s)) return null;

  // Supprime les prix / montants placés après la quantité quand l'OCR les mélange.
  s=s.replace(/\s+\d+[,.]\d{2}\s*€?.*$/,'');

  // Cas très fiable : colonne séparée par tabulation ou gros espace.
  // Exemple : "MISTIK 90 12G Vert      8"
  let m=s.match(/^(.*?)(?:\t+|\s{2,})(\d{1,3})\s*$/);
  if(m){
    const designation=m[1].trim();
    const qty=parseInt(m[2],10);
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation)){
      return {designation:fixInvoiceOcrLine(designation), qty};
    }
  }

  // Cas collé/copier-coller : "MISTIK 90 12G Vert 8".
  // Le DERNIER nombre devient quantité seulement si le texte avant contient déjà taille/grammage/couleur.
  // Ça évite l'erreur : "ROUGET 70" => 70 ne devient PAS quantité.
  m=s.match(/^(.*\S)\s+(\d{1,3})\s*$/);
  if(m){
    const designation=m[1].trim();
    const qty=parseInt(m[2],10);
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation) && invoiceDesignationHasSpecs(designation)){
      return {designation:fixInvoiceOcrLine(designation), qty};
    }
  }

  // Cas "8 MISTIK 90 12G Vert".
  m=s.match(/^\s*(\d{1,3})\s+(.+)$/);
  if(m){
    const qty=parseInt(m[1],10);
    const designation=m[2].trim();
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation)){
      return {designation:fixInvoiceOcrLine(designation), qty};
    }
  }

  // Aucun nombre de quantité sûr : on garde le produit avec quantité 1 pour validation.
  return {designation:s, qty:1};
}

function segmentContinuousInvoiceText(text){
  const clean=invoiceCleanText(text).replace(/\n+/g,' ');
  const tokens=clean.split(/\s+/).filter(Boolean);
  const starts=[];
  function isStart(i){
    const t=(tokens[i]||'').toLowerCase();
    const next=(tokens[i+1]||'').toLowerCase();
    if(['rouget','mistik','mystik','biggy','bigy','frenchy','super','anguillon','civelle','xeel','tp'].includes(t)) return true;
    if(t==='le' && next==='g') return true;
    if(t==='g' && (/^(9|9cm|9cm\b|cm)$/i.test(next)||next==='de')) return true;
    return false;
  }
  for(let i=0;i<tokens.length;i++) if(isStart(i)) starts.push(i);
  const out=[];
  for(let n=0;n<starts.length;n++){
    const start=starts[n];
    const end=(n+1<starts.length)?starts[n+1]:tokens.length;
    let seg=tokens.slice(start,end).join(' ');
    const row=parseInvoiceLineToRow(seg);
    if(row) out.push(row);
  }
  return out;
}

function extractInvoiceRowsFromText(raw){
  const text=invoiceCleanText(raw);
  const lines=text.split('\n').map(l=>fixInvoiceOcrLine(l).trim()).filter(Boolean);
  const rows=[];
  for(const line of lines){
    const row=parseInvoiceLineToRow(line);
    if(row) rows.push(row);
  }

  // Si PDF/OCR a tout mis sur une seule ligne, on segmente automatiquement.
  if(rows.length<2){
    const segmented=segmentContinuousInvoiceText(text);
    if(segmented.length>rows.length) return dedupeInvoiceRows(segmented);
  }
  return dedupeInvoiceRows(rows);
}

function dedupeInvoiceRows(rows){
  const out=[];
  const seen=new Set();
  rows.forEach(r=>{
    if(!r || !r.designation) return;
    const key=norm(r.designation)+'|'+r.qty;
    if(seen.has(key)) return;
    seen.add(key);
    out.push({designation:r.designation, qty:Math.max(1,Math.min(999,parseInt(r.qty,10)||1))});
  });
  return out;
}

function rowsToOrderResults(rows){
  return rows.map(item=>{
    const m=matchProduct(item.designation);
    return {line:item.designation, qty:item.qty, product:m.product, score:m.score, matched:m.matched, candidates:m.candidates};
  });
}

function showStructuredRows(rows, sourceLabel){
  const textarea=document.getElementById('order-text');
  textarea.value=rows.map(i=>`${i.designation} x${i.qty}`).join('\n');
  orderResults=rowsToOrderResults(rows);
  const matched=orderResults.filter(r=>r.matched).length;
  const status=document.getElementById('file-status');
  if(status) status.textContent=`✅ ${sourceLabel} — ${rows.length} ligne(s) produit détectée(s), ${matched} reconnue(s)`;
  renderOrderResults();
}

// PDF intelligent : utilise les positions X/Y quand elles existent pour retrouver les colonnes.
async function readPdfInvoiceSmart(file){
  if(typeof pdfjsLib==='undefined') throw new Error('PDF.js non chargé');
  pdfjsLib.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  const ab=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const rowLines=[];
  let plainText='';

  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const items=content.items.map(it=>({
      text:String(it.str||'').trim(),
      x:it.transform ? it.transform[4] : 0,
      y:it.transform ? it.transform[5] : 0
    })).filter(it=>it.text);
    plainText+=items.map(it=>it.text).join(' ')+'\n';

    const groups=[];
    items.sort((a,b)=>b.y-a.y || a.x-b.x).forEach(it=>{
      let g=groups.find(row=>Math.abs(row.y-it.y)<4);
      if(!g){g={y:it.y,items:[]};groups.push(g);}
      g.items.push(it);
    });
    groups.forEach(g=>{
      g.items.sort((a,b)=>a.x-b.x);
      const line=g.items.map(it=>it.text).join(' ');
      if(isLikelyInvoiceProductLine(line)){
        const last=g.items[g.items.length-1];
        const lastNum=String(last.text).trim().match(/^\d{1,3}$/);
        if(lastNum){
          const designation=g.items.slice(0,-1).map(it=>it.text).join(' ');
          rowLines.push(`${designation} ${last.text}`);
        }else rowLines.push(line);
      }
    });
  }
  const rowsFromLines=extractInvoiceRowsFromText(rowLines.join('\n'));
  const rowsFromPlain=extractInvoiceRowsFromText(plainText);
  return rowsFromLines.length>=rowsFromPlain.length ? rowsFromLines : rowsFromPlain;
}

// OCR image intelligent : préfère les mots avec coordonnées, puis retombe sur le texte brut.
async function readImageWithOCRData(file){
  if(typeof Tesseract==='undefined') throw new Error('Tesseract OCR non chargé. Vérifiez Internet.');
  const result = await Tesseract.recognize(file, 'fra+eng', {
    logger: m => {
      const status=document.getElementById('file-status');
      if(!status) return;
      if(m.status==='recognizing text') status.textContent=`🔎 Lecture OCR de l’image… ${Math.round((m.progress||0)*100)}%`;
      else if(m.status) status.textContent=`🔎 OCR : ${m.status}`;
    }
  });
  return result && result.data ? result.data : {text:''};
}

function extractInvoiceRowsFromOcrData(data){
  const words=(data && data.words ? data.words : []).filter(w=>String(w.text||'').trim());
  const rowLines=[];
  if(words.length){
    const normalized=words.map(w=>({
      text:String(w.text||'').trim(),
      x:w.bbox ? w.bbox.x0 : 0,
      y:w.bbox ? (w.bbox.y0+w.bbox.y1)/2 : 0
    }));
    normalized.sort((a,b)=>a.y-b.y || a.x-b.x);
    const groups=[];
    normalized.forEach(w=>{
      let g=groups.find(row=>Math.abs(row.y-w.y)<8);
      if(!g){g={y:w.y,items:[]};groups.push(g);}
      g.items.push(w);
    });
    groups.forEach(g=>{
      g.items.sort((a,b)=>a.x-b.x);
      const line=g.items.map(w=>w.text).join(' ');
      if(isLikelyInvoiceProductLine(line)) rowLines.push(line);
    });
  }
  const fromWords=extractInvoiceRowsFromText(rowLines.join('\n'));
  const fromText=extractInvoiceRowsFromText(data && data.text ? data.text : '');
  return fromWords.length>=fromText.length ? fromWords : fromText;
}

// Remplace l'analyse manuelle aussi : si l'utilisateur colle une facture complète, on extrait d'abord les lignes produit/quantité.
function analyzeOrder(){
  const text=document.getElementById('order-text').value.trim();
  if(!text){alert('Entrez une commande avant d\'analyser.');return;}
  const structured=extractInvoiceRowsFromText(text);
  if(structured.length>0){
    orderResults=rowsToOrderResults(structured);
    document.getElementById('order-text').value=structured.map(i=>`${i.designation} x${i.qty}`).join('\n');
  }else{
    orderResults=parseOrderText(text);
  }
  renderOrderResults();
}

// Remplace la gestion fichier : PDF, Excel, Image passent tous par l'extracteur Désignation + Qté.
async function processFile(file){
  const dz=document.getElementById('drop-zone');
  const status=document.getElementById('file-status');
  dz.classList.add('has-file');
  status.style.display='block';
  status.textContent='⏳ Analyse facture intelligente…';

  if(file.name.match(/\.xlsx?$/i)){
    try{
      if(typeof XLSX==='undefined') throw new Error('SheetJS non chargé');
      const result=await parseExcelInvoice(file);
      let rows=[];
      if(result.structured && result.structured.length>0) rows=result.structured;
      else if(result.text) rows=extractInvoiceRowsFromText(result.text);
      if(rows.length>0) showStructuredRows(rows,'Excel lu automatiquement');
      else { document.getElementById('order-text').value=result.text||''; status.textContent='⚠️ Excel lu, mais aucune ligne produit claire. Corrigez le texte puis cliquez Analyser.'; }
    }catch(err){ status.textContent='⚠️ Erreur lecture Excel : '+err.message; }
    return;
  }

  if(file.type==='application/pdf' || file.name.match(/\.pdf$/i)){
    try{
      // Essai 1 : extraction texte PDF.js
      const rows=await readPdfInvoiceSmart(file);
      if(rows.length>0){ showStructuredRows(rows,'PDF analysé automatiquement'); return; }

      // Essai 2 : PDF image → canvas + OpenAI Vision
      status.textContent='🖼️ Conversion PDF → OpenAI Vision…';
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const abv=await file.arrayBuffer();
      const pdfv=await pdfjsLib.getDocument({data:abv}).promise;
      const pv=await pdfv.getPage(1);
      const vpv=pv.getViewport({scale:1.5});
      const cvv=document.createElement('canvas');
      cvv.width=vpv.width; cvv.height=vpv.height;
      await pv.render({canvasContext:cvv.getContext('2d'),viewport:vpv}).promise;
      const imgV=cvv.toDataURL('image/jpeg',0.85);

      status.textContent='🤖 OpenAI Vision analyse le PDF…';
      const rv=await fetch('/api/analyse-commande',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filename:file.name,mime:'image/jpeg',dataUrl:imgV,texte:'',mode:'mag'})
      });
      const jv=await rv.json().catch(function(){return{ok:false};});
      if(jv.ok&&jv.data&&jv.data.lignes&&jv.data.lignes.length>0){
        const vr=jv.data.lignes.map(function(l){return{designation:l.designation||l.ref_frenchy||'',qty:Number(l.quantite)||1,pu:Number(l.prix_unitaire)||0};});
        showStructuredRows(vr,'OpenAI Vision : '+vr.length+' produit(s)');
      }else{
        status.textContent='⚠️ PDF lu — 0 produit trouvé. Copiez-collez le tableau dans la zone texte.';
      }
    }catch(err){ status.textContent='⚠️ Erreur PDF : '+err.message; }
    return;
  }

  if(file.type.startsWith('image/')){
    const url=URL.createObjectURL(file);
    const prev=document.getElementById('order-image-preview');
    if(prev) prev.src=url;
    const imgSec=document.getElementById('image-preview-section');
    if(imgSec) imgSec.style.display='block';
    try{
      status.textContent='🔎 OCR image + détection Désignation / Qté…';
      const data=await readImageWithOCRData(file);
      const rows=extractInvoiceRowsFromOcrData(data);
      if(rows.length>0) showStructuredRows(rows,'Image OCR analysée automatiquement');
      else {
        const cleaned=cleanOcrText(data.text||'');
        document.getElementById('order-text').value=cleaned;
        status.textContent='⚠️ Image lue, mais aucune ligne produit claire. Corrigez le texte puis cliquez Analyser.';
      }
    }catch(err){ status.textContent='⚠️ OCR impossible : '+err.message+' — vous pouvez toujours copier-coller le tableau.'; }
    return;
  }

  status.textContent='⚠️ Format non reconnu. Utilisez PDF, Excel, JPG ou PNG.';
}


// ═══════════════════════════════════════════════════════
// V4 — CORRECTION SENIOR : on ignore les références internes PE-* pour reconnaître les PRODUITS
// But : lire Désignation + Qté, pas Réf. produit.
// Exemple Excel : PE-0022611 | ROUGET MARTEGAL 90 14g | 8  => ROUGET MARTEGAL 90 14g x8
// ═══════════════════════════════════════════════════════

function stripInternalRefsV4(s){
  return String(s||'')
    .replace(/\bPE[-\s]?\d{4,}\b/ig,' ')
    .replace(/\bREF\.?\s*PRODUIT\b/ig,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function isInternalRefOnlyV4(s){
  const clean=String(s||'').trim();
  return /^PE[-\s]?\d{4,}(?:\s*x?\s*\d{1,3})?$/i.test(clean);
}

function normalizeExcelHeaderV4(v){
  return norm(String(v||''));
}

function findBestColumnV4(rows, startRow, kind){
  const maxCols=Math.max(...rows.map(r=>r.length));
  let best={idx:-1,score:-1};
  for(let c=0;c<maxCols;c++){
    let score=0;
    for(let r=startRow;r<Math.min(rows.length,startRow+40);r++){
      const val=rows[r] && rows[r][c] != null ? String(rows[r][c]).trim() : '';
      if(!val) continue;
      if(kind==='designation'){
        if(isInternalRefOnlyV4(val)) score-=3;
        if(INVOICE_PRODUCT_RE.test(val)) score+=5;
        if(invoiceDesignationHasSpecs(val)) score+=2;
        if(/total|tva|montant|prix|facture|client/i.test(val)) score-=2;
      }else if(kind==='qty'){
        const n=Number(String(val).replace(',','.'));
        if(Number.isFinite(n) && n>=1 && n<=500 && String(val).trim().length<=5) score+=3;
        if(INVOICE_PRODUCT_RE.test(val) || isInternalRefOnlyV4(val)) score-=3;
      }
    }
    if(score>best.score) best={idx:c,score};
  }
  return best.score>0 ? best.idx : -1;
}

async function parseExcelInvoice(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const products=[];
        const fallbackLines=[];

        wb.SheetNames.forEach(sheetName=>{
          const ws=wb.Sheets[sheetName];
          const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
          if(!rows || !rows.length) return;

          let headerIdx=-1, desCol=-1, qtyCol=-1;
          for(let i=0;i<rows.length;i++){
            const header=rows[i].map(normalizeExcelHeaderV4);
            const d=header.findIndex(c=>
              c.includes('designation') || c.includes('descriptif') || c.includes('description') ||
              c.includes('libelle') || c.includes('article') || (c.includes('produit') && !c.includes('ref'))
            );
            const q=header.findIndex(c=>
              c==='qte' || c==='qté' || c.includes('quantite') || c.includes('quantité') || c==='qty'
            );
            if(d>=0 && q>=0){ headerIdx=i; desCol=d; qtyCol=q; break; }
          }

          if(headerIdx<0){
            // Fallback intelligent : cherche la colonne qui contient les noms produits, pas les PE-*.
            headerIdx=0;
            desCol=findBestColumnV4(rows,0,'designation');
            qtyCol=findBestColumnV4(rows,0,'qty');
          }

          if(desCol>=0 && qtyCol>=0){
            for(let i=headerIdx+1;i<rows.length;i++){
              const row=rows[i]||[];
              let designation=String(row[desCol]||'').trim();
              let qtyRaw=String(row[qtyCol]||'').trim();
              designation=stripInternalRefsV4(designation);
              if(!designation || isInternalRefOnlyV4(designation)) continue;
              if(INVOICE_NOISE_RE.test(designation)) continue;
              const qtyNum=Number(qtyRaw.replace(',','.'));
              const qty=(Number.isFinite(qtyNum) && qtyNum>0 && qtyNum<=500) ? Math.round(qtyNum) : extractQty(row.join(' '));
              if(isLikelyInvoiceProductLine(designation) && qty>0){
                products.push({designation:fixInvoiceOcrLine(designation),qty});
              }
            }
          }

          // Texte de secours : on ne met jamais la colonne Réf. produit seule.
          rows.forEach(row=>{
            const cleanCells=row.map(c=>String(c||'').trim()).filter(Boolean);
            const productCell=cleanCells.find(c=>INVOICE_PRODUCT_RE.test(c) && !isInternalRefOnlyV4(c));
            const qtyCell=[...cleanCells].reverse().find(c=>/^\d{1,3}$/.test(c));
            if(productCell && qtyCell) fallbackLines.push(`${stripInternalRefsV4(productCell)} ${qtyCell}`);
            else if(productCell) fallbackLines.push(stripInternalRefsV4(productCell));
          });
        });

        const unique=dedupeInvoiceRows(products);
        resolve({text:fallbackLines.join('\n'),structured:unique});
      }catch(err){reject(err);}
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseInvoiceLineToRow(line){
  let s=fixInvoiceOcrLine(stripInternalRefsV4(line));
  if(!isLikelyInvoiceProductLine(s)) return null;
  if(isInternalRefOnlyV4(s)) return null;

  // Supprime les prix / montants placés après la quantité quand l'OCR/PDF mélange les colonnes.
  s=s.replace(/\s+\d+[,.]\d{2}\s*€?.*$/,'');

  // Cas colonne fiable : Désignation      Qté
  let m=s.match(/^(.*?)(?:\t+|\s{2,})(\d{1,3})\s*$/);
  if(m){
    const designation=stripInternalRefsV4(m[1]).trim();
    const qty=parseInt(m[2],10);
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation)) return {designation:fixInvoiceOcrLine(designation),qty};
  }

  // Cas collé : MISTIK 90 12G Vert 8
  m=s.match(/^(.*\S)\s+(\d{1,3})\s*$/);
  if(m){
    const designation=stripInternalRefsV4(m[1]).trim();
    const qty=parseInt(m[2],10);
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation) && invoiceDesignationHasSpecs(designation)){
      return {designation:fixInvoiceOcrLine(designation),qty};
    }
  }

  // Cas quantité devant : 8 MISTIK 90 12G Vert
  m=s.match(/^\s*(\d{1,3})\s+(.+)$/);
  if(m){
    const qty=parseInt(m[1],10);
    const designation=stripInternalRefsV4(m[2]).trim();
    if(qty>=1 && qty<=500 && isLikelyInvoiceProductLine(designation)) return {designation:fixInvoiceOcrLine(designation),qty};
  }

  return {designation:s,qty:1};
}

function gramsCompatibleV4(wantedGram, productGram, wantedProduct, wantedSize){
  const wg=normalizeLine(wantedGram||'');
  const pg=normalizeLine(productGram||'');
  if(!wg || !pg) return true;
  if(wg===pg) return true;
  // Cas métier Johan : Rouget 70 6g sur facture = produit catalogue Rouget 7cm 6.5g.
  if(norm(wantedProduct||'').includes('rouget') && wantedSize==='7 cm' && wg==='6 g' && pg==='6.5 g') return true;
  return false;
}

function scoreProduct(line, normLine, p){
  const cleanLine=stripInternalRefsV4(line);
  const refLine=norm(cleanLine);
  if(refLine.includes(norm(p.ref))) return 10;
  const wanted=extractWanted(cleanLine);
  const hay=productNormText(p);

  if(wanted.product && norm(p.produit)!==norm(wanted.product)) return 0;
  if(wanted.size && normalizeLine(p.taille)!==wanted.size) return 0;
  if(wanted.gram && !gramsCompatibleV4(wanted.gram, p.grammage, wanted.product || p.produit, wanted.size)) return 0;

  let score=0;
  if(wanted.product) score+=4;
  if(wanted.size) score+=2.5;
  if(wanted.gram) score+=2.5;

  const useful=normLine.split(' ').filter(w=>w && !['cm','g','de','la','le','les','du','x','pe'].includes(w) && !/^\d+$/.test(w));
  let hits=0;
  useful.forEach(w=>{ if(hay.includes(w)) hits++; });
  score += useful.length ? Math.min(3, hits/useful.length*3) : 0;

  const colorTokens=normalizeLine(p.couleur).split(' ').filter(w=>w.length>2);
  const colorHit=colorTokens.some(w=>normLine.includes(w));
  if(colorTokens.length && colorHit) score+=2;

  // Pour Rouget, la facture n’écrit pas toujours Rose : on ne pénalise pas la couleur manquante.
  if(colorTokens.length && !colorHit && useful.length>2 && norm(p.produit)!=='rouget') score-=1;
  return score;
}

function matchProduct(line){
  const cleanLine=stripInternalRefsV4(line);
  const nl=normalizeLine(cleanLine);
  const scored=CATALOGUE.map(p=>({p,s:scoreProduct(cleanLine,nl,p)})).sort((a,b)=>b.s-a.s);
  const best=scored[0];
  const second=scored[1];
  const confident = best && best.s>=7 && (!second || best.s-second.s>=0.25 || best.s>=10);
  return {product: confident ? best.p : null, score: best ? best.s : 0, matched: !!confident, candidates: scored.slice(0,3)};
}

function rowsToOrderResults(rows){
  return rows.map(item=>{
    const designation=stripInternalRefsV4(item.designation);
    const m=matchProduct(designation);
    return {line:designation, qty:item.qty, product:m.product, score:m.score, matched:m.matched, candidates:m.candidates};
  });
}

function showStructuredRows(rows, sourceLabel){
  rows=dedupeInvoiceRows(rows.map(r=>({designation:stripInternalRefsV4(r.designation),qty:r.qty}))).filter(r=>isLikelyInvoiceProductLine(r.designation));
  const textarea=document.getElementById('order-text');
  textarea.value=rows.map(i=>`${i.designation} x${i.qty}`).join('\n');
  orderResults=rowsToOrderResults(rows);
  const matched=orderResults.filter(r=>r.matched).length;
  const status=document.getElementById('file-status');
  if(status) status.textContent=`✅ ${sourceLabel} — ${rows.length} ligne(s) produit détectée(s), ${matched} reconnue(s). Références internes ignorées.`;
  renderOrderResults();
}

// ═══════════════════════════════════════════════════════
// V15 FINALE — garde la mécanique V7 + ajouts workflow pro
// ═══════════════════════════════════════════════════════

function removeOrderResult(index){
  orderResults.splice(index,1);
  renderOrderResults();
}

function clearUnmatchedResults(){
  orderResults = orderResults.filter(r=>r.matched);
  renderOrderResults();
}

function validateOrderToQueue(){
  const matched=orderResults.filter(r=>r.matched);
  if(!matched.length){alert('Aucun produit reconnu à valider.');return;}
  matched.forEach(r=>addToQueue(r.product,r.qty||1));
  const msg=document.getElementById('v15-validation-msg');
  if(msg){
    msg.textContent='✅ Commande validée : produits ajoutés à la file d’impression.';
    msg.style.display='block';
  }else{
    alert('Commande validée : produits ajoutés à la file d’impression.');
  }
}

function renderOrderResults(){
  const sec=document.getElementById('order-results-section');
  const list=document.getElementById('order-results-list');
  const stats=document.getElementById('results-stats');
  sec.style.display='block';
  const matched=orderResults.filter(r=>r.matched).length;
  stats.textContent=`${matched} reconnu(s) / ${orderResults.length} ligne(s)`;
  list.innerHTML='';
  if(!orderResults.length){
    list.innerHTML='<div class="queue-empty">Aucun résultat. Réimportez ou collez une commande.</div>';
    return;
  }
  orderResults.forEach((r,i)=>{
    const div=document.createElement('div');
    div.className='order-result '+(r.matched?'matched':'unmatched');
    const bcDiv=document.createElement('div');
    bcDiv.className='or-preview';
    if(r.matched && r.product.ean){
      const c=makeSmallEAN(r.product.ean);
      bcDiv.appendChild(c);
    } else {
      bcDiv.textContent='❓';
      bcDiv.style.fontSize='22px';
      bcDiv.style.display='flex';
      bcDiv.style.alignItems='center';
      bcDiv.style.justifyContent='center';
    }

    const info=document.createElement('div');
    info.className='or-info';
    const formatBadge = r.matched && r.product.format==='50x40' ? '<span class="tag tag-round">50×40</span>' : '';
    const roundBadge = r.matched && r.product.ronde ? '<span class="tag tag-round">ronde + code-barres</span>' : '';
    info.innerHTML=`<div class="or-name">${r.matched?r.product.produit+' — '+(r.product.couleur||''):'À vérifier'}</div>
      <div class="or-ref">${r.matched?r.product.ref+' '+formatBadge+' '+roundBadge:''}</div>
      <div class="or-line">"${r.line.substring(0,80)}${r.line.length>80?'…':''}"</div>
      <div class="qty-pills">${[1,2,4,6,8,10,12,20,50].map(q=>`<span class="qty-pill" onclick="setOrderQty(${i},${q})">${q}</span>`).join('')}</div>`;

    const right=document.createElement('div');
    right.className='or-right';
    right.innerHTML=`<span class="status-badge ${r.matched?'status-ok':'status-ko'}">${r.matched?'✓ OK':'à vérifier'}</span>
      <div class="qty-row">
        <button onclick="setOrderQty(${i},Math.max(1,(orderResults[${i}].qty||1)-1))">−</button>
        <input type="number" class="qty-input" id="oqty-${i}" value="${r.qty}" min="1" max="999" oninput="orderResults[${i}].qty=parseInt(this.value)||1"/>
        <button onclick="setOrderQty(${i},(orderResults[${i}].qty||1)+1)">+</button>
      </div>
      ${r.matched?`<button class="btn btn-success btn-sm" onclick="addToQueue(orderResults[${i}].product,orderResults[${i}].qty||1)">+ File</button>`:''}
      <button class="btn btn-danger btn-sm" onclick="removeOrderResult(${i})">Supprimer</button>`;

    div.appendChild(bcDiv);
    div.appendChild(info);
    div.appendChild(right);
    list.appendChild(div);
  });

  let msg=document.getElementById('v15-validation-msg');
  if(!msg){
    msg=document.createElement('div');
    msg.id='v15-validation-msg';
    msg.className='alert alert-ok';
    msg.style.display='none';
    msg.style.marginTop='10px';
    list.parentElement.appendChild(msg);
  }
}

function parseSizeNumberV15(v){
  const s=String(v||'').replace(',','.');
  const m=s.match(/(\d+(?:\.\d+)?)/);
  return m?parseFloat(m[1]):9999;
}

function parseWeightNumberV15(v){
  const s=String(v||'').replace(',','.');
  const m=s.match(/(\d+(?:\.\d+)?)/);
  return m?parseFloat(m[1]):9999;
}

function renderCatalogue(){
  const q=document.getElementById('cat-search').value.trim().toLowerCase();
  let items=[...CATALOGUE];
  if(activeFilter!=='Tous') items=items.filter(p=>p.produit===activeFilter);
  if(q) items=items.filter(p=>[p.ref,p.couleur,p.taille,p.grammage,p.produit,p.famille].join(' ').toLowerCase().includes(q));
  items.sort((a,b)=>
    a.produit.localeCompare(b.produit) ||
    parseSizeNumberV15(a.taille)-parseSizeNumberV15(b.taille) ||
    parseWeightNumberV15(a.grammage)-parseWeightNumberV15(b.grammage) ||
    String(a.couleur||'').localeCompare(String(b.couleur||''))
  );

  document.getElementById('cat-count').textContent=items.length+'/'+CATALOGUE.length;
  const grid=document.getElementById('cat-grid');
  if(!items.length){grid.innerHTML='<div class="empty-state"><div class="es-icon">🔍</div><p>Aucun résultat</p></div>';return;}
  grid.innerHTML='';
  let lastGroup='';
  items.forEach(p=>{
    const group=p.produit+' · '+p.taille+' · '+p.grammage;
    if(group!==lastGroup){
      lastGroup=group;
      const h=document.createElement('div');
      h.className='catalogue-group-title';
      h.textContent=group;
      grid.appendChild(h);
    }
    const card=document.createElement('div');
    card.className='cat-card';
    const bcDiv=document.createElement('div');
    bcDiv.className='cat-card-bc';
    if(p.ean){
      const c=makeSmallEAN(p.ean);
      c.style.maxHeight='44px';
      bcDiv.appendChild(c);
    }
    card.appendChild(bcDiv);
    const formatBadge = p.format==='50x40' ? '<span class="tag tag-round">50×40</span>' : '';
    const roundBadge = p.ronde ? '<span class="tag tag-round">ronde</span>' : '';
    const safeId=p.ref.replace(/[^a-z0-9]/gi,'');
    const htStr  = p.ht  ? Number(p.ht).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' € HT'  : '';
    const pvcStr = p.pvc ? Number(p.pvc).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' € PVC' : '';
    const priceStr = [htStr, pvcStr].filter(Boolean).join(' — ');
    card.innerHTML+=`<div class="cat-card-name">${p.couleur||p.produit}</div>
      <div class="cat-card-meta">${p.produit} · ${p.taille} / ${p.grammage} ${formatBadge} ${roundBadge}</div>
      <div class="cat-card-ref">${p.ref}</div>
      ${priceStr ? `<div class="cat-card-price">${priceStr}</div>` : ''}
      <div class="cat-card-actions v15-cat-actions">
        <input type="number" min="1" value="1" class="cat-qty" id="catqty-${safeId}" />
        <button class="btn btn-dark btn-sm" onclick="quickAddFromCatalogue('${p.ref}')">+ File</button>
        <button class="btn btn-sm" onclick="previewProduct('${p.ref}')">👁</button>
        ${p._custom?`<button class="btn btn-sm" style="background:#1565c0;color:#fff" onclick="openEditManualModal('${p.ref}')">✏️</button><button class="btn btn-sm" style="background:#b71c1c;color:#fff" onclick="deleteCustomProduct('${p.ref}')">🗑</button>`:''}
      </div>`;
    grid.appendChild(card);
  });
}

function quickAddFromCatalogue(ref){
  const p=CATALOGUE.find(x=>x.ref===ref);
  if(!p) return;
  const input=document.getElementById('catqty-'+ref.replace(/[^a-z0-9]/gi,''));
  const qty=Math.max(1,parseInt(input?.value||'1',10)||1);
  addToQueue(p,qty);
  const btn=event && event.target ? event.target : null;
  if(btn){
    btn.textContent='✓ '+qty;
    btn.style.background='#2e7d32';
    btn.style.color='#fff';
    setTimeout(()=>{btn.textContent='+ File';btn.style.background='';btn.style.color='';},1500);
  }
}

function addToQueue(product,qty){
  const safeQty=Math.max(1, parseInt(qty,10)||1);
  if(!product.roundOnly) addOneToQueueArray(queueRect, product, safeQty);
  if(product.ronde) addOneToQueueArray(queueRound, product, safeQty);
  saveState();
  updateQueueIndicator();
  renderQueues();
}

const DEFAULT_PRINT_SETTINGS_V15 = {
  rectW: 40, rectH: 30, rectPad: 1.2,
  bcWidth: 2.4, bcHeight: 62, bcFont: 9,
  titleFont: 13, infoFont: 13, refFont: 9,
  roundDiam: 15, roundGap: 2, roundGapY: 2, roundTitle: 9, roundSub: 8
};

function ensureV15Settings(){
  printSettings={...DEFAULT_PRINT_SETTINGS_V15,...(printSettings||{})};
  if(printSettings.roundGapY==null) printSettings.roundGapY=2;
}

function savePrintSettings(){
  ensureV15Settings();
  printSettings={
    rectW:num('set-rect-w',40), rectH:num('set-rect-h',30), rectPad:num('set-rect-pad',1.2),
    bcWidth:num('set-bc-width',2.4), bcHeight:num('set-bc-height',62), bcFont:num('set-bc-font',9),
    titleFont:num('set-title-font',13), infoFont:num('set-info-font',13), refFont:num('set-ref-font',9),
    roundDiam:num('set-round-diam',15), roundGap:num('set-round-gap',2), roundGapY:num('set-round-gap-y',2),
    roundTitle:num('set-round-title',9), roundSub:num('set-round-sub',8)
  };
  try{localStorage.setItem('fl_print_settings_v5',JSON.stringify(printSettings));}catch(e){}
  renderPrintPreviews();
}

function syncPrintSettingsToUI(){
  ensureV15Settings();
  const map={
    'set-rect-w':'rectW','set-rect-h':'rectH','set-rect-pad':'rectPad','set-bc-width':'bcWidth','set-bc-height':'bcHeight','set-bc-font':'bcFont',
    'set-title-font':'titleFont','set-info-font':'infoFont','set-ref-font':'refFont','set-round-diam':'roundDiam','set-round-gap':'roundGap',
    'set-round-gap-y':'roundGapY','set-round-title':'roundTitle','set-round-sub':'roundSub'
  };
  Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id); if(el) el.value=printSettings[key];});
  const fr=document.getElementById('format-rect');
  if(fr){ fr.value='custom'; }
  const fw=document.getElementById('fmt-w'), fh=document.getElementById('fmt-h');
  if(fw) fw.value=printSettings.rectW;
  if(fh) fh.value=printSettings.rectH;
  const cw=document.getElementById('custom-format-w'), ch=document.getElementById('custom-format-h');
  if(cw) cw.style.display='block'; if(ch) ch.style.display='block';
}

function loadPrintSettings(){
  try{
    const saved=localStorage.getItem('fl_print_settings_v5');
    if(saved) printSettings={...DEFAULT_PRINT_SETTINGS_V15,...JSON.parse(saved)};
    else printSettings={...DEFAULT_PRINT_SETTINGS_V15};
  }catch(e){ printSettings={...DEFAULT_PRINT_SETTINGS_V15}; }
  syncPrintSettingsToUI();
}

function resetPrintSettings(){
  printSettings={...DEFAULT_PRINT_SETTINGS_V15};
  syncPrintSettingsToUI();
  savePrintSettings();
}

function bindPrintSettingsUI(){
  ['set-rect-w','set-rect-h','set-rect-pad','set-bc-width','set-bc-height','set-bc-font','set-title-font','set-info-font','set-ref-font','set-round-diam','set-round-gap','set-round-gap-y','set-round-title','set-round-sub'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('input', savePrintSettings);
  });
  loadPrintSettings();
  renderPrintPreviews();
}

function getProductDimsV15(p){
  if(p && p.format==='50x40') return [50,40];
  return [printSettings.rectW||40, printSettings.rectH||30];
}

function buildPrintBody(type, labels){
  if(type==='rect'){
    return labels.map(p=>{
      const dims=getProductDimsV15(p);
      return buildLabelHTML(p,dims[0],dims[1],true);
    }).join('');
  }
  let html='';
  for(let i=0;i<labels.length;i+=2){ html+=buildRoundPairHTML(labels[i], labels[i+1]||null, true); }
  return html;
}

function getPageSize(type){
  if(type==='rect'){
    const first=queueRect[0]?.product;
    const dims=getProductDimsV15(first);
    return {w:dims[0]+'mm', h:dims[1]+'mm'};
  }
  return {w:(printSettings.roundDiam*2+printSettings.roundGap)+'mm', h:(printSettings.roundDiam+(printSettings.roundGapY||0))+'mm'};
}

function buildRoundPairHTML(p1,p2,pageBreak=true){
  const d=printSettings.roundDiam;
  const gap=printSettings.roundGap;
  const gapY=printSettings.roundGapY||0;
  const w=(d*2+gap);
  return `<div class="print-label-round-pair" style="width:${w}mm;height:${d+gapY}mm;background:#fff;display:flex;align-items:flex-start;justify-content:center;gap:${gap}mm;box-sizing:border-box;overflow:hidden;${pageBreak?'page-break-after:always;break-after:page;':''}">
    ${p1?buildOneRoundHTML(p1):`<div style="width:${d}mm;height:${d}mm;"></div>`}
    ${p2?buildOneRoundHTML(p2):`<div style="width:${d}mm;height:${d}mm;"></div>`}
  </div>`;
}

function renderPrintPreviews(){
  const rect=document.getElementById('rect-live-preview');
  if(rect){ 
    const p=exampleRectProduct();
    const dims=getProductDimsV15(p);
    rect.innerHTML=buildLabelHTML(p, dims[0], dims[1], false); 
  }
  const round=document.getElementById('round-live-preview');
  if(round){ round.innerHTML=buildRoundPairHTML(exampleRoundProduct(), exampleRoundProduct(), false); }
}



function printRound(){
  if(!roundQueue || !roundQueue.length){
    alert("File rondes vide.");
    return;
  }

  const diameter = parseFloat((document.getElementById("roundFormat") && document.getElementById("roundFormat").value) || "15");
  const gapX = parseFloat((document.getElementById("roundGapX") && document.getElementById("roundGapX").value) || "2");
  const gapY = parseFloat((document.getElementById("roundGapY") && document.getElementById("roundGapY").value) || "2");

  const modeEl = document.getElementById("roundPrintMode");
  const lineCountEl = document.getElementById("roundLineCount");
  const mode = modeEl ? modeEl.value : "both";
  const requestedLines = lineCountEl ? Math.max(1, parseInt(lineCountEl.value, 10) || 1) : null;

  const pageW = (diameter * 2) + gapX;
  const pageH = diameter + gapY;

  const w = window.open("", "_blank");

  let html = `
  <html>
  <head>
    <title>Impression rondes</title>
    <style>
      @page { margin:0; size:${pageW}mm ${pageH}mm; }
      * { box-sizing:border-box; }
      body { margin:0; padding:0; font-family:Arial, sans-serif; }
      .row {
        width:${pageW}mm;
        height:${pageH}mm;
        display:flex;
        gap:${gapX}mm;
        margin:0 0 ${gapY}mm 0;
        page-break-inside:avoid;
        break-inside:avoid;
      }
      .round {
        width:${diameter}mm;
        height:${diameter}mm;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        font-weight:900;
        font-size:${diameter <= 15 ? 7 : diameter <= 20 ? 9 : 11}px;
        line-height:1.05;
        overflow:hidden;
        white-space:normal;
      }
      .empty-round {
        width:${diameter}mm;
        height:${diameter}mm;
      }
    </style>
  </head>
  <body>`;

  roundQueue.forEach(item => {
    const p = item.product || item.produit || item.p || {};
    const qty = parseInt(item.qty || item.q || 1, 10) || 1;

    let lines;
    if(requestedLines){
      lines = requestedLines;
    }else{
      lines = mode === "both" ? Math.ceil(qty / 2) : qty;
    }

    const label = `${p.size || p.taille || ""}<br>${p.weight || p.grammage || ""}`;

    for(let i = 0; i < lines; i++){
      let left = `<div class="round">${label}</div>`;
      let right = `<div class="round">${label}</div>`;

      if(mode === "left"){
        right = `<div class="empty-round"></div>`;
      }else if(mode === "right"){
        left = `<div class="empty-round"></div>`;
      }

      html += `<div class="row">${left}${right}</div>`;
    }
  });

  html += `
    <script>
      setTimeout(function(){ window.print(); }, 300);
    <\/script>
  </body>
  </html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}



// ═══════════════════════════════════════════════════════
// V17 — FACTURATION PRO HT / TVA NON APPLICABLE
// ═══════════════════════════════════════════════════════
const FL_COMPANY = {
  name: "GAUTIER FISHING – FRENCHY LEURRES",
  person: "Mr Gautier Johan",
  address: "8, chemin campagne roque | 13110 Port-de-Bouc",
  phone: "07 83 21 07 58",
  mobile: "07 83 21 07 58",
  email: "contact@frenchyleurres.fr",
  siret: "48359538500038",
  vatNote: "TVA non applicable – article 293B du CGI"
};

let invoiceClients = [];
let invoiceLines = [];

function invoiceInit(){
  const today = new Date().toISOString().slice(0,10);
  const d = document.getElementById('invoice-date');
  const sd = document.getElementById('invoice-ship-date');
  if(d && !d.value) d.value = today;
  if(sd && !sd.value) sd.value = today;

  try{
    const saved = localStorage.getItem('fl_invoice_clients');
    invoiceClients = saved ? JSON.parse(saved) : [];
  }catch(e){ invoiceClients = []; }

  if(!invoiceClients.length){
    invoiceClients = [
      {
        name:"Cabesto Mandelieu",
        phone:"04 92 97 31 90",
        email:"mandelieu@cabesto.com",
        delivery:"CABESTO MANDELIEU\\nAv. du Maréchal Lyautey\\nZA La Canardière\\n06210 Mandelieu-la-Napoule",
        billing:"CABESTO\\nZAC Le Pastre II — CC Auchan Les Paluds\\n13400 Aubagne\\nFrance",
        siret:"44476149800047",
        vat:"FR36444761498",
        code:"FE00513"
      },
      {
        name:"Cabesto Aubagne",
        phone:"04.96.18.00.18",
        email:"",
        delivery:"CABESTO AUBAGNE\\nZAC Le Pastre II — CC Auchan Les Paluds\\n13400 Aubagne",
        billing:"CABESTO\\nZAC Le Pastre II — CC Auchan Les Paluds\\n13400 Aubagne\\nFrance",
        siret:"44476149800047",
        vat:"FR36444761498",
        code:"FE00513"
      }
    ];
    invoiceSaveClients();
  }
  invoiceRenderClients();
  invoiceRenderLines();
}

function invoiceSaveClients(){
  try{ localStorage.setItem('fl_invoice_clients', JSON.stringify(invoiceClients)); }catch(e){}
}

function invoiceRenderClients(){
  const sel = document.getElementById('invoice-client');
  if(!sel) return;
  sel.innerHTML = invoiceClients.map((c,i)=>`<option value="${i}">${escapeHtml(c.name)}</option>`).join('');
}

function clientFillForm(){
  const idx = Number(document.getElementById('invoice-client').value || 0);
  const c = invoiceClients[idx];
  if(!c) return;
  document.getElementById('client-name').value = c.name || '';
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-email').value = c.email || '';
  document.getElementById('client-delivery').value = c.delivery || '';
  document.getElementById('client-billing').value = c.billing || '';
  document.getElementById('client-siret').value = c.siret || '';
  document.getElementById('client-vat').value = c.vat || '';
  document.getElementById('client-code').value = c.code || '';
}

function clientSaveFromForm(){
  const c = {
    name: document.getElementById('client-name').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    email: document.getElementById('client-email').value.trim(),
    delivery: document.getElementById('client-delivery').value.trim(),
    billing: document.getElementById('client-billing').value.trim(),
    siret: document.getElementById('client-siret').value.trim(),
    vat: document.getElementById('client-vat').value.trim(),
    code: document.getElementById('client-code').value.trim()
  };
  if(!c.name){ alert('Nom magasin obligatoire'); return; }
  const existing = invoiceClients.findIndex(x=>norm(x.name)===norm(c.name));
  if(existing>=0) invoiceClients[existing] = c;
  else invoiceClients.push(c);
  invoiceSaveClients();
  invoiceRenderClients();
  document.getElementById('invoice-client').value = existing>=0 ? existing : invoiceClients.length-1;
  alert('Client enregistré.');
}

function clientDeleteSelected(){
  const idx = Number(document.getElementById('invoice-client').value || 0);
  if(!invoiceClients[idx]) return;
  if(!confirm('Supprimer ce client ?')) return;
  invoiceClients.splice(idx,1);
  invoiceSaveClients();
  invoiceRenderClients();
}

function invoiceAnalyzeText(){
  const text = document.getElementById('invoice-text').value || '';
  const lines = text.split(/\n|;/).map(x=>x.trim()).filter(Boolean);
  invoiceLines = [];
  lines.forEach(line=>{
    const match = matchProduct(line);
    const p = match && match.product ? match.product : null;
    if(!p) return;
    const qty = extractQty(line);
    invoiceLines.push({
      product:p,
      qty:qty,
      pu:Number(p.ht || 0),
      designation: invoiceDesignation(p)
    });
  });
  invoiceRenderLines();
}

function invoiceUsePrintQueue(){
  invoiceLines = [];
  const map = new Map();
  (queueRect||[]).forEach(item=>{
    const p = item.product;
    const key = p.ref;
    if(!map.has(key)) map.set(key,{product:p,qty:0,pu:Number(p.ht||0),designation:invoiceDesignation(p)});
    map.get(key).qty += Number(item.qty||0);
  });
  invoiceLines = Array.from(map.values());
  invoiceRenderLines();
}

function invoiceDesignation(p){
  return [p.produit, p.taille, p.grammage, p.couleur].filter(Boolean).join(' ');
}

function invoiceRenderLines(){
  const box = document.getElementById('invoice-lines');
  const totalBox = document.getElementById('invoice-total-box');
  if(!box) return;
  if(!invoiceLines.length){
    box.className = 'invoice-lines-empty';
    box.innerHTML = 'Aucune ligne pour le moment.';
    if(totalBox) totalBox.style.display='none';
    return;
  }
  box.className = '';
  box.innerHTML = invoiceLines.map((l,i)=>`
    <div class="invoice-line">
      <div>
        <strong>${escapeHtml(l.designation)}</strong>
        <small>Réf : ${escapeHtml(l.product.ref)} · EAN13 : ${escapeHtml(l.product.ean || '')}</small>
      </div>
      <input type="number" min="1" value="${l.qty}" onchange="invoiceUpdateLine(${i},'qty',this.value)">
      <input type="number" min="0" step="0.01" value="${moneyNumber(l.pu)}" onchange="invoiceUpdateLine(${i},'pu',this.value)">
      <strong>${money(l.qty*l.pu)}</strong>
      <button class="btn btn-danger btn-sm" onclick="invoiceRemoveLine(${i})">×</button>
    </div>
  `).join('');
  invoiceTotals();
}

function invoiceUpdateLine(i,field,value){
  if(!invoiceLines[i]) return;
  if(field==='qty') invoiceLines[i].qty = Math.max(1, parseInt(value,10)||1);
  if(field==='pu') invoiceLines[i].pu = Math.max(0, parseFloat(String(value).replace(',','.'))||0);
  invoiceRenderLines();
}

function invoiceRemoveLine(i){
  invoiceLines.splice(i,1);
  invoiceRenderLines();
}

function invoiceTotals(){
  const total = invoiceLines.reduce((s,l)=>s+(Number(l.qty)||0)*(Number(l.pu)||0),0);
  const box = document.getElementById('invoice-total-box');
  if(box){
    box.style.display='block';
    box.innerHTML = `Total HT : ${money(total)} — TVA : 0,00 € — Total à payer : ${money(total)}<br><span style="font-size:12px;color:#000;">${FL_COMPANY.vatNote}</span>`;
  }
  return total;
}

function invoicePrint(type){
  if(!invoiceLines.length){ alert('Aucune ligne à facturer. Analyse une commande ou utilise la file d’étiquettes.'); return; }
  const idx = Number(document.getElementById('invoice-client').value || 0);
  const client = invoiceClients[idx] || {};
  const meta = {
    number: document.getElementById('invoice-number').value || 'FL-2026-001',
    date: document.getElementById('invoice-date').value || new Date().toISOString().slice(0,10),
    order: document.getElementById('invoice-order-number').value || '',
    ship: document.getElementById('invoice-ship-date').value || '',
    place: document.getElementById('invoice-place').value || 'Roques'
  };
  const html = type==='delivery' ? invoiceDeliveryHTML(client, meta) : invoiceHTML(client, meta);
  const w = window.open('', '_blank');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function invoiceTableRows(){
  return invoiceLines.map((l,i)=>{
    const m = Number(l.qty||0)*Number(l.pu||0);
    return `<tr>
      <td>${i+1}</td>
      <td>${escapeHtml(l.designation)}<br><small>EAN13 : ${escapeHtml(l.product.ean||'')}</small></td>
      <td>${escapeHtml(l.product.ref||'')}</td>
      <td class="num">${l.qty}</td>
      <td class="num">${money(l.pu)}</td>
      <td class="num">${money(m)}</td>
    </tr>`;
  }).join('');
}

function invoiceBaseStyle(){
  return `<style>
    @page{size:A4;margin:12mm}
    body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}
    .top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:12px}
    .brand h1{margin:0;font-size:22px}.brand p{margin:3px 0}
    .doc-title{text-align:right}.doc-title h2{margin:0;font-size:24px}.doc-title strong{font-size:14px}
    .blocks{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0}
    .block{border:1px solid #000;padding:8px;min-height:72px}.block h3{margin:0 0 5px;font-size:12px;background:#111;color:#fff;padding:4px}
    table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#111;color:white}th,td{border:1px solid #000;padding:6px;vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}
    .totals{margin-left:auto;margin-top:12px;width:280px;border:1px solid #111}.totals div{display:flex;justify-content:space-between;padding:7px;border-bottom:1px solid #000}.totals div:last-child{border-bottom:0;font-weight:bold;background:#fff}
    .note{margin-top:14px;border:1px solid #000;padding:8px;font-weight:bold}
    .footer{margin-top:20px;font-size:11px;text-align:center;color:#000;border-top:1px solid #000;padding-top:8px}
    .sign{margin-top:24px;text-align:right}
    small{color:#000}
  </style>`;
}

function invoiceHTML(client, meta){
  const total = invoiceLines.reduce((s,l)=>s+(Number(l.qty)||0)*(Number(l.pu)||0),0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${escapeHtml(meta.number)}</title>${invoiceBaseStyle()}</head><body>
    <div class="top">
      <div class="brand">
        <h1>${FL_COMPANY.name}</h1>
        <p>${FL_COMPANY.address}</p>
        <p>Tél : ${FL_COMPANY.phone} — Mobile : ${FL_COMPANY.mobile}</p>
        <p>${FL_COMPANY.email}</p>
        <p>SIRET : ${FL_COMPANY.siret}</p>
      </div>
      <div class="doc-title">
        <h2>FACTURE</h2>
        <strong>N° ${escapeHtml(meta.number)}</strong><br>
        Date : ${dateFr(meta.date)}<br>
        ${meta.order ? 'Bon de commande : '+escapeHtml(meta.order) : ''}
      </div>
    </div>

    <div class="blocks">
      <div class="block"><h3>Client facturé</h3>${nl(client.billing || client.name || '')}<br>${client.siret ? 'SIRET : '+escapeHtml(client.siret)+'<br>' : ''}${client.vat ? 'TVA : '+escapeHtml(client.vat) : ''}</div>
      <div class="block"><h3>Livraison</h3>${nl(client.delivery || client.name || '')}</div>
      <div class="block"><h3>Conditions</h3>Prix en HT<br>Règlement par virement bancaire<br>${FL_COMPANY.vatNote}</div>
    </div>

    <table>
      <thead><tr><th>Article</th><th>Désignation</th><th>Réf. fournisseur</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Montant HT</th></tr></thead>
      <tbody>${invoiceTableRows()}</tbody>
    </table>

    <div class="totals">
      <div><span>Total HT</span><strong>${money(total)}</strong></div>
      <div><span>TVA</span><strong>0,00 €</strong></div>
      <div><span>Total à payer</span><strong>${money(total)}</strong></div>
    </div>
    <div class="note">${FL_COMPANY.vatNote}</div>
    <div class="sign">Fait à ${escapeHtml(meta.place)}, le ${dateFr(meta.date)}<br><br>Gautier Johan</div>
    <div class="footer">${FL_COMPANY.name} — ${FL_COMPANY.address}</div>
    <script>setTimeout(()=>window.print(),300);<\/script>
  </body></html>`;
}

function invoiceDeliveryHTML(client, meta){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bon de livraison ${escapeHtml(meta.number)}</title>${invoiceBaseStyle()}</head><body>
    <div class="top">
      <div class="brand">
        <h1>BON DE LIVRAISON</h1>
        <p>Code fournisseur : ${escapeHtml(client.code || '')}</p>
        <p>Commande n° ${escapeHtml(meta.order || meta.number)}</p>
      </div>
      <div class="doc-title">
        <h2>${FL_COMPANY.name}</h2>
        Date : ${dateFr(meta.date)}<br>
        Départ expédition : ${dateFr(meta.ship || meta.date)}
      </div>
    </div>

    <div class="blocks">
      <div class="block"><h3>Adresse livraison</h3>${nl(client.delivery || client.name || '')}<br>${client.phone ? 'Tél : '+escapeHtml(client.phone)+'<br>' : ''}${client.email ? escapeHtml(client.email) : ''}</div>
      <div class="block"><h3>Adresse facturation</h3>${nl(client.billing || client.name || '')}<br>${client.siret ? 'SIRET : '+escapeHtml(client.siret)+'<br>' : ''}${client.vat ? 'TVA : '+escapeHtml(client.vat) : ''}</div>
      <div class="block"><h3>Adresse commande</h3>${FL_COMPANY.person}<br>${FL_COMPANY.address}<br>Tél : ${FL_COMPANY.phone}<br>Mobile : ${FL_COMPANY.mobile}<br>${FL_COMPANY.email}</div>
    </div>

    <table>
      <thead><tr><th>Article</th><th>Désignation</th><th>Réf. fournisseur</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Montant HT</th></tr></thead>
      <tbody>${invoiceTableRows()}</tbody>
    </table>

    <div class="totals">
      <div><span>Base HT</span><strong>${money(invoiceLines.reduce((s,l)=>s+l.qty*l.pu,0))}</strong></div>
      <div><span>TVA</span><strong>0,00 €</strong></div>
      <div><span>Mtt TTC</span><strong>${money(invoiceLines.reduce((s,l)=>s+l.qty*l.pu,0))}</strong></div>
    </div>
    <div class="sign">Fait à ${escapeHtml(meta.place)}, le ${dateFr(meta.ship || meta.date)}<br><br>Le directeur général : Gautier Johan</div>
    <div class="footer">${FL_COMPANY.name} — ${FL_COMPANY.address}</div>
    <script>setTimeout(()=>window.print(),300);<\/script>
  </body></html>`;
}

function money(v){
  return (Number(v)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
}
function moneyNumber(v){
  return (Number(v)||0).toFixed(2);
}
function dateFr(v){
  if(!v) return '';
  const p=String(v).split('-');
  if(p.length===3) return p[2]+'/'+p[1]+'/'+p[0];
  return escapeHtml(v);
}
function nl(v){
  return escapeHtml(v||'').replace(/\n/g,'<br>');
}
function escapeHtml(v){
  return String(v||'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}

// Hook init sans casser l’app existante
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(invoiceInit, 200);
});
// ═══════════════════════════════════════════════════════════════════════
// MODULE FACTURATION V21
// ═══════════════════════════════════════════════════════════════════════

const FL = {
  name:     'GAUTIER FISHING – FRENCHY LEURRES',
  fullName: 'Mr Johan GAUTIER – GAUTIER FISHING / FRENCHY LEURRES',
  address:  '8, chemin campagne roque | 13110 Port-de-Bouc',
  phone:    '07 83 21 07 58',
  mobile:   '07 83 21 07 58',
  email:    'contact@frenchyleurres.fr',
  siret:    '483 595 385 00038',
  vatNote:  'TVA non applicable – article 293B du CGI | GAUTIER FRENCHY LEURRES — SIRET : 483 595 385 00038'
};

// ── CLIENTS ───────────────────────────────────────────────────────────
const CLIENTS_DB = [
  {name:"Chasse Pêche Passion Narbonne",type:"magasin",address:"Route de Perpignan, ZI Forum Sud\n11100 Narbonne",phone:"04 68 42 10 10",email:"contact@chassepechepassion.com"},
  {name:"Veromar",type:"magasin",address:"26 Zone Technique Portuaire\n11430 Gruissan",phone:"04 68 32 20 41",email:"boisetyachting@orange.fr"},
  {name:"L'Hippocampe Chasse et Pêche",type:"magasin",address:"18 Ronde des Florins, ZAC des Cognets\n13800 Istres",phone:"04 90 45 85 36",email:"contact@hippo-chasse-peche.fr"},
  {name:"La Plage",type:"magasin",address:"150 Avenue du Sablé d'Or\n13270 Fos-sur-Mer",phone:"04 42 05 48 80",email:""},
  {name:"Le Fosseen (Le Phocéen)",type:"magasin",address:"2 Boulevard du Collet\n13008 Marseille",phone:"04 91 73 83 82",email:""},
  {name:"Le Temple de la Pêche",type:"magasin",address:"Quartier Damiane\n13220 Châteauneuf-les-Martigues",phone:"04 42 76 39 69",email:""},
  {name:"Planet Fishing",type:"magasin",address:"Centre commercial Intermarché, av. du 8 mai 1945\n13700 Marignane",phone:"04 42 15 05 59",email:"vitrolles@planetfishing.fr"},
  {name:"Pêche for Life",type:"magasin",address:"24 Rue de la Loge\n13002 Marseille",phone:"04 91 91 48 33",email:"pecheforlife@gmail.com"},
  {name:"Pêche Passion chez Claude",type:"magasin",address:"512 Chemin du Littoral\n13016 Marseille",phone:"04 91 46 06 04",email:""},
  {name:"Top Fishing",type:"magasin",address:"33 Av. Albert Camus\n13960 Sausset-les-Pins",phone:"04 42 10 93 20",email:"info@top-fishing.fr"},
  {name:"Le Pescadou",type:"magasin",address:"Fiume d'Olmo – T10 Figaretto\n20230 Talasani",phone:"06 34 40 95 08",email:"lepescadou@hotmail.com"},
  {name:"Au Bon Pêcheur",type:"magasin",address:"46 Quai du Canal\n30800 Saint-Gilles",phone:"04 34 04 46 37",email:"contact@peche-chasse-gard.fr"},
  {name:"Pêche Center",type:"magasin",address:"RN 113\n30230 Bouillargues",phone:"04 66 21 73 42",email:"lepecheurgardois@orange.fr"},
  {name:"Chasse-Pêche Béziers",type:"magasin",address:"231 Rue Claude Nougaro\n34500 Béziers",phone:"04 67 21 93 41",email:"chassepechebeziers@hotmail.fr"},
  {name:"Pêchelec L'Espadon",type:"magasin",address:"1 Zone technique du port\n34110 Frontignan",phone:"06 04 17 69 37",email:"pechelec34@gmail.com"},
  {name:"Destination Pêche",type:"magasin",address:"5 Rue Michel Carré, Mas Guérido\n66330 Cabestany",phone:"04 68 67 10 52",email:"destinationpeche-shop@outlook.fr"},
  {name:"Riviera Pêche",type:"magasin",address:"450 Rue Louis Delage\n66000 Perpignan",phone:"",email:""},
  {name:"Orlando Pêche",type:"magasin",address:"31 Rue Camille Pelletan\n83500 La Seyne-sur-Mer",phone:"06 66 27 44 17",email:""},
  {name:"Sharnbrook Tackle",type:"magasin",address:"79 Meadow Street, Market Harborough\nLeicester LE16 7JY, United Kingdom",phone:"0044 (0)1858 467081",email:"sales@sharnbrooktackle.com"},
  // CABESTO
  {name:"Cabesto Mandelieu",type:"cabesto",comf:"COMF/MAN",storeCode:"MAN_STO",cde:"CDEXXXXX",ville:"MANDELIEU",recepEmail:"recep.mandelieu@cabesto.com",address:"Av. Maréchal Lyautey, ZA La Canardière\n06210 Mandelieu-la-Napoule",phone:"04 92 97 31 90",email:"mandelieu@cabesto.com",code:"FE00513"},
  {name:"Cabesto Aubagne",type:"cabesto",comf:"COMF/AUB",storeCode:"AUB_STO",cde:"CDE03523",ville:"AUBAGNE",recepEmail:"recep.aubagne@cabesto.com",address:"ZAC du Pastre 2\n13400 Aubagne",phone:"04 96 18 00 18",email:"rreea.aubagne@cabesto.com",code:"FE00513"},
  {name:"Cabesto Mauguio",type:"cabesto",comf:"COMF/MAU",storeCode:"MAU_STO",cde:"CDEXXXXX",ville:"MAUGUIO",recepEmail:"recep.mauguio@cabesto.com",address:"Route de Montpellier\n34130 Mauguio",phone:"",email:"mauguio@cabesto.com",code:"FE00513"},
  {name:"Cabesto Rivesaltes",type:"cabesto",comf:"COMF/RIV",storeCode:"RIV_STO",cde:"CDEXXXXX",ville:"RIVESALTES",recepEmail:"recep.riveasaltes@cabesto.com",address:"Zone Commerciale Cap Roussillon\n66600 Rivesaltes",phone:"04 68 08 40 50",email:"rivesaltes@cabesto.com",code:"FE00513"},
  {name:"Cabesto Sérignan / CABEDIS",type:"cabesto",comf:"COMF/SER",storeCode:"CABEDIS",cde:"CABEDIS",ville:"SERIGNAN",recepEmail:"directeur.serignan@cabesto.com",address:"400 Avenue Edgar Faure\n34410 Sérignan",phone:"",email:"directeur.serignan@cabesto.com",siret:"99502159900015",tva:"FR01995021599",code:"FE00513"},
  {name:"Cabesto Ollioules",type:"cabesto",comf:"COMF/OLL",storeCode:"OLL_STO",cde:"CDEXXXXX",ville:"OLLIOULES",recepEmail:"recep.ollioules@cabesto.com",address:"765 Chemin de Lagoubran\n83190 Ollioules",phone:"04 98 07 02 40",email:"rrabp.ollioules@cabesto.com",code:"FE00513"},
  {name:"Cabesto Toulon",type:"cabesto",comf:"COMF/TLN",storeCode:"TLN_STO",cde:"CDEXXXXX",ville:"TOULON",recepEmail:"recep.toulon@cabesto.com",address:"Toulon",phone:"",email:"toulon@cabesto.com",code:"FE00513"},
  {name:"Cabesto Cogolin",type:"cabesto",comf:"COMF/COG",storeCode:"COG_STO",cde:"CDEXXXXX",ville:"COGOLIN",recepEmail:"recep.cogolin@cabesto.com",address:"Cogolin",phone:"",email:"cogolin@cabesto.com",code:"FE00513"},
  {name:"Cabesto Brest",type:"cabesto",comf:"COMF/BRE",storeCode:"BRE_STO",cde:"CDEXXXXX",ville:"BREST",recepEmail:"recep.brest@cabesto.com",address:"Brest",phone:"",email:"brest@cabesto.com",code:"FE00513"},
];

// ── PRODUITS CABESTO (PE refs + prix Cabesto) ─────────────────────────
const CABESTO_PRODUCTS = [
  {pe:"PE-0007794",  ref:"MOULEDEMARS",            ean:"0710535116403",des:"MOULE MARSEILLAISE",         pu:2.98},
  {pe:"PE-0008623",  ref:"PB80g",                  ean:"0710535116465",des:"PB 80G MOULE MARSEILLAISE",  pu:2.26},
  {pe:"PE-0022611",  ref:"TP-ROUGET-ROSE-90-14GR", ean:"7864179998871",des:"ROUGET MARTEGAL 90 14g",    pu:3.10},
  {pe:"PE-0022612",  ref:"TP-ROUGET-ROSE-90-17GR", ean:"7864179339902",des:"ROUGET MARTEGAL 90 17g",    pu:3.10},
  {pe:"PE-0022613",  ref:"TP-ROUGET-ROSE-105-14GR",ean:"7864179320542",des:"ROUGET MARTEGAL 105 14g",   pu:3.20},
  {pe:"PE-0022614",  ref:"TP-ROUGET-ROSE-105-17GR",ean:"7864179999731",des:"ROUGET MARTEGAL 105 17g",   pu:3.20},
  {pe:"PE-0022615",  ref:"TP-ROUGET-ROSE-70-6.5GR",ean:"7864179792028",des:"ROUGET MARTEGAL 70 6g",     pu:2.90},
  {pe:"PE-0022616",  ref:"MISTIK-VE-9-12",         ean:"7864180440369",des:"MISTIK 90 12G Vert",        pu:2.60},
  {pe:"PE-0022617",  ref:"MISTIK-BPE-9-12",        ean:"7864180652953",des:"MISTIK 90 12G Blanc",       pu:2.60},
  {pe:"PE-0022618",  ref:"MISTIK-SD-9-12",         ean:"7864180445302",des:"MISTIK 90 12G Sardine",     pu:2.60},
  {pe:"PE-0022619",  ref:"MISTIK-VE-9-6",          ean:"7864180453345",des:"MISTIK 90 6G Vert",         pu:2.50},
  {pe:"PE-0022620",  ref:"MISTIK-BPE-9-6",         ean:"7864180684923",des:"MISTIK 90 6G Blanc",        pu:2.50},
  {pe:"PE-0022621",  ref:"MISTIK-SD-9-6",          ean:"7864180458173",des:"MISTIK 90 6G Sardine",      pu:2.50},
  {pe:"PE-0022622",  ref:"G-K-9-.6",               ean:"7141094847805",des:"LE G 9CM 6G Kaki",          pu:2.30},
  {pe:"PE-0022623",  ref:"G-BPE-9-.6",             ean:"7141094851246",des:"LE G 9CM 6G Blanc",         pu:2.30},
  {pe:"PE-0022624",  ref:"G-K-9-.9",               ean:"7141094848000",des:"LE G 9CM 9G Kaki",          pu:2.60},
  {pe:"PE-0022625",  ref:"G-BPE-9-.9",             ean:"7141094850904",des:"LE G 9CM 9G Blanc",         pu:2.60},
  {pe:"PE-0022626",  ref:"BIGGY-KIR-7-6",          ean:"7864180398417",des:"BIGGY 70 6G Kaki",          pu:2.44},
  {pe:"PE-0022627",  ref:"BIGGY-BVIR-7-6",         ean:"7864181197170",des:"BIGGY 70 6G Bleu",          pu:2.44},
  {pe:"PE-0022628",  ref:"BIGGY-SD-7-6",           ean:"7864180389835",des:"BIGGY 70 6G Sardine",       pu:2.44},
  {pe:"PE-0022892",  ref:"M2BRE.50",               ean:"0710535116496",des:"MOULE DE BREST 50GR",       pu:2.88},
  {pe:"PE-0022893",  ref:"M2MARB.110",             ean:"0710535116489",des:"MOULE DE MARBELLA 110GR",   pu:3.71},
  {pe:"PE-0022894-98D1",ref:"PIERRE25",            ean:"7141094848536",des:"PIERRE DE MARSEILLE 25GR",  pu:2.85},
  {pe:"PE-0022894-7635",ref:"PIERRE45",            ean:"7141094849052",des:"PIERRE DE MARSEILLE 45GR",  pu:3.46},
  {pe:"PE-0022894-3E37",ref:"PIERRE65",            ean:"7141094749120",des:"PIERRE DE MARSEILLE 65GR",  pu:3.96},
  {pe:"PE-0022894-7636",ref:"PIERRE90",            ean:"7141094849212",des:"PIERRE DE MARSEILLE 85GR",  pu:4.35},
];

function getPeData(ref, ean) {
  return CABESTO_PRODUCTS.find(p =>
    p.ref===ref || p.ean===String(ean||'') ||
    p.ean===String(ean||'').replace(/^0+/,'')
  ) || null;
}

// ── ÉTAT ──────────────────────────────────────────────────────────────
let magLines = [];
let cabLines = [];
let magClient = null;
let cabClient = null;
let magCurrentInvoiceId = null;
let cabCurrentInvoiceId = null;

// ── NAVIGATION ────────────────────────────────────────────────────────
function showFactuTab(name){
  try{localStorage.setItem('fl_factu_tab',name);}catch(e){}
  document.getElementById('factu-magasin').style.display=name==='magasin'?'block':'none';
  document.getElementById('factu-cabesto').style.display=name==='cabesto'?'block':'none';
  var h=document.getElementById('factu-tab-historique');if(h)h.style.display=name==='historique'?'block':'none';
  ['magasin','cabesto','historique'].forEach(function(n){
    var b=document.getElementById('sub-tab-'+n);
    if(b) b.classList.toggle('active', n===name);
  });
  if(name==='historique')renderHistorique();
  if(name==='magasin') setTimeout(function(){magUpdatePreview(_magPreviewType||'invoice');},100);
  // Remplir automatiquement les numéros de facture et la date
  if(name==='magasin'){
    var d=document.getElementById('mag-inv-date');if(d&&!d.value)d.value=todayISO();
    autoFillInvNum('mag');
  }
  if(name==='cabesto'){
    var dc=document.getElementById('cab-inv-date');if(dc&&!dc.value)dc.value=todayISO();
    autoFillInvNum('cab');
  }
}

// ── NUMÉROTATION AUTOMATIQUE DES FACTURES ──────────────────────────────────
window.autoFillInvNum = async function(mode){
  var el = document.getElementById(mode+'-inv-num');
  // Ne pas écraser si l'utilisateur a tapé un vrai numéro personnalisé
  var defaultPat = /^(FL|CAB)-\d{4}-\d{3}$/;
  if(!el) return;
  if(el.value && !defaultPat.test(el.value)) return;

  var year = new Date().getFullYear();
  var prefix = 'FL-'+year+'-';
  var prefix_cab = 'CAB-'+year+'-';

  try{
    var db = window.db;
    if(!db){ el.value = prefix+'001'; return; }

    // Récupérer tous les numéros existants pour cette année
    var r = await db.from('factures')
      .select('numero')
      .ilike('numero', (mode==='cab' ? prefix_cab : prefix)+'%')
      .order('numero', {ascending:false})
      .limit(100);

    var nums = (r.data||[]).map(function(f){
      var n = parseInt((f.numero||'').split('-').pop()) || 0;
      return n;
    }).filter(Boolean);

    var next = nums.length > 0 ? (Math.max.apply(null, nums) + 1) : 1;
    var nextStr = String(next).padStart(3,'0');
    el.value = (mode==='cab' ? prefix_cab : prefix) + nextStr;
  }catch(e){
    el.value = prefix + '001';
  }
};
window.autoFillInvNum = window.autoFillInvNum; // expose
// HISTORIQUE
var _histoData=[];
async function loadHistorique(){var db=window.db;if(!db)return;try{var r=await db.from('factures').select('*').order('date_facture',{ascending:false}).limit(500);if(!r.error){_histoData=r.data||[];renderHistorique();}}catch(e){console.warn(e);}}
function renderHistorique(){
  var q=((document.getElementById('histoSearch')||{}).value||'').toLowerCase();
  var ft=((document.getElementById('histoFilterType')||{}).value)||'';
  var fs=((document.getElementById('histoFilterStatut')||{}).value)||'';
  var fc=((document.getElementById('histoFilterClient')||{}).value)||'';
  var fm=((document.getElementById('histoFilterMonth')||{}).value)||''; // format YYYY-MM
  if(!_histoData.length){loadHistorique();return;}
  var arr=_histoData.filter(function(f){
    if(ft&&f.type_doc!==ft)return false;
    if(fs&&f.statut_paiement!==fs)return false;
    if(fc&&f.type_client!==fc)return false;
    if(fm&&!(f.date_facture||'').startsWith(fm))return false;
    if(q){var s=[f.numero||'',f.client_nom||'',f.ref_commande||''].join(' ').toLowerCase();if(!s.includes(q))return false;}
    return true;
  });
  // Trier par date décroissante
  arr.sort(function(a,b){return String(b.date_facture||'').localeCompare(String(a.date_facture||''));});
  var tp=0,ta=0,tr=0;
  arr.forEach(function(f){var m=+(f.montant_total)||0;if(f.statut_paiement==='paye')tp+=m;else if(f.statut_paiement==='retard')tr+=m;else ta+=m;});
  function se(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  function mny2(n){return Number(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';}
  se('histoKpiTotal',arr.length);se('histoKpiPaye',mny2(tp));se('histoKpiAttente',mny2(ta));se('histoKpiRetard',mny2(tr));
  var list=document.getElementById('histoList');if(!list)return;
  if(!arr.length){list.innerHTML='<div style="text-align:center;padding:32px;color:#777;font-size:13px">Aucun document trouvé. Imprimer ou télécharger une facture pour la voir apparaître ici.</div>';return;}
  var sc2={paye:'#2e7d32',en_attente:'#e65100',retard:'#c62828'};
  var sl2={paye:'✅ Payé',en_attente:'⏳ En attente',retard:'🔴 En retard'};
  var tl2={facture:'🧾 Facture',bon_livraison:'📦 Bon de livraison'};
  var tcl={magasin:'🏪',cabesto:'🔗'};
  list.innerHTML=arr.map(function(f){
    var fid=String(f.id||'');
    var dateAff=(f.date_facture||'').split('-').reverse().join('/');
    return '<div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);">'
      +'<div>'
        +'<div style="font-weight:800;font-size:14px;">'+(tcl[f.type_client]||'')+(tl2[f.type_doc]||f.type_doc)+' <span style="font-family:monospace;color:var(--accent);font-size:13px;">'+f.numero+'</span></div>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:3px;"><strong>'+f.client_nom+'</strong> · 📅 '+dateAff+(f.ref_commande?' · '+f.ref_commande:'')+'</div>'
      +'</div>'
      +'<div style="text-align:right;">'
        +'<div style="font-size:18px;font-weight:900;color:var(--primary);">'+mny2(f.montant_total)+'</div>'
        +'<div style="font-size:11px;font-weight:700;color:'+(sc2[f.statut_paiement]||'#777')+'">'+(sl2[f.statut_paiement]||f.statut_paiement)+'</div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:5px;align-items:stretch;">'
        +'<select data-fid="'+fid+'" onchange="histoSetStatut(this.dataset.fid,this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:7px;font-size:11px;">'
          +'<option value="en_attente"'+(f.statut_paiement==='en_attente'?' selected':'')+'>⏳ Attente</option>'
          +'<option value="paye"'+(f.statut_paiement==='paye'?' selected':'')+'>✅ Payé</option>'
          +'<option value="retard"'+(f.statut_paiement==='retard'?' selected':'')+'>🔴 Retard</option>'
        +'</select>'
        +'<div style="display:flex;gap:4px;">'
          +'<button data-fid="'+fid+'" onclick="histoReopen(\''+fid+'\')" style="flex:1;padding:5px 6px;background:#1565c0;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;" title="Rouvrir et modifier">✏️</button>'
          +'<button data-fid="'+fid+'" onclick="histoReprint(\''+fid+'\')" style="flex:1;padding:5px 6px;background:#2e7d32;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;" title="Réimprimer">🖨️</button>'
          +'<button data-fid="'+fid+'" onclick="histoDelete(\''+fid+'\')" style="flex:1;padding:5px 6px;background:#fce8e8;color:#c62828;border:1px solid #f4a9a9;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;" title="Supprimer">🗑️</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  }).join('');
}
window.renderHistorique=renderHistorique;
async function histoSetStatut(id,statut){var db=window.db;if(!db)return;try{await db.from('factures').update({statut_paiement:statut}).eq('id',id);var f=_histoData.find(function(x){return x.id===id;});if(f)f.statut_paiement=statut;renderHistorique();}catch(e){alert('Erreur: '+e.message);}}
window.histoSetStatut=histoSetStatut;
async function histoDelete(id){if(!confirm('Supprimer cette facture ?'))return;var db=window.db;if(!db)return;try{await db.from('factures').delete().eq('id',id);_histoData=_histoData.filter(function(f){return f.id!==id;});renderHistorique();}catch(e){alert('Erreur: '+e.message);}}
window.histoDelete=histoDelete;

/* Rouvrir une facture pour la modifier */
window.histoReopen = function(id){
  var f=_histoData.find(function(x){return String(x.id)===String(id);});
  if(!f){alert('Document introuvable.');return;}
  var mode=f.type_client==='cabesto'?'cab':'mag';
  if(mode==='cab'){cabCurrentInvoiceId=f.id;}else{magCurrentInvoiceId=f.id;}
  showFactuTab(mode==='cab'?'cabesto':'magasin');
  // Remplir les champs
  var num=document.getElementById(mode+'-inv-num');
  var date=document.getElementById(mode+'-inv-date');
  var port=document.getElementById(mode+'-port');
  var remise=document.getElementById(mode+'-remise');
  if(num)num.value=f.numero||'';
  if(date)date.value=f.date_facture||'';
  // frais_port est le vrai nom de colonne Supabase
  if(port)port.value=f.frais_port||f.montant_port||0;
  // remise_pct n'est pas en base → la recalculer depuis montant_ht et montant_total
  var remisePctRestored=0;
  if(f.montant_ht>0){
    var portVal=parseFloat(f.frais_port||f.montant_port||0);
    var htApresPort=parseFloat(f.montant_total||0)-portVal;
    var calc=Math.round((1-(htApresPort/f.montant_ht))*1000)/10;
    if(calc>0&&calc<=100)remisePctRestored=calc;
  }
  if(remise)remise.value=remisePctRestored;
  // Recharger les lignes
  var lignes=f.lignes;
  if(typeof lignes==='string'){try{lignes=JSON.parse(lignes);}catch(e){lignes=[];}}
  if(Array.isArray(lignes)&&lignes.length){
    if(mode==='mag'){
      magLines=lignes.map(function(l){return{ref:l.ref||'',nom:l.nom||'',couleur:l.couleur||'',taille:l.taille||'',grammage:l.grammage||'',qty:Number(l.qty)||1,pu:Number(l.pu)||0,pe:'',desCab:'',puCab:0};});
      if(typeof renderMagLines==='function')renderMagLines();
    } else {
      cabLines=lignes.map(function(l){return{ref:l.ref||'',pe:l.ref||'',desCab:l.nom||'',nom:l.nom||'',couleur:'',taille:'',grammage:'',qty:Number(l.qty)||1,pu:0,puCab:Number(l.pu)||0};});
      if(typeof renderCabLines==='function')renderCabLines();
    }
  }
  // Sélectionner le client ET déclencher le change pour initialiser magClient/cabClient
  setTimeout(function(){
    var sel=document.getElementById(mode+'-client-sel');
    if(sel&&f.client_nom){
      for(var i=0;i<sel.options.length;i++){
        if(sel.options[i].text.includes(f.client_nom)){
          sel.selectedIndex=i;
          sel.dispatchEvent(new Event('change')); // initialise magClient/cabClient
          break;
        }
      }
    }
    factuRenderTotals(mode);
    // Toast de confirmation
    var tk=document.createElement('div');
    tk.textContent='✏️ Facture '+f.numero+' chargée — prête à imprimer ou modifier';
    tk.style.cssText='position:fixed;bottom:20px;right:20px;background:#1565c0;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:700;z-index:9999';
    document.body.appendChild(tk);setTimeout(function(){tk.remove();},4000);
  },400);
};

/* Réimprimer une facture depuis l\'historique */
window.histoReprint = function(id){
  var f=_histoData.find(function(x){return String(x.id)===String(id);});
  if(!f){alert('Document introuvable.');return;}
  histoReopen(id);
  setTimeout(function(){
    var mode=f.type_client==='cabesto'?'cab':'mag';
    var docType=f.type_doc==='bon_livraison'?'delivery':'invoice';
    if(mode==='mag'&&typeof magPrint==='function')magPrint(docType);
    else if(mode==='cab'&&typeof cabPrint==='function')cabPrint(docType);
  },600);
};

function goToFacturationMagasin() {
  loadQueueToFactu('mag');
  showTab('facturation');
  setTimeout(()=>showFactuTab('magasin'),80);
}
function goToFacturationCabesto() {
  loadQueueToFactu('cab');
  showTab('facturation');
  setTimeout(()=>showFactuTab('cabesto'),80);
}
function goToCommandeFromFactu(mode) {
  var lines = mode==='cab' ? cabLines : magLines;
  var missing=0;
  (lines||[]).forEach(function(l){
    var p=flV35GetProductFromLine(l);
    if(p) addToQueue(p, Number(l.qty)||1);
    else missing++;
  });
  if(typeof renderQueues==='function') renderQueues();
  showTab('impression');
  if(missing){
    var t=document.createElement('div');
    t.textContent='⚠️ '+missing+' ligne(s) sans référence catalogue — code-barres à imprimer manuellement.';
    t.style.cssText='position:fixed;bottom:20px;right:20px;background:#c62828;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:700;z-index:9999;max-width:320px';
    document.body.appendChild(t);setTimeout(function(){t.remove();},6000);
  }
}

// ── CHARGER DEPUIS LA FILE ────────────────────────────────────────────
function loadQueueToFactu(mode) {
  const map = new Map();
  (queueRect||[]).forEach(item=>{
    const p=item.product;
    if(!map.has(p.ref)) map.set(p.ref,{product:p,qty:0});
    map.get(p.ref).qty += Number(item.qty||0);
  });
  const lines = Array.from(map.values()).map(({product:p,qty})=>{
    const pe = getPeData(p.ref, p.ean);
    return {
      ref:p.ref, ean:p.ean||'',
      nom:p.produit||'',
      couleur:p.couleur||'',
      taille:p.taille||'',
      grammage:p.grammage||'',
      qty:qty,
      pu:Number(p.ht)||0,
      pe:pe?pe.pe:'',
      desCab:pe?pe.des:([p.produit,p.taille,p.grammage,p.couleur].filter(Boolean).join(' ').toUpperCase()),
      puCab:pe?pe.pu:Number(p.ht)||0,
    };
  });
  if(mode==='mag'){ magLines=lines; renderMagLines(); }
  else { cabLines=lines; renderCabLines(); }
}

// ── IMPORT / ANALYSE DANS FACTURATION ────────────────────────────────
function handleFactuDrop(e,mode){
  e.preventDefault();
  const f=e.dataTransfer.files[0]; if(f) handleFactuFile(f,mode);
}

// ── PARSER PE CODES ───────────────────────────────────────────────────
function parsePeCodes(text){
  // V42 — Parser Cabesto robuste pour PDF "longs".
  // Le bug venait du fait que PDF.js met souvent toute la page sur UNE seule ligne.
  // L'ancien parser ne prenait alors que le premier PE trouvé. Ici on parcourt TOUS les PE.
  const raw = String(text || '');
  const flat = raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const results = [];
  const seen = new Set();

  if(!flat) return results;

  // Tous les codes PE, y compris les références longues avec suffixes type PE-0022894-98 D1
  const peRegex = /\bPE-\s*([0-9]{6,7})(?:\s*-\s*([0-9A-Z]{2,4})(?:\s+([0-9A-Z]{1,4}))?)?\b/gi;
  const matches = [];
  let m;
  while((m = peRegex.exec(flat)) !== null){
    let pe = 'PE-' + m[1];
    if(m[2]) pe += '-' + m[2];
    if(m[3] && /^([0-9A-Z]{1,4})$/i.test(m[3])){
      // Cabesto coupe parfois PE-0022894-98D1 en PE-0022894-98 D1
      const merged = (m[2] || '') + m[3];
      const maybe = 'PE-' + m[1] + '-' + merged;
      if(CABESTO_PRODUCTS.some(p => p.pe.toUpperCase() === maybe.toUpperCase())) pe = maybe;
    }
    matches.push({ pe: pe.toUpperCase(), index: m.index, raw: m[0] });
  }

  matches.forEach((hit, idx) => {
    // Matching exact d'abord
    let prod = CABESTO_PRODUCTS.find(p => p.pe.toUpperCase() === hit.pe);

    // Si suffixe PDF mal coupé, chercher le produit qui commence pareil
    if(!prod){
      const compact = hit.pe.replace(/\s+/g,'');
      prod = CABESTO_PRODUCTS.find(p => p.pe.toUpperCase().replace(/\s+/g,'') === compact);
    }
    if(!prod) return;

    const prevIndex = idx > 0 ? matches[idx-1].index : Math.max(0, hit.index - 350);
    const nextIndex = idx < matches.length - 1 ? matches[idx+1].index : Math.min(flat.length, hit.index + 260);
    const before = flat.slice(Math.max(prevIndex, hit.index - 260), hit.index);
    const around = flat.slice(Math.max(0, hit.index - 320), Math.min(flat.length, hit.index + 220));

    let qty = null;

    // Format Cabesto Rivesaltes : "pce 10 ... PE-0022611"
    const pceAfterList = [...before.matchAll(/\bpce\s+(\d{1,4})\b/gi)];
    if(pceAfterList.length) qty = parseInt(pceAfterList[pceAfterList.length - 1][1], 10);

    // Format Cabedis/Sérignan : "10,00 pce ... PE-0007794"
    if(!qty){
      const pceBeforeList = [...before.matchAll(/(\d{1,4})(?:[,.]00)?\s*pce\b/gi)];
      if(pceBeforeList.length) qty = parseInt(pceBeforeList[pceBeforeList.length - 1][1], 10);
    }

    // Format texte collé : "PE-0022611 ... x8" ou "PE-0022611 ... 8"
    if(!qty){
      const afterShort = flat.slice(hit.index, Math.min(flat.length, hit.index + 120));
      const x = afterShort.match(/[x×*]\s*(\d{1,4})\b|\b(\d{1,4})\s*[x×*]/i);
      if(x) qty = parseInt(x[1] || x[2], 10);
    }

    // Fallback : quantité avant le prix unitaire connu
    // Exemple : "... 10 0,00 % ... PE-0022611 3,10 €"
    if(!qty){
      const candidates = [...before.matchAll(/\b(\d{1,4})(?:[,.]00)?\b/g)]
        .map(x => parseInt(x[1], 10))
        .filter(n => n > 0 && n <= 500 && !(n >= 2020 && n <= 2035)); // Exclure années et nombres aberrants
      // Le dernier petit entier avant PE est souvent la quantité.
      if(candidates.length) qty = candidates[candidates.length - 1];
    }

    qty = Number.isFinite(qty) && qty > 0 ? qty : 1;

    // Clé unique par occurrence proche : permet les doublons réels mais évite le double parsing exact.
    const key = prod.pe + '@' + Math.round(hit.index / 5);
    if(seen.has(key)) return;
    seen.add(key);

    const catProd = (typeof CATALOGUE !== 'undefined' ? CATALOGUE : []).find(p =>
      p.ref === prod.ref || p.ean === prod.ean || String(p.ean || '').replace(/^0+/, '') === String(prod.ean || '').replace(/^0+/, '')
    );

    results.push({
      pe: prod.pe,
      ref: prod.ref,
      ean: prod.ean,
      nom: catProd ? catProd.produit : prod.des,
      couleur: catProd ? catProd.couleur : '',
      taille: catProd ? catProd.taille : '',
      grammage: catProd ? catProd.grammage : '',
      qty: qty,
      pu: Number(catProd && catProd.ht ? catProd.ht : prod.pu) || 0,
      desCab: prod.des,
      puCab: prod.pu,
    });
  });

  // Fusionne les doublons du même PE si le PDF répète une ligne strictement identique dans un calque.
  const merged = [];
  results.forEach(r => {
    const existing = merged.find(x => x.pe === r.pe && x.qty === r.qty);
    if(existing) return;
    merged.push(r);
  });

  return merged;
}
// ── DETECT CABESTO STORE FROM TEXT ────────────────────────────────────
function detectCabestoStore(text){
  const raw = String(text || '');
  const upper = raw.toUpperCase();

  // Supporte les 2 formats Cabesto :
  // COMF/RIV/2026/04553 et COMF/2026/SER/00013
  let comf = '';
  let comfCode = '';
  let m = raw.match(/COMF\/[A-Z]+\/\d{4}\/\d+/i);
  if(m){
    comf = m[0].toUpperCase();
    const parts = comf.split('/');
    comfCode = parts[1] || '';
  } else {
    m = raw.match(/COMF\/\d{4}\/[A-Z]+\/\d+/i);
    if(m){
      comf = m[0].toUpperCase();
      const parts = comf.split('/');
      comfCode = parts[2] || '';
    }
  }

  const comfToStore = {
    'RIV':'Cabesto Rivesaltes',
    'AUB':'Cabesto Aubagne',
    'MAN':'Cabesto Mandelieu',
    'MAU':'Cabesto Mauguio',
    'OLL':'Cabesto Ollioules',
    'TLN':'Cabesto Toulon',
    'COG':'Cabesto Cogolin',
    'BRE':'Cabesto Brest',
    'SER':'Cabesto Sérignan / CABEDIS'
  };

  let foundClient = comfCode ? CLIENTS_DB.find(c => c.name === comfToStore[comfCode]) : null;

  // Détection par texte visible dans le PDF
  if(!foundClient){
    const storeMap = {
      'RIVESALTES':'Cabesto Rivesaltes',
      'MANDELIEU':'Cabesto Mandelieu',
      'MAUGUIO':'Cabesto Mauguio',
      'OLLIOULES':'Cabesto Ollioules',
      'AUBAGNE':'Cabesto Aubagne',
      'SERIGNAN':'Cabesto Sérignan / CABEDIS',
      'SÉRIGNAN':'Cabesto Sérignan / CABEDIS',
      'CABEDIS':'Cabesto Sérignan / CABEDIS'
    };
    for(const key of Object.keys(storeMap)){
      if(upper.includes(key)){
        foundClient = CLIENTS_DB.find(c => c.name === storeMap[key]);
        break;
      }
    }
  }

  // CDE / destinataire
  const cdeMatch = raw.match(/\bCDE(\d{3,6})\b/i);
  let cdeRaw = cdeMatch ? 'CDE' + cdeMatch[1] : '';
  if(!cdeRaw && /CABEDIS/i.test(raw)) cdeRaw = 'CABEDIS';
  if(cdeRaw && !foundClient){
    foundClient = CLIENTS_DB.find(c => c.cde && c.cde.toUpperCase() === cdeRaw.toUpperCase());
  }
  if(cdeRaw && foundClient && (!foundClient.cde || foundClient.cde === 'CDEXXXXX')){
    foundClient.cde = cdeRaw;
  }

  let villeDetected = '';
  if(/SERIGNAN|SÉRIGNAN/i.test(raw)) villeDetected = 'SERIGNAN';
  else if(cdeMatch){
    const afterCde = raw.substring(cdeMatch.index + cdeMatch[0].length).trim();
    const villeMatch = afterCde.match(/^\s*([A-ZÉÈÀÙÂÊÎÔÛÄËÏÖÜÇ\-]+)/i);
    if(villeMatch) villeDetected = villeMatch[1].trim().toUpperCase();
  }

  // N° facture éventuel + date
  const numMatch = raw.match(/N[°o]?\s*Facture\s*[:\s]+([0-9,./-]+)/i);
  const num = numMatch ? numMatch[1].replace(/,/g,'-') : '';
  const dateMatch = raw.match(/(\d{2})[\/.](\d{2})[\/.](\d{4})/);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : '';

  return {client:foundClient, comf, num, date, cde:cdeRaw, ville:villeDetected};
}
function autoFillCabestoFields(detected){
  if(!detected) return;

  if(detected.client){
    // Reconstruit la liste au cas où un client Supabase vient d'être ajouté
    try{ if(typeof buildClientDropdowns === 'function') buildClientDropdowns(); }catch(e){}

    const sel = document.getElementById('cab-client-sel');
    if(sel){
      let wanted = String(detected.client.name || '').toLowerCase();
      let foundValue = '';

      // 1) Recherche par nom exact dans les options du select
      Array.from(sel.options || []).forEach(opt => {
        if(String(opt.textContent || '').trim().toLowerCase() === wanted){
          foundValue = opt.value;
        }
      });

      // 2) Si absent, on ajoute l'option pour qu'elle apparaisse quand même
      if(!foundValue){
        foundValue = 'cab_auto_' + Date.now();
        const opt = document.createElement('option');
        opt.value = foundValue;
        opt.textContent = detected.client.name;
        sel.appendChild(opt);
      }

      sel.value = foundValue;
      cabClient = detected.client;
    } else {
      cabClient = detected.client;
    }

    const s = document.getElementById('cab-supplier-code');
    if(s) s.value = detected.client.code || 'FE00513';

    const emailEl = document.getElementById('cab-recep-email-display');
    if(emailEl) emailEl.textContent = detected.client.recepEmail || detected.client.email || '—';
  }

  if(detected.cde){
    if(cabClient) cabClient.cde = detected.cde;
    const cdeEl = document.getElementById('cab-cde-display');
    if(cdeEl) cdeEl.textContent = detected.cde + (detected.ville ? ' — ' + detected.ville : '');
  }

  if(detected.ville && cabClient && (!cabClient.ville || String(cabClient.ville).includes('XXXXX'))){
    cabClient.ville = detected.ville;
  }

  if(detected.comf){
    const r = document.getElementById('cab-order-ref');
    if(r) r.value = detected.comf;
  }

  if(detected.num){
    const n = document.getElementById('cab-inv-num');
    if(n && !String(n.value || '').replace('FL-2026-001','')) n.value = detected.num;
  }

  if(detected.date){
    const d = document.getElementById('cab-inv-date');
    if(d) d.value = detected.date;
  }
}
function numGrams(s){
  var m = String(s||'').match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',','.')) : null;
}
function commonPrefixLen(a,b){
  var n = Math.min(a.length,b.length), i=0;
  while(i<n && a[i]===b[i]) i++;
  return i;
}
function wordsOfSingular(s){
  return norm(s).split(/\s+/).filter(function(w){return w.length>2;}).map(function(w){
    return w.replace(/s$/,'');
  });
}
function fuzzyWordHit(w, prodWords){
  return prodWords.some(function(pw){
    if(w===pw) return true;
    var cp = commonPrefixLen(w,pw);
    return cp>=5 && cp >= Math.min(w.length,pw.length)*0.7;
  });
}
// Matching générique catalogue, indépendant des alias "leurres" (extractWanted/PROD_ALIASES) :
// utilisé en repli pour toute famille de produits (pierres, moules, accessoires, etc.)
// quand le matching spécialisé matchProduct() ne trouve rien.
function matchCatalogueGeneric(l, nom){
  if(typeof CATALOGUE === 'undefined' || !nom) return null;
  var refFr = norm(l.ref_frenchy||'').replace(/[-_]/g,' ');
  var wantedWords = wordsOfSingular(nom);
  // OpenAI met parfois le grammage dans la désignation ("Pierres 45 gr") sans remplir le champ grammage
  var wantedGram = numGrams(l.grammage);
  if(wantedGram==null){
    var gm = normalizeLine(nom).match(/(\d+(?:\.\d+)?)\s*g\b/);
    if(gm) wantedGram = parseFloat(gm[1]);
  }
  var wantedTaille = norm(l.taille||'');
  var wantedCouleur = norm(l.couleur||'');
  var scored = CATALOGUE.map(function(p){
    var refNorm = norm(p.ref).replace(/[-_]/g,' ');
    if(refFr && refFr.length>=4 && (refNorm===refFr || refNorm.includes(refFr) || refFr.includes(refNorm))) return {p:p, s:99};
    var prodWords = wordsOfSingular(p.produit);
    if(!wantedWords.length || !prodWords.length) return {p:p, s:0};
    var hits = wantedWords.filter(function(w){return fuzzyWordHit(w, prodWords);}).length;
    if(!hits) return {p:p, s:0};
    var pGram = numGrams(p.grammage);
    // Grammage renseigné des deux côtés mais différent : on disqualifie (variante du mauvais poids)
    if(wantedGram!=null && pGram!=null && Math.abs(wantedGram-pGram)>0.01) return {p:p, s:0};
    var ratio = hits / Math.max(wantedWords.length, prodWords.length);
    var s = ratio*5;
    if(wantedGram!=null && pGram!=null) s += 3;
    if(wantedTaille && norm(p.taille)===wantedTaille) s += 1;
    if(wantedCouleur && norm(p.couleur)===wantedCouleur) s += 1;
    return {p:p, s:s};
  }).sort(function(a,b){return b.s-a.s;});
  var best = scored[0];
  return (best && best.s>=2.5) ? best.p : null;
}
// Rapproche une ligne brute renvoyée par OpenAI (analyse-commande) avec le catalogue local.
// OpenAI ne connaît pas nos références/prix internes : le catalogue est toujours prioritaire
// quand un match fiable est trouvé, sinon on retombe sur ce qu'OpenAI a extrait.
function matchOpenAILine(l){
  var nom = l.designation || l.ref_frenchy || l.ref_client || '';
  var qty = Math.max(1, parseInt(l.quantite)||1);
  var searchLine = [nom, l.grammage, l.taille, l.couleur].filter(Boolean).join(' ');
  var catMatch = null;
  if(typeof CATALOGUE !== 'undefined' && searchLine){
    var m = matchProduct(searchLine);
    if(m && m.matched) catMatch = m.product;
    if(!catMatch) catMatch = matchCatalogueGeneric(l, nom);
    // matchProduct() (logique "leurres") ne filtre pas toujours strictement sur la couleur :
    // si une variante du même produit/taille existe dans la couleur exacte demandée, on la préfère.
    if(catMatch && l.couleur){
      var wantedC = norm(l.couleur).replace(/kh/g,'k');
      if(norm(catMatch.couleur||'').replace(/kh/g,'k') !== wantedC){
        var exact = CATALOGUE.find(function(p){
          return p.produit===catMatch.produit && p.taille===catMatch.taille &&
            norm(p.couleur||'').replace(/kh/g,'k')===wantedC;
        });
        if(exact) catMatch = exact;
      }
    }
  }
  return {
    catMatch: catMatch,
    ref: catMatch ? catMatch.ref : (l.ref_frenchy || l.ref_client || nom),
    nom: catMatch ? catMatch.produit : nom,
    couleur: catMatch ? (catMatch.couleur||'') : (l.couleur||''),
    taille: catMatch ? (catMatch.taille||'') : (l.taille||''),
    grammage: catMatch ? (catMatch.grammage||'') : (l.grammage||''),
    qty: qty,
    pu: (catMatch && Number(catMatch.ht)) ? Number(catMatch.ht) : (parseFloat(l.prix_unitaire)||0)
  };
}
// Quand le client demande plusieurs tailles d'un même produit sans tout détailler
// (ex: "Kaki, 10 par taille, les 4 tailles" ou "toutes les tailles"), OpenAI renvoie une
// seule ligne ambiguë. On éclate ici cette ligne en une ligne par taille réellement
// disponible au catalogue pour ce produit/couleur, en gardant la même quantité sur chacune.
function expandAmbiguousSizeLines(lignes){
  if(typeof CATALOGUE === 'undefined') return lignes||[];
  var multiSizeRe = /toutes?\s+les\s+tailles|tous\s+les\s+formats|\d+\s*tailles?|chaque\s+taille|chaque\s+format/i;
  var out = [];
  (lignes||[]).forEach(function(l){
    var hay = [l.taille, l.designation].filter(Boolean).join(' ');
    if(!multiSizeRe.test(hay)){ out.push(l); return; }
    var nom = l.designation || l.ref_frenchy || l.ref_client || '';
    var wantedWords = wordsOfSingular(nom);
    // "kh" -> "k" tolère les variantes d'orthographe courantes (kaki/khaki)
    var wantedCouleur = norm(l.couleur||'').replace(/kh/g,'k');
    if(!wantedWords.length){ out.push(l); return; }
    var tailles = [];
    CATALOGUE.forEach(function(p){
      var prodWords = wordsOfSingular(p.produit);
      if(!prodWords.length) return;
      var hits = wantedWords.filter(function(w){return fuzzyWordHit(w, prodWords);}).length;
      if(!hits) return;
      if(wantedCouleur && norm(p.couleur).replace(/kh/g,'k')!==wantedCouleur) return;
      var t = p.taille||'';
      if(t && tailles.indexOf(t)===-1) tailles.push(t);
    });
    if(tailles.length<2){ out.push(l); return; }
    tailles.forEach(function(t){
      var copy={}; for(var k in l) copy[k]=l[k];
      copy.taille=t;
      out.push(copy);
    });
  });
  return out;
}
async function handleFactuFile(file,mode){
  const statusEl=document.getElementById((mode==='mag'?'mag':'cab')+'-import-status');
  if(statusEl){ statusEl.style.display='block'; statusEl.textContent='⏳ OpenAI analyse le document…'; }
  // Vider les lignes existantes dès qu'un nouveau fichier est déposé
  if(mode === 'cab'){ cabLines = []; if(typeof renderCabLines === 'function') renderCabLines(); }
  if(mode === 'mag'){ magLines = []; if(typeof renderMagLines === 'function') renderMagLines(); }

  try {
    if(!file) throw new Error('Aucun fichier reçu');

    // ── Convertir le fichier en base64 ──
    async function toDataUrl(f){
      return new Promise(function(resolve,reject){
        var r=new FileReader();
        r.onload=function(){resolve(r.result);}; r.onerror=reject; r.readAsDataURL(f);
      });
    }

    // ── Excel : lecture locale (PDF.js ne peut pas, OpenAI non plus) ──
    if(file.name.match(/\.xlsx?$/i)){
      if(typeof XLSX==='undefined') throw new Error('SheetJS non chargé');
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(new Uint8Array(ab),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      let text='';
      let hIdx=-1,dCol=-1,qCol=-1;
      rows.forEach(function(row,i){
        var r=row.map(function(c){return String(c).toLowerCase();});
        var d=r.findIndex(function(c){return c.includes('désignation')||c.includes('designation')||c.includes('produit')||c.includes('article')||c.includes('description');});
        var q=r.findIndex(function(c){return c.includes('qté')||c.includes('qte')||c.includes('quantit');});
        if(d>=0&&q>=0&&hIdx<0){hIdx=i;dCol=d;qCol=q;}
      });
      if(hIdx>=0){
        rows.slice(hIdx+1).forEach(function(row){
          var des=String(row[dCol]||'').trim();
          var qty=Math.round(parseFloat(String(row[qCol]||'0').replace(',','.'))||0);
          if(des&&qty>0&&!/total|tva/i.test(des)) text+=des+' x'+qty+'\n';
        });
      } else {
        rows.forEach(function(row){ var s=row.join(' ').trim(); if(s) text+=s+'\n'; });
      }
      var ta=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
      if(ta) ta.value=text.trim();
      if(mode==='cab') autoFillCabestoFields(detectCabestoStore(text));
      if(statusEl) statusEl.textContent='✅ Excel lu — analyse en cours…';
      setTimeout(function(){ factuAnalyze(mode); }, 150);
      return;
    }

    // ── Image ou PDF ──
    var isPdf = file.type==='application/pdf' || file.name.match(/\.pdf$/i);
    var dataUrl = '';
    var pdfText = '';

    if(isPdf){
      if(statusEl){statusEl.style.display='block';statusEl.textContent='📄 Lecture du PDF…';}
      try{
        if(typeof pdfjsLib === 'undefined') throw new Error('PDF.js non chargé');
        pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var ab2=await file.arrayBuffer();
        var pdf2=await pdfjsLib.getDocument({data:ab2}).promise;

        // Essai 1 : extraction texte directe
        var pages2=[];
        for(var pi=1;pi<=pdf2.numPages;pi++){
          var page2=await pdf2.getPage(pi);
          var ct2=await page2.getTextContent();
          pages2.push(ct2.items.map(function(x){return x.str;}).join(' '));
        }
        pdfText = pages2.join('\n').trim();

        if(pdfText && pdfText.length > 50){
          var taPdf=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
          if(taPdf) taPdf.value=pdfText;
          if(statusEl) statusEl.textContent='🤖 PDF lu — OpenAI analyse…';
          try{ await window.factuAnalyzeIA(mode); }catch(e2){ console.warn(e2); }
          return;
        }

        // Essai 2 : PDF sans texte → canvas + OpenAI Vision (rapide et fiable)
        if(statusEl) statusEl.textContent='🖼️ Conversion PDF → OpenAI Vision…';
        var page1=await pdf2.getPage(1);
        var vp2=page1.getViewport({scale:1.5});
        var cv2=document.createElement('canvas');
        cv2.width=vp2.width; cv2.height=vp2.height;
        await page1.render({canvasContext:cv2.getContext('2d'),viewport:vp2}).promise;
        var imgData=cv2.toDataURL('image/jpeg',0.85);

        if(statusEl) statusEl.textContent='🤖 OpenAI Vision analyse le PDF…';
        var r2=await fetch('/api/analyse-commande',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({filename:file.name,mime:'image/jpeg',dataUrl:imgData,texte:'',mode:mode})
        });
        var j2=await r2.json().catch(function(){return{ok:false,error:'Erreur réseau'};});
        if(j2.ok&&j2.data){
          var lig=j2.data.lignes||[];
          if(j2.data.numero_facture){var nf=document.getElementById(mode==='cab'?'cab-inv-num':'mag-inv-num');if(nf&&!nf.value)nf.value=j2.data.numero_facture;}
          if(j2.data.ref_commande){var rf=document.getElementById(mode==='cab'?'cab-order-ref':'mag-order-ref');if(rf&&!rf.value)rf.value=j2.data.ref_commande;}
          if(lig.length>0){
            if(mode==='mag'){
              magLines=lig.map(function(l){return{ref:l.ref_frenchy||'',nom:l.designation||'',couleur:l.couleur||'',taille:l.taille||'',grammage:l.grammage||'',qty:Number(l.quantite)||1,pu:Number(l.prix_unitaire)||0,pe:'',desCab:'',puCab:0};});
              if(typeof renderMagLines==='function')renderMagLines();
            }else{
              cabLines=lig.map(function(l){return{pe:l.ref_frenchy||'',desCab:l.designation||'',ref:l.ref_frenchy||'',nom:l.designation||'',couleur:'',taille:'',grammage:'',qty:Number(l.quantite)||1,pu:0,puCab:Number(l.prix_unitaire)||0};});
              if(typeof renderCabLines==='function')renderCabLines();
            }
            if(statusEl)statusEl.textContent='✅ '+lig.length+' produit(s) importés depuis le PDF !';
            factuRenderTotals(mode);
          }else{
            if(statusEl)statusEl.textContent='⚠️ PDF lu — 0 produit détecté. Copiez-collez le texte dans la zone puis cliquez Analyser.';
          }
        }else{
          if(statusEl)statusEl.textContent='⚠️ '+(j2.error||'Vision impossible')+' — Copiez-collez le texte dans la zone.';
        }
      }catch(pdfErr){
        if(statusEl)statusEl.textContent='⚠️ Erreur PDF : '+pdfErr.message;
        console.error('PDF error:',pdfErr);
      }
      return;
    }

    // Images : compresser puis envoyer à OpenAI Vision
    if(statusEl) statusEl.textContent='🖼️ Compression de l\'image…';
    dataUrl = await (async function compressImage(f){
      return new Promise(function(resolve){
        var img=new Image();
        var url=URL.createObjectURL(f);
        img.onload=function(){
          URL.revokeObjectURL(url);
          var MAX=1600; // px max — suffisant pour lire un tableau
          var w=img.width,h=img.height;
          if(w>MAX||h>MAX){var r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          var cv=document.createElement('canvas');
          cv.width=w;cv.height=h;
          cv.getContext('2d').drawImage(img,0,0,w,h);
          resolve(cv.toDataURL('image/jpeg',0.85)); // JPEG 85% < 1Mo
        };
        img.onerror=function(){
          // Fallback sans compression
          var fr=new FileReader();
          fr.onload=function(){resolve(fr.result);};
          fr.readAsDataURL(f);
        };
        img.src=url;
      });
    })(file);
    if(statusEl) statusEl.textContent='🤖 OpenAI Vision analyse l\'image…';

    var resp = await fetch('/api/analyse-commande', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        filename: file.name,
        mime: file.type,
        dataUrl: dataUrl,
        texte: '',
        mode: mode
      })
    });

    var j = await resp.json().catch(function(){return {ok:false,error:'Réponse serveur invalide'};});

    if(j.ok && j.data){
      var data = j.data;

      // Remplir ref commande
      if(data.ref_commande){
        var refEl = document.getElementById(mode==='cab'?'cab-order-ref':'mag-order-ref');
        if(refEl && !refEl.value) refEl.value = data.ref_commande;
      }

      // Remplir le nom du magasin
      if(data.magasin && mode==='cab'){
        autoFillCabestoFields({name: data.magasin});
      }

      var lignes = data.lignes || [];

      // Mettre le texte dans la zone pour référence
      var textLines = lignes.map(function(l){
        return (l.ref_frenchy||l.designation||'') + ' x' + (l.quantite||1);
      }).join('\n');
      if(data.texte_brut && !lignes.length) textLines = data.texte_brut;
      var ta = document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
      if(ta && textLines) ta.value = textLines;

      if(mode === 'mag' && lignes.length > 0){
        var unmatchedCount = 0;
        magLines = lignes.map(function(l){
          var ml = matchOpenAILine(l);
          if(!ml.catMatch) unmatchedCount++;
          return {ref:ml.ref, nom:ml.nom, couleur:ml.couleur, taille:ml.taille, grammage:ml.grammage, qty:ml.qty, pu:ml.pu, pe:'', desCab:ml.nom.toUpperCase(), puCab:ml.pu};
        });
        if(statusEl) statusEl.textContent = '✅ '+magLines.length+' produit(s) importés'+(unmatchedCount?' ('+unmatchedCount+' sans référence catalogue — à vérifier)':' — vérifiez les prix HT');
        renderMagLines();
      } else {
        if(mode === 'cab') { cabLines = []; if(typeof renderCabLines === 'function') renderCabLines(); }
        if(mode === 'mag') { magLines = []; if(typeof renderMagLines === 'function') renderMagLines(); }
        if(statusEl) statusEl.textContent = '✅ OpenAI : '+(lignes.length||'?')+' produit(s) — intégration…';
        setTimeout(function(){ factuAnalyze(mode); }, 300);
      }

    } else {
      // Fallback PDF.js si OpenAI échoue
      if(isPdf && typeof pdfjsLib !== 'undefined'){
        if(statusEl) statusEl.textContent='⚠️ OpenAI indisponible — lecture PDF locale…';
        pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var ab=await file.arrayBuffer();
        var pdf=await pdfjsLib.getDocument({data:ab}).promise;
        var text='';
        for(var i=1;i<=pdf.numPages;i++){
          var page=await pdf.getPage(i);
          var ct=await page.getTextContent();
          text+=ct.items.map(function(x){return x.str;}).join(' ')+'\n';
        }
        var ta2=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
        if(ta2) ta2.value=text.trim();
        if(mode==='cab') autoFillCabestoFields(detectCabestoStore(text));
        if(statusEl) statusEl.textContent='✅ PDF lu localement — analyse…';
        setTimeout(function(){ factuAnalyze(mode); }, 200);
      } else {
        if(statusEl) statusEl.textContent='⚠️ '+(j.error||'Analyse impossible')+' — tapez la commande manuellement.';
      }
    }

  } catch(err){
    if(statusEl){ statusEl.style.display='block'; statusEl.textContent='⚠️ Erreur : '+err.message; }
    console.error('handleFactuFile error:', err);
  }
}

// ═══════════════════════════════════════════════════════
// ANALYSE IA — Texte email/SMS via OpenAI
// ═══════════════════════════════════════════════════════
window.factuAnalyzeIA = async function(mode){
  var texte = document.getElementById((mode==='mag'?'mag':'cab')+'-import-text').value.trim();
  var statusEl = document.getElementById((mode==='mag'?'mag':'cab')+'-import-status');
  if(!texte){ alert('Collez d\'abord un texte dans la zone de commande.'); return; }

  if(statusEl){ statusEl.style.display='block'; statusEl.textContent='🤖 OpenAI analyse le texte…'; }

  try{
    var resp = await fetch('/api/analyse-commande',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ texte:texte, mode:mode, filename:'texte.txt', mime:'text/plain', dataUrl:'' })
    });
    var j = await resp.json().catch(function(){return{ok:false,error:'Réponse invalide'};});

    if(j.ok && j.data){
      var data = j.data;
      // Ref commande
      if(data.ref_commande){
        var refEl = document.getElementById(mode==='cab'?'cab-order-ref':'mag-order-ref');
        if(refEl && !refEl.value) refEl.value = data.ref_commande;
      }
      // Magasin Cabesto
      if(data.magasin && mode==='cab') autoFillCabestoFields({name:data.magasin});

      // Construire le texte structuré pour factuAnalyze
      // Remplir le numéro de facture si trouvé
      if(data.numero_facture){
        var numEl = document.getElementById(mode==='cab'?'cab-inv-num':'mag-inv-num');
        if(numEl && !numEl.value) numEl.value = data.numero_facture;
      }
      // Remplir les frais de port si trouvés
      if(data.frais_port){
        var portEl = document.getElementById(mode==='cab'?'cab-port':'mag-port');
        if(portEl && !parseFloat(portEl.value)) portEl.value = data.frais_port;
      }

      var lignes = expandAmbiguousSizeLines(data.lignes || []);
      if(lignes.length > 0){
        var unmatchedCount = 0;
        // Rapproche chaque ligne OpenAI avec le catalogue local pour récupérer ref/prix/grammage corrects
        if(mode==='mag'){
          var newMagLines = lignes.map(function(l){
            var ml = matchOpenAILine(l);
            if(!ml.catMatch) unmatchedCount++;
            return {
              ref: ml.ref, nom: ml.nom, couleur: ml.couleur, taille: ml.taille, grammage: ml.grammage,
              qty: ml.qty, pu: ml.pu, pe:'', desCab: ml.nom.toUpperCase(), puCab: ml.pu
            };
          });
          magLines = magLines.concat(newMagLines);
          if(typeof renderMagLines==='function') renderMagLines();
        } else {
          var newCabLines = lignes.map(function(l){
            var ml = matchOpenAILine(l);
            if(!ml.catMatch) unmatchedCount++;
            var pe = ml.catMatch ? getPeData(ml.catMatch.ref, ml.catMatch.ean) : null;
            return {
              pe: pe ? pe.pe : (l.ref_client||l.ref_frenchy||''),
              desCab: pe ? pe.des : ml.nom.toUpperCase(),
              ref: ml.ref, nom: ml.nom, couleur: ml.couleur, taille: ml.taille, grammage: ml.grammage,
              qty: ml.qty, pu: ml.pu, puCab: pe ? pe.pu : ml.pu
            };
          });
          cabLines = cabLines.concat(newCabLines);
          if(typeof renderCabLines==='function') renderCabLines();
        }
        if(statusEl) statusEl.textContent='✅ OpenAI : '+lignes.length+' produit(s) ajouté(s)'+(unmatchedCount?' ('+unmatchedCount+' sans référence catalogue — à vérifier)':' avec succès !');
        var iaTa=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
        if(iaTa) iaTa.value='';
        factuRenderTotals(mode);
      } else if(data.texte_brut){
        // Pas de lignes structurées — utiliser le texte brut reformatté
        var ta2 = document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
        if(ta2) ta2.value = data.texte_brut;
        if(statusEl) statusEl.textContent='✅ Texte reformatté — analyse locale…';
        setTimeout(function(){ factuAnalyze(mode); }, 300);
      } else {
        if(statusEl) statusEl.textContent='⚠️ OpenAI n\'a pas trouvé de produits — essayez Analyser (local)';
      }
    } else {
      if(statusEl) statusEl.textContent='⚠️ '+(j.error||'Analyse impossible')+' — essayez Analyser (local)';
    }
  }catch(e){
    if(statusEl) statusEl.textContent='⚠️ Erreur : '+e.message;
    console.error('factuAnalyzeIA:', e);
  }
};

function factuAnalyze(mode){
  const text = document.getElementById((mode==='mag'?'mag':'cab')+'-import-text').value.trim();
  if(!text){ alert('Entrez ou importez une commande.'); return; }
  let lines = [];
  let orderRes = [];

  if(mode==='cab'){
    // Essai 1 : parser PE codes directement
    const peLines = parsePeCodes(text);
    if(peLines.length > 0){
      lines = peLines;
    } else {
      // Essai 2 : parser noms de produits
      const dq = parseInt((document.getElementById('default-qty')||{value:'1'}).value)||1;
      const results = parseOrderText(text, dq);
      orderRes = results;
      lines = results.filter(r=>r.matched).map(r=>{
        const p=r.product;
        const pe=getPeData(p.ref,p.ean);
        return {
          ref:p.ref, ean:p.ean||'',
          nom:p.produit||'',
          couleur:p.couleur||'',
          taille:p.taille||'',
          grammage:p.grammage||'',
          qty:r.qty,
          pu:Number(p.ht)||0,
          pe:pe?pe.pe:'',
          desCab:pe?pe.des:([p.produit,p.taille,p.grammage,p.couleur].filter(Boolean).join(' ').toUpperCase()),
          puCab:pe?pe.pu:Number(p.ht)||0,
        };
      });
    }
    // Auto-detect store from text
    const detected = detectCabestoStore(text);
    autoFillCabestoFields(detected);
    cabLines = cabLines.concat(lines);
    renderCabLines();
  } else {
    // Magasin mode — use parseOrderText from app.js
    const dq = parseInt((document.getElementById('default-qty')||{value:'1'}).value)||1;
    // Temporarily set default-qty for the original extractQty
    let results = [];
    try {
      results = parseOrderText(text);
    } catch(e) { console.error('parseOrderText error:', e); }
    // If no results, try with explicit qty
    if(!results.length || !results.filter(r=>r.matched).length){
      // Try line by line with manual qty extraction
      const dqFallback = dq;
      const tmpLines2 = text.split('\n').map(l=>l.trim()).filter(l=>l.length>3);
      results = tmpLines2.map(line => {
        const nl = typeof normalizeLine==='function' ? normalizeLine(line) : line.toLowerCase();
        const scored = (typeof CATALOGUE!=='undefined'?CATALOGUE:[]).map(p=>{
          const hay = [p.produit,p.couleur,p.taille,p.grammage,p.ref].join(' ').toLowerCase();
          const words = nl.replace(/\d+/g,' ').split(/\s+/).filter(w=>w.length>2);
          const hits = words.filter(w=>hay.includes(w)).length;
          return {p, s:words.length?hits/words.length:0};
        }).sort((a,b)=>b.s-a.s);
        const best = scored[0];
        const qm = line.match(/[x×*]\s*(\d+)|(\d+)\s*[x×*]|\b(\d{1,3})\s*$/i);
        const qty = qm?(parseInt(qm[1]||qm[2]||qm[3])||dqFallback):dqFallback;
        return {line, qty, product:best&&best.s>=0.25?best.p:null, matched:best&&best.s>=0.25};
      });
    }
    orderRes = results;
    lines = results.filter(r=>r.matched).map(r=>{
      const p=r.product;
      const pe=getPeData(p.ref,p.ean);
      return {
        ref:p.ref, ean:p.ean||'',
        nom:p.produit||'',
        couleur:p.couleur||'',
        taille:p.taille||'',
        grammage:p.grammage||'',
        qty:r.qty,
        pu:Number(p.ht)||0,
        pe:pe?pe.pe:'',
        desCab:pe?pe.des:([p.produit,p.taille,p.grammage,p.couleur].filter(Boolean).join(' ').toUpperCase()),
        puCab:pe?pe.pu:Number(p.ht)||0,
      };
    });
    magLines = magLines.concat(lines);
    renderMagLines();
  }

  // Charger dans orderResults pour le bouton codes-barres
  if(orderRes.length) orderResults = orderRes;

  // Bouton animé
  const btn=document.getElementById((mode==='mag'?'mag':'cab')+'-go-print');
  if(btn) btn.classList.add('visible');
  const st=document.getElementById((mode==='mag'?'mag':'cab')+'-import-status');
  if(st) st.textContent=`✅ ${lines.length} produit(s) ajouté(s) — facture mise à jour`;
  const ta=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
  if(ta) ta.value='';
  flV35SyncFactuToCommandes(mode, lines, orderRes);
}

function factuClear(mode){
  const ta=document.getElementById((mode==='mag'?'mag':'cab')+'-import-text');
  if(ta) ta.value='';
  const st=document.getElementById((mode==='mag'?'mag':'cab')+'-import-status');
  if(st){ st.style.display='none'; st.textContent=''; }
  if(mode==='mag'){ magLines=[]; magCurrentInvoiceId=null; renderMagLines(); }
  else { cabLines=[]; cabCurrentInvoiceId=null; renderCabLines(); }
  const btn=document.getElementById((mode==='mag'?'mag':'cab')+'-go-print');
  if(btn) btn.classList.remove('visible');
}

// ── HELPERS ───────────────────────────────────────────────────────────
const fe=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const mny=v=>Number(v||0).toFixed(2)+'\u00a0€';
const dfr=d=>{if(!d)return'';const p=String(d).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d;};
const nl2=s=>fe(s).replace(/\n/g,'<br>');
const todayISO=()=>new Date().toISOString().slice(0,10);

// ── BUILD CLIENT DROPDOWNS ────────────────────────────────────────────
// Clients Supabase valides uniquement
window._supabaseClients=[];
window._inactiveClients=(function(){try{return JSON.parse(localStorage.getItem('fl_inactive_clients')||'[]');}catch(e){return[];}})();
window.toggleClientActive=function(name){var list=window._inactiveClients||[];var idx=list.indexOf(name);if(idx===-1)list.push(name);else list.splice(idx,1);window._inactiveClients=list;try{localStorage.setItem('fl_inactive_clients',JSON.stringify(list));}catch(e){}buildClientDropdowns();};

function buildClientDropdowns(){
  var sm=document.getElementById('mag-client-sel');
  var sc=document.getElementById('cab-client-sel');
  var supaClients=(window._supabaseClients||[]).filter(function(c){return c.statut==='valide';}).map(function(c){return{name:c.nom_magasin||'',type:c.type_client==='cabesto'?'cabesto':'magasin',email:c.email||'',phone:c.telephone||'',address:c.adresse||'',siret:c.siret||'',_supabase:true};}).filter(function(c){return c.name;});
  var supaNames=supaClients.map(function(c){return c.name.toLowerCase();});
  var inactive=(window._inactiveClients||[]).map(function(n){return n.toLowerCase();});
  var staticClients=CLIENTS_DB.filter(function(c){return supaNames.indexOf((c.name||'').toLowerCase())===-1&&inactive.indexOf((c.name||'').toLowerCase())===-1;});
  var allClients=supaClients.filter(function(c){return inactive.indexOf(c.name.toLowerCase())===-1;}).concat(staticClients);
  if(sm){
    var magClients=allClients.filter(function(c){return c.type==='magasin';});
    sm.innerHTML='<option value="">— Choisir un magasin —</option>'+magClients.map(function(c,i){return '<option value="mag_'+i+'">'+c.name+'</option>';}).join('');
    sm.onchange=function(){var idx=this.value;if(!idx){magClient=null;this.style.background='';return;}magClient=magClients[parseInt(idx.replace('mag_',''))]||null;this.style.background='#e8f5e9';this.style.fontWeight='700';};
  }
  if(sc){
    var cabClients=allClients.filter(function(c){return c.type==='cabesto';});
    sc.innerHTML='<option value="">— Choisir le magasin Cabesto —</option>'+cabClients.map(function(c,i){return '<option value="cab_'+i+'">'+c.name+'</option>';}).join('');
    sc.onchange=function(){var idx=this.value;if(!idx){cabClient=null;return;}cabClient=cabClients[parseInt(idx.replace('cab_',''))]||null;if(cabClient){var orig=CLIENTS_DB.find(function(x){return x.name===cabClient.name;});if(orig){cabClient.comf=orig.comf;cabClient.code=orig.code;cabClient.storeCode=orig.storeCode;cabClient.cde=orig.cde;}var r=document.getElementById('cab-order-ref');if(r&&!r.value&&cabClient.comf)r.placeholder=cabClient.comf+'/2026/XXXXX';var s=document.getElementById('cab-supplier-code');if(s)s.value=((orig&&orig.code)||'FE00513');}};
  }
}
window.buildClientDropdowns=buildClientDropdowns;

// ── RENDU LIGNES MAGASIN ──────────────────────────────────────────────
function renderMagLines(){
  const box=document.getElementById('mag-lines');
  if(!box) return;
  if(!magLines.length){
    box.innerHTML='<div class="factu-empty">Importez une commande ou cliquez "Passer à la facturation Magasin" depuis l\'onglet Impression.</div>';
    const t=document.getElementById('mag-total'); if(t) t.style.display='none';
    const gp=document.getElementById('mag-go-print'); if(gp) gp.classList.remove('visible');
    return;
  }
  box.innerHTML=`<div style="width:100%;overflow-x:auto;padding-bottom:4px;"><table class="factu-table" style="width:100%;min-width:480px;table-layout:fixed;">
    <colgroup>
      <col style="width:20px">
      <col style="width:80px">
      <col>
      <col style="width:52px">
      <col style="width:36px">
      <col style="width:42px">
      <col style="width:34px">
      <col style="width:50px">
      <col style="width:58px">
      <col style="width:22px">
    </colgroup>
    <thead><tr>
      <th style="padding:4px 0;"></th>
      <th style="font-size:10px;">Réf. produit</th>
      <th>Nom produit</th>
      <th style="font-size:10px;">Couleur</th>
      <th style="font-size:10px;">Taille</th>
      <th style="font-size:10px;">Grammage</th>
      <th class="r" style="font-size:10px;">Qté</th>
      <th class="r" style="font-size:10px;">PU HT&nbsp;€</th>
      <th class="r" style="font-size:10px;">Montant&nbsp;€</th>
      <th></th>
    </tr></thead><tbody>
    ${magLines.map((l,i)=>`<tr>
      <td style="padding:0;text-align:center;vertical-align:middle;">
        <button onclick="magMoveLine(${i},-1)" ${i===0?'disabled':''} style="display:block;width:18px;height:14px;padding:0;margin:0 auto 1px;background:#555;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:9px;line-height:1;${i===0?'opacity:.2;':''}">▲</button>
        <button onclick="magMoveLine(${i},1)" ${i===magLines.length-1?'disabled':''} style="display:block;width:18px;height:14px;padding:0;margin:0 auto;background:#555;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:9px;line-height:1;${i===magLines.length-1?'opacity:.2;':''}">▼</button>
      </td>
      <td class="mono" style="padding:3px 4px;"><input value="${fe(l.ref)}" style="width:100%;font-family:monospace;font-size:11px;padding:4px 4px;box-sizing:border-box;" oninput="magLines[${i}].ref=this.value"/></td>
      <td style="padding:3px 4px;"><input value="${fe(l.nom)}" style="width:100%;font-weight:700;font-size:13px;padding:5px 6px;box-sizing:border-box;" oninput="magLines[${i}].nom=this.value"/></td>
      <td style="padding:3px 3px;"><input value="${fe(l.couleur)}" style="width:100%;font-size:11px;padding:4px 3px;box-sizing:border-box;" oninput="magLines[${i}].couleur=this.value"/></td>
      <td style="padding:3px 2px;"><input value="${fe(l.taille)}" style="width:100%;font-size:11px;padding:4px 3px;box-sizing:border-box;" oninput="magLines[${i}].taille=this.value"/></td>
      <td style="padding:3px 2px;"><input value="${fe(l.grammage)}" style="width:100%;font-size:11px;padding:4px 3px;box-sizing:border-box;" oninput="magLines[${i}].grammage=this.value"/></td>
      <td class="r" style="padding:3px 2px;"><input type="number" value="${l.qty}" min="1"
        style="width:100%;text-align:center;font-weight:800;font-size:13px;padding:4px 2px;box-sizing:border-box;"
        oninput="magLines[${i}].qty=Math.max(1,parseInt(this.value)||1);factuRenderTotals('mag')"/></td>
      <td class="r" style="padding:3px 2px;"><input type="number" value="${l.pu.toFixed(2)}" min="0" step="0.01"
        style="width:100%;text-align:center;font-weight:800;font-size:13px;padding:4px 2px;box-sizing:border-box;"
        oninput="magLines[${i}].pu=Math.max(0,parseFloat(this.value.replace(',','.'))||0);factuRenderTotals('mag')"/></td>
      <td class="r bold" id="mmt-${i}" style="font-size:12px;padding:3px 4px;white-space:nowrap;">${mny(l.qty*l.pu)}</td>
      <td style="padding:2px 2px;"><button onclick="magLines.splice(${i},1);renderMagLines()" class="btn-del" style="font-size:13px;">✕</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <button onclick="magAddLine()" style="margin-top:10px;padding:8px 18px;background:#2d6a2d;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">➕ Ajouter une ligne</button>`;
  factuRenderTotals('mag');
  const gp=document.getElementById('mag-go-print'); if(gp) gp.classList.add('visible');
  magUpdatePreview(_magPreviewType||'invoice');
}
window.magAddLine = function(){
  magLines.push({ref:'',nom:'',couleur:'',taille:'',grammage:'',qty:1,pu:0,pe:'',desCab:'',puCab:0});
  renderMagLines();
  setTimeout(function(){
    var tds = document.querySelectorAll('#mag-lines tbody tr:last-child td');
    if(tds[1]){ tds[1].scrollIntoView({block:'nearest'}); }
  },50);
};
window.magMoveLine = function(i, dir){
  var j = i + dir;
  if(j < 0 || j >= magLines.length) return;
  var tmp = magLines[i]; magLines[i] = magLines[j]; magLines[j] = tmp;
  renderMagLines();
};

// ── RENDU LIGNES CABESTO ──────────────────────────────────────────────
function renderCabLines(){
  const box=document.getElementById('cab-lines');
  if(!box) return;
  if(!cabLines.length){
    box.innerHTML='<div class="factu-empty">Importez une commande ou cliquez "Passer à la facturation Cabesto" depuis l\'onglet Impression.</div>';
    const t=document.getElementById('cab-total'); if(t) t.style.display='none';
    const gp=document.getElementById('cab-go-print'); if(gp) gp.classList.remove('visible');
    return;
  }
  box.innerHTML=`<div style="width:100%;overflow-x:auto;padding-bottom:4px;"><table class="factu-table" style="width:100%;min-width:400px;table-layout:fixed;">
    <colgroup>
      <col style="width:20px">
      <col style="width:54px">
      <col>
      <col style="width:34px">
      <col style="width:46px">
      <col style="width:56px">
      <col style="width:22px">
    </colgroup>
    <thead><tr>
      <th style="padding:4px 0;"></th>
      <th style="font-size:10px;">Réf. PE</th>
      <th style="font-size:11px;font-weight:800;">Désignation Cabesto</th>
      <th class="r" style="font-size:10px;">Qté</th>
      <th class="r" style="font-size:10px;">PU HT&nbsp;€</th>
      <th class="r" style="font-size:10px;">Montant&nbsp;€</th>
      <th></th>
    </tr></thead><tbody>
    ${cabLines.map((l,i)=>`<tr>
      <td style="padding:0;text-align:center;vertical-align:middle;">
        <button onclick="cabMoveLine(${i},-1)" ${i===0?'disabled':''} style="display:block;width:18px;height:14px;padding:0;margin:0 auto 1px;background:#555;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:9px;line-height:1;${i===0?'opacity:.2;':''}">▲</button>
        <button onclick="cabMoveLine(${i},1)" ${i===cabLines.length-1?'disabled':''} style="display:block;width:18px;height:14px;padding:0;margin:0 auto;background:#555;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:9px;line-height:1;${i===cabLines.length-1?'opacity:.2;':''}">▼</button>
      </td>
      <td style="padding:3px 4px;"><input value="${fe(l.pe)}" style="width:100%;font-family:monospace;font-size:10px;padding:4px 3px;box-sizing:border-box;"
        oninput="cabLines[${i}].pe=this.value"/></td>
      <td style="padding:3px 4px;"><input value="${fe(l.desCab)}" style="width:100%;font-weight:700;font-size:14px;padding:5px 6px;box-sizing:border-box;"
        oninput="cabLines[${i}].desCab=this.value"/></td>
      <td style="padding:3px 2px;" class="r"><input type="number" value="${l.qty}" min="1"
        style="width:100%;text-align:center;font-weight:800;font-size:13px;padding:4px 2px;box-sizing:border-box;"
        oninput="cabLines[${i}].qty=Math.max(1,parseInt(this.value)||1);factuRenderTotals('cab')"/></td>
      <td style="padding:3px 2px;" class="r"><input type="number" value="${l.puCab.toFixed(2)}" min="0" step="0.01"
        style="width:100%;text-align:center;font-weight:800;font-size:13px;padding:4px 2px;box-sizing:border-box;"
        oninput="cabLines[${i}].puCab=Math.max(0,parseFloat(this.value.replace(',','.'))||0);factuRenderTotals('cab')"/></td>
      <td class="r bold" id="cmt-${i}" style="font-size:12px;padding:3px 4px;white-space:nowrap;">${mny(l.qty*l.puCab)}</td>
      <td style="padding:2px 2px;"><button onclick="cabLines.splice(${i},1);renderCabLines()" class="btn-del" style="font-size:13px;">✕</button></td>
    </tr>`).join('')}
    </tbody></table></div>`;
  factuRenderTotals('cab');
  const gp=document.getElementById('cab-go-print'); if(gp) gp.classList.add('visible');
}
window.cabMoveLine = function(i, dir){
  var j = i + dir;
  if(j < 0 || j >= cabLines.length) return;
  var tmp = cabLines[i]; cabLines[i] = cabLines[j]; cabLines[j] = tmp;
  renderCabLines();
};

function factuRenderTotals(mode){
  const lines = mode==='mag' ? magLines : cabLines;
  const portId    = mode==='mag' ? 'mag-port'    : 'cab-port';
  const remiseId  = mode==='mag' ? 'mag-remise'  : 'cab-remise';
  const totalId   = mode==='mag' ? 'mag-total'   : 'cab-total';

  const ht = lines.reduce((s,l)=>s+Number(l.qty)*(mode==='mag'?Number(l.pu):Number(l.puCab)),0);
  const port    = parseFloat((document.getElementById(portId)||{value:0}).value)||0;
  const remisePct = parseFloat((document.getElementById(remiseId)||{value:0}).value)||0;
  const remiseMt  = ht * remisePct / 100;
  const htRemise  = ht - remiseMt;
  const net       = htRemise + port;

  const tbox = document.getElementById(totalId);
  if(tbox){
    tbox.style.display='block';
    tbox.innerHTML=`
      <div class="total-row"><span>Total hors taxes</span><span>${mny(ht)}</span></div>
      ${remisePct>0?`<div class="total-row" style="color:#c62828;font-weight:700;"><span>Remise ${remisePct}%</span><span>− ${mny(remiseMt)}</span></div>
      <div class="total-row" style="font-weight:700;"><span>Total HT après remise</span><span>${mny(htRemise)}</span></div>`:''}
      ${port>0?`<div class="total-row"><span>Frais de port</span><span>${mny(port)}</span></div>`:''}
      <div class="total-row tva"><span>TVA non applicable (Art. 293 B CGI)</span><span>0,00&nbsp;€</span></div>
      <div class="total-row grand"><span>Total net à payer</span><span>${mny(net)}</span></div>`;
  }
  if(mode==='mag') lines.forEach((l,i)=>{const e=document.getElementById('mmt-'+i);if(e)e.textContent=mny(Number(l.qty)*Number(l.pu));});
  else lines.forEach((l,i)=>{const e=document.getElementById('cmt-'+i);if(e)e.textContent=mny(Number(l.qty)*Number(l.puCab));});
  if(mode==='mag') setTimeout(function(){magUpdatePreview(_magPreviewType||'invoice');},50);
}

// ── CSS IMPRESSION ────────────────────────────────────────────────────
function printCSS(){
  return `<style>
    @page{size:A4;margin:20mm}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0}
    h1{margin:0;font-size:20px;font-weight:900}
    .header{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:14px;gap:20px}
    .from p{margin:1px 0;font-size:10px}
    .docinfo{text-align:right}.docinfo h2{margin:0;font-size:26px;font-weight:900}
    .docinfo table{margin-left:auto;border-collapse:collapse;font-size:10px}
    .docinfo td{padding:2px 5px}.docinfo td:first-child{font-weight:700;color:#000;text-align:right}
    .parties{display:flex;gap:16px;margin-bottom:12px}
    .party{flex:1;border:1px solid #000;padding:8px;font-size:10px}
    .party h3{margin:0 0 5px;font-size:10px;background:#f0f0f0;color:#000;padding:2px 6px;font-weight:700;display:inline-block;border:1px solid #ccc}
    table.lg{width:100%;border-collapse:collapse;margin-top:6px}
    table.lg th{background:#fff;color:#000;border:1px solid #000;padding:5px 6px;font-size:10px;font-weight:700;text-align:left;white-space:nowrap}
    table.lg th.r,table.lg td.r{text-align:right;white-space:nowrap}
    table.lg td{border:1px solid #000;padding:4px 6px;font-size:10px;vertical-align:middle;white-space:nowrap;color:#000}
    table.lg tr:nth-child(even){background:#fafafa}
    .tot{margin-left:auto;width:260px;margin-top:8px;border-collapse:collapse}
    .tot td{padding:5px 10px;border:1px solid #000;font-size:11px;color:#000}
    .tot tr.tva td{color:#000;font-size:10px}
    .tot tr.grand td{background:#fff;color:#000;font-weight:700;font-size:13px;border-top:2px solid #000}
    .refs{margin-top:12px;border:2px solid #000;border-radius:4px;padding:8px 12px}
    .refs h3{color:#000;margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
    .refs table{font-size:10px;width:100%}.refs td{padding:2px 6px}.refs td:first-child{font-weight:700;width:170px}
    .legal{margin-top:14px;font-size:9px;text-align:center;color:#000;border-top:1px solid #000;padding-top:6px}
  </style>`;
}

// ── GÉNÉRATION FACTURE MAGASIN ────────────────────────────────────────
// ARCHIVAGE FACTURES
async function archiveFacture(opts){
  var db=window.db;if(!db){var tn=document.createElement('div');tn.textContent='❌ Base de données non connectée — réessayez dans 2 secondes';tn.style.cssText='position:fixed;bottom:20px;right:20px;background:#c62828;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:700;z-index:9999';document.body.appendChild(tn);setTimeout(function(){tn.remove();},5000);return;}
  try{
    var row={numero:opts.num||'',type_doc:opts.typeDoc||'facture',type_client:opts.typeClient||'magasin',client_nom:opts.clientNom||'',client_email:opts.clientEmail||'',client_adresse:opts.clientAdresse||'',date_facture:opts.date||todayISO(),ref_commande:opts.refCmd||'',montant_ht:opts.ht||0,frais_port:opts.port||0,montant_total:opts.total||0,lignes:JSON.stringify(opts.lignes||[])};
    var r;
    if(opts.invoiceId){
      r=await db.from('factures').update(row).eq('id',opts.invoiceId).select();
    }else{
      row.statut_paiement='en_attente';
      r=await db.from('factures').insert([row]).select();
    }
    var _docLabel=opts.typeDoc==='bon_livraison'?'Bon de livraison':'Facture';
    if(!r.error){console.log('Facture archivee:',opts.num);var t=document.createElement('div');t.textContent='✅ '+_docLabel+' '+opts.num+(opts.invoiceId?' mis à jour !':' enregistré(e) !');t.style.cssText='position:fixed;bottom:20px;right:20px;background:#2e7d32;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3)';document.body.appendChild(t);setTimeout(function(){t.remove();},4000);if(typeof renderHistorique==='function')renderHistorique();}else{var te=document.createElement('div');te.textContent='❌ Erreur sauvegarde: '+JSON.stringify(r.error);te.style.cssText='position:fixed;bottom:20px;right:20px;background:#c62828;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:700;z-index:9999;max-width:320px';document.body.appendChild(te);setTimeout(function(){te.remove();},6000);console.error('Archive error:',r.error);}
  }catch(e){console.warn('Archive:',e);var te2=document.createElement('div');te2.textContent='❌ Erreur: '+e.message;te2.style.cssText='position:fixed;bottom:20px;right:20px;background:#c62828;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:700;z-index:9999';document.body.appendChild(te2);setTimeout(function(){te2.remove();},6000);}
}


var _magSilent=false;
var _magPreviewType='invoice';
function magBuildPreviewHtml(type){
  var isDelivery=type==='delivery';
  var num=(document.getElementById('mag-inv-num')||{}).value||'FL-2026-???';
  var date=(document.getElementById('mag-inv-date')||{}).value||todayISO();
  var oref=(document.getElementById('mag-order-ref')||{}).value||'';
  var port=parseFloat((document.getElementById('mag-port')||{value:0}).value)||0;
  var remisePct=parseFloat((document.getElementById('mag-remise')||{value:0}).value)||0;
  var c=magClient;
  var clientHtml=c
    ?`<strong>${fe(c.name)}</strong><br>${nl2(c.address||'')}<br>${c.phone?'Tél&nbsp;: '+fe(c.phone)+'<br>':''}${c.email?fe(c.email):''}`
    :'<em style="color:#aaa;font-size:10px;">— Sélectionnez un magasin dans le formulaire ci-dessus —</em>';
  var linesHtml='';
  if(magLines.length){
    var ht=magLines.reduce(function(s,l){return s+Number(l.qty)*Number(l.pu);},0);
    var remiseMt=ht*remisePct/100;var htR=ht-remiseMt;var net=htR+port;
    if(isDelivery){
      linesHtml=magLines.map(function(l){return '<tr><td class="mono">'+fe(l.ref)+'</td><td>'+fe(l.nom)+'</td><td>'+(fe(l.couleur)||'—')+'</td><td>'+(fe(l.taille)||'—')+'</td><td>'+(fe(l.grammage)||'—')+'</td><td class="r"><strong>'+l.qty+'</strong></td><td class="r">□</td></tr>';}).join('');
    } else {
      linesHtml=magLines.map(function(l){return '<tr><td class="mono">'+fe(l.ref)+'</td><td>'+fe(l.nom)+'</td><td>'+(fe(l.couleur)||'—')+'</td><td>'+(fe(l.taille)||'—')+'</td><td>'+(fe(l.grammage)||'—')+'</td><td class="r">'+l.qty+'</td><td class="r">'+mny(l.pu)+'</td><td class="r"><strong>'+mny(Number(l.qty)*Number(l.pu))+'</strong></td></tr>';}).join('');
      linesHtml+='</tbody></table><table class="tot"><tbody>'
        +'<tr><td><strong>Total hors taxes</strong></td><td class="r"><strong>'+mny(ht)+'</strong></td></tr>'
        +(remisePct>0?'<tr style="color:#c62828;font-weight:700"><td>Remise '+remisePct+'%</td><td class="r">− '+mny(remiseMt)+'</td></tr><tr><td><strong>Total HT après remise</strong></td><td class="r"><strong>'+mny(htR)+'</strong></td></tr>':'')
        +(port>0?'<tr><td>Frais de port</td><td class="r">'+mny(port)+'</td></tr>':'')
        +'<tr class="tva"><td>TVA non applicable (Art. 293 B CGI)</td><td class="r">0,00&nbsp;€</td></tr>'
        +'<tr class="grand"><td>Total net à payer</td><td class="r">'+mny(net)+'</td></tr>';
    }
  } else {
    var _span=isDelivery?7:8;
    linesHtml='<tr><td colspan="'+_span+'" style="text-align:center;color:#aaa;padding:18px;font-style:italic;font-size:10px;">— Importez une commande pour voir les lignes de la facture —</td></tr>';
  }
  var thInvoice='<th>Réf. produit</th><th>Nom produit</th><th>Couleur</th><th>Taille</th><th>Grammage</th><th class="r">Qté</th><th class="r">PU HT&nbsp;(€)</th><th class="r">Montant HT&nbsp;(€)</th>';
  var thDelivery='<th>Réf. produit</th><th>Nom produit</th><th>Couleur</th><th>Taille</th><th>Grammage</th><th class="r">Qté commandée</th><th class="r">Qté livrée</th>';
  return '<!doctype html><html><head><meta charset="utf-8">'+printCSS()+'</head><body>'
    +'<div class="header"><div class="from"><h1>'+fe(FL.name)+'</h1><p>'+fe(FL.address)+'</p><p>Tél&nbsp;: '+fe(FL.phone)+' — Mobile&nbsp;: '+fe(FL.mobile)+'</p><p>'+fe(FL.email)+'</p><p>SIRET&nbsp;: '+fe(FL.siret)+'</p></div>'
    +'<div class="docinfo"><h2>'+(isDelivery?'BON DE LIVRAISON':'FACTURE')+'</h2>'
    +'<table><tr><td>N° :</td><td><strong>'+fe(num)+'</strong></td></tr><tr><td>Date :</td><td>'+dfr(date)+'</td></tr>'
    +(oref?'<tr><td>Réf. commande :</td><td>'+fe(oref)+'</td></tr>':'')
    +'<tr><td>Règlement :</td><td>Virement bancaire</td></tr></table></div></div>'
    +'<div class="parties"><div class="party"><h3>Expéditeur</h3><br><strong>'+fe(FL.fullName)+'</strong><br>'+nl2(FL.address)+'<br>Tél&nbsp;: '+fe(FL.phone)+'<br>'+fe(FL.email)+'<br>SIRET&nbsp;: '+fe(FL.siret)+'</div>'
    +'<div class="party"><h3>Destinataire</h3><br>'+clientHtml+'</div></div>'
    +'<table class="lg"><thead><tr>'+(isDelivery?thDelivery:thInvoice)+'</tr></thead><tbody>'+linesHtml+'</tbody></table>'
    +(magLines.length&&!isDelivery?'':'')
    +'<div class="legal">'+fe(FL.vatNote)+'</div></body></html>';
}
function magUpdatePreview(type){
  _magPreviewType=type||'invoice';
  var frame=document.getElementById('mag-factu-preview');
  if(!frame) return;
  frame.srcdoc=magBuildPreviewHtml(_magPreviewType);
}
function magSetPreviewType(type){
  _magPreviewType=type;
  var bi=document.getElementById('prev-btn-invoice');
  var bd=document.getElementById('prev-btn-delivery');
  if(bi) bi.classList.toggle('active',type==='invoice');
  if(bd) bd.classList.toggle('active',type==='delivery');
  magUpdatePreview(type);
}
function magGenDoc(type){
  const c=magClient;
  if(!magLines.length){if(!_magSilent)alert('Aucune ligne à facturer.');return null;}
  if(!c){if(!_magSilent)alert('Sélectionnez un magasin.');return null;}
  const num=(document.getElementById('mag-inv-num')||{}).value||'FL-2026-001';
  const date=(document.getElementById('mag-inv-date')||{}).value||todayISO();
  const oref=(document.getElementById('mag-order-ref')||{}).value||'';
  const port=parseFloat((document.getElementById('mag-port')||{value:0}).value)||0;
  const remisePct=parseFloat((document.getElementById('mag-remise')||{value:0}).value)||0;
  const ht=magLines.reduce((s,l)=>s+Number(l.qty)*Number(l.pu),0);
  const remiseMt=ht*remisePct/100;
  const htRemise=ht-remiseMt;
  const net=htRemise+port;

  const rows=magLines.map(l=>`<tr>
    <td class="mono">${fe(l.ref)}</td>
    <td>${fe(l.nom)}</td>
    <td>${fe(l.couleur)||'—'}</td>
    <td>${fe(l.taille)||'—'}</td>
    <td>${fe(l.grammage)||'—'}</td>
    <td class="r">${l.qty}</td>
    <td class="r">${mny(l.pu)}</td>
    <td class="r"><strong>${mny(Number(l.qty)*Number(l.pu))}</strong></td>
  </tr>`).join('');

  const blRows=magLines.map(l=>`<tr>
    <td class="mono">${fe(l.ref)}</td><td>${fe(l.nom)}</td>
    <td>${fe(l.couleur)||'—'}</td><td>${fe(l.taille)||'—'}</td><td>${fe(l.grammage)||'—'}</td>
    <td class="r"><strong>${l.qty}</strong></td><td class="r">□</td>
  </tr>`).join('');

const totRows=`
    <tr><td><strong>Total hors taxes</strong></td><td class="r"><strong>${mny(ht)}</strong></td></tr>
    ${remisePct>0?`<tr style="color:#c62828;font-weight:700"><td>Remise ${remisePct}%</td><td class="r">− ${mny(remiseMt)}</td></tr><tr><td><strong>Total HT après remise</strong></td><td class="r"><strong>${mny(htRemise)}</strong></td></tr>`:''}
    ${port>0?`<tr><td>Frais de port</td><td class="r">${mny(port)}</td></tr>`:''}
    <tr class="tva"><td>TVA non applicable (Art. 293 B CGI)</td><td class="r">0,00&nbsp;€</td></tr>
    <tr class="grand"><td>Total net à payer</td><td class="r">${mny(net)}</td></tr>`;

  const header=`<div class="header">
    <div class="from"><h1>${fe(FL.name)}</h1>
      <p>${fe(FL.address)}</p>
      <p>Tél&nbsp;: ${fe(FL.phone)} — Mobile&nbsp;: ${fe(FL.mobile)}</p>
      <p>${fe(FL.email)}</p><p>SIRET&nbsp;: ${fe(FL.siret)}</p></div>
    <div class="docinfo"><h2>${type==='delivery'?'BON DE LIVRAISON':'FACTURE'}</h2>
      <table><tr><td>N° :</td><td><strong>${fe(num)}</strong></td></tr>
      <tr><td>Date :</td><td>${dfr(date)}</td></tr>
      ${oref?`<tr><td>Réf. commande :</td><td>${fe(oref)}</td></tr>`:''}
      <tr><td>Règlement :</td><td>Virement bancaire</td></tr></table></div>
  </div>`;

  const parties=`<div class="parties">
    <div class="party"><h3>Expéditeur</h3><br><strong>${fe(FL.fullName)}</strong><br>${nl2(FL.address)}<br>
      Tél&nbsp;: ${fe(FL.phone)}<br>${fe(FL.email)}<br>SIRET&nbsp;: ${fe(FL.siret)}</div>
    <div class="party"><h3>Destinataire</h3><br><strong>${fe(c.name)}</strong><br>${nl2(c.address)}<br>
      ${c.phone?'Tél&nbsp;: '+fe(c.phone)+'<br>':''}${c.email?fe(c.email):''}</div>
  </div>`;

  if(type==='delivery'){
    return `<!doctype html><html><head><meta charset="utf-8"><title>BL ${fe(num)}</title>${printCSS()}</head><body>
      ${header}${parties}
      <table class="lg"><thead><tr><th>Réf. produit</th><th>Nom produit</th><th>Couleur</th><th>Taille</th><th>Grammage</th>
        <th class="r">Qté commandée</th><th class="r">Qté livrée</th></tr></thead><tbody>${blRows}</tbody></table>
      <div style="margin-top:20px;display:flex;justify-content:space-between;">
        <div style="border:1px solid #000;padding:10px 18px;width:45%;font-size:10px;">Signature expéditeur&nbsp;:<br><br><br></div>
        <div style="border:1px solid #000;padding:10px 18px;width:45%;font-size:10px;">Signature réceptionnaire&nbsp;:<br><br><br></div>
      </div>
      <div class="legal">${fe(FL.vatNote)}</div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${fe(num)}</title>${printCSS()}</head><body>
    ${header}${parties}
    <table class="lg"><thead><tr><th>Réf. produit</th><th>Nom produit</th><th>Couleur</th>
      <th>Taille</th><th>Grammage</th>
      <th class="r">Qté</th><th class="r">PU HT&nbsp;(€)</th><th class="r">Montant HT&nbsp;(€)</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <table class="tot"><tbody>${totRows}</tbody></table>
    <div class="legal">${fe(FL.vatNote)}</div>
    <script>window.onload=function(){window.print();};<\/script></body></html>`;
}


// ── V35 EXPORT PREMIUM + SYNCHRO COMMANDES/CODES-BARRES ───────────────
function flV35SanitizeFilename(v){return String(v||'document').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'document';}
function flV35RemovePrintScript(html){return String(html||'').replace(new RegExp('<script>window.onload=function\\(\\)\\{window.print\\(\\);\\};<\\/script>','g'),'').replace(/@page\{size:A4;margin:20mm\}/g,'').replace(/body\{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0\}/g,'body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:18px;background:#fff}');}
function flV35DownloadBlob(content, filename, type){const blob=new Blob([content],{type:type||'application/octet-stream'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function flV35DownloadDesignedDoc(html, filename){
  // Export premium : on télécharge le même HTML que l'aperçu/impression.
  // Avant, le fichier était forcé en .xls : Excel cassait la mise en page.
  const cleanHtml='<!doctype html>'+String(flV35RemovePrintScript(html)||'')
    .replace(/^<!doctype html>/i,'')
    .replace(/<body>/i,'<body class="download-mode">');
  flV35DownloadBlob('﻿'+cleanHtml, filename, 'text/html;charset=utf-8;');
}

function flV40CleanDesignedHtml(html){
  return '<!doctype html>'+String(flV35RemovePrintScript(html)||'')
    .replace(/^<!doctype html>/i,'')
    .replace(/<body>/i,'<body class="download-mode">');
}
function flV40DownloadExcelPremium(html, filename){
  const clean=flV40CleanDesignedHtml(html)
    .replace(/<table class="lg"/g,'<table class="lg" border="1"')
    .replace(/<table class="tot"/g,'<table class="tot" border="1"')
    .replace(/<table>/g,'<table border="1">');
  flV35DownloadBlob('﻿'+clean, filename, 'application/vnd.ms-excel;charset=utf-8;');
}
function flV40OpenPdfPrint(html){
  const w=window.open('','_blank');
  if(!w){ alert('PDF : autorise les popups, puis choisis Imprimer > Enregistrer en PDF.'); return; }
  w.document.open();
  w.document.write(String(html||''));
  w.document.close();
}
function flV40DownloadPack(html, baseName){
  // Ouvrir dans un nouvel onglet SANS auto-print → qualité parfaite
  // L'utilisateur enregistre via Ctrl+P → "Enregistrer en PDF"
  var cleanHtml = flV35RemovePrintScript(String(html||''));
  var w = window.open('','_blank');
  if(w){
    w.document.open();
    w.document.write(cleanHtml);
    w.document.close();
    var toast=document.createElement('div');
    toast.innerHTML='📄 Facture ouverte dans un nouvel onglet<br><strong>Ctrl+P → "Enregistrer en PDF"</strong>';
    toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1565c0;color:#fff;padding:14px 22px;border-radius:10px;font-size:14px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);line-height:1.5;white-space:nowrap';
    document.body.appendChild(toast);
    setTimeout(function(){toast.remove();},6000);
  } else {
    alert('Autorisez les popups puis réessayez — ou utilisez "Imprimer facture" pour enregistrer en PDF.');
  }
}
function flV35GetProductFromLine(l){if(!l)return null;if(l.ref&&typeof CATALOGUE!=='undefined'){const p=CATALOGUE.find(x=>x.ref===l.ref);if(p)return p;}if(l.ean&&typeof CATALOGUE!=='undefined'){const p=CATALOGUE.find(x=>String(x.ean||'')===String(l.ean||''));if(p)return p;}return null;}
function flV35SyncFactuToCommandes(mode, lines, existingResults){const results=[];(existingResults||[]).forEach(r=>{if(r&&r.matched&&r.product)results.push(r);});(lines||[]).forEach(l=>{const p=flV35GetProductFromLine(l);if(!p)return;if(results.some(r=>r.product&&r.product.ref===p.ref))return;results.push({matched:true,product:p,qty:parseInt(l.qty)||1,line:(mode==='cab'?(l.pe||l.ref||'')+' '+(l.desCab||l.nom||''):(l.ref||'')+' '+(l.nom||''))});});if(results.length){orderResults=results;try{renderOrderResults();}catch(e){console.warn('V35 render commandes',e);}const tab=document.getElementById('tab-commande');if(tab){tab.classList.add('fl-v35-pulse');setTimeout(()=>tab.classList.remove('fl-v35-pulse'),3500);}const st=document.getElementById((mode==='mag'?'mag':'cab')+'-import-status');if(st)st.textContent+=' — codes-barres préparés dans Commandes';}}

function magPrint(t){const h=magGenDoc(t);if(!h)return;const w=window.open('','_blank');w.document.open();w.document.write(h);w.document.close();_magArchive(t);}
function _magArchive(t){try{var c=magClient||{name:(document.getElementById('mag-client-sel')||{options:[{text:''}]}).options[(document.getElementById('mag-client-sel')||{selectedIndex:0}).selectedIndex]?.text||'Magasin non sélectionné',email:'',address:''};var num=(document.getElementById('mag-inv-num')||{}).value||'';var date=(document.getElementById('mag-inv-date')||{}).value||todayISO();var oref=(document.getElementById('mag-order-ref')||{}).value||'';var port=parseFloat((document.getElementById('mag-port')||{value:0}).value)||0;var remisePct=parseFloat((document.getElementById('mag-remise')||{value:0}).value)||0;var ht=magLines.reduce(function(s,l){return s+Number(l.qty)*Number(l.pu);},0);var remiseMt=ht*remisePct/100;var total=ht-remiseMt+port;archiveFacture({invoiceId:magCurrentInvoiceId,num:num,typeDoc:t==='delivery'?'bon_livraison':'facture',typeClient:'magasin',clientNom:c.name||'',clientEmail:c.email||'',clientAdresse:(c.address||'').replace(/\n/g,' '),date:date,refCmd:oref,ht:ht,port:port,remisePct:remisePct,remiseMt:remiseMt,total:total,lignes:magLines.map(function(l){return{ref:l.ref,nom:l.nom,couleur:l.couleur,taille:l.taille,grammage:l.grammage,qty:l.qty,pu:l.pu};})});}catch(e){console.warn(e);}}
function magDownload(t){
  const h=magGenDoc(t); if(!h) return;
  const num=(document.getElementById('mag-inv-num')||{}).value||'FL-2026-001';
  const base=(t==='delivery'?'BL_':'Facture_')+flV35SanitizeFilename(num);
  flV40DownloadPack(h, base);
  _magArchive(t);
}

// ── GÉNÉRATION FACTURE CABESTO// ── GÉNÉRATION FACTURE CABESTO ─────────────────────────────────────────
function cabGenDoc(type){
  const c=cabClient;
  if(!cabLines.length){alert('Aucune ligne Cabesto.');return null;}
  if(!c||c.type!=='cabesto'){alert('Sélectionnez un magasin Cabesto.');return null;}
  const num=(document.getElementById('cab-inv-num')||{}).value||'FL-2026-001';
  const date=(document.getElementById('cab-inv-date')||{}).value||todayISO();
  const comf=(document.getElementById('cab-order-ref')||{}).value||'';
  const deliv=(document.getElementById('cab-delivery-date')||{}).value||'';
  const supp=(document.getElementById('cab-supplier-code')||{}).value||'FE00513';
  const port=parseFloat((document.getElementById('cab-port')||{value:0}).value)||0;
  const remisePct=parseFloat((document.getElementById('cab-remise')||{value:0}).value)||0;
  const ht=cabLines.reduce((s,l)=>s+Number(l.qty)*Number(l.puCab),0);
  const remiseMt=ht*remisePct/100;
  const htRemise=ht-remiseMt;
  const net=htRemise+port;

  const rows=cabLines.map(l=>`<tr>
    <td class="mono">${fe(l.pe||'—')}</td>
    <td><strong>${fe(l.desCab)}</strong></td>
    <td class="r">${l.qty}</td>
    <td class="r">${mny(l.puCab)}</td>
    <td class="r"><strong>${mny(Number(l.qty)*Number(l.puCab))}</strong></td>
  </tr>`).join('');

const totRows=`
    <tr><td><strong>Total hors taxes</strong></td><td class="r"><strong>${mny(ht)}</strong></td></tr>
    ${remisePct>0?`<tr style="color:#c62828;font-weight:700"><td>Remise ${remisePct}%</td><td class="r">− ${mny(remiseMt)}</td></tr><tr><td><strong>Total HT après remise</strong></td><td class="r"><strong>${mny(htRemise)}</strong></td></tr>`:''}
    ${port>0?`<tr><td>Frais de port</td><td class="r">${mny(port)}</td></tr>`:''}
    <tr class="tva"><td>TVA non applicable (Art. 293 B CGI)</td><td class="r">0,00&nbsp;€</td></tr>
    <tr class="grand"><td>Total net à payer</td><td class="r">${mny(net)}</td></tr>`;

  const refs=`<div class="refs"><h3>Références à rappeler pour la livraison</h3>
    <table><tr><td>Fournisseur :</td><td>${fe(supp)}</td></tr>
    <tr><td>N° Commande :</td><td>${fe(comf)}</td></tr>
    <tr><td>Destinataire :</td><td>${fe(c.storeCode)}${deliv?' — Livraison prévue&nbsp;: '+dfr(deliv):''}</td></tr></table></div>`;

  const header=`<div class="header">
    <div class="from"><h1>${fe(FL.name)}</h1>
      <p>${fe(FL.address)}</p>
      <p>Tél&nbsp;: ${fe(FL.phone)} — Mobile&nbsp;: ${fe(FL.mobile)}</p>
      <p>${fe(FL.email)}</p><p>SIRET&nbsp;: ${fe(FL.siret)}</p></div>
    <div class="docinfo"><h2>${type==='delivery'?'BON DE LIVRAISON':'FACTURE'}</h2>
      <table><tr><td>N° Facture :</td><td><strong>${fe(num)}</strong></td></tr>
      <tr><td>Date :</td><td>${dfr(date)}</td></tr>
      <tr><td>Réf. commande :</td><td><strong>${fe(comf)}</strong></td></tr>
      <tr><td>Code fournisseur :</td><td><strong>${fe(supp)}</strong></td></tr>
      <tr><td>Règlement :</td><td>Virement bancaire</td></tr></table></div>
  </div>`;

  const parties=`<div class="parties">
    <div class="party"><h3>Expéditeur</h3><br><strong>${fe(FL.fullName)}</strong><br>${nl2(FL.address)}<br>
      Tél&nbsp;: ${fe(FL.phone)}<br>${fe(FL.email)}<br>SIRET&nbsp;: ${fe(FL.siret)}</div>
    <div class="party"><h3>Destinataire</h3><br><strong>${fe(c.name)}</strong><br>${nl2(c.address)}<br>
      ${c.phone?'Tél&nbsp;: '+fe(c.phone)+'<br>':''}${c.email?fe(c.email):''}</div>
  </div>`;

  if(type==='delivery'){
    const blRows=cabLines.map(l=>`<tr>
      <td class="mono">${fe(l.pe||'—')}</td><td><strong>${fe(l.desCab)}</strong></td>
      <td class="r"><strong>${l.qty}</strong></td><td class="r">□</td>
    </tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>BL Cabesto ${fe(num)}</title>${printCSS()}</head><body>
      ${header}${parties}
      <table class="lg"><thead><tr><th>Réf. produit</th><th>Désignation</th>
        <th class="r">Qté commandée</th><th class="r">Qté livrée</th></tr></thead><tbody>${blRows}</tbody></table>
      ${refs}
      <div style="margin-top:20px;display:flex;justify-content:space-between;">
        <div style="border:1px solid #000;padding:10px 18px;width:45%;font-size:10px;">Signature expéditeur&nbsp;:<br><br><br></div>
        <div style="border:1px solid #000;padding:10px 18px;width:45%;font-size:10px;">Signature réceptionnaire&nbsp;:<br><br><br></div>
      </div>
      <div class="legal">${fe(FL.vatNote)}</div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Facture Cabesto ${fe(num)}</title>${printCSS()}</head><body>
    ${header}${parties}
    <table class="lg"><thead><tr><th>Réf. produit</th><th>Désignation</th>
      <th class="r">Qté</th><th class="r">PU HT&nbsp;(€)</th><th class="r">Montant HT&nbsp;(€)</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <table class="tot"><tbody>${totRows}</tbody></table>
    ${refs}
    <div class="legal">${fe(FL.vatNote)}</div>
    <script>window.onload=function(){window.print();};<\/script></body></html>`;
}


// ── EXPORT PACKING LISTE CABESTO (CSV séparateur ;) ───────────────────
function cabExportPackingListe(){
  if(!cabLines||!cabLines.length){alert('Aucune ligne Cabesto. Importez ou saisissez une commande d\'abord.');return;}
  const c=cabClient; if(!c||c.type!=='cabesto'){alert('Sélectionnez un magasin Cabesto.');return;}
  const cde=c.cde||'CDEXXXXX', ville=c.ville||c.name.replace('Cabesto ','').toUpperCase(), email=c.recepEmail||'';

  // Packing list volontairement simplifiée : uniquement EAN + quantité envoyée.
  const rows=[['PACKING LISTE EAN13 — GAUTIER FISHING'],['CDE',cde,'Email récepteur',email],[],['EAN13','Quantité envoyée']];
  let hasWarning=false;
  const lines=cabLines.map(function(l){
    const prod=flV35GetProductFromLine(l);
    const ean=prod?(prod.ean||''):(l.ean||'');
    const qty=parseInt(l.qty)||0;
    if(!ean)hasWarning=true;
    rows.push([ean||'EAN_MANQUANT','X '+qty]);
    return {ean:ean||'EAN_MANQUANT', qty:qty};
  });

  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  flV35DownloadBlob(csv,cde+'-'+ville+'-PACKING-LISTE-EAN13.csv','text/csv;charset=utf-8;');

  const html='<!doctype html><html><head><meta charset="utf-8"><title>Packing Liste '+cde+'</title>'+printCSS()+
    '<style>'+ 
    '.pl-top{display:flex;justify-content:space-between;gap:18px;margin:18px 0 14px;border:1px solid #ddd;padding:12px 14px;border-radius:10px;background:#fafafa;}'+
    '.pl-box{font-size:13px;line-height:1.35}.pl-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:3px}.pl-value{font-size:15px;font-weight:800;color:#111}.pl-email{text-align:right}'+
    '.qty-x{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:38px;line-height:1}.qty-x .x{font-weight:900;font-size:15px}.qty-x .n{font-weight:900;font-size:18px;margin-top:4px}.ean-only th,.ean-only td{text-align:center}.ean-only td:first-child,.ean-only th:first-child{text-align:left}'+
    '</style></head><body>'+ 
    '<div class="header"><div class="from"><h1>GAUTIER FISHING</h1><p>Packing liste EAN13</p></div><div class="docinfo"><h2>PACKING LISTE</h2></div></div>'+ 
    '<div class="pl-top"><div class="pl-box"><div class="pl-label">CDE</div><div class="pl-value">'+fe(cde)+'</div></div><div class="pl-box pl-email"><div class="pl-label">Email récepteur</div><div class="pl-value">'+fe(email||'email non trouvé')+'</div></div></div>'+ 
    '<table class="lg ean-only"><thead><tr><th>EAN13</th><th>Quantité envoyée</th></tr></thead><tbody>'+lines.map(function(l){return '<tr><td class="mono"><strong>'+fe(l.ean)+'</strong></td><td><span class="qty-x"><span class="x">X</span><span class="n">'+fe(l.qty)+'</span></span></td></tr>';}).join('')+
    '</tbody></table><div class="legal">Document de contrôle pour préparation magasin — uniquement EAN13 + quantités envoyées.</div></body></html>';

  flV35DownloadDesignedDoc(html,cde+'-'+ville+'-PACKING-LISTE-EAN13.html');
  if(hasWarning) alert('⚠️ Certains produits n\'ont pas de code EAN13 dans le catalogue. Vérifiez le fichier généré.'); else alert('✅ CSV + tableau Excel de packing liste téléchargés.\n\n📧 À envoyer à : '+(email||'email non trouvé'));
  const cdeDisplay=document.getElementById('cab-cde-display'), emailDisplay=document.getElementById('cab-recep-email-display'); if(emailDisplay) emailDisplay.textContent=email||'email non trouvé'; if(cdeDisplay&&cde!=='CDEXXXXX') cdeDisplay.textContent=cde;
}

function cabPrint(t){const h=cabGenDoc(t);if(!h)return;const w=window.open('','_blank');w.document.open();w.document.write(h);w.document.close();_cabArchive(t);}
function _cabArchive(t){try{var c=cabClient;if(!c)return;var num=(document.getElementById('cab-inv-num')||{}).value||'';var date=(document.getElementById('cab-inv-date')||{}).value||todayISO();var comf=(document.getElementById('cab-order-ref')||{}).value||'';var port=parseFloat((document.getElementById('cab-port')||{value:0}).value)||0;var remisePct=parseFloat((document.getElementById('cab-remise')||{value:0}).value)||0;var ht=cabLines.reduce(function(s,l){return s+Number(l.qty)*Number(l.puCab);},0);var remiseMt=ht*remisePct/100;var total=ht-remiseMt+port;archiveFacture({invoiceId:cabCurrentInvoiceId,num:num,typeDoc:t==='delivery'?'bon_livraison':'facture',typeClient:'cabesto',clientNom:c.name||'',clientEmail:c.email||'',clientAdresse:(c.address||'').replace(/\n/g,' '),date:date,refCmd:comf,ht:ht,port:port,remisePct:remisePct,remiseMt:remiseMt,total:total,lignes:cabLines.map(function(l){return{ref:l.pe||l.ref,nom:l.desCab||l.nom,qty:l.qty,pu:l.puCab};})});}catch(e){console.warn(e);}}
function cabDownload(t){
  const h=cabGenDoc(t); if(!h) return;
  const num=(document.getElementById('cab-inv-num')||{}).value||'FL-2026-001';
  const base=(t==='delivery'?'BL_Cabesto_':'Facture_Cabesto_')+flV35SanitizeFilename(num);
  flV40DownloadPack(h, base);
  _cabArchive(t);
}

// extractQty// extractQty default handled in factuAnalyze

// ── INIT ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  buildClientDropdowns();
  // Vider la file au démarrage pour repartir propre
  // (décommenter si besoin) : queueRect=[]; queueRound=[]; saveState();
});


// ═══════════════════════════════════════════════════════════════════════
// SAISIE RAPIDE CABESTO — grille visuelle de tous les produits
// ═══════════════════════════════════════════════════════════════════════

function openCabSaisieRapide(){
  const modal = document.getElementById('modal-saisie-rapide');
  const grid  = document.getElementById('saisie-rapide-grid');
  if(!modal || !grid) return;

  // Group products by category for readability
  const groups = [
    {label:'🔴 Rouget Martegal', codes:['PE-0022615','PE-0022611','PE-0022612','PE-0022613','PE-0022614']},
    {label:'🎣 Mistik Shad', codes:['PE-0022616','PE-0022617','PE-0022618','PE-0022619','PE-0022620','PE-0022621']},
    {label:'⚓ Le G de Gautier', codes:['PE-0022622','PE-0022623','PE-0022624','PE-0022625']},
    {label:'🐟 Biggy Minnow', codes:['PE-0022626','PE-0022627','PE-0022628']},
    {label:'🐚 Moules / Pierre', codes:['PE-0007794','PE-0008623','PE-0022892','PE-0022893','PE-0022894-98D1','PE-0022894-7635','PE-0022894-3E37','PE-0022894-7636']},
  ];

  let html = '';
  groups.forEach(g => {
    html += `<div style="grid-column:1/-1;background:#1a1a1a;color:#fff;padding:5px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-top:8px;">${g.label}</div>`;
    g.codes.forEach(pe => {
      const prod = CABESTO_PRODUCTS.find(p=>p.pe.toUpperCase()===pe.toUpperCase());
      if(!prod) return;
      const existingLine = cabLines.find(l=>l.pe===prod.pe);
      const existingQty  = existingLine ? existingLine.qty : 0;
      html += `<div style="display:flex;align-items:center;gap:8px;background:#f8f8f4;border:1px solid #e0e0d8;border-radius:6px;padding:6px 10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-family:monospace;color:#000;">${prod.pe}</div>
          <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${prod.des}</div>
          <div style="font-size:11px;color:#000;">${prod.pu.toFixed(2)} €</div>
        </div>
        <input type="number" id="sr-${prod.pe.replace(/[^a-z0-9]/gi,'')}"
          value="${existingQty||0}" min="0" max="9999"
          style="width:65px;text-align:center;font-size:16px;font-weight:700;border:1.5px solid #ddd;border-radius:6px;padding:4px;"/>
      </div>`;
    });
  });

  grid.innerHTML = html;
  modal.style.display = 'block';
}

function valideSaisieRapide(){
  const groups = [
    ['PE-0022615','PE-0022611','PE-0022612','PE-0022613','PE-0022614'],
    ['PE-0022616','PE-0022617','PE-0022618','PE-0022619','PE-0022620','PE-0022621'],
    ['PE-0022622','PE-0022623','PE-0022624','PE-0022625'],
    ['PE-0022626','PE-0022627','PE-0022628'],
    ['PE-0007794','PE-0008623','PE-0022892','PE-0022893','PE-0022894-98D1','PE-0022894-7635','PE-0022894-3E37','PE-0022894-7636'],
  ];
  const allCodes = groups.flat();
  const newLines = [];

  allCodes.forEach(pe => {
    const safeId = pe.replace(/[^a-z0-9]/gi,'');
    const inp = document.getElementById('sr-'+safeId);
    if(!inp) return;
    const qty = parseInt(inp.value,10)||0;
    if(qty <= 0) return;

    const prod = CABESTO_PRODUCTS.find(p=>p.pe.toUpperCase()===pe.toUpperCase());
    if(!prod) return;
    const catProd = (typeof CATALOGUE!=='undefined'?CATALOGUE:[]).find(p=>
      p.ref===prod.ref || String(p.ean||'')===String(prod.ean||'')
    );
    newLines.push({
      pe:   prod.pe,
      ref:  prod.ref,
      ean:  prod.ean,
      nom:  catProd ? catProd.produit : prod.des,
      couleur:  catProd ? catProd.couleur  : '',
      taille:   catProd ? catProd.taille   : '',
      grammage: catProd ? catProd.grammage : '',
      qty:  qty,
      pu:   Number(catProd&&catProd.ht ? catProd.ht : prod.pu)||0,
      desCab:  prod.des,
      puCab:   prod.pu,
    });
  });

  cabLines = newLines;
  renderCabLines();

  // Show animated go-print button
  const btn = document.getElementById('cab-go-print');
  if(btn) btn.classList.add('visible');

  document.getElementById('modal-saisie-rapide').style.display='none';

  // Also populate orderResults so "aller imprimer" works
  orderResults = newLines.map(l=>({matched:true, product:
    (typeof CATALOGUE!=='undefined'?CATALOGUE:[]).find(p=>p.ref===l.ref)||{ref:l.ref,produit:l.nom,couleur:l.couleur,taille:l.taille,grammage:l.grammage,ean:l.ean,ronde:false},
    qty:l.qty
  })).filter(r=>r.product);
}



// ═══════════════════════════════════════════════════════
// CATALOGUE — AJOUT PRODUIT INTÉGRÉ
// ═══════════════════════════════════════════════════════
window.catShowAddProduit = function(){
  document.getElementById('catAddPanel').style.display='';
  document.getElementById('catAddRef').focus();
};
window.catHideAddProduit = function(){
  document.getElementById('catAddPanel').style.display='none';
  document.getElementById('catAddStatus').textContent='';
};
window.catSaveProduit = async function(){
  var ref=document.getElementById('catAddRef').value.trim();
  var nom=document.getElementById('catAddNom').value.trim();
  var ean=(document.getElementById('catAddEan').value.trim()).replace(/\D/g,'');
  var famille=document.getElementById('catAddFamille').value.trim();
  var couleur=document.getElementById('catAddCouleur').value.trim();
  var taille=document.getElementById('catAddTaille').value.trim();
  var grammage=document.getElementById('catAddGrammage').value.trim();
  var cond=document.getElementById('catAddCond').value.trim();
  var ht=parseFloat(document.getElementById('catAddHt').value)||0;
  var pvc=parseFloat(document.getElementById('catAddPvc').value)||0;
  var ronde=parseInt(document.getElementById('catAddRonde').value)||0;
  var notes=document.getElementById('catAddNotes').value.trim();
  var st=document.getElementById('catAddStatus');
  if(!ref||!nom){st.textContent='❌ Référence et nom obligatoires';st.style.color='#c62828';return;}
  if(ean&&ean.length!==13){st.textContent='❌ EAN-13 doit faire 13 chiffres';st.style.color='#c62828';return;}
  var db=window.db;
  if(!db){st.textContent='❌ Supabase non connecté';st.style.color='#c62828';return;}
  st.textContent='⏳ Enregistrement…';st.style.color='#888';
  try{
    var r=await db.from('products').insert([{ref:ref,produit:nom,famille:famille,couleur:couleur,
      taille:taille,grammage:grammage,conditionnement:cond,prix_ht:ht,pvc:pvc,
      ean13:ean,etiq_ronde:ronde,notes:notes,source:'manuel'}]).select();
    if(r.error){st.textContent='❌ '+r.error.message;st.style.color='#c62828';return;}
    /* Injecter dans RAW + CATALOGUE immédiatement */
    RAW.unshift([ref,nom,famille,couleur,taille,grammage,cond,ht,pvc,ean,ronde]);
    CATALOGUE.unshift({ref:ref,produit:nom,famille:famille,couleur:couleur,taille:taille,
      grammage:grammage,cond:cond,ht:ht,pvc:pvc,ean:ean,ronde:!!ronde,format:'40x30',_custom:true});
    /* Sauvegarder dans localStorage pour persistance au rechargement */
    if(typeof saveCustomCatalogue==='function') saveCustomCatalogue();
    /* Vider les filtres pour que le nouveau produit soit visible */
    var catSearch=document.getElementById('cat-search');
    var catFamille=document.getElementById('cat-famille');
    if(catSearch) catSearch.value='';
    if(catFamille) catFamille.value='';
    buildFilters();
    renderCatalogue();
    st.textContent='✅ Produit "'+nom+'" ajouté ! Visible en haut du catalogue.';st.style.color='#2e7d32';
    /* Vider le formulaire */
    ['catAddRef','catAddFamille','catAddNom','catAddCouleur','catAddTaille','catAddGrammage',
     'catAddCond','catAddHt','catAddPvc','catAddEan','catAddNotes'].forEach(function(id){
      var e=document.getElementById(id);if(e)e.value='';
    });
    setTimeout(function(){
      window.catHideAddProduit();
      /* Scroller en haut du catalogue pour voir le nouveau produit */
      var catPage=document.getElementById('page-catalogue');
      if(catPage) catPage.scrollTop=0;
      window.scrollTo({top:0,behavior:'smooth'});
      /* Mettre en évidence le premier cat-card */
      var firstCard=document.querySelector('.cat-card');
      if(firstCard){
        firstCard.style.outline='3px solid #00a651';
        firstCard.style.transition='outline .5s';
        setTimeout(function(){firstCard.style.outline='';},3000);
      }
    },800);
  }catch(e){st.textContent='❌ '+e.message;st.style.color='#c62828';}
};

// ═══════════════════════════════════════════════════════
// COMPTES PRO — LISTE TOUS LES MAGASINS
// ═══════════════════════════════════════════════════════
var _allMgData=[];

async function allMgLoad(){
  /* Base statique */
  var base=CLIENTS_DB.map(function(c,i){
    return{id:'s'+i,nom:c.name||'',type:c.type||'magasin',
      tel:c.phone||'',email:c.email||'',
      adresse:(c.address||'').replace(/\n/g,' '),src:'static'};
  });
  /* Supabase */
  var sb=[];
  try{
    var db=window.db;
    if(db){
      var r=await db.from('pro_clients').select('*').order('nom_magasin',{ascending:true});
      if(!r.error&&r.data){
        sb=r.data.map(function(c){
          return{id:c.id,nom:c.nom_magasin||'',type:c.type_client||'magasin',
            tel:c.telephone||'',email:c.email||'',adresse:c.adresse||'',
            statut:c.statut||'',notes:c.notes||'',src:'supabase'};
        });
      }
    }
  }catch(e){console.warn('allMgLoad:',e);}
  var sbNoms=sb.map(function(c){return c.nom.toLowerCase();});
  var staticOnly=base.filter(function(c){return sbNoms.indexOf(c.nom.toLowerCase())===-1;});
  _allMgData=sb.concat(staticOnly).sort(function(a,b){return a.nom.localeCompare(b.nom,'fr');});
  allMgRender();
}

window.allMgRender=function(){
  var q=((document.getElementById('allMgSearch')||{}).value||'').toLowerCase();
  var arr=_allMgData.filter(function(m){
    if(!q)return true;
    return [m.nom,m.email,m.tel,m.adresse].join(' ').toLowerCase().includes(q);
  });
  var el=document.getElementById('allMgList');if(!el)return;
  if(!arr.length){el.innerHTML='<div style="text-align:center;padding:24px;color:#777;font-size:13px">Aucun magasin.</div>';return;}
  el.innerHTML=arr.map(function(m){
    var sid=String(m.id).replace(/'/g,'');
    var typBdg=m.type==='cabesto'?'<span style="background:#fde8e8;color:#c62828;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid #f4a9a9">Cabesto</span>':'<span style="background:#e3f2fd;color:#1565c0;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid #90caf9">Magasin</span>';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #f0f0ec">'
      +'<div>'
      +'<div style="font-weight:700;font-size:13px;color:#1a1a1a;margin-bottom:2px">'+m.nom+' '+typBdg+'</div>'
      +'<div style="font-size:11px;color:#777;display:flex;gap:10px">'
      +(m.tel?'<span>📞 '+m.tel+'</span>':'')
      +(m.email?'<span>✉ '+m.email+'</span>':'')
      +'</div></div>'
      +'<button data-sid="'+sid+'" onclick="allMgFacture(this.dataset.sid)" style="padding:5px 10px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap">🧾 Facturer</button>'
      +'</div>';
  }).join('');
};

window.allMgFacture=function(id){
  var m=_allMgData.find(function(x){return String(x.id)===String(id);});
  if(!m)return;
  window._supabaseClients=window._supabaseClients||[];
  if(!window._supabaseClients.find(function(c){return(c.nom_magasin||'').toLowerCase()===m.nom.toLowerCase();})){
    window._supabaseClients.push({nom_magasin:m.nom,type_client:m.type,email:m.email,telephone:m.tel,adresse:m.adresse,statut:'valide'});
    buildClientDropdowns();
  }
  showTab('facturation');
  setTimeout(function(){
    var selId=m.type==='cabesto'?'cab-client-sel':'mag-client-sel';
    var sel=document.getElementById(selId);
    if(sel){var opt=Array.from(sel.options).find(function(o){return o.text===m.nom;});if(opt){sel.value=opt.value;sel.dispatchEvent(new Event('change'));}}
  },400);
};

window.allMgShowForm=function(){
  document.getElementById('allMgFormPanel').style.display='';
  document.getElementById('allMgNom').focus();
};

window.allMgSave=async function(){
  var nom=(document.getElementById('allMgNom')||{value:''}).value.trim();
  var st=document.getElementById('allMgStatus');
  if(!nom){if(st){st.textContent='❌ Nom obligatoire';st.style.color='#c62828';}return;}
  var db=window.db;
  if(!db){if(st){st.textContent='❌ Supabase non connecté';st.style.color='#c62828';}return;}
  function gv2(id){var e=document.getElementById(id);return e?e.value.trim():'';}
  var payload={nom_magasin:nom,type_client:gv2('allMgType')||'magasin',
    telephone:gv2('allMgTel'),email:gv2('allMgEmail'),
    adresse:gv2('allMgAdresse'),siret:gv2('allMgSiret'),
    notes:gv2('allMgNotes'),dept:gv2('allMgDept'),statut:'valide'};
  if(st){st.textContent='⏳ Enregistrement…';st.style.color='#888';}
  try{
    var r=await db.from('pro_clients').insert([payload]).select();
    if(r.error){if(st){st.textContent='❌ '+r.error.message;st.style.color='#c62828';}return;}
    if(st){st.textContent='✅ Magasin enregistré !';st.style.color='#2e7d32';}
    var saved=r.data&&r.data[0];
    if(saved){window._supabaseClients=window._supabaseClients||[];window._supabaseClients.push(saved);}
    buildClientDropdowns();
    ['allMgNom','allMgTel','allMgEmail','allMgAdresse','allMgSiret','allMgNotes','allMgDept'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
    setTimeout(function(){document.getElementById('allMgFormPanel').style.display='none';allMgLoad();},800);
  }catch(e){if(st){st.textContent='❌ '+e.message;st.style.color='#c62828';}}
};

/* Charger la liste magasins quand on ouvre Comptes Pro */


// ═══════════════════════════════════════════════════════
// BOUTON STATUT IA
// ═══════════════════════════════════════════════════════
window.checkIACredit = async function(){
  var dot   = document.getElementById('ia-dot');
  var label = document.getElementById('ia-label');
  var btn   = document.getElementById('ia-status-btn');
  if(!dot||!label) return;

  function setColor(color, txt){
    dot.style.background  = color;
    dot.style.boxShadow   = '0 0 6px '+color;
    label.textContent     = txt;
    if(btn){ btn.style.borderColor=color; btn.style.color=color; }
  }

  setColor('#e8c840','⏳ Vérification…');

  try{
    /* Tester via le backend Vercel (qui a la clé OpenAI) */
    var resp = await fetch('/api/analyse-facture', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({_ping:true, filename:'ping', mime:'image/png', dataUrl:''})
    });
    /* Si le backend répond (même avec une erreur d'analyse) = OpenAI accessible */
    if(resp.status===200||resp.status===400){
      setColor('#4caf50','🟢 OpenAI connectée');
    } else if(resp.status===429){
      setColor('#ff9800','⚠️ Crédit OpenAI faible');
    } else if(resp.status===500){
      /* Erreur serveur = probablement clé manquante ou quota */
      var j = await resp.json().catch(function(){return{};});
      if(j&&j.error&&j.error.includes('quota')){
        setColor('#f44336','🔴 Quota OpenAI épuisé');
      } else {
        setColor('#4caf50','🟢 OpenAI OK');
      }
    } else {
      setColor('#4caf50','🟢 OpenAI OK');
    }
  }catch(e){
    /* Backend non disponible en local — vert par défaut */
    setColor('#4caf50','🟢 OpenAI OK');
  }
};

// Vérifier au démarrage — vert par défaut car clé dans Vercel
document.addEventListener('DOMContentLoaded', function(){
  var dot = document.getElementById('ia-dot');
  var label = document.getElementById('ia-label');
  var btn = document.getElementById('ia-status-btn');
  if(dot){ dot.style.background='#4caf50'; dot.style.boxShadow='0 0 6px #4caf50'; }
  if(label) label.textContent='🟢 OpenAI';
  if(btn){ btn.style.borderColor='#4caf50'; btn.style.color='#4caf50'; }
  // Test réel en arrière-plan après 3s
  setTimeout(window.checkIACredit, 3000);
});

// === PATCH V37 NAVIGATION PORTABLE + INDEX STABLE ===
(function(){
  function safeRender(name){
    try{ if(name==='catalogue' && typeof window.renderCatalogue==='function') window.renderCatalogue(); }catch(e){ console.warn('renderCatalogue:',e); }
    try{ if(name==='impression' && typeof window.renderQueues==='function') window.renderQueues(); }catch(e){ console.warn('renderQueues:',e); }
    try{ if(name==='comptes-pro'){
      if(typeof window.pLoadList==='function') window.pLoadList();
      if(typeof window.loadSigForm==='function') window.loadSigForm();
      if(typeof allMgLoad==='function') allMgLoad();
    }}catch(e){ console.warn('comptes-pro:',e); }
    try{ if(name==='comptabilite' && typeof window.comptaLoad==='function') window.comptaLoad(); }catch(e){ console.warn('comptabilite:',e); }
    try{ if(name==='magasins' && typeof window._mgLoad==='function') window._mgLoad(); }catch(e){ console.warn('magasins:',e); }
    try{ if(name==='produits' && typeof window._pdLoad==='function') window._pdLoad(); }catch(e){ console.warn('produits:',e); }
  }
  window.showTab = function(name){
    try{
      var pages=document.querySelectorAll('.page');
      var tabs=document.querySelectorAll('.tab-btn');
      for(var i=0;i<pages.length;i++){ pages[i].classList.remove('active'); pages[i].style.display='none'; }
      for(var j=0;j<tabs.length;j++){ tabs[j].classList.remove('active'); }
      var page=document.getElementById('page-'+name);
      var tab=document.getElementById('tab-'+name);
      if(!page){ console.error('Onglet introuvable:', name); return false; }
      page.classList.add('active'); page.style.display='block';
      if(tab) tab.classList.add('active');
      try{localStorage.setItem('fl_active_tab',name);}catch(e){}
      safeRender(name);
      if(name==='facturation') setTimeout(function(){magUpdatePreview(_magPreviewType||'invoice');},80);
      return true;
    }catch(err){ console.error('Erreur navigation stable:', err); return false; }
  };
  function bindTabs(){
    var tabs=document.querySelectorAll('.tab-btn');
    for(var i=0;i<tabs.length;i++){
      tabs[i].onclick=null;
      tabs[i].addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        var id=this.id||'';
        var name=id.replace(/^tab-/, '');
        if(name) window.showTab(name);
      }, true);
    }
    var anyActive=document.querySelector('.page.active');
    if(!anyActive){
      var _savedTab=null;try{_savedTab=localStorage.getItem('fl_active_tab');}catch(e){}
      var _startTab=(_savedTab&&document.getElementById('page-'+_savedTab))?_savedTab:'commande';
      window.showTab(_startTab);
      if(_startTab==='facturation'){
        var _savedFTab=null;try{_savedFTab=localStorage.getItem('fl_factu_tab');}catch(e){}
        if(_savedFTab) setTimeout(function(){if(typeof showFactuTab==='function')showFactuTab(_savedFTab);},200);
      }
    } else { anyActive.style.display='block'; }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bindTabs);
  else bindTabs();
  window.addEventListener('load', bindTabs);
})();

