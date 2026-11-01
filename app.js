/*
  Mis finanzas — pantallas y guardado en el teléfono.

  Los datos llegan dentro del enlace, detrás de "#", que el navegador nunca
  envía a ningún servidor. El atajo "Mis finanzas" lee los dos archivos de
  la carpeta Finanzas del iPhone y abre:
    #c=…&d=…   c = config.txt, d = movimientos.txt (los dos en base64)
  Se guardan en el almacenamiento de este teléfono y se borran del enlace al
  momento. La app no hace ninguna conexión salvo traerse su propio programa.

  Los cambios hechos en Ajustes se respetan hasta que llegue un config.txt
  distinto del último recibido (el que manda Claude o el ordenador).
*/
"use strict";

const F = window.Finanzas;
const CLAVE_CONFIG = "mf-config";
const CLAVE_RECIBIDA = "mf-config-recibida";
const CLAVE_DATOS = "mf-movimientos";
const CLAVE_FECHA = "mf-actualizado";

document.getElementById("estilos-panel").textContent = F.CSS;

const guardar = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

function desdeBase64(b64) {
  const limpio = decodeURIComponent(b64).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const relleno = limpio + "===".slice((limpio.length + 3) % 4);
  const bin = atob(relleno);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function ahora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moverMes(mes, delta) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function avisar(texto, esError) {
  const el = document.getElementById("aviso");
  el.textContent = texto;
  el.style.color = esError ? "var(--mal)" : "";
  el.classList.toggle("oculto", !texto);
}

// Lee lo que trae el enlace y lo borra de la barra de direcciones.
function leerEnlace() {
  const h = location.hash;
  if (!h || h.length < 3) return;
  const partes = {};
  for (const trozo of h.slice(1).split("&")) {
    const i = trozo.indexOf("=");
    if (i > 0) partes[trozo.slice(0, i)] = trozo.slice(i + 1);
  }
  const textoConfig = partes.c || partes.config;
  try {
    if (textoConfig) {
      const recibida = desdeBase64(textoConfig);
      const config = JSON.parse(recibida);
      if (!config.bancos || !config.presupuestos) throw new Error("configuración incompleta");
      if (recibida !== leer(CLAVE_RECIBIDA) || !leer(CLAVE_CONFIG)) {
        const habia = leer(CLAVE_RECIBIDA);
        guardar(CLAVE_CONFIG, JSON.stringify(config));
        guardar(CLAVE_RECIBIDA, recibida);
        avisar(habia ? "Configuración actualizada." : "Configuración guardada en este teléfono.");
      }
    }
    if (partes.d !== undefined) {
      guardar(CLAVE_DATOS, desdeBase64(partes.d));
      guardar(CLAVE_FECHA, ahora());
    }
  } catch (e) {
    avisar("No se pudo leer el enlace: " + e.message, true);
  }
  history.replaceState(null, "", location.pathname);
}

let mes = mesActual();
let enAjustes = false;

function config() {
  const c = leer(CLAVE_CONFIG);
  return c ? JSON.parse(c) : null;
}

function familia(c) {
  return [...new Set(Object.values(c.personas || {}))].join(" y ");
}

function pintar() {
  const vista = document.getElementById("vista");
  const c = config();
  if (!c) {
    vista.innerHTML = `<section><h2>Falta la configuración</h2><p class="nota">Entra desde el icono "Mis finanzas" y comprueba que el archivo config.txt está en la carpeta Finanzas, junto a movimientos.txt.</p></section>`;
    return;
  }
  if (enAjustes) return pintarAjustes(c);
  const texto = leer(CLAVE_DATOS) || "";
  const movs = F.movimientosDe([texto], c);
  const r = F.resumenDelMes(movs, c, mes);
  vista.innerHTML = F.cuerpo(r, { generado: leer(CLAVE_FECHA) || "sin movimientos todavía", familia: familia(c) });
}

/* ── Ajustes: presupuestos, gastos fijos y comercios sin categoría ── */

function pintarAjustes(c) {
  const vista = document.getElementById("vista");
  const movs = F.movimientosDe([leer(CLAVE_DATOS) || ""], c);
  const sinCategoria = [...new Set(movs.filter((m) => m.categoria === "Sin clasificar" && m.comercio).map((m) => m.comercio))];
  const categorias = [...new Set([...Object.keys(c.presupuestos), ...(c.comercios || []).map((r) => r.categoria)])].sort();
  const e = F.esc;

  vista.innerHTML = `
  <h1>Ajustes</h1>
  <section><h2>Presupuesto mensual (AED)</h2>
    <div id="lista-pres">${Object.entries(c.presupuestos).map(([cat, v]) =>
      `<div class="ajuste" data-cat="${e(cat)}"><label>${e(cat)}</label><input type="number" inputmode="decimal" step="0.01" min="0" value="${v}"><button class="quitar" aria-label="Quitar">×</button></div>`).join("")}</div>
    <div class="ajuste"><input id="nueva-cat" class="ancho" placeholder="Nueva categoría"><input id="nuevo-imp" type="number" inputmode="decimal" step="0.01" min="0" placeholder="AED"></div>
  </section>
  <section><h2>Gastos fijos (AED)</h2>
    ${(c.fijos || []).map((f, i) =>
      `<div class="ajuste" data-fijo="${i}"><label>${e(f.nombre)}<div class="nota">cada ${f.cadaMeses || 1} ${(f.cadaMeses || 1) === 1 ? "mes" : "meses"}</div></label><input type="number" inputmode="decimal" step="0.01" min="0" value="${f.importe}"></div>`).join("")}
  </section>
  <section><h2>Comercios sin categoría</h2>
    ${sinCategoria.length ? sinCategoria.map((com) =>
      `<div class="ajuste" data-com="${e(com)}"><label>${e(com)}</label><select class="ancho"><option value="">Elegir…</option>${categorias.map((cat) => `<option>${e(cat)}</option>`).join("")}</select></div>`).join("")
      : '<p class="nota">Todos los comercios tienen categoría.</p>'}
  </section>
  <div class="acciones"><button class="boton" id="cancelar">Cancelar</button><button class="boton primario" id="guardar">Guardar</button></div>`;

  vista.querySelectorAll("#lista-pres .quitar").forEach((b) => b.addEventListener("click", () => b.closest(".ajuste").remove()));
  document.getElementById("cancelar").addEventListener("click", () => { enAjustes = false; pintar(); });
  document.getElementById("guardar").addEventListener("click", () => {
    const nueva = JSON.parse(JSON.stringify(c));
    nueva.presupuestos = {};
    vista.querySelectorAll("#lista-pres .ajuste").forEach((fila) => {
      const v = Number(fila.querySelector("input").value);
      if (v > 0) nueva.presupuestos[fila.dataset.cat] = Math.round(v * 100) / 100;
    });
    const nCat = document.getElementById("nueva-cat").value.trim();
    const nImp = Number(document.getElementById("nuevo-imp").value);
    if (nCat && nImp > 0) nueva.presupuestos[nCat] = Math.round(nImp * 100) / 100;
    vista.querySelectorAll("[data-fijo]").forEach((fila) => {
      const v = Number(fila.querySelector("input").value);
      if (v > 0) nueva.fijos[Number(fila.dataset.fijo)].importe = Math.round(v * 100) / 100;
    });
    vista.querySelectorAll("[data-com]").forEach((fila) => {
      const cat = fila.querySelector("select").value;
      if (cat) nueva.comercios = [...(nueva.comercios || []), { empieza: fila.dataset.com, categoria: cat }];
    });
    guardar(CLAVE_CONFIG, JSON.stringify(nueva));
    enAjustes = false;
    avisar("Ajustes guardados en este teléfono.");
    pintar();
  });
}

document.getElementById("mes-ant").addEventListener("click", () => { mes = moverMes(mes, -1); enAjustes = false; pintar(); });
document.getElementById("mes-sig").addEventListener("click", () => { mes = moverMes(mes, 1); enAjustes = false; pintar(); });
document.getElementById("abrir-ajustes").addEventListener("click", () => { enAjustes = !enAjustes; avisar(""); pintar(); });

leerEnlace();
pintar();
// Si la app ya estaba abierta, un enlace nuevo solo cambia lo que va tras "#":
// no se recarga la página, así que hay que escucharlo.
window.addEventListener("hashchange", () => { leerEnlace(); pintar(); });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
