// GameConsole: arma la consola (juegos y partidas) y el panel de estadísticas.
//   - DespachadorEventos: envía los eventos de todas las partidas a GameStats (Go).
//   - Consola: abre partidas, varias a la vez, en esta pestaña o en otras.
//   - PanelEstadisticas: consulta a GameStats cada 2 s y muestra lo que calcula.
import './estilos.css';
import { Consola } from './consola/Consola.ts';
import { DespachadorEventos } from './events/DespachadorEventos.ts';
import { crearCatalogo } from './games/catalogo.ts';
import { ClienteGameStats } from './panel/ClienteGameStats.ts';
import { PanelEstadisticas } from './panel/PanelEstadisticas.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="encabezado">
    <h1>GameConsole</h1>
    <p class="tenue">Tres juegos, varias partidas a la vez y sus estadísticas en vivo desde GameStats.</p>
  </header>
  <div class="distribucion"></div>
`;
const distribucion = app.querySelector<HTMLDivElement>('.distribucion')!;

const catalogo = crearCatalogo();
const despachador = new DespachadorEventos();
const consola = new Consola(distribucion, catalogo, despachador);
const panel = new PanelEstadisticas(
  distribucion,
  new ClienteGameStats(),
  catalogo.todos().map((j) => j.gameId),
);
panel.iniciar();

// "Abrir en otra pestaña" llega con ?juego=<gameId>: se abre esa partida de una vez.
const pedido = new URLSearchParams(window.location.search).get('juego');
if (pedido && catalogo.obtener(pedido)) consola.abrirPartida(pedido);
