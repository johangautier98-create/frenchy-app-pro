// ═══════════════════════════════════════════════════════
// COMPTES PRO — Frenchy Leurres B2B
// ═══════════════════════════════════════════════════════
;(function(){
'use strict';

var SIG_DEFAULT={
  nom:'Mr Gautier Johan',societe:'GAUTIER FISHING \u2013 FRENCHY LEURRES',
  adresse:'8, chemin campagne roque\n13110 Port-de-Bouc',
  tel:'07 83 21 07 58',email:'gautierfishing@gmail.com',
  site:'https://www.frenchyleurres.fr',siret:'48359538500038',tva:'FR 0L483595385'
};

var _pid=null,_pkf=null;
function psb(){return window.db||null;}

// Utilitaires
function gv(id){var e=document.getElementById(id);return e?e.value.trim():'';}
function sv(id,v){var e=document.getElementById(id);if(e)e.value=v||'';}
function se(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function se2(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function show(id){var e=document.getElementById(id);if(e)e.style.display='block';}
function hide(id){var e=document.getElementById(id);if(e)e.style.display='none';}
function pGenPwd(){var c='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';var p='';for(var i=0;i<10;i++)p+=c[Math.floor(Math.random()*c.length)];return p;}
function pToast(msg,bg,col){var t=document.getElementById('pToast');if(!t)return;t.textContent=msg;t.style.background=bg||'#2e7d32';t.style.color=col||'#fff';t.classList.add('pshow');setTimeout(function(){t.classList.remove('pshow');},3200);}
window._pToast=pToast;

// Signature
function getSig(){try{var s=localStorage.getItem('fl_sig');return s?JSON.parse(s):SIG_DEFAULT;}catch(e){return SIG_DEFAULT;}}
function saveSig(){
  var sig={nom:gv('sigNom'),societe:gv('sigSociete'),adresse:gv('sigAdresse'),tel:gv('sigTel'),email:gv('sigEmail'),site:gv('sigSite'),siret:gv('sigSiret'),tva:gv('sigTva')};
  localStorage.setItem('fl_sig',JSON.stringify(sig));
  pToast('\u2705 Signature sauvegard\u00e9e','#2e7d32','#fff');
}
window.pSaveSig=saveSig;
function loadSigForm(){var s=getSig();sv('sigNom',s.nom);sv('sigSociete',s.societe);sv('sigAdresse',s.adresse);sv('sigTel',s.tel);sv('sigEmail',s.email);sv('sigSite',s.site);sv('sigSiret',s.siret);sv('sigTva',s.tva);}
window.loadSigForm=loadSigForm;

// Init
window.addEventListener('load',function(){
  var orig=window.showTab;
  window.showTab=function(n){orig(n);if(n==='comptes-pro'){window.pLoadList();loadSigForm();}};
  var inp=document.getElementById('proKbisInput');
  if(inp)inp.addEventListener('change',function(){var f=this.files[0];if(!f)return;pSelectKbisFile(f);});
  var dz=document.querySelector('.cpro-kbis-inner');
  if(dz){
    ['dragenter','dragover'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.style.borderColor='var(--accent)';});});
    ['dragleave','drop'].forEach(function(ev){dz.addEventListener(ev,function(e){e.preventDefault();dz.style.borderColor='';});});
    dz.addEventListener('drop',function(e){var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)pSelectKbisFile(f);});
  }
});

// Kbis - selection fichier
function pSelectKbisFile(f){
  if(!f)return;
  var name=(f.name||'').toLowerCase();
  if(f.type!=='application/pdf'&&!name.endsWith('.pdf')){pToast('PDF uniquement pour le Kbis','#c62828','#fff');return;}
  _pkf=f;
  var fn=document.getElementById('proFileName');if(fn)fn.textContent='\ud83d\udcc4 '+f.name;
  var st=document.getElementById('proOcrSt');if(st)st.textContent='\u23f3 Analyse automatique en cours...';
  var wrap=document.getElementById('proBarWrap');if(wrap)wrap.style.display='block';
  var fill=document.getElementById('proBarFill');if(fill)fill.style.width='10%';
  setTimeout(function(){window.proLanceAnalyse();},400);
}

