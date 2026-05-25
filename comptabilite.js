
;(function(){
'use strict';
/* Frenchy Leurres — Comptabilite V3 Pro
   Inspire de gautier-fishing-compta.vercel.app
   Sidebar PC + bottom nav mobile
   Supabase via window.db */

var TABLE='compta_documents';
var BUCKET='compta-factures';
var LOCAL_KEY='fl_compta_docs_v44';
var _docs=[], _file=null, _bound=false, _loading=false;
var _curPageDep='dep', _curPageRec='rec';
var _selMonthDep=null, _selYearDep=null, _selCatDep='all';
var _selMonthRec=null, _selYearRec=null;

/* utils */
function $(id){return document.getElementById(id)}
function gv(id){var e=$(id);return e?String(e.value||'').trim():''}
function sv(id,v){var e=$(id);if(e)e.value=v==null?'':v}
function nowIso(){return new Date().toISOString()}
function today(){return nowIso().slice(0,10)}
function uid(){return'loc_'+Date.now()+'_'+Math.random().toString(16).slice(2)}
function cleanAmount(v){return parseFloat(String(v||'0').replace(/\s/g,'').replace(',','.'))||0}
function monthOf(d){return String(d||today()).slice(5,7)}
function yearOf(d){return String(d||today()).slice(0,4)}
function dayOf(d){return String(d||today()).slice(8,10)}
function money(n){return(parseFloat(n||0)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' \u20ac'}
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function badge(txt,cls){var e=$('cSupabaseBadge');if(e){e.className='fc-badge '+(cls||'warn');e.textContent=txt}}
function toast(m){var e=$('comptaStatus');if(e)e.textContent=m||''}
function sb(){return window.db||null}
function localGet(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||localStorage.getItem('fl_compta_docs_v43')||localStorage.getItem('fl_compta_docs')||'[]')}catch(e){return[]}}
function localSet(a){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(a||[]))}catch(e){}}

var MONTHS=[
  {v:'01',l:'Jan'},{v:'02',l:'Fev'},{v:'03',l:'Mars'},{v:'04',l:'Avr'},
  {v:'05',l:'Mai'},{v:'06',l:'Juin'},{v:'07',l:'Juil'},{v:'08',l:'Aout'},
  {v:'09',l:'Sep'},{v:'10',l:'Oct'},{v:'11',l:'Nov'},{v:'12',l:'Dec'}
];
var CATS_DEP=[
  {v:'all',l:'Toutes'},
  {v:'emballage',l:'Emballage'},{v:'la_poste',l:'Envois'},
  {v:'shopify_stripe_paypal',l:'Logiciel'},{v:'materiel_fabrication',l:'Materiel'},
  {v:'frais_de_port',l:'Port'},{v:'carburant',l:'Carburant'},
  {v:'general',l:'Divers'},{v:'a_verifier',l:'\u00c0 verifier'}
];

function normalize(d){
  d=d||{};
  return{
    id:d.id||uid(),
    date_doc:d.date_doc||d.date||today(),
    type_doc:d.type_doc||d.type||'depense',
    fournisseur:d.fournisseur||d.client||'A completer',
    categorie:d.categorie||'general',
    montant_ttc:+(d.montant_ttc||d.montant||0),
    paiement:d.paiement||'a_classer',
    notes:d.notes||'',
    fichier_nom:d.fichier_nom||'',
    fichier_url:d.fichier_url||d.file_url||'',
    fichier_path:d.fichier_path||d.file_path||'',
    statut:d.statut||'classe',
    source:d.source||'manuel',
    created_at:d.created_at||nowIso(),
    synced:d.synced!==false
  }
}

function typeLabel(t){return{depense:'Depense',recette:'Recette',liquide_b:'Liquide B',ca_historique:'CA historique',avoir:'Avoir'}[t]||t}
function amtClass(t){return(t==='recette'||t==='ca_historique')?'rec':(t==='depense'?'dep':'neu')}
function amtSign(t){return(t==='recette'||t==='ca_historique')?'+':'-'}

