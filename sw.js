// Service Worker — Frenchy Leurres App Pro (PWA Offline)
var CACHE_NAME = 'frenchy-pwa-v5';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/catalogue.js',
  '/comptes-pro.js',
  '/comptabilite.js',
  '/fl-securite.js',
  '/logo-app.png',
  '/manifest.json'
];

// Installation : mise en cache des fichiers locaux
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    }).catch(function(err) {
      console.warn('[SW] Erreur cache install:', err);
    })
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch : network-first avec fallback cache
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Laisser passer les appels Supabase API (gérés offline dans l'app)
  if(url.indexOf('supabase.co') !== -1) return;

  // Ne jamais mettre en cache les réponses du serveur (/api) : elles contiennent des données personnelles
  if(url.indexOf('/api/') !== -1) return;

  // Laisser passer les requêtes non-GET
  if(e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // Cacher la réponse si succès
      if(response && response.ok && response.type !== 'opaque') {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Réseau indisponible → chercher dans le cache
      return caches.match(e.request, {ignoreSearch: true}).then(function(cached) {
        if(cached) return cached;
        // Fallback pour les pages HTML
        if(e.request.headers.get('accept') && e.request.headers.get('accept').indexOf('text/html') !== -1) {
          return caches.match('/index.html');
        }
        return new Response('', {status: 503});
      });
    })
  );
});
