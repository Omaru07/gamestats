// Paso 3: página de PRUEBA DE CONEXIÓN. Comprueba que la consola llega a GameStats
// a través del proxy. En el Paso 5 se reemplaza por la consola real con los 3 juegos.
import './estilos.css';
import { Jugador } from './core/Jugador.ts';
import { Partida } from './core/Partida.ts';
import { PartidaDePrueba } from './dev/PartidaDePrueba.ts';
import { DespachadorEventos } from './events/DespachadorEventos.ts';

const despachador = new DespachadorEventos();
const juegos: PartidaDePrueba[] = [];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>GameConsole</h1>
  <p class="tenue">Prueba de conexión con GameStats (Paso 3)</p>

  <section class="tarjeta">
    <label>Tu nombre <input id="nombre" value="Omar" /></label>
    <button id="una">Lanzar 1 partida de prueba</button>
    <button id="cinco">Lanzar 5 a la vez</button>
    <p class="tenue">Cada partida simula una culebrita: come 3 veces y choca con la pared.</p>
    <div id="partidas"></div>
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
const zonaPartidas = app.querySelector<HTMLDivElement>('#partidas')!;
const envio = app.querySelector<HTMLParagraphElement>('#envio')!;
const instancias = app.querySelector<HTMLPreElement>('#instancias')!;

function lanzar(cantidad: number): void {
  for (let i = 0; i < cantidad; i++) {
    const partida = new Partida('snake', [new Jugador(nombre.value)]);
    const juego = new PartidaDePrueba(partida, despachador);
    juegos.push(juego);
    juego.comenzar(zonaPartidas);
  }
}

app.querySelector('#una')!.addEventListener('click', () => lanzar(1));
app.querySelector('#cinco')!.addEventListener('click', () => lanzar(5));

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
  const abandonos = juegos.flatMap((j) => j.eventoDeAbandono() ?? []);
  despachador.enviarAlCerrar(abandonos);
});
