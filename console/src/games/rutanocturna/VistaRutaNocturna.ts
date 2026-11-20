// Dibujo de Ruta Nocturna en un <canvas>, vista horizontal y estilo pixel: carretera de
// noche, postes de neón en las orillas, líneas que corren hacia la izquierda y el tráfico
// que viene de frente con los faros encendidos. El cambio de carril se dibuja como un
// deslizamiento suave (la lógica cambia de carril al instante; solo el dibujo se interpola).
// Como en la culebrita, el teclado solo llega a la partida que tiene el foco.
import type { AccionesRuta, JuegoRutaNocturna, VistaJuegoRuta } from './JuegoRutaNocturna.ts';
import { Carretera } from './modelo.ts';

const ORILLA = 22; // franja de pasto arriba y abajo
const ANCHO_CARRIL = 52;
const ALTO = ORILLA * 2 + ANCHO_CARRIL * Carretera.CARRILES; // 252
const ANCHO = Carretera.LARGO; // 560
const ALTO_AUTO = 32; // grosor del auto visto desde arriba
const P = 4; // tamaño del "pixel" del estilo retro
const VELOCIDAD_DESLIZAMIENTO = 22; // qué tan rápido se acomoda al nuevo carril (por segundo)

const COLORES_TRAFICO = ['#e8e8e8', '#ff8a3d', '#5ad1ff', '#b4f05a'];

const CARRIL: Record<string, -1 | 1> = {
  ArrowUp: -1,
  KeyW: -1,
  ArrowDown: 1,
  KeyS: 1,
};
const TURBO = new Set(['ArrowRight', 'KeyD']);

const yDeCarril = (carril: number) => ORILLA + carril * ANCHO_CARRIL + (ANCHO_CARRIL - ALTO_AUTO) / 2;

export class VistaRutaNocturna implements VistaJuegoRuta {
  readonly #raiz: HTMLDivElement;
  readonly #info: HTMLParagraphElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #g: CanvasRenderingContext2D;
  readonly #ayuda: HTMLParagraphElement;
  #yJugador: number | null = null; // posición dibujada (se acerca suave al carril real)
  #ultimoDibujo = 0;

