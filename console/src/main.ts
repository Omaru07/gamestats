// Página TEMPORAL del Paso 5: los 3 juegos. En el Paso 7 se reemplaza por la consola
// real (menú, pestañas y panel de estadísticas).
import './estilos.css';
import type { Juego } from './core/Juego.ts';
import { DespachadorEventos } from './events/DespachadorEventos.ts';
import { crearCatalogo } from './games/catalogo.ts';

const despachador = new DespachadorEventos();
const catalogo = crearCatalogo();
const juegos: Juego[] = [];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>GameConsole</h1>
  <p class="tenue">Página de prueba (Paso 5): los 3 juegos. Puedes abrir varias partidas a la vez.</p>

  <section class="tarjeta">
    <label>Tu nombre <input id="nombre" value="Omar" /></label>
    <div id="lanzadores" class="lanzadores"></div>
    <div id="zona" class="partidas"></div>
  </section>

  <section class="tarjeta">
    <strong>Envío de eventos</strong>
    <p id="envio" class="tenue">Sin eventos todavía.</p>
  </section>

  <section class="tarjeta">
    <strong>Instancias según GameStats</strong> <span class="tenue">(GET /api/ingest/instances, cada 2 s)</span>
    <pre id="instancias">Consultando…</pre>
  </section>
`;

const nombre = app.querySelector<HTMLInputElement>('#nombre')!;
const zona = app.querySelector<HTMLDivElement>('#zona')!;
const envio = app.querySelector<HTMLParagraphElement>('#envio')!;
const instancias = app.querySelector<HTMLPreElement>('#instancias')!;

// Un botón por cada juego del catálogo.
for (const def of catalogo.todos()) {
  const boton = document.createElement('button');
  boton.textContent = `Nueva partida: ${def.nombre}`;
  boton.title = def.descripcion;
  boton.addEventListener('click', () => abrir(def.gameId, def.nombre));
  app.querySelector('#lanzadores')!.append(boton);
}

// Cada partida vive en su propio marco, con un botón para cerrarla.
function abrir(gameId: string, titulo: string): void {
  const juego = catalogo.nuevaPartida(gameId, nombre.value, despachador);
  const marco = document.createElement('article');
  marco.className = 'marco-partida';
  const cabecera = document.createElement('header');
  cabecera.innerHTML = `<span>${titulo} <span class="tenue">· ${juego.matchId.slice(0, 8)}</span></span>`;
  const cerrar = document.createElement('button');
  cerrar.textContent = 'Cerrar';
  cerrar.addEventListener('click', () => {
    juego.cerrar(); // si seguía en curso, cuenta como abandonada
    marco.remove();
  });
  cabecera.append(cerrar);
  const cuerpo = document.createElement('div');
  marco.append(cabecera, cuerpo);
  zona.append(marco);
  juegos.push(juego);
  juego.comenzar(cuerpo);
}

despachador.suscribir(() => {
  const t = despachador.totales();
  envio.className = t.ultimoError ? 'error' : 'ok';
  envio.textContent =
    `Enviados: ${t.enviados} · Pendientes: ${t.pendientes} · Descartados: ${t.descartados}` +
    ` · Reintentos: ${t.reintentos}` +
    (t.ultimoError ? ` · Último error: ${t.ultimoError}` : '');
});

async function consultarInstancias(): Promise<void> {
  try {
    const r = await fetch('/api/ingest/instances');
    instancias.className = r.ok ? '' : 'error';
    instancias.textContent = r.ok ? JSON.stringify(await r.json(), null, 2) : `Go respondió ${r.status}`;
  } catch (e) {
    instancias.className = 'error';
    instancias.textContent = `No hay conexión con Go: ${String(e)}`;
  }
}
consultarInstancias();
setInterval(consultarInstancias, 2000);

// Si se cierra la pestaña con partidas en curso, se avisa a GameStats que se abandonaron.
window.addEventListener('pagehide', () => {
  despachador.enviarAlCerrar(juegos.flatMap((j) => j.eventoDeAbandono() ?? []));
});