// Kbis - analyse PDF
window.proLanceAnalyse=function(){
  if(!_pkf){pToast('S\u00e9lectionne un fichier d\'abord','#c62828','#fff');return;}
  var fill=document.getElementById('proBarFill');
  var wrap=document.getElementById('proBarWrap');
  var st=document.getElementById('proOcrSt');
  if(wrap)wrap.style.display='block';
  if(fill)fill.style.width='20%';
  if(st)st.textContent='Lecture du PDF...';
  if(typeof pdfjsLib==='undefined'){
    if(st)st.textContent='\u274c PDF.js non charg\u00e9';
    pToast('PDF.js non disponible','#c62828','#fff');return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var reader=new FileReader();
  reader.onload=function(e){
    if(fill)fill.style.width='40%';
    pdfjsLib.getDocument({data:e.target.result}).promise.then(function(pdf){
      var allText='';var chain=Promise.resolve();
      for(var i=1;i<=pdf.numPages;i++){
        (function(pn){chain=chain.then(function(){return pdf.getPage(pn).then(function(page){return page.getTextContent().then(function(tc){allText+=tc.items.map(function(x){return x.str;}).join(' ')+' ';});});});})(i);
      }
      chain.then(function(){
        if(fill)fill.style.width='90%';
        if(st)st.textContent='Extraction des donn\u00e9es...';
        pExtract(allText);
        if(fill)fill.style.width='100%';
        if(st)st.textContent='\u2705 Kbis lu — v\u00e9rifiez les champs';
        pToast('\u2705 Kbis analys\u00e9 — v\u00e9rifiez les champs','#e8c840','#000');
        setTimeout(function(){if(wrap)wrap.style.display='none';},2500);
      });
    }).catch(function(err){if(st)st.textContent='\u274c '+err.message;pToast('Erreur PDF : '+err.message,'#c62828','#fff');});
  };
  reader.readAsArrayBuffer(_pkf);
};

// Extraction données Kbis
function pExtract(txt){
  var clean=(txt||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  function fill(id,val,force){if(!val)return;var e=document.getElementById(id);if(e&&(force||!e.value))e.value=String(val).trim().replace(/\s+/g,' ');}
  function capName(v){return String(v||'').toLowerCase().replace(/\b([a-z\u00e0-\u00ff])/g,function(m){return m.toUpperCase();}).trim();}
  var sm=clean.match(/SIRET\s*(?:[:\-])?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})/i)||clean.match(/\b(\d{14})\b/);
  if(sm)fill('proSiret',sm[1].replace(/\D/g,''));
  var nom=clean.match(/(?:NOM COMMERCIAL|ENSEIGNE|DENOMINATION|D\u00c9NOMINATION|RAISON SOCIALE)\s*(?:[:\-])?\s*([A-Z0-9][A-Z0-9 \u00c0-\u00df'&\-.]{2,80}?)(?=\s+(?:FORME|ACTIVIT|ADRESSE|SIREN|SIRET|IMMATRICULATION|RCS|DATE)|$)/i);
  if(nom){var n=nom[1].replace(/\b(RENSEIGNEMENTS|RELATIFS|ACTIVITE|ETABLISSEMENT).*$/i,'').trim();fill('proNom',n);}
  var resp=clean.match(/Nom\s*(?:de naissance)?\s*(?:[:\-])?\s*([A-Z\u00c0-\u00df'\- ]{2,45})\s+Pr[ée]noms?\s*(?:[:\-])?\s*([A-Z\u00c0-\u00df'\- ]{2,80}?)(?=\s+(?:N[ée]|Date|Nationalit|Domicile|Adresse|SIREN|SIRET)|$)/i);
  if(resp)fill('proResponsable',(capName(resp[1])+' '+capName(resp[2])).trim());
  var em=clean.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);if(em)fill('proEmail',em[0].toLowerCase());
  var phone=clean.match(/(?:T[ée]l[ée]phone|Tel|Mobile)\s*(?:[:\-])?\s*((?:\+33|0033|0)\s?[1-9](?:[ .\-]?\d{2}){4})/i)||clean.match(/\b((?:\+33|0033|0)\s?[1-9](?:[ .\-]?\d{2}){4})\b/);
  if(phone)fill('proTel',phone[1].replace(/(?:\+33|0033)\s?/,'0').replace(/[^0-9]/g,'').replace(/(\d{2})(?=\d)/g,'$1 ').trim());
  var adr=clean.match(/Adresse\s+de\s+l['']?[ée]tablissement\s*(?:[:\-])?\s*(.+?)(?=\s+(?:Activit[ée]|SIRET|SIREN|RCS|Date)|$)/i);
  if(adr)fill('proAdresse',adr[1].replace(/\bRENSEIGNEMENTS\b.*$/i,'').trim());
  var tvm=clean.match(/FR\s*[A-Z0-9]{2}\s*\d{9}/i);if(tvm)fill('proTva',tvm[0].replace(/\s/g,''),true);
}

// Email HTML
function buildEmailHtml(nom,prenom,login,pwd,notes){
  var condBlock=notes?('<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f8f0;border:1px solid #c8e6c9;border-radius:8px;margin-bottom:24px;"><tr><td style="padding:16px 20px;"><div style="font-size:11px;font-weight:900;color:#2e7d32;text-transform:uppercase;margin-bottom:8px;">\u2705 Vos conditions commerciales</div><p style="color:#1a5e20;font-size:13px;line-height:1.6;margin:0;">'+notes.replace(/&/g,'&amp;').replace(/\n/g,'<br>')+'</p></td></tr></table>'):'';
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>'
    +'<body style="margin:0;padding:0;background:#f4f4f0;font-family:Helvetica Neue,Arial,sans-serif;">'
    +'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:32px 16px;"><tr><td align="center">'
    +'<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">'
    +'<tr><td style="background:#1a1a1a;padding:32px 40px;text-align:center;"><div style="font-size:40px;margin-bottom:10px;">\ud83c\udfa3</div><div style="color:#e8c840;font-size:22px;font-weight:900;letter-spacing:1px;">FRENCHY LEURRES</div><div style="color:#666;font-size:12px;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Leurres artisanaux \u2014 Port-de-Bouc</div></td></tr>'
    +'<tr><td style="background:#e8c840;padding:10px 40px;text-align:center;"><div style="color:#1a1a1a;font-size:12px;font-weight:900;">\u2705 VOTRE COMPTE PROFESSIONNEL EST CR\u00c9\u00c9</div></td></tr>'
    +'<tr><td style="padding:32px 40px;">'
    +'<p style="color:#1a1a1a;font-size:16px;line-height:1.6;margin:0 0 18px;">Bonjour <strong>'+prenom+'</strong>,</p>'
    +'<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 28px;">Nous avons le plaisir de vous confirmer l\'ouverture de votre compte professionnel <strong>Frenchy Leurres</strong>. Votre compte est actuellement <strong>en cours de validation</strong>.</p>'
    +'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f4;border:2px solid #e8c840;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;">'
    +'<div style="font-size:10px;font-weight:900;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">Vos identifiants de connexion</div>'
    +'<table width="100%" cellpadding="0" cellspacing="0">'
    +'<tr><td style="padding:8px 0;border-bottom:1px solid #e8e6e0;"><span style="color:#888;font-size:13px;">Enseigne</span></td><td style="padding:8px 0;border-bottom:1px solid #e8e6e0;text-align:right;"><strong style="color:#1a1a1a;font-size:14px;">'+nom+'</strong></td></tr>'
    +'<tr><td style="padding:8px 0;border-bottom:1px solid #e8e6e0;"><span style="color:#888;font-size:13px;">Identifiant</span></td><td style="padding:8px 0;border-bottom:1px solid #e8e6e0;text-align:right;"><strong style="color:#1a1a1a;font-size:13px;">'+login+'</strong></td></tr>'
    +'<tr><td style="padding:10px 0;"><span style="color:#888;font-size:13px;">Mot de passe</span></td><td style="padding:10px 0;text-align:right;"><strong style="color:#e8c840;font-size:17px;font-family:monospace;background:#1a1a1a;padding:5px 12px;border-radius:6px;">'+pwd+'</strong></td></tr>'
    +'</table></td></tr></table>'
    +'<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td align="center"><a href="https://www.frenchyleurres.fr/account/login" style="display:inline-block;background:#1a1a1a;color:#e8c840;font-size:15px;font-weight:900;padding:15px 40px;border-radius:10px;text-decoration:none;">\ud83d\udd10 Acc\u00e9der \u00e0 mon compte</a></td></tr></table>'
    +'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-left:4px solid #e8c840;border-radius:0 8px 8px 0;margin-bottom:24px;"><tr><td style="padding:16px 20px;">'
    +'<div style="font-size:12px;font-weight:900;color:#7a5800;margin-bottom:8px;">\ud83d\udccb PROCHAINE \u00c9TAPE \u2014 MANDAT SEPA</div>'
    +'<p style="color:#7a5800;font-size:13px;line-height:1.6;margin:0;">Pour activer le <strong>paiement diff\u00e9r\u00e9</strong>, vous allez recevoir un email de notre partenaire <strong>Stripe</strong> vous demandant de signer un mandat SEPA.<br><br>\u26a0\ufe0f <strong>Merci de signer ce mandat d\u00e8s r\u00e9ception.</strong></p>'
    +'</td></tr></table>'
    +condBlock
    +'<p style="color:#888;font-size:13px;line-height:1.6;margin:0;">Une fois valid\u00e9, vos <strong>tarifs professionnels</strong> seront visibles automatiquement.</p>'
    +'</td></tr>'
    +'<tr><td style="background:#f8f8f4;border-top:1px solid #e8e6e0;padding:24px 40px;">'
    +'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    +'<td><div style="font-size:14px;font-weight:900;color:#1a1a1a;margin-bottom:3px;">Mr Gautier Johan</div>'
    +'<div style="font-size:12px;color:#555;margin-bottom:8px;">GAUTIER FISHING \u2014 FRENCHY LEURRES</div>'
    +'<div style="font-size:12px;color:#888;line-height:1.8;">\ud83d\udccd 8, chemin campagne roque \u2014 13110 Port-de-Bouc<br>\ud83d\udcde 07 83 21 07 58<br>\u2709 gautierfishing@gmail.com<br>\ud83c\udf10 www.frenchyleurres.fr<br>SIRET : 48359538500038</div></td>'
    +'<td align="right" valign="top" style="font-size:36px;">\ud83c\udfa3</td>'
    +'</tr></table></td></tr>'
    +'<tr><td style="background:#1a1a1a;padding:14px 40px;text-align:center;"><div style="color:#555;font-size:11px;">Frenchy Leurres \u00b7 Port-de-Bouc \u00b7 <span style="color:#e8c840;">frenchyleurres.fr</span></div></td></tr>'
    +'</table></td></tr></table></body></html>';
}

window.pGenEmail=function(){
  var nom=gv('proNom'),email=gv('proEmail'),resp=gv('proResponsable'),notes=gv('proNotes');
  var login=gv('proLoginId')||email,pwd=gv('proLoginPass')||pGenPwd();
  if(!email){pToast('Email du client manquant','#c62828','#fff');return;}
  if(!login)login=email;
  if(!pwd)pwd=pGenPwd();
  // Sauvegarder le mdp généré dans le champ
  if(!gv('proLoginPass'))sv('proLoginPass',pwd);
  var prenom=resp?resp.split(' ')[0]:(nom?nom.split(' ')[0]:'');
  var htmlContent=buildEmailHtml(nom,prenom,login,pwd,notes);
  window._pEmailHtml=htmlContent;window._pEmailTo=email;
  window._pEmailSubject='Vos identifiants de connexion Frenchy Leurres \u2705';
  var modal=document.getElementById('modalEmail');
  if(modal){
    var meta=document.getElementById('emailModalMeta');
    if(meta)meta.textContent='\u00c0 : '+email+'   \u2022   Login : '+login+'   \u2022   MDP : '+pwd;
    var frame=document.getElementById('emailPreviewFrame');if(frame)frame.srcdoc=htmlContent;
    modal.style.display='';
  }
};
window.pCopyEmailHtml=function(){
  if(!window._pEmailHtml){pToast('G\u00e9n\u00e8re d\'abord un email','#c62828','#fff');return;}
  try{
    var blob=new Blob([window._pEmailHtml],{type:'text/html'});
    var item=new ClipboardItem({'text/html':blob});
    navigator.clipboard.write([item]).then(function(){pToast('\ud83d\udccb Email copi\u00e9 ! Ouvre Gmail \u2192 Nouveau message \u2192 Colle (Ctrl+V)','#2e7d32','#fff');});
  }catch(e){navigator.clipboard.writeText(window._pEmailHtml).then(function(){pToast('\ud83d\udccb HTML copi\u00e9 !','#2e7d32','#fff');});}
};
window.pOpenGmail=function(){
  if(!window._pEmailTo){pToast('G\u00e9n\u00e8re d\'abord un email','#c62828','#fff');return;}
  window.open('https://mail.google.com/mail/?view=cm&to='+encodeURIComponent(window._pEmailTo)+'&su='+encodeURIComponent(window._pEmailSubject||'Frenchy Leurres'),'_blank');
};
window.pCopyEmail=window.pCopyEmailHtml;

// Shopify
window.pOpenShopify=function(){
  var nom=gv('proNom'),email=gv('proEmail'),tel=gv('proTel'),siret=gv('proSiret'),adresse=gv('proAdresse');
  var type=gv('proTypeSelect')||'pro',notes=gv('proNotes');
  if(!nom){alert('S\u00e9lectionne un compte pro dans la liste d\'abord.');return;}
  var tags='pro, valide, frenchy-leurres';
  if(type==='cabesto')tags='pro, valide, cabesto, grand-compte, frenchy-leurres';
  if(type==='vip')tags='pro, valide, vip, frenchy-leurres';
  var lines=['Nom / Enseigne : '+nom];
  if(email)lines.push('Email          : '+email);
  if(tel)lines.push('T\u00e9l\u00e9phone      : '+tel);
  if(adresse)lines.push('Adresse        : '+adresse);
  if(siret)lines.push('SIRET          : '+siret);
  lines.push('','Tags Shopify   : '+tags,'','\u2192 Tags \u00e0 coller dans Shopify : '+tags,'\u2192 Cocher "Exempt\u00e9 de taxes" si pro HT');
  if(notes)lines.push('','Notes : '+notes);
  window._shopifyInfoText=lines.join('\n');
  var el=document.getElementById('shopifyClientInfo');if(el)el.textContent=window._shopifyInfoText;
  var modal=document.getElementById('modalShopify');if(modal)modal.style.display='';
};
window.pCopyShopifyInfo=function(){
  if(!window._shopifyInfoText)return;
  navigator.clipboard.writeText(window._shopifyInfoText).then(function(){pToast('\ud83d\udccb Infos copi\u00e9es ! Ouvre Shopify et cr\u00e9e le client.','#2e7d32','#fff');});
};

// Accordéons
window.cproToggle=function(id){
  var acc=document.getElementById(id);if(!acc)return;
  var body=acc.querySelector('.cpro-acc-body'),header=acc.querySelector('.cpro-acc-header'),arrow=acc.querySelector('.cpro-acc-arrow');
  if(!body)return;
  var isOpen=body.style.display!=='none';
  body.style.display=isOpen?'none':'';
  if(header)header.classList.toggle('open',!isOpen);
  if(arrow)arrow.textContent=isOpen?'\u25bc':'\u25b2';
};

// ═══════════════════════════════════════════════════════
// GESTION COMPTES PRO — Supabase + secours local
// ═══════════════════════════════════════════════════════
var PRO_LOCAL_KEY='fl_pro_clients_cache_v32';
var _proCacheV32=[];
var _pid=null;
function proUid(){return'local_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);}
function proGetLocal(){try{return JSON.parse(localStorage.getItem(PRO_LOCAL_KEY)||'[]')||[];}catch(e){return[];}}
function proSetLocal(a){try{localStorage.setItem(PRO_LOCAL_KEY,JSON.stringify(a||[]));}catch(e){}}
function proMirror(a){if(Array.isArray(a)){_proCacheV32=a;proSetLocal(a);}}
function proConn(txt,ok){var el=document.getElementById('proSupabaseStatus');if(!el)return;el.textContent=txt;el.style.color=ok?'#82f39a':'#ffd93b';}
function pLblS(s){return{en_attente:'\u23f3 Attente',valide:'\u2705 Valid\u00e9',refuse:'\u274c Refus\u00e9'}[s]||s;}

function proStats(a){
  a=a||[];
  se('proStatTotal',a.length);
  se('proStatAttente',a.filter(function(x){return x.statut==='en_attente';}).length);
  se('proStatValide',a.filter(function(x){return x.statut==='valide';}).length);
  se('proStatShopify',a.filter(function(x){return x.shopify_customer_id;}).length);
}

function proToolbar(){
  var list=document.getElementById('proList');if(!list)return;
  if(document.getElementById('proSupabaseStatus'))return;
  var panel=list.closest('.cpro-card');if(!panel)return;
  var box=document.createElement('div');
  box.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px';
  box.innerHTML='<div id="proSupabaseStatus" style="font-size:11px;border:1px solid rgba(255,217,59,.35);border-radius:999px;padding:5px 9px;background:rgba(255,217,59,.12);color:#ffd93b">\u23f3 Connexion...</div>'
    +'<div style="display:flex;gap:6px;">'
    +'<button type="button" class="cpro-btn cpro-ghost" style="padding:5px 9px;font-size:11px" onclick="pLoadList(true)">\ud83d\udd04 Recharger</button>'
    +'<button type="button" class="cpro-btn cpro-gold" style="padding:5px 9px;font-size:11px" onclick="pExportClients()">\ud83d\udce4 Export</button>'
    +'</div>';
  panel.insertBefore(box,list);
}

function proRender(data,msg){
  proToolbar();
  var list=document.getElementById('proList');if(!list)return;
  data=data||[];
  var f=document.getElementById('proFilterStatut');var fval=f?f.value:'';
  var rows=data.filter(function(c){return !fval||c.statut===fval;});
  if(!rows.length){list.innerHTML='<div style="text-align:center;padding:24px;color:#777">'+(msg?'\u26a0\ufe0f '+msg:'Aucun compte pro')+'</div>';proStats(data);return;}
  list.innerHTML=rows.map(function(c){
    var sel=(_pid===c.id)?' pro-sel':'';
    return '<div class="pro-card'+sel+'" data-cid="'+String(c.id||'').replace(/"/g,'&quot;')+'">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
      +'<div style="min-width:0"><div style="font-weight:800;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(c.nom_magasin||'\u2014')+'</div>'
      +'<div style="font-size:12px;color:var(--muted);margin-top:2px">'+(c.email||'')+(c.siret?' \u00b7 '+c.siret:'')+'</div></div>'
      +'<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">'
      +'<span class="pro-bdg pb-'+(c.statut||'en_attente')+'">'+pLblS(c.statut)+'</span>'
      +'<span class="pro-bdg pb-'+(c.type_client||'pro')+'">'+(c.type_client||'pro')+'</span>'
      +'<button type="button" class="pro-mini-del" onclick="event.stopPropagation();pDeleteClient(\''+String(c.id).replace(/'/g,'\\\'')+'\')">\ud83d\uddd1</button>'
      +'</div></div>'
      +(c.shopify_customer_id?'<div style="font-size:11px;color:#00c896;margin-top:4px;">\u2713 Shopify #'+c.shopify_customer_id+'</div>':'')
      +'</div>';
  }).join('');
  list.querySelectorAll('.pro-card').forEach(function(el){el.addEventListener('click',function(){window._pSel(this.getAttribute('data-cid'));});});
  proStats(data);
}

window.pLoadList=function(force){
  proToolbar();
  var s=psb();var local=proGetLocal();
  if(!s){proConn('\u26a0\ufe0f Supabase non charg\u00e9 \u2014 mode local',false);_proCacheV32=local;proRender(local);return;}
  proConn('\u23f3 Connexion Supabase...',false);
  s.from('pro_clients').select('*').order('created_at',{ascending:false}).then(function(r){
    if(r.error){proConn('\u26a0\ufe0f Erreur : '+r.error.message,false);_proCacheV32=local;proRender(local,r.error.message);return;}
    var data=r.data||[];proMirror(data);proConn('\u2705 Supabase connect\u00e9',true);proRender(data);
    try{window._supabaseClients=data;if(typeof window.buildClientDropdowns==='function')window.buildClientDropdowns();}catch(e){}
  }).catch(function(err){proConn('\u26a0\ufe0f Inaccessible \u2014 mode local',false);_proCacheV32=local;proRender(local,err.message);});
};

window._pSel=function(id){
  function fill(c){
    if(!c)return;_pid=id;
    sv('proEditId',c.id);sv('proNom',c.nom_magasin);sv('proResponsable',c.nom_responsable);
    sv('proEmail',c.email);sv('proLoginId',c.email||'');sv('proLoginPass','');
    sv('proTel',c.telephone);sv('proSiret',c.siret);sv('proAdresse',c.adresse);
    sv('proTva',c.tva);sv('proNotes',c.notes);
    var st=document.getElementById('proStatutSelect');if(st)st.value=c.statut||'en_attente';
    var ty=document.getElementById('proTypeSelect');if(ty)ty.value=c.type_client||'pro';
    se2('proFormTitle','\u270f\ufe0f '+(c.nom_magasin||'Compte pro'));
    show('proResetBtn');show('proActPanel');se2('proActTitle','Actions \u2014 '+(c.nom_magasin||''));
    hide('proEmailPanel');
    proRender(_proCacheV32.length?_proCacheV32:proGetLocal());
  }
  var local=(_proCacheV32.concat(proGetLocal())).find(function(x){return String(x.id)===String(id);});
  var s=psb();
  if(!s||String(id).startsWith('local_')){fill(local);return;}
  s.from('pro_clients').select('*').eq('id',id).single().then(function(r){fill((r&&!r.error&&r.data)?r.data:local);}).catch(function(){fill(local);});
};

window.pSaveClient=function(){
  var nom=gv('proNom'),email=gv('proEmail');
  if(!nom||!email){pToast('Nom et email obligatoires','#c62828','#fff');return;}
  var payload={nom_magasin:nom,nom_responsable:gv('proResponsable'),email:email,
    telephone:gv('proTel'),siret:gv('proSiret'),adresse:gv('proAdresse'),tva:gv('proTva'),
    type_client:gv('proTypeSelect')||'pro',statut:gv('proStatutSelect')||'en_attente',notes:gv('proNotes')};
  var eid=gv('proEditId');var s=psb();
  function saveLocal(msg){
    var arr=proGetLocal();
    if(eid){arr=arr.map(function(c){if(String(c.id)===String(eid))return Object.assign({},c,payload,{id:eid});return c;});}
    else{eid=proUid();arr.unshift(Object.assign({},payload,{id:eid,created_at:new Date().toISOString()}));}
    proMirror(arr);proRender(arr);pToast(msg||'\u2705 Sauvegard\u00e9 en local','#ffd93b','#000');
  }
  if(!s){saveLocal('\u2705 Sauvegard\u00e9 en local (Supabase non connect\u00e9)');return;}
  var q=(eid&&!String(eid).startsWith('local_'))?s.from('pro_clients').update(payload).eq('id',eid).select():s.from('pro_clients').insert([payload]).select();
  q.then(function(r){
    if(r.error){saveLocal('\u26a0\ufe0f Supabase refus\u00e9 : '+r.error.message);return;}
    var saved=(r.data&&r.data[0])||null;var wasNew=!eid;
    if(saved){_pid=saved.id;sv('proEditId',saved.id);}
    pToast(wasNew?'\u2705 Compte cr\u00e9\u00e9 !':'\u2705 Mis \u00e0 jour !','#2e7d32','#fff');
    window.pLoadList(true);
    if(wasNew)setTimeout(function(){window.pGenEmail();},600);
    if(wasNew)setTimeout(function(){window.pGenEmail();},600);
  }).catch(function(err){saveLocal('\u26a0\ufe0f Supabase inaccessible : '+err.message);});
};

window.pMarkValide=function(){
  var id=_pid||gv('proEditId');if(!id)return;var s=psb();
  function loc(){var arr=proGetLocal().map(function(c){if(String(c.id)===String(id))c.statut='valide';return c;});proMirror(arr);var st=document.getElementById('proStatutSelect');if(st)st.value='valide';proRender(arr);pToast('\u2705 Valid\u00e9','#2e7d32','#fff');}
  if(!s||String(id).startsWith('local_')){loc();return;}
  s.from('pro_clients').update({statut:'valide'}).eq('id',id).select().then(function(r){if(r.error){loc();return;}var st=document.getElementById('proStatutSelect');if(st)st.value='valide';pToast('\u2705 Valid\u00e9 dans Supabase','#2e7d32','#fff');window.pLoadList(true);}).catch(loc);
};

window.pDeleteClient=function(forceId){
  var id=forceId||_pid||gv('proEditId');if(!id){pToast('S\u00e9lectionne d\'abord un compte','#c62828','#fff');return;}
  var found=(_proCacheV32.concat(proGetLocal())).find(function(x){return String(x.id)===String(id);});
  var nom=(found&&found.nom_magasin)||'ce compte';
  if(!confirm('Supprimer uniquement : '+nom+' ?'))return;
  var s=psb();
  function delLocal(){var arr=proGetLocal().filter(function(c){return String(c.id)!==String(id);});proMirror(arr);pToast('\u2705 Supprim\u00e9 : '+nom,'#555','#fff');if(String(id)===String(_pid)){window.pResetForm();}else{proRender(arr);}}
  if(!s||String(id).startsWith('local_')){delLocal();return;}
  s.from('pro_clients').delete().eq('id',id).select('id').then(function(r){if(r.error){pToast('Erreur : '+r.error.message,'#c62828','#fff');return;}delLocal();window.pLoadList(true);}).catch(function(err){pToast('Erreur : '+(err.message||err),'#c62828','#fff');});
};

window.pEditMode=function(){var e=document.getElementById('proNom');if(e)e.focus();};

window.pResetForm=function(){
  ['proEditId','proNom','proResponsable','proEmail','proLoginId','proLoginPass','proTel','proSiret','proAdresse','proTva','proNotes']
    .forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  var st=document.getElementById('proStatutSelect');if(st)st.value='en_attente';
  var ty=document.getElementById('proTypeSelect');if(ty)ty.value='pro';
  se2('proFormTitle','\u2795 Nouveau compte pro');
  hide('proResetBtn');hide('proActPanel');hide('proEmailPanel');
  _pid=null;window.pLoadList();
};

window.pExportClients=function(){
  var data=_proCacheV32.length?_proCacheV32:proGetLocal();
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);var a=document.createElement('a');
  a.href=url;a.download='frenchy_comptes_pro_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  pToast('\ud83d\udce4 Export t\u00e9l\u00e9charg\u00e9','#ffd93b','#000');
};

window.pGenEmail=window.pGenEmail;// already defined above

window.pToggleFactu = function(nom){
  if(!nom) return;
  var inactive = window._inactiveClients || [];
  var idx = inactive.indexOf(nom);
  var msg;
  if(idx === -1){
    inactive.push(nom);
    msg = nom + ' retiré des dropdowns Facturation';
  } else {
    inactive.splice(idx, 1);
    msg = nom + ' réactivé dans les dropdowns Facturation';
  }
  window._inactiveClients = inactive;
  try{ localStorage.setItem('fl_inactive_clients', JSON.stringify(inactive)); }catch(e){}
  if(typeof window.buildClientDropdowns === 'function') window.buildClientDropdowns();
  pToast('⚙️ ' + msg, '#1565c0', '#fff');
};

window.proFilterList = function(){
  var q = (document.getElementById('proSearch')||{value:''}).value.toLowerCase();
  var fval = (document.getElementById('proFilterStatut')||{value:''}).value;
  var data = _proCacheV32.length ? _proCacheV32 : proGetLocal();
  var filtered = data.filter(function(c){
    if(fval && c.statut!==fval) return false;
    if(q){
      var s = [c.nom_magasin||'',c.email||'',c.telephone||'',c.siret||''].join(' ').toLowerCase();
      if(!s.includes(q)) return false;
    }
    return true;
  });
  proRender(filtered);
};

})();