/* ==============================
   NAVIGATION ENTRE PAGES
============================== */
var FC_PAGES=['dashboard','recettes','depenses','saisie','exports'];
window.fcShowPage=function(name){
  FC_PAGES.forEach(function(p){
    var el=$('fc-page-'+p);
    if(el)el.style.display=(p===name)?'':'none';
    var nb=$('fcbnav-'+p),sv2=$('fcnav-'+p);
    if(nb)nb.classList.toggle('active',p===name);
    if(sv2)sv2.classList.toggle('active',p===name);
  });
  if(name==='dashboard'){renderKpis();renderChart();renderDashList();}
  if(name==='depenses'){initDepenses();fcRenderDepenses();}
  if(name==='recettes'){initRecettes();fcRenderRecettes();}
  if(name==='saisie'){if($('cDate')&&!gv('cDate'))sv('cDate',today());}
};

/* ==============================
   CHARGEMENT
============================== */
async function load(){
  if(_loading)return; _loading=true;
  var s=sb();
  if(s){
    try{
      badge('Connexion\u2026','warn');
      var r=await s.from(TABLE).select('*').order('date_doc',{ascending:false}).limit(8000);
      if(!r.error){
        _docs=(r.data||[]).map(normalize);
        localSet(_docs);
        badge('\u2705 Synchronise','ok');
        toast('\u2705 Donnees synchronisees.');
        renderKpis(); renderChart(); renderDashList();
        _loading=false; return;
      }
      console.warn('Supabase load error',r.error);
      badge('\u26a0\ufe0f Erreur','err');
    }catch(e){console.warn(e);badge('\u26a0\ufe0f Inaccessible','err');}
  }else{badge('\u26a0\ufe0f Non charge','err')}
  _docs=localGet().map(normalize);
  renderKpis(); renderChart(); renderDashList();
  _loading=false;
}

/* ==============================
   DASHBOARD KPIs
============================== */
function renderKpis(){
  var dep=0,rec=0,cash=0;
  _docs.forEach(function(d){
    if(d.type_doc==='depense')dep+=(+d.montant_ttc||0);
    else if(d.type_doc==='recette'||d.type_doc==='ca_historique')rec+=(+d.montant_ttc||0);
    else if(d.type_doc==='liquide_b')cash+=(+d.montant_ttc||0);
  });
  if($('cKpiDocs'))$('cKpiDocs').textContent=_docs.length;
  if($('cKpiDep'))$('cKpiDep').textContent=money(dep);
  if($('cKpiRec'))$('cKpiRec').textContent=money(rec);
  if($('cKpiNet'))$('cKpiNet').textContent=money(rec+cash-dep);
}

/* ==============================
   GRAPHIQUE 6 MOIS
============================== */
function renderChart(){
  var el=$('cChart'); if(!el)return;
  var months=[];
  for(var i=5;i>=0;i--){
    var d=new Date(); d.setMonth(d.getMonth()-i);
    months.push({y:String(d.getFullYear()),m:String(d.getMonth()+1).padStart(2,'0')});
  }
  var maxVal=0;
  var data=months.map(function(mo){
    var dep=0,rec=0;
    _docs.forEach(function(d){
      if(monthOf(d.date_doc)===mo.m&&yearOf(d.date_doc)===mo.y){
        if(d.type_doc==='depense')dep+=(+d.montant_ttc||0);
        else if(d.type_doc==='recette'||d.type_doc==='ca_historique')rec+=(+d.montant_ttc||0);
      }
    });
    if(dep>maxVal)maxVal=dep; if(rec>maxVal)maxVal=rec;
    var lbl=MONTHS.find(function(x){return x.v===mo.m});
    return{lbl:lbl?lbl.l:mo.m,dep:dep,rec:rec};
  });
  var H=72;
  var html=data.map(function(mo){
    var dh=maxVal?Math.max(3,Math.round((mo.dep/maxVal)*H)):3;
    var rh=maxVal?Math.max(3,Math.round((mo.rec/maxVal)*H)):3;
    return '<div class="fc-chart-col">'
      +'<div class="fc-chart-bars">'
      +'<div class="fc-bar-dep" style="height:'+dh+'px" title="Dep: '+money(mo.dep)+'"></div>'
      +'<div class="fc-bar-rec" style="height:'+rh+'px" title="Rec: '+money(mo.rec)+'"></div>'
      +'</div>'
      +'<div class="fc-chart-lbl">'+esc(mo.lbl)+'</div>'
      +'</div>';
  }).join('');
  el.innerHTML=html;
}

