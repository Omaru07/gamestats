// Traducción de VentanaConecta4.java (Swing) a HTML: los mismos botones ▼ por columna,
// el tablero azul y los colores de Omar. Solo dibuja y avisa la columna elegida.
import type { DecisionIA } from './ClienteIA.ts';
import type { AccionesConecta4, TipoEstado, VistaTablero } from './JuegoConecta4.ts';
import { COMPUTADORA, JUGADOR, type Posicion, TableroConecta4 } from './TableroConecta4.ts';

const RAZONES: Record<string, string> = {
  win: 'jugada ganadora',
  block: 'tapó tu 4 en línea',
  minimax: 'búsqueda minimax',
};

export class VistaConecta4 implements VistaTablero {
  readonly #raiz: HTMLDivElement;
  readonly #estado: HTMLParagraphElement;
  readonly #decision: HTMLParagraphElement;
  readonly #botones: HTMLButtonElement[] = [];
  readonly #celdas: HTMLDivElement[][] = [];

  constructor(contenedor: HTMLElement, acciones: AccionesConecta4) {
    this.#raiz = document.createElement('div');
    this.#raiz.className = 'c4';

    this.#estado = document.createElement('p');
    this.#estado.className = 'c4-estado';

    const columnas = document.createElement('div');
    columnas.className = 'c4-columnas';
    for (let c = 0; c < TableroConecta4.COLUMNAS; c++) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.textContent = '▼';
      boton.title = `Columna ${c + 1}`;
      boton.addEventListener('click', () => acciones.alElegirColumna(c));
      this.#botones.push(boton);
      columnas.append(boton);
    }

    const tablero = document.createElement('div');
    tablero.className = 'c4-tablero';
    for (let f = 0; f < TableroConecta4.FILAS; f++) {
      const fila: HTMLDivElement[] = [];
      for (let c = 0; c < TableroConecta4.COLUMNAS; c++) {
        const celda = document.createElement('div');
        celda.className = 'c4-celda';
        fila.push(celda);
        tablero.append(celda);
      }
      this.#celdas.push(fila);
    }

    this.#decision = document.createElement('p');
    this.#decision.className = 'c4-decision tenue';

    this.#raiz.append(this.#estado, columnas, tablero, this.#decision);
    contenedor.append(this.#raiz);
  }

  actualizar(tablero: TableroConecta4): void {
    for (let f = 0; f < TableroConecta4.FILAS; f++) {
      for (let c = 0; c < TableroConecta4.COLUMNAS; c++) {
        const ficha = tablero.celda(f, c);
        const celda = this.#celdas[f][c];
        celda.classList.toggle('c4-jugador', ficha === JUGADOR);
        celda.classList.toggle('c4-computadora', ficha === COMPUTADORA);
      }
    }
  }

  mostrarEstado(texto: string, tipo: TipoEstado = 'normal'): void {
    this.#estado.textContent = texto;
    this.#estado.dataset.tipo = tipo;
  }

  // Lo que decidió Prolog y por qué: sirve para explicar la IA en la demostración.
  mostrarDecision(d: DecisionIA): void {
    const razon = RAZONES[d.reason] ?? d.reason;
    this.#decision.textContent =
      `La IA (Prolog) jugó en la columna ${d.column + 1}: ${razon}. ` +
      `Revisó ${d.nodesExplored.toLocaleString('es')} tableros a profundidad ${d.depth} ` +
      `en ${d.thinkMs} ms (puntaje ${d.score}).`;
  }

  mostrarFinal(mensaje: string, linea: Posicion[] | null): void {
    this.mostrarEstado(mensaje, 'normal');
    this.#estado.dataset.final = 'si';
    for (const [f, c] of linea ?? []) this.#celdas[f][c].classList.add('c4-ganadora');
  }

  permitirJugar(permitir: boolean): void {
    for (const b of this.#botones) b.disabled = !permitir;
  }

  destruir(): void {
    this.#raiz.remove();
  }
}
