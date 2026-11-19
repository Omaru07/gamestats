// Panel de control: consulta a GameStats cada 2 segundos y muestra, por separado,
// 1) las estadísticas GENERALES (Scala, /stats -> general),
// 2) las INSTANCIAS en vivo por juego (Go, /instances), que incluyen las partidas en curso,
// 3) las estadísticas POR JUEGO (Scala, /stats -> games), con una pestaña por juego.
// Scala solo analiza una partida cuando termina; por eso lo "en vivo" viene de Go.
import type { ClienteGameStats, Instancias, Panorama, PartidaEnGo } from './ClienteGameStats.ts';
import { ETIQUETAS_GENERALES, ETIQUETAS_POR_JUEGO, type Fila, filas, NOMBRES_JUEGO } from './etiquetas.ts';

const ESTADOS_GO: Record<PartidaEnGo['status'], string> = {
  ACTIVE: 'en juego',
  COMPLETE: 'enviándose',
  SENT: 'analizada',
  FAILED: 'falló el análisis',
};

export class PanelEstadisticas {
  static readonly INTERVALO_MS = 2000;

  readonly #cliente: ClienteGameStats;
  readonly #juegos: readonly string[]; // los juegos de la consola, en orden
  readonly #raiz: HTMLElement;
  readonly #general: HTMLElement;
  readonly #instancias: HTMLElement;
  readonly #pestanas: HTMLElement;
  readonly #porJuego: HTMLElement;
  readonly #enVivo: HTMLElement;
  readonly #estado: HTMLElement;
  #juegoElegido: string;
  #ultimoPanorama: Panorama | null = null;
  #reloj: ReturnType<typeof setInterval> | null = null;