  constructor(contenedor: HTMLElement, acciones: AccionesRuta) {
    this.#raiz = document.createElement('div');
    this.#raiz.className = 'ruta';

    this.#info = document.createElement('p');
    this.#info.className = 'ruta-info';

    this.#canvas = document.createElement('canvas');
    this.#canvas.width = ANCHO;
    this.#canvas.height = ALTO;
    this.#canvas.tabIndex = 0;
    this.#canvas.className = 'ruta-canvas';
    this.#g = this.#canvas.getContext('2d')!;
    this.#canvas.addEventListener('keydown', (e) => {
      if (CARRIL[e.code]) {
        e.preventDefault();
        if (!e.repeat) acciones.alCambiarCarril(CARRIL[e.code]);
      } else if (TURBO.has(e.code)) {
        e.preventDefault();
        acciones.alTurbo(true);
      }
    });
    this.#canvas.addEventListener('keyup', (e) => {
      if (TURBO.has(e.code)) acciones.alTurbo(false);
    });
    this.#canvas.addEventListener('blur', () => acciones.alTurbo(false));

    this.#ayuda = document.createElement('p');
    this.#ayuda.className = 'tenue ruta-ayuda';
    this.#ayuda.textContent = 'Haz clic en la carretera: ↑ ↓ (o W y S) cambian de carril, mantén → (o D) para turbo';

    this.#raiz.append(this.#info, this.#canvas, this.#ayuda);
    contenedor.append(this.#raiz);
    this.#canvas.focus();
  }

  dibujar(juego: JuegoRutaNocturna): void {
    const g = this.#g;
    const ahora = performance.now();
    const dt = this.#ultimoDibujo ? Math.min((ahora - this.#ultimoDibujo) / 1000, 0.1) : 0;
    this.#ultimoDibujo = ahora;
    const desplazamiento = juego.recorrido;

    // Pasto de noche y asfalto
    g.fillStyle = '#070912';
    g.fillRect(0, 0, ANCHO, ALTO);
    g.fillStyle = '#1b1c27';
    g.fillRect(0, ORILLA, ANCHO, ALTO - 2 * ORILLA);
    g.fillStyle = '#2b2d3d'; // bordes del asfalto
    g.fillRect(0, ORILLA, ANCHO, P);
    g.fillRect(0, ALTO - ORILLA - P, ANCHO, P);

    // Postes de neón en las orillas, corriendo hacia la izquierda
    const separacion = 90;
    const inicio = -(desplazamiento % separacion);
    for (let x = inicio; x < ANCHO + separacion; x += separacion) {
      g.fillStyle = '#ff2fd0';
      g.fillRect(x, 6, P * 4, P * 2);
      g.fillStyle = '#21f0ff';
      g.fillRect(x + separacion / 2, ALTO - 6 - P * 2, P * 4, P * 2);
    }

    // Líneas entre carriles, discontinuas
    g.fillStyle = '#d9d9e8';
    const tramo = 36;
    const desfase = -(desplazamiento % (tramo * 2));
    for (let c = 1; c < Carretera.CARRILES; c++) {
      const y = ORILLA + c * ANCHO_CARRIL - P / 2;
      for (let x = desfase; x < ANCHO; x += tramo * 2) g.fillRect(x, y, tramo, P);
    }

    // Tráfico de frente: los faros miran a la izquierda (hacia el jugador)
    for (const auto of juego.trafico) {
      this.#auto(auto.x, yDeCarril(auto.carril), COLORES_TRAFICO[auto.color] ?? COLORES_TRAFICO[0], true);
    }

    // El jugador se desliza suave hacia su carril y se inclina un poco al moverse
    const objetivo = yDeCarril(juego.jugador.carril);
    if (this.#yJugador === null) this.#yJugador = objetivo;
    const diferencia = objetivo - this.#yJugador;
    this.#yJugador += diferencia * Math.min(1, dt * VELOCIDAD_DESLIZAMIENTO);
    if (Math.abs(objetivo - this.#yJugador) < 0.5) this.#yJugador = objetivo;
    const parpadeo = juego.invulnerable && Math.floor(ahora / 110) % 2 === 0;
    if (!parpadeo) {
      const inclinacion = Math.max(-0.12, Math.min(0.12, diferencia / 200));
      g.save();
      g.translate(juego.jugador.x + Carretera.LARGO_AUTO / 2, this.#yJugador + ALTO_AUTO / 2);
      g.rotate(inclinacion);
      g.translate(-(juego.jugador.x + Carretera.LARGO_AUTO / 2), -(this.#yJugador + ALTO_AUTO / 2));
      this.#auto(juego.jugador.x, this.#yJugador, '#18e0b0', false);
      if (juego.turbo && juego.enCurso) {
        g.fillStyle = Math.floor(ahora / 60) % 2 ? '#ffb020' : '#ff5a1f'; // llama del turbo
        g.fillRect(juego.jugador.x - P * 3, this.#yJugador + P * 2, P * 3, P * 2);
        g.fillRect(juego.jugador.x - P * 3, this.#yJugador + ALTO_AUTO - P * 4, P * 3, P * 2);
      }
      g.restore();
    }

    const vidas = '♥'.repeat(Math.max(juego.vidas, 0)) + '♡'.repeat(Math.max(3 - juego.vidas, 0));
    this.#info.textContent =
      `Puntaje: ${juego.puntaje} · ${vidas} · ${juego.velocidad} km/h${juego.turbo ? ' TURBO' : ''}` +
      ` · ${juego.distanciaKm.toFixed(2)} km`;
    if (juego.arranco && juego.enCurso) {
      this.#ayuda.textContent = '↑ ↓ cambian de carril · mantén → para turbo (doble puntaje)';
    }
  }

  mostrarFinal(puntaje: number, esquivados: number, distanciaKm: number): void {
    this.#info.textContent = `¡Fin del viaje! Puntaje: ${puntaje}`;
    this.#ayuda.textContent =
      `Esquivaste ${esquivados} autos y recorriste ${distanciaKm.toFixed(2)} km. ¡Buen manejo!`;
    const g = this.#g;
    g.fillStyle = 'rgb(0 0 0 / 0.6)';
    g.fillRect(0, ALTO / 2 - 28, ANCHO, 56);
    g.fillStyle = '#ff2fd0';
    g.font = 'bold 24px monospace';
    g.textAlign = 'center';
    g.fillText('FIN DEL VIAJE', ANCHO / 2, ALTO / 2 + 8);
  }

  destruir(): void {
    this.#raiz.remove();
  }

  // Un auto de pixeles visto desde arriba, de largo LARGO_AUTO y grosor ALTO_AUTO.
  // deFrente = mira a la izquierda (tráfico); si no, mira a la derecha (jugador).
  #auto(x: number, y: number, color: string, deFrente: boolean): void {
    const g = this.#g;
    const largo = Carretera.LARGO_AUTO;
    const frente = deFrente ? x : x + largo; // borde donde van los faros
    const atras = deFrente ? x + largo : x;

    g.fillStyle = color;
    g.fillRect(x, y + P, largo, ALTO_AUTO - 2 * P); // carrocería
    g.fillRect(x + P * 2, y, largo - P * 4, ALTO_AUTO);
    g.fillStyle = '#0b0d1a'; // parabrisas (cerca del frente) y vidrio trasero
    const xParabrisas = deFrente ? x + P * 4 : x + largo - P * 6;
    const xTrasero = deFrente ? x + largo - P * 5 : x + P * 3;
    g.fillRect(xParabrisas, y + P * 2, P * 2, ALTO_AUTO - P * 4);
    g.fillRect(xTrasero, y + P * 2, P * 2, ALTO_AUTO - P * 4);

    // Faros (amarillos) adelante, con su haz de luz, y luces traseras (rojas) atrás
    const xFaro = deFrente ? frente : frente - P;
    g.fillStyle = '#ffe680';
    g.fillRect(xFaro, y + P, P, P * 2);
    g.fillRect(xFaro, y + ALTO_AUTO - P * 3, P, P * 2);
    g.fillStyle = 'rgb(255 230 128 / 0.13)';
    if (deFrente) g.fillRect(frente - P * 12, y - P, P * 12, ALTO_AUTO + P * 2);
    else g.fillRect(frente, y - P, P * 12, ALTO_AUTO + P * 2);
    const xTrasera = deFrente ? atras - P : atras;
    g.fillStyle = '#ff3355';
    g.fillRect(xTrasera, y + P, P, P * 2);
    g.fillRect(xTrasera, y + ALTO_AUTO - P * 3, P, P * 2);
  }
}