/* ==============================
   DASHBOARD LAST 5
============================== */
function renderDashList(){
  var el=$('cDashList'); if(!el)return;
  var arr=_docs.slice(0,10);
  if(!arr.length){el.innerHTML='<div style="text-align:center;color:#aaa;padding:24px;font-size:13px">Aucune ligne enregistree</div>';return}
  el.innerHTML=arr.map(function(d){
    var ac=amtClass(d.type_doc);
    var sign=amtSign(d.type_doc);
    var sid=String(d.id||'').replace(/'/g,'');
    var fileLink=d.fichier_url?'<a href="'+esc(d.fichier_url)+'" target="_blank" style="color:#e8c840;font-size:11px;text-decoration:none;font-weight:700;margin-left:8px">📎 Voir</a>':'';
    return '<div class="fc-dash-row" style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px">'
      +'<div>'
      +'<div class="fc-dash-name">'+esc(d.fournisseur)+fileLink+'</div>'
      +'<div class="fc-dash-meta">'+typeLabel(d.type_doc)+' \u00b7 '+dayOf(d.date_doc)+'/'+monthOf(d.date_doc)+'</div>'
      +'</div>'
      +'<div class="fc-dash-amount '+ac+'">'+sign+money(d.montant_ttc)+'</div>'
      +'<div style="display:flex;gap:4px">'
      +'<button class="fc-action-btn" title="Modifier" onclick="fcEditDoc(\''+sid+'\')" style="padding:5px 8px">✏️</button>'
      +'<button class="fc-action-btn" title="Supprimer" onclick="comptaDelete(\''+sid+'\')" style="padding:5px 8px;color:#c62828">🗑</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

/* ==============================
   PAGE DEPENSES
============================== */
function initDepenses(){
  var now=new Date();
  if(!_selMonthDep)_selMonthDep=String(now.getMonth()+1).padStart(2,'0');
  if(!_selYearDep)_selYearDep=String(now.getFullYear());
  /* Month bar */
  var mb=$('fcMonthBarDep');
  if(mb&&!mb.children.length){
    mb.innerHTML=MONTHS.map(function(m){
      return '<button class="fc-month-pill'+(m.v===_selMonthDep?' active':'')+'" data-m="'+m.v+'" onclick="fcSelectMonthDep(\''+m.v+'\')">'+m.l+'</button>';
    }).join('');
  }
  /* Year sel */
  var ys=$('fcYearDep');
  if(ys&&!ys.children.length){
    var y=now.getFullYear()+1,arr=[];
    for(var i=y;i>=2022;i--)arr.push(String(i));
    ys.innerHTML=arr.map(function(v){return'<option value="'+v+'">'+v+'</option>'}).join('');
    ys.value=_selYearDep;
  }
  /* Cat bar */
  var cb=$('fcCatBar');
  if(cb&&!cb.children.length){
    cb.innerHTML=CATS_DEP.map(function(c){
      return '<button class="fc-cat-pill'+(c.v===_selCatDep?' active':'')+'" data-c="'+c.v+'" onclick="fcSelectCatDep(\''+c.v+'\')">'+c.l+'</button>';
    }).join('');
  }
}

window.fcSelectMonthDep=function(m){
  _selMonthDep=m;
  var pills=document.querySelectorAll('#fcMonthBarDep .fc-month-pill');
  pills.forEach(function(p){p.classList.toggle('active',p.dataset.m===m)});
  fcRenderDepenses();
};
window.fcSelectCatDep=function(c){
  _selCatDep=c;
  var pills=document.querySelectorAll('#fcCatBar .fc-cat-pill');
  pills.forEach(function(p){p.classList.toggle('active',p.dataset.c===c)});
  fcRenderDepenses();
};
window.fcRenderDepenses=function(){
  var ys=$('fcYearDep'); if(ys)_selYearDep=ys.value;
  var arr=_docs.filter(function(d){
    if(d.type_doc!=='depense')return false;
    if(_selMonthDep&&monthOf(d.date_doc)!==_selMonthDep)return false;
    if(_selYearDep&&_selYearDep!=='all'&&yearOf(d.date_doc)!==_selYearDep)return false;
    if(_selCatDep&&_selCatDep!=='all'&&d.categorie!==_selCatDep)return false;
    return true;
  }).sort(function(a,b){return String(b.date_doc).localeCompare(String(a.date_doc))});
  var total=arr.reduce(function(s,d){return s+(+d.montant_ttc||0)},0);
  if($('fcDepTotal'))$('fcDepTotal').textContent=money(total);
  if($('fcDepCount'))$('fcDepCount').textContent=arr.length+' facture(s)';
  renderDocList('fcDepList', arr, 'dep');
};

/* ==============================
   PAGE RECETTES
============================== */
function initRecettes(){
  var now=new Date();
  if(!_selMonthRec)_selMonthRec=String(now.getMonth()+1).padStart(2,'0');
  if(!_selYearRec)_selYearRec=String(now.getFullYear());
  var mb=$('fcMonthBarRec');
  if(mb&&!mb.children.length){
    mb.innerHTML=MONTHS.map(function(m){
      return '<button class="fc-month-pill'+(m.v===_selMonthRec?' active':'')+'" data-m="'+m.v+'" onclick="fcSelectMonthRec(\''+m.v+'\')">'+m.l+'</button>';
    }).join('');
  }
  var ys=$('fcYearRec');
  if(ys&&!ys.children.length){
    var y=now.getFullYear()+1,arr=[];
    for(var i=y;i>=2022;i--)arr.push(String(i));
    ys.innerHTML=arr.map(function(v){return'<option value="'+v+'">'+v+'</option>'}).join('');
    ys.value=_selYearRec;
  }
}

window.fcSelectMonthRec=function(m){
  _selMonthRec=m;
  var pills=document.querySelectorAll('#fcMonthBarRec .fc-month-pill');
  pills.forEach(function(p){p.classList.toggle('active',p.dataset.m===m)});
  fcRenderRecettes();
};
window.fcRenderRecettes=function(){
  var ys=$('fcYearRec'); if(ys)_selYearRec=ys.value;
  var arr=_docs.filter(function(d){
    if(d.type_doc!=='recette'&&d.type_doc!=='ca_historique'&&d.type_doc!=='liquide_b'&&d.type_doc!=='avoir')return false;
    if(_selMonthRec&&monthOf(d.date_doc)!==_selMonthRec)return false;
    if(_selYearRec&&_selYearRec!=='all'&&yearOf(d.date_doc)!==_selYearRec)return false;
    return true;
  }).sort(function(a,b){return String(b.date_doc).localeCompare(String(a.date_doc))});
  var total=arr.reduce(function(s,d){return s+(+d.montant_ttc||0)},0);
  if($('fcRecTotal'))$('fcRecTotal').textContent=money(total);
  if($('fcRecCount'))$('fcRecCount').textContent=arr.length+' document(s)';
  renderDocList('fcRecList', arr, 'rec');
};

/* ==============================
   RENDU LISTE DOCUMENTS
============================== */
function renderDocList(listId, arr, mode){
  var list=$(listId); if(!list)return;
  if(!arr.length){
    list.innerHTML='<div style="text-align:center;color:#333;padding:32px;font-size:13px">Aucun document pour cette periode.</div>';
    return;
  }
  list.innerHTML=arr.map(function(d){
    var ac=amtClass(d.type_doc);
    var sign=(mode==='rec'?'+':'-');
    var fileHtml='';
    if(d.fichier_url){
      fileHtml='<a class="fc-doc-link" href="'+esc(d.fichier_url)+'" target="_blank">Voir PDF</a>';
    } else if(d.fichier_nom){
      fileHtml='<span style="color:#444;font-size:11px">📎 '+esc(d.fichier_nom)+'</span>';
    }
    var sid=String(d.id).replace(/'/g,'');
    return '<div class="fc-doc-row">'
      +'<div class="fc-doc-left">'
      +'<div class="fc-doc-name">'+esc(d.fournisseur)+'</div>'
      +'<div class="fc-doc-sub">'+esc(d.notes||d.categorie||'')+' \u00b7 '+dayOf(d.date_doc)+'/'+monthOf(d.date_doc)+'</div>'
      +'</div>'
      +'<div class="fc-doc-amount '+ac+'">'+sign+money(d.montant_ttc)+'</div>'
      +'<div class="fc-doc-actions">'
      +fileHtml
      +'<button class="fc-action-btn" title="Modifier" onclick="fcEditDoc(\''+sid+'\')">✏️</button>'
      +'<button class="fc-action-btn" title="Supprimer" onclick="comptaDelete(\''+sid+'\')">🗑</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

/* ==============================
   EDITION
============================== */
window.fcEditDoc=function(id){
  var d=_docs.find(function(x){return String(x.id)===String(id)});
  if(!d)return;
  window.fcShowPage('saisie');
  sv('cDate',d.date_doc); sv('cType',d.type_doc); sv('cFournisseur',d.fournisseur);
  sv('cMontant',String(d.montant_ttc).replace('.',',')); sv('cCategorie',d.categorie);
  sv('cPaiement',d.paiement); sv('cNotes',d.notes);
  var hidden=$('cEditId');
  if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.id='cEditId';
    var f=$('fc-page-saisie');if(f)f.appendChild(hidden);}
  hidden.value=id;
  if(d.fichier_url&&$('cFileName')){
    $('cFileName').innerHTML='<a href="'+esc(d.fichier_url)+'" target="_blank" style="color:#e8c840;font-weight:700">📎 Fichier existant</a> — importez un nouveau pour remplacer';
  }
  toast('\u270f\ufe0f Mode edition — modifie puis clique Enregistrer.');
};

/* ==============================
   UPLOAD FICHIER
============================== */
async function uploadFile(file,row){
  if(!file||!sb())return{url:'',path:''};
  var ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  var safe=(row.date_doc||today())+'/'+(row.type_doc||'doc')+'_'+Date.now()+'_'+Math.random().toString(16).slice(2)+'.'+ext;
  try{
    var up=await sb().storage.from(BUCKET).upload(safe,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
    if(up.error){console.warn('upload error',up.error);return{url:'',path:''}}
    var pub=sb().storage.from(BUCKET).getPublicUrl(safe);
    return{url:(pub&&pub.data&&pub.data.publicUrl)||'',path:safe};
  }catch(e){console.warn(e);return{url:'',path:''}}
}

async function insertSb(row){
  var send=Object.assign({},row); delete send.id; delete send.synced;
  var r=await sb().from(TABLE).insert([send]).select('*').single();
  if(!r.error)return normalize(r.data);
  if(String(r.error.message||'').includes('fichier_')){
    delete send.fichier_url; delete send.fichier_path;
    var r2=await sb().from(TABLE).insert([send]).select('*').single();
    if(!r2.error)return normalize(r2.data);
    throw r2.error;
  }
  throw r.error;
}

async function updateSb(id,payload){
  var send=Object.assign({},payload); delete send.id; delete send.synced;
  var r=await sb().from(TABLE).update(send).eq('id',id).select('*').single();
  if(!r.error)return normalize(r.data);
  throw r.error;
}

/* ==============================
   SAVE
============================== */
async function save(){
  var editId=($('cEditId')||{}).value||'';
  var row=normalize({
    id:editId||uid(),
    date_doc:gv('cDate')||today(),
    type_doc:gv('cType')||'depense',
    fournisseur:gv('cFournisseur')||'A completer',
    categorie:gv('cCategorie')||'general',
    montant_ttc:cleanAmount(gv('cMontant')),
    paiement:gv('cPaiement')||'a_classer',
    notes:gv('cNotes'),
    fichier_nom:_file?_file.name:'',
    statut:'classe',source:_file?'photo':'manuel',created_at:nowIso(),synced:false
  });
  if(!row.montant_ttc&&!row.fichier_nom){toast('\u274c Ajoute au moins un montant ou une photo.');return}
  toast('\u23f3 Enregistrement\u2026');
  if(sb()){
    try{
      if(_file){var fi=await uploadFile(_file,row);row.fichier_url=fi.url;row.fichier_path=fi.path;}
      var saved;
      if(editId&&!editId.startsWith('loc_')){
        saved=await updateSb(editId,row);
        _docs=_docs.map(function(x){return String(x.id)===editId?saved:x});
      } else {
        saved=await insertSb(row);
        if(editId)_docs=_docs.filter(function(x){return String(x.id)!==editId});
        _docs.unshift(saved);
      }
      localSet(_docs); reset(); badge('\u2705 Synchronise','ok');
      toast('\u2705 '+(editId?'Modifie':'Enregistre')+' dans Supabase.');
      renderKpis(); renderChart(); renderDashList();
      setTimeout(function(){window.fcShowPage(row.type_doc==='depense'?'depenses':'recettes');},800);
      return;
    }catch(e){console.warn(e);badge('\u26a0\ufe0f Erreur','err');toast('\u26a0\ufe0f Sauvegarde locale.');}
  }
  if(editId){_docs=_docs.map(function(x){return String(x.id)===editId?normalize(Object.assign({},row,{synced:false})):x});}
  else{row.synced=false;_docs.unshift(row);}
  localSet(_docs); reset(); renderKpis(); renderChart(); renderDashList();
  toast('\u2705 Sauvegarde locale.');
}

/* ==============================
   DELETE
============================== */
async function del(id){
  if(!confirm('Supprimer cette ligne ?'))return;
  var found=_docs.find(function(x){return String(x.id)===String(id)});
  if(sb()&&found&&!String(id).startsWith('loc_')){
    try{await sb().from(TABLE).delete().eq('id',id)}catch(e){console.warn(e)}
    if(found&&found.fichier_path){try{await sb().storage.from(BUCKET).remove([found.fichier_path])}catch(e){}}
  }
  _docs=_docs.filter(function(x){return String(x.id)!==String(id)});
  localSet(_docs); renderKpis(); renderChart(); renderDashList();
  fcRenderDepenses(); fcRenderRecettes();
}

/* ==============================
   RESET
============================== */
function reset(){
  ['cFournisseur','cMontant','cNotes'].forEach(function(i){sv(i,'')});
  sv('cDate',today()); sv('cType','depense'); sv('cCategorie','materiel_fabrication'); sv('cPaiement','a_classer');
  _file=null; if($('cFileName'))$('cFileName').textContent=''; if($('cFile'))$('cFile').value='';
  if($('fcFileCamera'))$('fcFileCamera').value='';
  var h=$('cEditId');if(h)h.value=''; toast('');
  if($('fcAnalyzeRow'))$('fcAnalyzeRow').style.display='none';
}

/* ==============================
   FICHIER + IA
============================== */
window.fcSetFile=function(f){
  if(!f)return; _file=f;
  if($('cFileName'))$('cFileName').innerHTML='📎 '+esc(f.name)+' \u2014 '+Math.round(f.size/1024)+' Ko';
  if($('fcAnalyzeRow'))$('fcAnalyzeRow').style.display='';
  /* Auto-fill par nom */
  var name=(f.name||'').toLowerCase();
  if(name.includes('poste')||name.includes('colissimo')){sv('cFournisseur','La Poste');sv('cCategorie','la_poste');}
  if(name.includes('stripe')){sv('cFournisseur','Stripe');sv('cCategorie','shopify_stripe_paypal');}
  if(name.includes('paypal')){sv('cFournisseur','PayPal');sv('cCategorie','shopify_stripe_paypal');}
  toast('\ud83d\udcf8 Fichier pret. Analysez ou remplissez les champs puis enregistrez.');
};

window.fcTypeChange=function(){
  var t=gv('cType');
  if(t==='liquide_b'){sv('cFournisseur','Liquide B');sv('cCategorie','liquide_b');sv('cPaiement','especes')}
  if(t==='ca_historique'){sv('cFournisseur','CA historique');sv('cCategorie','ca_historique');sv('cPaiement','a_classer')}
  if(t==='recette')sv('cCategorie','vente_boutique');
};

async function fileToDataUrl(file){
  if(!file)throw new Error('Aucun fichier.');
  if(file.type&&file.type.indexOf('image/')===0){
    return await new Promise(function(resolve,reject){
      var img=new Image(),reader=new FileReader();
      reader.onload=function(){img.onload=function(){
        var max=1600,w=img.width,h=img.height;
        if(w>max||h>max){var r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r)}
        var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',0.84));
      };img.onerror=reject;img.src=reader.result};reader.onerror=reject;reader.readAsDataURL(file);
    });
  }
  return await new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(r.result)};r.onerror=reject;r.readAsDataURL(file)});
}

async function analyzeInvoice(){
  if(!_file){toast('\u274c Ajoute d\'abord une photo ou un PDF.');return}
  var btn=$('cAnalyzeBtn');if(btn){btn.disabled=true;btn.textContent='\u23f3 Analyse en cours\u2026'}
  toast('\u23f3 Analyse IA de la facture\u2026');
  try{
    var dataUrl=await fileToDataUrl(_file);
    var r=await fetch('/api/analyse-facture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:_file.name,mime:_file.type,dataUrl:dataUrl})});
    var j=await r.json().catch(function(){return{ok:false}});
    if(!j.ok)throw new Error(j.error||'Analyse impossible');
    var a=j.data||{};
    if(a.date_doc)sv('cDate',a.date_doc);
    if(a.type_doc)sv('cType',a.type_doc);
    if(a.fournisseur)sv('cFournisseur',a.fournisseur);
    if(a.montant_ttc)sv('cMontant',String(a.montant_ttc).replace('.',','));
    if(a.categorie)sv('cCategorie',a.categorie);
    if(a.paiement)sv('cPaiement',a.paiement);
    toast('\u2705 Analyse terminee. Verifiez les champs puis enregistrez.');
  }catch(e){console.warn(e);toast('\u26a0\ufe0f Analyse impossible : '+( e.message||e)+'. Remplissez manuellement.');}
  finally{if(btn){btn.disabled=false;btn.textContent='\u2728 Analyser avec l\'IA'}}
}

/* ==============================
   EXPORTS
============================== */
function csvRows(rows){return rows.map(function(r){return r.map(function(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"'}).join(';')}).join('\n')}
function download(name,content,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:type||'text/plain;charset=utf-8'}));a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500)}
function exportCsv(arr,name){
  var rows=[['date','type','fournisseur','categorie','montant_ttc','paiement','fichier','lien','notes']]
    .concat(arr.map(function(d){return[d.date_doc,d.type_doc,d.fournisseur,d.categorie,d.montant_ttc,d.paiement,d.fichier_nom,d.fichier_url,d.notes]}));
  download(name,'\ufeff'+csvRows(rows),'text/csv;charset=utf-8');
}
window.fcExportFiltered=function(mode){
  var arr=(mode==='depenses')?
    _docs.filter(function(d){return d.type_doc==='depense'&&monthOf(d.date_doc)===_selMonthDep&&yearOf(d.date_doc)===_selYearDep}):
    _docs.filter(function(d){return(d.type_doc==='recette'||d.type_doc==='ca_historique')&&monthOf(d.date_doc)===_selMonthRec&&yearOf(d.date_doc)===_selYearRec});
  exportCsv(arr,'frenchy_'+mode+'_export.csv');
};
function exportMonthCsv(){exportCsv(_docs,'compta_frenchy_complet.csv')}
function exportAllCsv(){exportCsv(_docs,'compta_frenchy_complet.csv')}
function exportJson(){download('backup_compta_frenchy.json',JSON.stringify(_docs,null,2),'application/json;charset=utf-8')}

/* Export fin de mois complet pour comptable */
function exportFinDeMois(){
  var now=new Date();
  var m=_selMonthDep||String(now.getMonth()+1).padStart(2,'0');
  var y=_selYearDep||String(now.getFullYear());
  var MOIS={'01':'Janvier','02':'Fevrier','03':'Mars','04':'Avril','05':'Mai','06':'Juin',
    '07':'Juillet','08':'Aout','09':'Septembre','10':'Octobre','11':'Novembre','12':'Decembre'};
  var moisLbl=MOIS[m]||m;
  var arr=_docs.filter(function(d){return monthOf(d.date_doc)===m&&yearOf(d.date_doc)===y});
  arr.sort(function(a,b){return String(a.date_doc).localeCompare(String(b.date_doc))});
  var dep=0,rec=0,liq=0;
  arr.forEach(function(d){
    if(d.type_doc==='depense') dep+=(+d.montant_ttc||0);
    else if(d.type_doc==='recette'||d.type_doc==='ca_historique') rec+=(+d.montant_ttc||0);
    else if(d.type_doc==='liquide_b') liq+=(+d.montant_ttc||0);
  });
  var res=rec+liq-dep;
  function q(v){return '"'+String(v||'').replace(/"/g,'""')+'"';}
  function qn(n){return '"'+Number(n||0).toFixed(2).replace('.',',')+'"';}
  var lines=[];
  lines.push(q('BILAN COMPTABLE — FRENCHY LEURRES'));
  lines.push(q(moisLbl+' '+y)+';'+q('Genere le '+new Date().toLocaleDateString('fr-FR')));
  lines.push('');
  lines.push([q('Date'),q('Type'),q('Fournisseur / Client'),q('Categorie'),q('Montant TTC (EUR)'),q('Paiement'),q('Justificatif'),q('Notes')].join(';'));
  arr.forEach(function(d){
    lines.push([q(d.date_doc),q(typeLabel(d.type_doc)),q(d.fournisseur),q(d.categorie),qn(d.montant_ttc),q(d.paiement),q(d.fichier_url),q(d.notes)].join(';'));
  });
  lines.push('');
  lines.push([q('TOTAL DEPENSES'),'','','',qn(dep),'','',''].join(';'));
  lines.push([q('TOTAL RECETTES / CA'),'','','',qn(rec),'','',''].join(';'));
  lines.push([q('TOTAL LIQUIDE B'),'','','',qn(liq),'','',''].join(';'));
  lines.push([q('RESULTAT NET'),'','','',qn(res),'','',''].join(';'));
  download('bilan_'+y+'_'+m+'_'+moisLbl+'.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
}

/* ==============================
   EXPORTS GLOBAUX
============================== */
window.comptaLoad=load;
window.comptaSave=save;
window.comptaDelete=del;
window.comptaReset=reset;
window.comptaAnalyzeInvoice=analyzeInvoice;
window.comptaExportMonthCsv=exportMonthCsv;
window.comptaExportAllCsv=exportAllCsv;
window.comptaExportJson=exportJson;
window.comptaExportFinDeMois=exportFinDeMois;

/* ==============================
   DEMARRAGE
============================== */
function start(){
  try{
    if($('cDate')&&!gv('cDate'))sv('cDate',today());
    load();
  }catch(e){console.error('Compta V3 erreur',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
else start();
})();
