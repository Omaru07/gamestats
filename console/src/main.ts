// Página TEMPORAL de los pasos 3 y 4: prueba de conexión y Conecta 4.
// En el Paso 5 se reemplaza por la consola real con los 3 juegos y el panel.
import './estilos.css';
import type { Juego } from './core/Juego.ts';
import { Jugador } from './core/Jugador.ts';
import { Partida } from './core/Partida.ts';
import { PartidaDePrueba } from './dev/PartidaDePrueba.ts';
import { DespachadorEventos } from './events/DespachadorEventos.ts';
import { crearCatalogo } from './games/catalogo.ts';

const despachador = new DespachadorEventos();
const catalogo = crearCatalogo();
const juegos: Juego[] = [];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>GameConsole</h1>
  <p class="tenue">Página de prueba (pasos 3 y 4)</p>

  <section class="tarjeta">
    <label>Tu nombre <input id="nombre" value="Omar" /></label>
  </section>

  <section class="tarjeta">
    <strong>Conecta 4 contra la computadora</strong>
    <p class="tenue">La computadora decide con minimax en Prolog. Puedes abrir varias partidas a la vez.</p>
    <button id="c4">Nueva partida de Conecta 4</button>
    <div id="zona-c4" class="partidas"></div>
  </section>

  <section class="tarjeta">
    <strong>Envío de eventos</strong>
    <p id="envio" class="tenue">Sin eventos todavía.</p>
  </section>

  <section class="tarjeta">
    <strong>Instancias según GameStats</strong> <span class="tenue">(GET /api/ingest/instances, cada 2 s)</span>
    <pre id="instancias">Consultando…</pre>
  </section>

  <section class="tarjeta">
    <strong>Prueba de conexión</strong>
    <p class="tenue">Simula una culebrita que come 3 veces y choca con la pared.</p>
    <button id="una">Lanzar 1 partida de prueba</button>
    <button id="cinco">Lanzar 5 a la vez</button>
    <div id="zona-prueba"></div>
  </section>
`;

const nombre = app.querySelector<HTMLInputElement>('#nombre')!;
const envio = app.querySelector<HTMLParagraphElement>('#envio')!;
const instancias = app.querySelector<HTMLPreElement>('#instancias')!;

// Cada partida vive en su propio marco, con un botón para cerrarla.
function abrir(juego: Juego, zona: HTMLElement, titulo: string): void {
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

app.querySelector('#c4')!.addEventListener('click', () => {
  const juego = catalogo.nuevaPartida('connect4', nombre.value, despachador);
  abrir(juego, app.querySelector<HTMLDivElement>('#zona-c4')!, 'Conecta 4');
});

function lanzarPrueba(cantidad: number): void {
  for (let i = 0; i < cantidad; i++) {
    const juego = new PartidaDePrueba(new Partida('snake', [new Jugador(nombre.value)]), despachador);
    juegos.push(juego);
    juego.comenzar(app.querySelector<HTMLDivElement>('#zona-prueba')!);
  }
}
app.querySelector('#una')!.addEventListener('click', () => lanzarPrueba(1));
app.querySelector('#cinco')!.addEventListener('click', () => lanzarPrueba(5));

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
