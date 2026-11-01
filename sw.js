/*
  Mis finanzas — trabajador de servicio (mismo método que LLEnergy).
  Guarda el programa en el teléfono para abrirlo sin internet y trae las
  versiones nuevas solo. Nunca guarda ni envía datos: solo los archivos de
  la propia app.
*/
const VERSION = "mis-finanzas-v6";
const ARCHIVOS = ["./", "./index.html", "./app.js", "./finanzas.js", "./manifest.webmanifest", "./icono-180.png", "./icono-192.png", "./icono-512.png"];
const ESPERA = 2500;

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled(
      ARCHIVOS.map((a) => fetch(new Request(a, { cache: "reload" })).then((res) => (res && res.ok ? c.put(a, res) : null)))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(new Request(req, { cache: "no-cache" })),
        new Promise((_, no) => setTimeout(() => no(new Error("lenta")), ESPERA)),
      ]);
      if (res && res.ok) { cache.put(req, res.clone()); return res; }
      throw new Error("respuesta mala");
    } catch (e) {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./index.html")) || Response.error();
    }
  })());
});
