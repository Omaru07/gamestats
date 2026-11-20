// La consola: muestra los juegos del catálogo, abre partidas (varias a la vez, del mismo
// juego o de juegos distintos), las abre en otra pestaña y avisa a GameStats si se cierran
// a medias. Cada partida va en su propio marco con el estado del envío de sus eventos.
import type { Juego } from '../core/Juego.ts';
import type { RegistroJuegos } from '../core/RegistroJuegos.ts';
import type { DespachadorEventos, EstadoEnvio } from '../events/DespachadorEventos.ts';

const RESULTADOS: Record<string, string> = {
  WIN: 'Ganaste',
  LOSS: 'Terminó',
  DRAW: 'Empate',
  ABANDONED: 'Abandonada',
};

const CLAVE_NOMBRE = 'gameconsole.nombre';

export class Consola {
  readonly #catalogo: RegistroJuegos;
  readonly #despachador: DespachadorEventos;
  readonly #zonaPartidas: HTMLElement;
  readonly #nombre: HTMLInputElement;
  readonly #envio: HTMLElement;
  readonly #abiertas = new Map<string, { juego: Juego; estadoEnvio: HTMLElement }>();

  constructor(contenedor: HTMLElement, catalogo: RegistroJuegos, despachador: DespachadorEventos) {
    this.#catalogo = catalogo;
    this.#despachador = despachador;

    const raiz = document.createElement('main');
    raiz.className = 'consola';
    raiz.innerHTML = `
      <section class="tarjeta consola-jugador">
        <label>Tu nombre <input class="consola-nombre" maxlength="30" /></label>
        <span class="consola-envio tenue">Sin eventos enviados todavía.</span>
      </section>
      <section class="consola-juegos"></section>
      <h2 class="consola-subtitulo">Partidas abiertas <span class="tenue consola-cuantas"></span></h2>
      <section class="partidas consola-partidas">
        <p class="tenue consola-vacio">Elige un juego para empezar. Puedes abrir varias partidas a la vez.</p>
      </section>
    `;
    this.#nombre = raiz.querySelector('.consola-nombre')!;
    this.#envio = raiz.querySelector('.consola-envio')!;
    this.#zonaPartidas = raiz.querySelector('.consola-partidas')!;
    this.#nombre.value = Consola.#leerNombre();
    this.#nombre.addEventListener('change', () => Consola.#guardarNombre(this.#nombre.value));

    const zonaJuegos = raiz.querySelector<HTMLElement>('.consola-juegos')!;
    for (const def of catalogo.todos()) {
      const tarjeta = document.createElement('article');
      tarjeta.className = `tarjeta juego-tarjeta juego-${def.gameId}`;
      const titulo = document.createElement('h3');
      titulo.textContent = def.nombre;
      const descripcion = document.createElement('p');
      descripcion.className = 'tenue';
      descripcion.textContent = def.descripcion;
      const nueva = document.createElement('button');
      nueva.textContent = 'Nueva partida';
      nueva.addEventListener('click', () => this.abrirPartida(def.gameId));
      const otra = document.createElement('button');
      otra.className = 'secundario';
      otra.textContent = 'Abrir en otra pestaña';
      otra.title = 'Otra pestaña del navegador, con su propia partida';
      otra.addEventListener('click', () => this.abrirEnOtraPestana(def.gameId));
      const botones = document.createElement('div');
      botones.className = 'juego-botones';
      botones.append(nueva, otra);
      tarjeta.append(titulo, descripcion, botones);
      zonaJuegos.append(tarjeta);
    }

    despachador.suscribir((matchId, estado) => this.#mostrarEnvio(matchId, estado));
    // Al cerrar la pestaña, las partidas en curso se marcan como abandonadas en GameStats.
    window.addEventListener('pagehide', () => this.#avisarAbandonos());
    contenedor.append(raiz);
  }

  abrirPartida(gameId: string): Juego {
    Consola.#guardarNombre(this.#nombre.value);
    const juego = this.#catalogo.nuevaPartida(gameId, this.#nombre.value, this.#despachador);
    const def = this.#catalogo.obtener(gameId)!;

    const marco = document.createElement('article');
    marco.className = 'marco-partida';
    const cabecera = document.createElement('header');
    const titulo = document.createElement('span');
    titulo.textContent = `${def.nombre} `;
    const id = document.createElement('span');
    id.className = 'tenue';
    id.textContent = `· ${juego.matchId.slice(0, 8)}`;
    id.title = `matchId ${juego.matchId}`;
    titulo.append(id);
    const estadoEnvio = document.createElement('span');
    estadoEnvio.className = 'marco-envio tenue';
    const cerrar = document.createElement('button');
    cerrar.className = 'secundario';
    cerrar.textContent = 'Cerrar';
    cerrar.addEventListener('click', () => {
      juego.cerrar(); // si seguía en curso, cuenta como abandonada
      marco.remove();
      this.#abiertas.delete(juego.matchId);
      this.#actualizarContador();
    });
    cabecera.append(titulo, estadoEnvio, cerrar);
    const cuerpo = document.createElement('div');
    marco.append(cabecera, cuerpo);

    juego.alTerminar((partida) => {
      const etiqueta = document.createElement('span');
      etiqueta.className = `marco-resultado resultado-${partida.resultado}`;
      etiqueta.textContent = RESULTADOS[partida.resultado ?? ''] ?? '';
      titulo.append(' ', etiqueta);
    });

    this.#zonaPartidas.querySelector('.consola-vacio')?.remove();
    this.#zonaPartidas.prepend(marco);
    this.#abiertas.set(juego.matchId, { juego, estadoEnvio });
    juego.comenzar(cuerpo);
    this.#actualizarContador();
    return juego;
  }

  // La otra pestaña abre sola una partida nueva de ese juego (ver main.ts: ?juego=...).
  abrirEnOtraPestana(gameId: string): void {
    Consola.#guardarNombre(this.#nombre.value);
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('juego', gameId);
    window.open(url, '_blank');
  }

  #mostrarEnvio(matchId: string, estado: EstadoEnvio): void {
    const abierta = this.#abiertas.get(matchId);
    if (abierta) {
      abierta.estadoEnvio.textContent =
        estado.pendientes > 0
          ? `↑ ${estado.pendientes} por enviar`
          : `✓ ${estado.enviados} eventos en GameStats`;
      abierta.estadoEnvio.classList.toggle('error', estado.reintentos > 0 && estado.pendientes > 0);
    }
    const t = this.#despachador.totales();
    this.#envio.textContent =
      `Eventos enviados: ${t.enviados} · pendientes: ${t.pendientes}` +
      (t.descartados ? ` · rechazados: ${t.descartados}` : '') +
      (t.pendientes > 0 && t.ultimoError ? ` · reintentando (${t.ultimoError})` : '');
    this.#envio.classList.toggle('error', t.pendientes > 0 && t.ultimoError !== null);
  }

  #actualizarContador(): void {
    const n = this.#abiertas.size;
    this.#zonaPartidas.parentElement!.querySelector('.consola-cuantas')!.textContent =
      n === 0 ? '' : `· ${n}`;
  }

  #avisarAbandonos(): void {
    const eventos = [...this.#abiertas.values()].flatMap(({ juego }) => juego.eventoDeAbandono() ?? []);
    this.#despachador.enviarAlCerrar(eventos);
  }

  // El nombre se recuerda entre pestañas. Si el navegador no deja guardar, no pasa nada.
  static #leerNombre(): string {
    try {
      return localStorage.getItem(CLAVE_NOMBRE) ?? 'Omar';
    } catch {
      return 'Omar';
    }
  }

  static #guardarNombre(nombre: string): void {
    try {
      localStorage.setItem(CLAVE_NOMBRE, nombre);
    } catch {
      // sin almacenamiento: el nombre solo vale en esta pestaña
    }
  }
}
