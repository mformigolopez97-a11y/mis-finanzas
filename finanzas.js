/* Mis finanzas — motor (generado por construir-app.js, no editar a mano) */
(function(){"use strict";var M={};
M["./lector.js"]=(function(){var module={exports:{}};var require=function(n){return M[n];};
"use strict";
function aFils(texto) {
  if (!/^\d{1,3}(,\d{3})*\.\d{2}$|^\d+\.\d{2}$/.test(texto)) return null;
  const [enteros, decimales] = texto.replace(/,/g, "").split(".");
  return Number(enteros) * 100 + Number(decimales);
}
function normalizar(texto) {
  return String(texto).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}
function crearLector({ remitentes = {}, patrones = [] } = {}) {
  const compilados = patrones.map((p) => ({ ...p, re: new RegExp(p.regex) }));
  function leerSMS({ remitente, texto }) {
    const banco = remitentes[remitente];
    if (!banco) return { estado: "ignorado" };
    const limpio = normalizar(texto);
    for (const p of compilados) {
      if (p.banco !== banco) continue;
      const m = limpio.match(p.re);
      if (!m) continue;
      const dato = (nombre) => (p.grupos[nombre] ? m[p.grupos[nombre]].trim() : undefined);
      const moneda = dato("moneda");
      const fils = aFils(dato("importe"));
      if (fils === null) return { estado: "revisar", banco, motivo: "importe ilegible", texto: limpio };
      if (moneda !== "AED") return { estado: "revisar", banco, motivo: `moneda ${moneda}`, texto: limpio };
      const mov = { estado: "ok", formato: p.id, banco, tipo: p.tipo, moneda, fils };
      for (const campo of ["comercio", "ciudad", "tarjeta", "cuenta", "referencia"]) {
        const v = dato(campo);
        if (v !== undefined) mov[campo] = v;
      }
      if (p.concepto) mov.concepto = p.concepto;
      if (p.grupos.anio) {
        mov.fechaBanco = `${dato("anio")}-${dato("mes")}-${dato("dia")} ${dato("hora")}:${dato("minuto")}`;
      }
      return mov;
    }
    return { estado: "revisar", banco, motivo: "formato desconocido", texto: limpio };
  }
  return { leerSMS, remitentes };
}
module.exports = { crearLector, aFils, normalizar };
return module.exports;})();
M["./motor.js"]=(function(){var module={exports:{}};var require=function(n){return M[n];};
"use strict";
const { crearLector, aFils } = require("./lector.js");
const TIPO_TELEFONO = { Gasto: "gasto", Ingreso: "ingreso", Enviado: "enviado", Rechazado: "rechazado" };
function aFilsNumero(aed) {
  return Math.round(Number(aed) * 100);
}
function fechaCorta(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
}
function leerLinea(linea) {
  const partes = linea.split("|").map((p) => p.trim());
  if (partes.length < 6) return null;
  const [fecha, dispositivo, tipo, importe, comercio, ...resto] = partes;
  const sms = resto.join("|").split(/\s*~\s*/).join("\n").trim();
  if (!fechaCorta(fecha) || !sms) return null;
  return { fechaRegistro: fechaCorta(fecha), dispositivo, tipoTelefono: tipo, importeTelefono: importe, comercioTelefono: comercio, sms };
}
function leerConCualquierBanco(lector, sms) {
  for (const remitente of Object.keys(lector.remitentes)) {
    const r = lector.leerSMS({ remitente, texto: sms });
    if (r.estado === "ok") return r;
  }
  return null;
}
function categoriaDe(mov, config) {
  for (const fijo of config.fijos || []) {
    const rec = fijo.reconocer || {};
    if (rec.referencia && mov.referencia === rec.referencia) return { categoria: fijo.nombre, fijo: true };
    for (const c of rec.comercio || []) {
      if (mov.comercio && mov.comercio.toUpperCase().startsWith(c.toUpperCase())) return { categoria: fijo.nombre, fijo: true };
    }
  }
  for (const regla of config.comercios || []) {
    if (mov.comercio && mov.comercio.toUpperCase().startsWith(regla.empieza.toUpperCase())) {
      return { categoria: regla.categoria, fijo: false };
    }
  }
  return { categoria: "Sin clasificar", fijo: false };
}
function movimientosDe(textos, config) {
  const lector = crearLector(config.bancos);
  const vistos = new Set();
  const lista = [];
  for (const texto of textos) {
    for (const linea of String(texto).split(/\r?\n/)) {
      const l = leerLinea(linea);
      if (!l) continue;
      if (vistos.has(l.sms)) continue;
      vistos.add(l.sms);
      const leido = leerConCualquierBanco(lector, l.sms);
      const avisos = [];
      let tipo = TIPO_TELEFONO[l.tipoTelefono] || null;
      let fils = aFils(l.importeTelefono);
      let comercio = l.comercioTelefono && l.comercioTelefono !== "-" ? l.comercioTelefono : null;
      let fecha = l.fechaRegistro;
      let referencia = null;
      if (leido) {
        let tipoLector = leido.tipo;
        if (tipoLector === "transferencia") {
          tipoLector = (config.cuentasPropias || []).includes(leido.cuenta) ? "ingreso" : "enviado";
        }
        if (tipo && tipo !== tipoLector) avisos.push(`el teléfono dijo "${l.tipoTelefono}" y el SMS es ${tipoLector}`);
        if (fils !== null && fils !== leido.fils) avisos.push(`el teléfono leyó ${l.importeTelefono} y el SMS dice otro importe`);
        tipo = tipoLector;
        fils = leido.fils;
        comercio = leido.comercio || comercio;
        fecha = leido.fechaBanco || fecha;
        referencia = leido.referencia || null;
      } else {
        avisos.push("formato de SMS aún no conocido por la computadora");
      }
      if (!tipo || fils === null) {
        avisos.push("no se pudo leer el tipo o el importe");
      }
      const persona = (config.personas || {})[l.dispositivo] || l.dispositivo;
      const mov = { clave: "s" + huella(l.sms), fecha, mes: fecha.slice(0, 7), persona, tipo, fils, comercio, referencia, sms: l.sms, avisos };
      if (tipo === "gasto") Object.assign(mov, categoriaDe(mov, config));
      lista.push(mov);
    }
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function gastoManual({ id, fecha, importe, categoria, comercio, persona }) {
  const dia = String(fecha || "").slice(0, 10);
  const fils = aFilsNumero(importe);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !(fils > 0)) return null;
  return {
    clave: "m" + (id || huella(`${dia}|${importe}|${categoria}|${comercio}`)),
    fecha: `${dia} 12:00`, mes: dia.slice(0, 7), persona: persona || "", tipo: "gasto", fils,
    comercio: comercio || null, referencia: null, sms: null, avisos: [],
    categoria: categoria || "Sin clasificar", fijo: false, manual: true,
  };
}
function huella(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const IGNORAR = "(no es un gasto)";
function aplicarCambios(movimientos, cambios = {}) {
  return movimientos
    .filter((m) => cambios[m.clave] !== IGNORAR)
    .map((m) => (cambios[m.clave] && m.tipo === "gasto" ? { ...m, categoria: cambios[m.clave], cambiado: true } : m));
}
function mesesEntre(desde, hasta) {
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
function tocaEsteMes(fijo, mes) {
  const cada = fijo.cadaMeses || 1;
  if (cada === 1) return true;
  if (!fijo.primerMes) return null;
  const d = mesesEntre(fijo.primerMes, mes);
  return d >= 0 && d % cada === 0;
}
function mesAnterior(mes) {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
const suma = (lista) => lista.reduce((t, m) => t + (m.fils || 0), 0);
function presupuestoDelMes(movimientos, config, mes) {
  const primerMes = movimientos.length ? movimientos[0].mes : mes;
  const anterior = mes > primerMes ? presupuestoDelMes(movimientos, config, mesAnterior(mes)) : [];
  const gastos = movimientos.filter((m) => m.mes === mes && m.tipo === "gasto");
  return Object.entries(config.presupuestos || {}).map(([categoria, aed]) => {
    const base = aFilsNumero(aed);
    const previo = anterior.find((p) => p.categoria === categoria);
    const arrastre = previo && previo.restante < 0 ? -previo.restante : 0;
    const limite = base - arrastre;
    const consumido = suma(gastos.filter((m) => m.categoria === categoria));
    return {
      categoria, base, arrastre, limite, consumido,
      restante: limite - consumido,
      porcentaje: limite > 0 ? Math.round((consumido / limite) * 100) : consumido > 0 ? 100 : 0,
    };
  });
}
function resumenDelMes(movimientos, config, mes, { pagadosAMano = [] } = {}) {
  const aMano = new Set(pagadosAMano);
  const delMes = movimientos.filter((m) => m.mes === mes);
  const gastos = delMes.filter((m) => m.tipo === "gasto");
  const presupuesto = presupuestoDelMes(movimientos, config, mes);
  const fijos = (config.fijos || []).map((f) => {
    const esperado = aFilsNumero(f.importe);
    const toca = tocaEsteMes(f, mes);
    const pagado = suma(gastos.filter((m) => m.categoria === f.nombre));
    let estado;
    if (pagado > 0) estado = "pagado";
    else if (aMano.has(f.nombre)) estado = "pagado a mano";
    else if (toca === false) estado = "no toca este mes";
    else if (!f.reconocer || (!f.reconocer.referencia && !(f.reconocer.comercio || []).length)) estado = "falta saber cómo reconocer su SMS";
    else estado = "pendiente";
    return {
      nombre: f.nombre, esperado, pagado, toca, estado, dia: f.dia || null,
      cadaMeses: f.cadaMeses || 1,
      diferencia: pagado > 0 ? esperado - pagado : 0,
    };
  });
  const categoriasConPresupuesto = new Set([...Object.keys(config.presupuestos || {}), ...(config.fijos || []).map((f) => f.nombre)]);
  const otras = {};
  for (const m of gastos) {
    if (categoriasConPresupuesto.has(m.categoria)) continue;
    otras[m.categoria] = (otras[m.categoria] || 0) + m.fils;
  }
  const porPersona = {};
  for (const m of gastos) porPersona[m.persona] = (porPersona[m.persona] || 0) + m.fils;
  return {
    mes,
    totalGastado: suma(gastos),
    ingresos: suma(delMes.filter((m) => m.tipo === "ingreso")),
    enviado: suma(delMes.filter((m) => m.tipo === "enviado")),
    rechazados: delMes.filter((m) => m.tipo === "rechazado").length,
    presupuesto,
    fijos,
    otras: Object.entries(otras).map(([categoria, fils]) => ({ categoria, fils })).sort((a, b) => b.fils - a.fils),
    porPersona: Object.entries(porPersona).map(([persona, fils]) => ({ persona, fils })),
    revisar: delMes.filter((m) => m.avisos.length || m.categoria === "Sin clasificar"),
    movimientos: delMes.slice().reverse(),
  };
}
module.exports = { movimientosDe, resumenDelMes, leerLinea, tocaEsteMes, gastoManual, aplicarCambios, IGNORAR };
return module.exports;})();
M["./panel.js"]=(function(){var module={exports:{}};var require=function(n){return M[n];};
"use strict";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function aed(fils) {
  const signo = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const enteros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${signo}${enteros}.${String(abs % 100).padStart(2, "0")}`;
}
function esc(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function nombreMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}
function semaforo(consumido, limite) {
  const pct = limite > 0 ? consumido / limite : 0;
  if (pct >= 1) return { clase: "mal", color: "var(--mal)", texto: "Límite alcanzado" };
  if (pct >= 0.8) return { clase: "aviso", color: "var(--aviso)", texto: "Cerca del límite" };
  return { clase: "bien", color: "var(--bien)", texto: "Saludable" };
}
function barra(consumido, limite) {
  const pct = limite > 0 ? consumido / limite : 0;
  const ancho = Math.min(pct, 1) * 100;
  return `<svg class="barra" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect width="100" height="10" rx="5" fill="var(--pista)"/>` +
    `<rect width="${ancho.toFixed(2)}" height="10" rx="5" fill="${semaforo(consumido, limite).color}"/></svg>`;
}
function anillo(consumido, limite) {
  const pct = limite > 0 ? consumido / limite : 0;
  const s = semaforo(consumido, limite);
  const r = 52, c = 2 * Math.PI * r;
  const lleno = Math.min(pct, 1) * c;
  return `<svg class="anillo" viewBox="0 0 140 140" aria-hidden="true">` +
    `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--pista)" stroke-width="16"/>` +
    `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-linecap="round" ` +
    `stroke-dasharray="${lleno.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 70 70)"/>` +
    `<text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="var(--tinta)">${Math.round(pct * 100)}%</text>` +
    `<text x="70" y="90" text-anchor="middle" font-size="12" fill="var(--suave)">usado</text></svg>`;
}
function filaPresupuesto(p) {
  const s = semaforo(p.consumido, p.limite);
  const estado = p.restante < 0
    ? `<span class="mal">Te has pasado en ${aed(-p.restante)} AED · se descuenta del mes que viene</span>`
    : `<span class="${s.clase}">${s.texto}</span> · quedan ${aed(p.restante)}`;
  const arrastre = p.arrastre > 0
    ? `<div class="nota mal">El mes pasado te pasaste en ${aed(p.arrastre)}: este mes el límite es ${aed(p.limite)} en vez de ${aed(p.base)}</div>`
    : "";
  return `<div class="fila"><div class="fila-cab"><b>${esc(p.categoria)}</b><span>${aed(p.consumido)} de ${aed(p.limite)} · <b class="${s.clase}">${p.porcentaje}%</b></span></div>` +
    `${barra(p.consumido, p.limite)}<div class="nota">${estado}</div>${arrastre}</div>`;
}
function filaFijo(f, conBotones) {
  let detalle;
  if (f.estado === "pagado") {
    detalle = f.diferencia > 0 ? `Pagado ${aed(f.pagado)} · <span class="bien">ahorro ${aed(f.diferencia)}</span>`
      : f.diferencia < 0 ? `Pagado ${aed(f.pagado)} · <span class="mal">${aed(-f.diferencia)} más de lo previsto</span>`
      : `Pagado ${aed(f.pagado)}`;
  } else if (f.estado === "pendiente") {
    detalle = `Pendiente${f.dia ? ` · se cobra el día ${f.dia}` : ""}`;
  } else if (f.estado === "pagado a mano") {
    detalle = "Marcado como pagado · no suma al gasto hasta que llegue su SMS";
  } else if (f.estado === "no toca este mes") {
    detalle = `No toca este mes (cada ${f.cadaMeses} meses)`;
  } else {
    detalle = `Pendiente · aún no sé reconocer su SMS`;
  }
  const marca = f.estado === "pagado" || f.estado === "pagado a mano" ? "✓" : f.estado === "no toca este mes" ? "–" : "○";
  const boton = !conBotones ? ""
    : f.estado === "pagado a mano" ? `<button class="marcar" data-pagado="${esc(f.nombre)}" data-accion="quitar">Deshacer</button>`
    : f.estado === "pagado" || f.estado === "no toca este mes" ? ""
    : `<button class="marcar" data-pagado="${esc(f.nombre)}" data-accion="poner">Ya se pagó</button>`;
  return `<div class="fijo"><span class="marca">${marca}</span><div style="flex:1"><b>${esc(f.nombre)}</b> · ${aed(f.esperado)}<div class="nota">${detalle}</div></div>${boton}</div>`;
}
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaHora(f, conHora = true) {
  const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/);
  if (!m) return String(f || "");
  const dia = `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]} ${m[1]}`;
  if (!conHora || m[4] === undefined) return dia;
  const h = Number(m[4]);
  return `${dia}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "a. m." : "p. m."}`;
}
function filaMovimiento(m, conBotones) {
  const etiqueta = { gasto: m.categoria, ingreso: "Ingreso", enviado: "Dinero enviado", rechazado: "Rechazado (no suma)" }[m.tipo] || "Revisar";
  const signo = m.tipo === "ingreso" ? "+" : m.tipo === "rechazado" ? "" : "−";
  const clase = m.tipo === "ingreso" ? "bien" : m.tipo === "rechazado" ? "tenue" : "";
  const sinClasificar = m.fils == null || (m.tipo === "gasto" && m.categoria === "Sin clasificar");
  const titulo = m.fils == null && !m.comercio ? "SMS que aún no sé leer" : m.comercio || etiqueta;
  const sms = sinClasificar && m.sms ? `<div class="nota sms">SMS: ${esc(m.sms.replace(/\s*\n\s*/g, " · "))}</div>` : "";
  return `<div class="mov"><div><b>${esc(titulo)}</b>${sms}<div class="nota">${esc(fechaHora(m.fecha, !m.manual))} · ${esc(m.persona)} · ${esc(etiqueta)}${m.manual ? " · apuntado a mano" : ""}${m.cambiado ? " · cambiado a mano" : ""}</div></div>` +
    `<div style="text-align:right"><div class="${clase}">${signo}${m.fils != null ? aed(m.fils) : "?"}</div>` +
    `${conBotones && m.clave && (m.tipo === "gasto" || m.fils == null) ? `<button class="marcar" data-mov="${esc(m.clave)}">Cambiar</button>` : ""}</div></div>`;
}
const CSS = `:root{--fondo:#F2F4F7;--carta:#FFFFFF;--tinta:#13202B;--suave:#5E6B77;--pista:#E3E7EC;--bien:#1E9E5A;--aviso:#EA8A12;--mal:#DC2F45;--linea:#E8EBEF;--acento:#2563EB}
@media (prefers-color-scheme:dark){:root{--fondo:#0D1217;--carta:#182029;--tinta:#EEF2F5;--suave:#98A5B1;--pista:#27313B;--bien:#34C27A;--aviso:#F59E2B;--mal:#F0566A;--linea:#232D37;--acento:#5B8DEF}}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--tinta);font:18px/1.45 -apple-system,system-ui,sans-serif;padding:16px}
h1{font-size:28px;margin:4px 0 2px}
h2{font-size:20px;margin:0 0 12px}
section{background:var(--carta);border-radius:16px;padding:16px;margin:14px 0}
.cifras{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cifra{background:var(--carta);border-radius:14px;padding:12px}
.cifra small{display:block;color:var(--suave);font-size:14px}
.cifra b{font-size:22px}
.fila{margin:0 0 16px}
.fila-cab{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.fila-cab span{color:var(--suave);font-size:16px}
.barra{display:block;width:100%;height:12px;margin:6px 0 4px}
.nota{color:var(--suave);font-size:15px}
.fijo{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--linea)}
.fijo:first-of-type{border-top:0}
.marca{width:20px;text-align:center}
.mov{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--linea)}
.resumen{display:flex;align-items:center;gap:16px}
.anillo{width:132px;height:132px;flex:none}
.bien{color:var(--bien)}.aviso{color:var(--aviso)}.mal{color:var(--mal)}.tenue{color:var(--suave);text-decoration:line-through}
.pie{color:var(--suave);font-size:14px;text-align:center;margin:18px 0}
`;
function cuerpo(r, { generado, familia, botones } = {}) {
  const totalPresupuesto = r.presupuesto.reduce((t, p) => t + p.limite, 0);
  const consumidoPresupuesto = r.presupuesto.reduce((t, p) => t + p.consumido, 0);
  const revisar = r.revisar.length
    ? `<section><h2>Para revisar (${r.revisar.length})</h2>${r.revisar.map((m) => filaMovimiento(m, botones)).join("")}<p class="nota">Movimientos sin categoría o que la computadora no pudo comprobar del todo.</p></section>`
    : "";
  const listaRechazados = r.movimientos.filter((m) => m.tipo === "rechazado");
  const rechazados = listaRechazados.length
    ? `<section><h2>Pagos rechazados (${listaRechazados.length})</h2>${listaRechazados.map((m) =>
      `<div class="mov"><div><b>${esc(m.comercio || "Sin comercio")}</b><div class="nota">${esc(fechaHora(m.fecha))} · ${esc(m.persona)} · no suma al gasto</div></div><div class="tenue">${aed(m.fils)}</div></div>`).join("")}</section>`
    : "";
  const otras = r.otras.length
    ? `<section><h2>Otros gastos (sin presupuesto)</h2>${r.otras.map((o) => `<div class="mov"><b>${esc(o.categoria)}</b><div>${aed(o.fils)}</div></div>`).join("")}</section>`
    : "";
  return `<h1>Mis finanzas</h1>
<div class="nota">${esc(nombreMes(r.mes))}${familia ? ` · ${esc(familia)}` : ""}</div>
<section class="resumen">${anillo(consumidoPresupuesto, totalPresupuesto)}
  <div><div class="nota">Presupuesto variable del mes</div><b style="font-size:24px">${aed(consumidoPresupuesto)}</b>
  <div class="nota">de ${aed(totalPresupuesto)}</div>
  <div class="${semaforo(consumidoPresupuesto, totalPresupuesto).clase}" style="font-weight:600;margin-top:4px">${semaforo(consumidoPresupuesto, totalPresupuesto).texto}</div></div>
</section>
<div class="cifras">
  <div class="cifra"><small>Gastado este mes</small><b>${aed(r.totalGastado)}</b></div>
  <div class="cifra"><small>Ingresos</small><b class="bien">${aed(r.ingresos)}</b></div>
  <div class="cifra"><small>Dinero enviado</small><b>${aed(r.enviado)}</b></div>
  <div class="cifra"><small>Pagos rechazados</small><b>${r.rechazados}</b><small>no suman al gasto</small></div>
</div>
<section><h2>Presupuesto del mes</h2>${r.presupuesto.map(filaPresupuesto).join("")}</section>
<section><h2>Gastos fijos</h2>${r.fijos.map((f) => filaFijo(f, botones)).join("")}</section>
${rechazados}
${otras}
<section><h2>Por persona</h2>${r.porPersona.length ? r.porPersona.map((p) => `<div class="mov"><b>${esc(p.persona)}</b><div>${aed(p.fils)}</div></div>`).join("") : '<p class="nota">Sin gastos este mes.</p>'}</section>
${revisar}
<section><h2>Últimos movimientos</h2>${r.movimientos.slice(0, 30).map((m) => filaMovimiento(m, botones)).join("") || '<p class="nota">Sin movimientos este mes.</p>'}</section>
<p class="pie">Importes en AED · actualizado ${esc(fechaHora(generado))}</p>
`;
}
function pagina(r, opciones = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mis finanzas</title>
<style>
${CSS}</style></head><body>
${cuerpo(r, opciones)}</body></html>`;
}
module.exports = { pagina, cuerpo, CSS, aed, semaforo, nombreMes, esc, fechaHora };
return module.exports;})();
window.Finanzas=Object.assign({},M["./lector.js"],M["./motor.js"],M["./panel.js"]);})();
