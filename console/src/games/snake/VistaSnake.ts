// Traducción de VentanaSnake.java: el mismo dibujo (cuadrícula, comida redonda, cabeza de
// otro color) con los colores de Omar, ahora en un <canvas>. Las teclas solo llegan a la
// culebrita que tiene el foco, para que varias partidas en pantalla no se muevan juntas.
import type { AccionesSnake, CausaMuerte, JuegoSnake, VistaJuegoSnake } from './JuegoSnake.ts';
import type { Direccion } from './Serpiente.ts';

const TAMANO_CELDA = 18; // px por celda (25 en Java; aquí más chico para que quepan varias)
const COLOR_FONDO = 'rgb(34 34 34)';
const COLOR_SERPIENTE = 'rgb(76 175 80)';
const COLOR_CABEZA = 'rgb(139 195 74)';
const COLOR_COMIDA = 'rgb(244 67 54)';
const COLOR_BORDE_COMIDA = 'rgb(255 100 100)';
const COLOR_GRID = 'rgb(50 50 50)';

const TECLAS: Record<string, Direccion> = {
  ArrowUp: 'ARRIBA',
  KeyW: 'ARRIBA',
  ArrowDown: 'ABAJO',
  KeyS: 'ABAJO',
  ArrowLeft: 'IZQUIERDA',
  KeyA: 'IZQUIERDA',
  ArrowRight: 'DERECHA',
  KeyD: 'DERECHA',
};

const CAUSAS: Record<CausaMuerte, string> = {
  wall: 'chocaste con la pared',
  self: 'te mordiste la cola',
};

export class VistaSnake implements VistaJuegoSnake {
  readonly #raiz: HTMLDivElement;
  readonly #info: HTMLParagraphElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #ayuda: HTMLParagraphElement;

  constructor(contenedor: HTMLElement, acciones: AccionesSnake) {
    this.#raiz = document.createElement('div');
    this.#raiz.className = 'snake';

    this.#info = document.createElement('p');
    this.#info.className = 'snake-info';

    this.#canvas = document.createElement('canvas');
    this.#canvas.tabIndex = 0; // puede recibir el foco (y el teclado)
    this.#canvas.className = 'snake-canvas';
    this.#ctx = this.#canvas.getContext('2d')!;
    this.#canvas.addEventListener('keydown', (e) => {
      const direccion = TECLAS[e.code];
      if (direccion) {
        e.preventDefault(); // que las flechas no muevan la página
        acciones.alCambiarDireccion(direccion);
      }
    });

    this.#ayuda = document.createElement('p');
    this.#ayuda.className = 'tenue snake-ayuda';
    this.#ayuda.textContent = 'Haz clic en el tablero y usa las flechas (o WASD) para empezar';

    this.#raiz.append(this.#info, this.#canvas, this.#ayuda);
    contenedor.append(this.#raiz);
    this.#canvas.focus();
  }

  dibujar(juego: JuegoSnake): void {
    const n = 20;
    const lado = n * TAMANO_CELDA;
    if (this.#canvas.width !== lado) {
      this.#canvas.width = lado;
      this.#canvas.height = lado;
    }
    const g = this.#ctx;

    g.fillStyle = COLOR_FONDO;
    g.fillRect(0, 0, lado, lado);

    // Cuadrícula
    g.strokeStyle = COLOR_GRID;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      g.moveTo(i * TAMANO_CELDA + 0.5, 0);
      g.lineTo(i * TAMANO_CELDA + 0.5, lado);
      g.moveTo(0, i * TAMANO_CELDA + 0.5);
      g.lineTo(lado, i * TAMANO_CELDA + 0.5);
    }
    g.stroke();

    // Comida (círculo con borde brillante)
    const { x: cx, y: cy } = juego.comida;
    const radio = (TAMANO_CELDA - 6) / 2;
    g.beginPath();
    g.arc(cx * TAMANO_CELDA + TAMANO_CELDA / 2, cy * TAMANO_CELDA + TAMANO_CELDA / 2, radio, 0, Math.PI * 2);
    g.fillStyle = COLOR_COMIDA;
    g.fill();
    g.strokeStyle = COLOR_BORDE_COMIDA;
    g.stroke();

    // Serpiente (la cabeza de otro color)
    juego.serpiente.cuerpo.forEach((p, i) => {
      if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return; // la cabeza que salió del tablero
      g.fillStyle = i === 0 ? COLOR_CABEZA : COLOR_SERPIENTE;
      g.beginPath();
      g.roundRect(p.x * TAMANO_CELDA + 2, p.y * TAMANO_CELDA + 2, TAMANO_CELDA - 4, TAMANO_CELDA - 4, 4);
      g.fill();
    });

    this.#info.textContent = `Puntaje: ${juego.puntaje} | Longitud: ${juego.serpiente.longitud}`;
    if (juego.arranco && juego.enCurso) this.#ayuda.textContent = 'Usa las flechas ↑ ↓ ← → para moverte';
  }

  mostrarFinal(puntaje: number, longitud: number, causa: CausaMuerte): void {
    this.#info.textContent = `¡Juego terminado! Puntaje final: ${puntaje} · Longitud final: ${longitud}`;
    this.#ayuda.textContent = `Se acabó: ${CAUSAS[causa]}. ¡Buen intento!`;
  }

  destruir(): void {
    this.#raiz.remove();
  }
}