  constructor(contenedor: HTMLElement, cliente: ClienteGameStats, juegos: readonly string[]) {
    this.#cliente = cliente;
    this.#juegos = juegos;
    this.#juegoElegido = juegos[0];

    this.#raiz = document.createElement('aside');
    this.#raiz.className = 'panel';
    this.#raiz.innerHTML = `
      <header class="panel-cabecera">
        <h2>Panel de estadísticas</h2>
        <span class="panel-estado tenue">Consultando GameStats…</span>
      </header>
      <section class="panel-bloque">
        <h3>General <span class="tenue">· todos los juegos</span></h3>
        <dl class="panel-general"></dl>
      </section>
      <section class="panel-bloque">
        <h3>Instancias ejecutadas <span class="tenue">· en vivo</span></h3>
        <div class="panel-instancias"></div>
        <div class="panel-envivo"></div>
      </section>
      <section class="panel-bloque">
        <h3>Por juego</h3>
        <div class="panel-pestanas" role="tablist"></div>
        <dl class="panel-juego"></dl>
      </section>
      <p class="tenue panel-nota">Todos los valores los calcula GameStats (Scala y Go); la consola solo los muestra.</p>
    `;
    this.#general = this.#raiz.querySelector('.panel-general')!;
    this.#instancias = this.#raiz.querySelector('.panel-instancias')!;
    this.#enVivo = this.#raiz.querySelector('.panel-envivo')!;
    this.#pestanas = this.#raiz.querySelector('.panel-pestanas')!;
    this.#porJuego = this.#raiz.querySelector('.panel-juego')!;
    this.#estado = this.#raiz.querySelector('.panel-estado')!;

    for (const gameId of juegos) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.role = 'tab';
      boton.textContent = NOMBRES_JUEGO[gameId] ?? gameId;
      boton.dataset.juego = gameId;
      boton.addEventListener('click', () => {
        this.#juegoElegido = gameId;
        this.#pintarPorJuego();
      });
      this.#pestanas.append(boton);
    }
    contenedor.append(this.#raiz);
  }

  iniciar(): void {
    void this.actualizar();
    this.#reloj = setInterval(() => void this.actualizar(), PanelEstadisticas.INTERVALO_MS);
  }

  detener(): void {
    if (this.#reloj) clearInterval(this.#reloj);
    this.#reloj = null;
  }

  // Las tres consultas van en paralelo; si un servicio falla, lo demás se sigue mostrando.
  async actualizar(): Promise<void> {
    const [panorama, instancias, partidas] = await Promise.allSettled([
      this.#cliente.panorama(),
      this.#cliente.instancias(),
      this.#cliente.partidas(),
    ]);
    const errores: string[] = [];

    if (panorama.status === 'fulfilled') {
      this.#ultimoPanorama = panorama.value;
      this.#pintarDl(this.#general, filas(panorama.value.general, ETIQUETAS_GENERALES));
      this.#pintarPorJuego();
    } else {
      errores.push('Scala no responde');
    }

    if (instancias.status === 'fulfilled') this.#pintarInstancias(instancias.value);
    else errores.push('Go no responde');

    if (partidas.status === 'fulfilled') this.#pintarEnVivo(partidas.value);

    const hora = new Date().toLocaleTimeString('es');
    this.#estado.textContent = errores.length ? `${errores.join(' · ')} (${hora})` : `Actualizado ${hora}`;
    this.#estado.classList.toggle('error', errores.length > 0);
  }

  #pintarPorJuego(): void {
    for (const b of this.#pestanas.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-selected', String(b.dataset.juego === this.#juegoElegido));
    }
    const resumen = this.#ultimoPanorama?.games.find((g) => g.gameId === this.#juegoElegido);
    if (!resumen) {
      this.#porJuego.innerHTML = '<p class="tenue">Sin datos de este juego todavía.</p>';
      return;
    }
    this.#pintarDl(this.#porJuego, filas(resumen, ETIQUETAS_POR_JUEGO[this.#juegoElegido] ?? {}));
  }

  #pintarInstancias(datos: Instancias): void {
    const tabla = document.createElement('table');
    tabla.className = 'panel-tabla';
    tabla.innerHTML = `
      <thead><tr><th>Juego</th><th>Total</th><th>En juego</th><th>Analizadas</th><th>Fallidas</th></tr></thead>
    `;
    const cuerpo = document.createElement('tbody');
    for (const gameId of this.#juegos) {
      const g = datos.games.find((x) => x.gameId === gameId);
      const fila = document.createElement('tr');
      const celdas = [
        NOMBRES_JUEGO[gameId] ?? gameId,
        g?.total ?? 0,
        g?.active ?? 0,
        g?.sent ?? 0,
        g?.failed ?? 0,
      ];
      for (const valor of celdas) {
        const td = document.createElement('td');
        td.textContent = String(valor);
        fila.append(td);
      }
      cuerpo.append(fila);
    }
    tabla.append(cuerpo);
    const total = document.createElement('p');
    total.className = 'panel-total';
    total.textContent = `Total en GameStats (todos los juegos): ${datos.total}`;
    this.#instancias.replaceChildren(tabla, total);
  }

  // Las partidas que están corriendo ahora mismo (en esta pestaña o en otras).
  #pintarEnVivo(partidas: PartidaEnGo[]): void {
    const activas = partidas.filter((p) => p.status === 'ACTIVE' && this.#juegos.includes(p.gameId));
    if (activas.length === 0) {
      this.#enVivo.innerHTML = '<p class="tenue">Ninguna partida en curso.</p>';
      return;
    }
    const lista = document.createElement('ul');
    lista.className = 'panel-lista';
    for (const p of activas.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent =
        `${NOMBRES_JUEGO[p.gameId] ?? p.gameId} · ${p.matchId.slice(0, 8)} · ` +
        `${p.eventCount} eventos · ${ESTADOS_GO[p.status]}`;
      lista.append(li);
    }
    const titulo = document.createElement('p');
    titulo.className = 'tenue';
    titulo.textContent = `${activas.length} en curso ahora mismo (de todas las pestañas):`;
    this.#enVivo.replaceChildren(titulo, lista);
  }

  #pintarDl(dl: HTMLElement, datos: Fila[]): void {
    const nodos = datos.flatMap((f) => {
      const dt = document.createElement('dt');
      dt.textContent = f.etiqueta;
      const dd = document.createElement('dd');
      dd.textContent = f.valor;
      return [dt, dd];
    });
    if (nodos.length === 0) {
      dl.innerHTML = '<p class="tenue">Sin partidas analizadas todavía.</p>';
      return;
    }
    dl.replaceChildren(...nodos);
  }
}
