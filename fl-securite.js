// Connexion obligatoire + sauvegarde continue de toute la base sur le PC.
;(function(){
  'use strict';
  var db = window.db;
  var FL_TABLES = ['factures','pro_clients','products','compta_documents','scheduled_payments','orders','order_items','magasins'];
  var STORAGE_KEY = 'sb-qdpkeftzdgguwfywtprz-auth-token';

  function el(tag, css, html){ var e = document.createElement(tag); if(css) e.style.cssText = css; if(html != null) e.innerHTML = html; return e; }
  function txt(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function translateError(e){
    var m = String((e && (e.message || e.error_description || e.msg)) || e || '');
    if(/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if(/email not confirmed/i.test(m)) return 'Ton adresse n’est pas encore confirmée : clique sur le lien reçu par email (regarde aussi dans les spams).';
    if(/already registered|already been registered|user already exists/i.test(m)) return 'Ce compte existe déjà : connecte-toi, ou clique sur « Mot de passe oublié ».';
    if(/signups? not allowed|signup.*disabled/i.test(m)) return 'La création de compte est fermée. Connecte-toi avec ton compte existant.';
    if(/rate limit|only request this after|too many/i.test(m)) return 'Trop de demandes d’affilée. Attends quelques minutes puis réessaie.';
    if(/password.*(short|least|weak)/i.test(m)) return 'Mot de passe trop faible : au moins 10 caractères.';
    if(/failed to fetch|network/i.test(m)) return 'Pas de connexion internet.';
    return m || 'Erreur inconnue.';
  }

  function hasStoredSession(){
    try { var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return !!(s && (s.user || (s.currentSession && s.currentSession.user))); } catch(e){ return false; }
  }

  // ───────────────────────── ÉCRAN DE CONNEXION ─────────────────────────
  var overlay = null;
  function showOverlay(inner){
    if(!overlay){
      overlay = el('div', 'position:fixed;inset:0;z-index:2147483646;background:linear-gradient(160deg,#0d1b2a,#1b263b);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;font-family:Arial,Helvetica,sans-serif;');
      overlay.id = 'fl-auth-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    var card = el('div', 'width:100%;max-width:400px;background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.45);color:#111;');
    card.innerHTML = '<div style="text-align:center;margin-bottom:18px;"><img src="logo-app.png" alt="" style="width:84px;height:84px;object-fit:contain;border-radius:18px;"><div style="font-size:20px;font-weight:900;margin-top:10px;">Frenchy Leurres — Application Pro</div><div style="font-size:12px;color:#666;margin-top:4px;">🔒 Accès réservé</div></div>';
    card.appendChild(inner);
    overlay.appendChild(card);
  }

  var INPUT_CSS = 'width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #cfd8dc;border-radius:10px;font-size:15px;margin:6px 0 12px;';
  var BTN_CSS = 'width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;';
  var LINK_CSS = 'background:none;border:none;color:#1565c0;font-size:13px;font-weight:700;cursor:pointer;padding:6px 0;text-decoration:underline;';

  function msgBox(){ return el('div', 'font-size:13px;line-height:1.5;margin:4px 0 12px;min-height:0;'); }
  function setMsg(box, text, ok){ box.style.color = ok ? '#2e7d32' : '#c62828'; box.textContent = text || ''; }

  function loginForm(){
    var wrap = el('div');
    wrap.innerHTML =
      '<div style="font-size:16px;font-weight:800;margin-bottom:8px;">Connexion</div>' +
      '<label style="font-size:12px;font-weight:700;color:#444;">Adresse email</label>' +
      '<input id="fl-auth-email" type="email" autocomplete="username" style="' + INPUT_CSS + '">' +
      '<label style="font-size:12px;font-weight:700;color:#444;">Mot de passe</label>' +
      '<input id="fl-auth-pass" type="password" autocomplete="current-password" style="' + INPUT_CSS + '">';
    var box = msgBox();
    var go = el('button', BTN_CSS + 'background:#1565c0;color:#fff;', 'Se connecter');
    go.type = 'button';
    wrap.appendChild(box);
    wrap.appendChild(go);
    var links = el('div', 'display:flex;justify-content:flex-end;gap:10px;margin-top:12px;flex-wrap:wrap;');
    var l2 = el('button', LINK_CSS, 'Mot de passe oublié ?');
    l2.type = 'button';
    links.appendChild(l2);
    wrap.appendChild(links);

    l2.onclick = function(){ showOverlay(resetForm()); };

    async function submit(){
      var email = (document.getElementById('fl-auth-email').value || '').trim().toLowerCase();
      var pass = document.getElementById('fl-auth-pass').value || '';
      if(!email || !pass){ setMsg(box, 'Remplis l’email et le mot de passe.'); return; }
      go.disabled = true; go.style.opacity = '.6'; setMsg(box, 'Un instant…', true);
      try{
        var si = await db.auth.signInWithPassword({ email: email, password: pass });
        if(si.error) throw si.error;
        await afterLogin();
        return;
      }catch(e){ setMsg(box, translateError(e)); }
      go.disabled = false; go.style.opacity = '1';
    }
    go.onclick = submit;
    wrap.addEventListener('keydown', function(ev){ if(ev.key === 'Enter') submit(); });
    setTimeout(function(){ var f = document.getElementById('fl-auth-email'); if(f) f.focus(); }, 50);
    return wrap;
  }

  function resetForm(){
    var wrap = el('div');
    wrap.innerHTML = '<div style="font-size:16px;font-weight:800;margin-bottom:8px;">Mot de passe oublié</div>' +
      '<div style="font-size:13px;color:#555;margin-bottom:8px;">Tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe.</div>' +
      '<label style="font-size:12px;font-weight:700;color:#444;">Adresse email</label>' +
      '<input id="fl-auth-email" type="email" autocomplete="username" style="' + INPUT_CSS + '">';
    var box = msgBox();
    var go = el('button', BTN_CSS + 'background:#1565c0;color:#fff;', 'Envoyer le lien');
    var back = el('button', LINK_CSS + 'margin-top:12px;', '← Retour à la connexion');
    go.type = back.type = 'button';
    wrap.appendChild(box); wrap.appendChild(go); wrap.appendChild(back);
    back.onclick = function(){ showOverlay(loginForm()); };
    go.onclick = async function(){
      var email = (document.getElementById('fl-auth-email').value || '').trim().toLowerCase();
      if(!email){ setMsg(box, 'Indique ton adresse email.'); return; }
      go.disabled = true;
      try{
        var r = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
        if(r.error) throw r.error;
        setMsg(box, '✅ Si un accès existe pour cette adresse, un email vient d’être envoyé. Clique sur le lien, puis choisis ton nouveau mot de passe.', true);
      }catch(e){ setMsg(box, translateError(e)); }
      go.disabled = false;
    };
    return wrap;
  }

  function newPasswordForm(){
    var wrap = el('div');
    wrap.innerHTML = '<div style="font-size:16px;font-weight:800;margin-bottom:8px;">Choisis ton nouveau mot de passe</div>' +
      '<label style="font-size:12px;font-weight:700;color:#444;">Nouveau mot de passe (au moins 10 caractères)</label>' +
      '<input id="fl-auth-pass" type="password" autocomplete="new-password" style="' + INPUT_CSS + '">' +
      '<label style="font-size:12px;font-weight:700;color:#444;">Retape-le</label>' +
      '<input id="fl-auth-pass2" type="password" autocomplete="new-password" style="' + INPUT_CSS + '">';
    var box = msgBox();
    var go = el('button', BTN_CSS + 'background:#2e7d32;color:#fff;', 'Enregistrer le mot de passe');
    go.type = 'button';
    wrap.appendChild(box); wrap.appendChild(go);
    go.onclick = async function(){
      var p1 = document.getElementById('fl-auth-pass').value || '';
      var p2 = document.getElementById('fl-auth-pass2').value || '';
      if(p1.length < 10){ setMsg(box, 'Au moins 10 caractères.'); return; }
      if(p1 !== p2){ setMsg(box, 'Les deux mots de passe ne sont pas identiques.'); return; }
      go.disabled = true;
      try{
        var r = await db.auth.updateUser({ password: p1 });
        if(r.error) throw r.error;
        setMsg(box, '✅ Mot de passe enregistré.', true);
        setTimeout(function(){ location.replace(location.origin + '/'); }, 900);
      }catch(e){ setMsg(box, translateError(e)); go.disabled = false; }
    };
    return wrap;
  }

  function deniedScreen(email){
    var wrap = el('div');
    wrap.innerHTML = '<div style="font-size:16px;font-weight:800;color:#c62828;margin-bottom:8px;">Accès refusé</div>' +
      '<div style="font-size:14px;line-height:1.5;margin-bottom:14px;">Le compte <b>' + txt(email) + '</b> n’a pas accès à cette application.</div>';
    var out = el('button', BTN_CSS + 'background:#455a64;color:#fff;', 'Se déconnecter');
    out.type = 'button';
    out.onclick = signOut;
    wrap.appendChild(out);
    return wrap;
  }

  async function afterLogin(){
    try{
      var h = await flGetFolder();
      if(h && (await h.queryPermission({mode:'readwrite'})) !== 'granted') await h.requestPermission({mode:'readwrite'});
    }catch(e){}
    location.replace(location.origin + '/');
  }

  async function signOut(){
    try{ await db.auth.signOut(); }catch(e){}
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    location.replace(location.origin + '/');
  }
  window.flSignOut = signOut;

  function unlock(session){
    document.documentElement.classList.add('fl-ok');
    if(overlay){ overlay.remove(); overlay = null; }
    addAccountBox(session && session.user ? session.user.email : '');
    addBackupBadge();
    setTimeout(function(){ flScheduleLocalBackup(0); }, 4000);
    setInterval(function(){ flScheduleLocalBackup(0); }, 10 * 60 * 1000);
    if(session && navigator.onLine){
      db.rpc('fl_is_owner').then(function(r){
        if(!r.error && r.data === false){ document.documentElement.classList.remove('fl-ok'); showOverlay(deniedScreen(session.user.email)); }
      }, function(){});
    }
  }

  function addAccountBox(email){
    var bottom = document.querySelector('#nav-tabs .sidebar-bottom');
    if(!bottom || document.getElementById('fl-account-box')) return;
    var box = el('div', 'padding:8px 12px 4px;border-top:1px solid rgba(255,255,255,.08);margin-top:6px;');
    box.id = 'fl-account-box';
    box.innerHTML = '<div style="font-size:10px;color:#9aa5b1;word-break:break-all;margin-bottom:6px;">🔒 ' + txt(email || 'Connecté') + '</div>';
    var out = el('button', 'width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#cfd8dc;font-size:12px;font-weight:700;cursor:pointer;', 'Se déconnecter');
    out.type = 'button';
    out.onclick = function(){ if(confirm('Se déconnecter de l’application ?')) signOut(); };
    box.appendChild(out);
    bottom.appendChild(box);
  }

  // ───────────────────────── SAUVEGARDE CONTINUE SUR LE PC ─────────────────────────
  async function flGetFolder(){
    try{ return typeof flGetBackupFolderHandle === 'function' ? await flGetBackupFolderHandle() : null; }catch(e){ return null; }
  }

  var badge = null, bkTimer = null, bkRunning = false, bkAgain = false;
  function setBadge(state, extra){
    if(!badge) return;
    var conf = {
      none:    ['#ef6c00', '💾 Choisir le dossier de sauvegarde PC', 'Clique pour choisir le dossier de ton PC où toute la base sera copiée après chaque modification'],
      paused:  ['#ef6c00', '💾 Sauvegarde PC en pause — clique ici', 'Ton navigateur demande ton autorisation pour écrire dans le dossier de sauvegarde'],
      running: ['#1565c0', '💾 Sauvegarde en cours…', ''],
      ok:      ['#2e7d32', '💾 PC à jour ' + (extra || ''), 'Toute la base est copiée sur ton PC. Clique pour forcer une sauvegarde maintenant'],
      blocked: ['#c62828', '⚠️ Sauvegarde PC bloquée', extra || 'Données reçues incomplètes : la dernière bonne sauvegarde a été conservée'],
      error:   ['#c62828', '⚠️ Sauvegarde PC : erreur — réessayer', extra || ''],
      nosupport: ['#78909c', '💾 Sauvegarde PC : utilise Chrome ou Edge', 'Ce navigateur ne permet pas d’écrire dans un dossier du PC']
    }[state];
    badge.dataset.state = state;
    badge.style.borderColor = conf[0];
    badge.style.color = conf[0];
    badge.style.background = conf[0] + '1a';
    badge.textContent = conf[1];
    badge.title = conf[2];
  }

  function addBackupBadge(){
    var host = document.getElementById('ia-status-btn');
    if(!host || document.getElementById('fl-bk-badge')) return;
    badge = el('div', 'display:flex;align-items:center;padding:5px 12px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:700;border:1.5px solid;white-space:nowrap;user-select:none;');
    badge.id = 'fl-bk-badge';
    host.parentNode.insertBefore(badge, host.nextSibling);
    badge.onclick = async function(){
      var st = badge.dataset.state;
      if(st === 'nosupport') return;
      var h = await flGetFolder();
      if(!h){ if(typeof flPickBackupFolder === 'function'){ h = await flPickBackupFolder(); } if(!h) return; }
      try{ if((await h.queryPermission({mode:'readwrite'})) !== 'granted') await h.requestPermission({mode:'readwrite'}); }catch(e){}
      flScheduleLocalBackup(0);
    };
    setBadge(window.showDirectoryPicker ? 'none' : 'nosupport');
  }

  function flScheduleLocalBackup(delay){
    clearTimeout(bkTimer);
    bkTimer = setTimeout(runBackup, typeof delay === 'number' ? delay : 3000);
  }
  window.flScheduleLocalBackup = flScheduleLocalBackup;

  async function readAll(table){
    var rows = [], from = 0, size = 1000;
    for(;;){
      var r = await db.from(table).select('*').range(from, from + size - 1);
      if(r.error) throw r.error;
      rows = rows.concat(r.data || []);
      if(!r.data || r.data.length < size) break;
      from += size;
    }
    return rows;
  }

  function toCsv(rows){
    if(!rows || !rows.length) return '﻿';
    var cols = [];
    rows.forEach(function(r){ Object.keys(r).forEach(function(k){ if(cols.indexOf(k) < 0) cols.push(k); }); });
    function cell(v){
      if(v == null) return '';
      if(typeof v === 'object') v = JSON.stringify(v);
      v = String(v);
      return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    return '﻿' + [cols.join(';')].concat(rows.map(function(r){ return cols.map(function(c){ return cell(r[c]); }).join(';'); })).join('\r\n');
  }

  async function writeFile(dir, name, content, type){
    var fh = await dir.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(new Blob([content], { type: type }));
    await w.close();
  }

  async function runBackup(){
    if(!badge) return;
    if(!window.showDirectoryPicker){ setBadge('nosupport'); return; }
    if(bkRunning){ bkAgain = true; return; }
    bkRunning = true;
    try{
      var h = await flGetFolder();
      if(!h){ setBadge('none'); return; }
      if((await h.queryPermission({mode:'readwrite'})) !== 'granted'){ setBadge('paused'); return; }
      var sess = (await db.auth.getSession()).data.session;
      if(!sess || !navigator.onLine) return;
      setBadge('running');

      var data = {}, counts = {}, total = 0;
      for(var i = 0; i < FL_TABLES.length; i++){
        var t = FL_TABLES[i];
        try{ data[t] = await readAll(t); }
        catch(e){
          if(/does not exist|schema cache|PGRST205|42P01/i.test((e && (e.code + ' ' + e.message)) || '')) continue;
          throw e;
        }
        counts[t] = data[t].length;
        total += data[t].length;
      }

      var prev = {};
      try{ prev = JSON.parse(localStorage.getItem('fl_bk_counts') || '{}'); }catch(e){}
      var prevTotal = prev.total || 0;
      if(prevTotal >= 10 && total < prevTotal * 0.5){ setBadge('blocked', 'Reçu ' + total + ' lignes au lieu d’environ ' + prevTotal + ' : la dernière bonne sauvegarde a été conservée'); return; }
      if((prev.factures || 0) > 0 && !counts.factures){ setBadge('blocked'); return; }

      var now = new Date();
      var day = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      var payload = JSON.stringify({ app: 'Frenchy Leurres', date_sauvegarde: now.toISOString(), totaux: counts, tables: data }, null, 1);
      await writeFile(h, 'Frenchy-BASE-COMPLETE-derniere-version.json', payload, 'application/json;charset=utf-8');
      await writeFile(h, 'Frenchy-factures-derniere-version.csv', toCsv(data.factures), 'text/csv;charset=utf-8');
      await writeFile(h, 'Frenchy-clients-pro-derniere-version.csv', toCsv(data.pro_clients), 'text/csv;charset=utf-8');
      if(data.compta_documents) await writeFile(h, 'Frenchy-comptabilite-derniere-version.csv', toCsv(data.compta_documents), 'text/csv;charset=utf-8');
      var hist = await h.getDirectoryHandle('historique', { create: true });
      await writeFile(hist, 'Frenchy-BASE-' + day + '.json', payload, 'application/json;charset=utf-8');

      counts.total = total;
      try{ localStorage.setItem('fl_bk_counts', JSON.stringify(counts)); localStorage.setItem('fl_bk_last', now.toISOString()); }catch(e){}
      setBadge('ok', String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
    }catch(e){
      console.warn('Sauvegarde PC :', e);
      setBadge('error', translateError(e));
    }finally{
      bkRunning = false;
      if(bkAgain){ bkAgain = false; flScheduleLocalBackup(1500); }
    }
  }

  // ───────────────────────── DÉMARRAGE ─────────────────────────
  if(!db || !db.auth){
    document.documentElement.classList.add('fl-ok');
    return;
  }

  db.auth.onAuthStateChange(function(event){
    if(event === 'PASSWORD_RECOVERY'){
      document.documentElement.classList.remove('fl-ok');
      showOverlay(newPasswordForm());
    }
  });

  (async function start(){
    if(/type=recovery/.test(location.hash)) return;
    var session = null;
    try{ session = (await db.auth.getSession()).data.session; }catch(e){}
    if(/type=recovery/.test(location.hash) || (overlay && document.getElementById('fl-auth-pass2') && !document.getElementById('fl-auth-email'))) return;
    if(session){ unlock(session); return; }
    if(!navigator.onLine && hasStoredSession()){ unlock(null); return; }
    showOverlay(loginForm());
  })();
})();
