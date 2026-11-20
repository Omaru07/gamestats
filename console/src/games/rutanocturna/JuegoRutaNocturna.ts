// Ruta Nocturna (gameId "nightdrive"): manejar de noche por una carretera horizontal
// esquivando el tráfico que viene de frente. 4 carriles, 3 vidas, la velocidad sube con
// el tiempo y con turbo se va más rápido a cambio del doble de puntos. Juego original del
// proyecto: la mecánica es la clásica de estos juegos retro, el arte y los nombres son propios.
//
// Toda la lógica está en avanzar(ms), que mueve el mundo ese tiempo. El reloj real
// (requestAnimationFrame, unos 60 cuadros por segundo) solo llama a avanzar con el tiempo
// transcurrido; en las pruebas se llama a mano, sin navegador ni esperas.
import { Juego } from '../../core/Juego.ts';
import type { Partida } from '../../core/Partida.ts';
import type { DatosEvento, ReceptorEventos } from '../../events/tipos.ts';
import { AutoJugador, AutoTrafico, Carretera } from './modelo.ts';
import { VistaRutaNocturna } from './VistaRutaNocturna.ts';

export interface AccionesRuta {
  alCambiarCarril(delta: -1 | 1): void;
  alTurbo(activo: boolean): void;
}

export interface VistaJuegoRuta {
  dibujar(juego: JuegoRutaNocturna): void;
  mostrarFinal(puntaje: number, esquivados: number, distanciaKm: number): void;
  destruir(): void;
}

export interface OpcionesRuta {
  aleatorio?: () => number;
  crearVista?: (contenedor: HTMLElement, acciones: AccionesRuta) => VistaJuegoRuta;
  usarReloj?: boolean;
}

export class JuegoRutaNocturna extends Juego {
  static readonly VIDAS = 3;
  static readonly VELOCIDAD_INICIAL = 120; // km/h
  static readonly VELOCIDAD_MAXIMA = 320;
  static readonly ACELERACION = 6; // km/h que sube cada INTERVALO_ACELERACION
  static readonly INTERVALO_ACELERACION = 2000; // ms
  static readonly PIXELES_POR_KMH = 4; // a 120 km/h el tráfico se acerca 480 unidades por segundo
  static readonly FACTOR_TURBO = 1.4;
  static readonly INVULNERABLE_MS = 1500; // tras un choque, un respiro para reacomodarse
  static readonly PUNTOS_POR_AUTO = 10;

  readonly #jugador = new AutoJugador(1);
  readonly #trafico: AutoTrafico[] = [];
  readonly #aleatorio: () => number;
  readonly #crearVista: (contenedor: HTMLElement, acciones: AccionesRuta) => VistaJuegoRuta;
  readonly #usarReloj: boolean;
  #vista: VistaJuegoRuta | null = null;
  #vidas = JuegoRutaNocturna.VIDAS;
  #velocidadBase = JuegoRutaNocturna.VELOCIDAD_INICIAL;
  #turbo = false;
  #puntaje = 0;
  #esquivados = 0;
  #distanciaKm = 0;
  #recorrido = 0; // para que la vista desplace las líneas del camino
  #hastaAcelerar = JuegoRutaNocturna.INTERVALO_ACELERACION;
  #hastaProximoAuto = 500;
  #invulnerableMs = 0;
  #arranco = false;
  #cuadro: number | null = null;
  #ultimoInstante: number | null = null;

  constructor(partida: Partida, receptor: ReceptorEventos, opciones: OpcionesRuta = {}) {
    super(partida, receptor);
    this.#aleatorio = opciones.aleatorio ?? Math.random;
    this.#crearVista = opciones.crearVista ?? ((c, a) => new VistaRutaNocturna(c, a));
    this.#usarReloj = opciones.usarReloj ?? true;
  }

  get jugador(): AutoJugador {
    return this.#jugador;
  }
  get trafico(): readonly AutoTrafico[] {
    return this.#trafico;
  }
  get vidas(): number {
    return this.#vidas;
  }
  // Velocidad real (con turbo si está activo), en km/h enteros.
  get velocidad(): number {
    return Math.round(this.#velocidadBase * (this.#turbo ? JuegoRutaNocturna.FACTOR_TURBO : 1));
  }
  get turbo(): boolean {
    return this.#turbo;
  }
  get puntaje(): number {
    return this.#puntaje;
  }
  get esquivados(): number {
    return this.#esquivados;
  }
  get distanciaKm(): number {
    return this.#distanciaKm;
  }
  get recorrido(): number {
    return this.#recorrido;
  }
  get invulnerable(): boolean {
    return this.#invulnerableMs > 0;
  }
  get arranco(): boolean {
    return this.#arranco;
  }

  protected datosDeInicio(): DatosEvento {
    return { lanes: Carretera.CARRILES, lives: JuegoRutaNocturna.VIDAS };
  }

  protected montar(contenedor: HTMLElement): void {
    this.#vista = this.#crearVista(contenedor, {
      alCambiarCarril: (delta) => this.cambiarCarril(delta),
      alTurbo: (activo) => this.usarTurbo(activo),
    });
    this.#vista.dibujar(this);
    if (this.#usarReloj) this.#cuadro = requestAnimationFrame((t) => this.#bucle(t));
  }

  protected desmontar(): void {
    this.#detenerReloj();
    this.#vista?.destruir();
    this.#vista = null;
  }

  cambiarCarril(delta: -1 | 1): void {
    if (!this.enCurso) return;
    this.#arranco = true;
    const cambio = this.#jugador.cambiarCarril(delta);
    if (cambio) {
      this.emitir('LANE_CHANGED', { from: cambio.desde, to: cambio.hasta }, this.partida.humano.id);
    }
  }

  usarTurbo(activo: boolean): void {
    if (!this.enCurso) return;
    if (activo) this.#arranco = true;
    this.#turbo = activo;
  }

  // Mueve el mundo "ms" milisegundos.
  avanzar(ms: number): void {
    if (!this.enCurso || !this.#arranco) return;
    const dt = Math.min(ms, 100); // si la pestaña estuvo oculta, no dar un salto enorme

    // La velocidad base sube de a poco hasta el máximo; el turbo la multiplica.
    this.#hastaAcelerar -= dt;
    while (this.#hastaAcelerar <= 0) {
      this.#velocidadBase = Math.min(
        this.#velocidadBase + JuegoRutaNocturna.ACELERACION,
        JuegoRutaNocturna.VELOCIDAD_MAXIMA,
      );
      this.#hastaAcelerar += JuegoRutaNocturna.INTERVALO_ACELERACION;
    }
    const velocidad = this.#velocidadBase * (this.#turbo ? JuegoRutaNocturna.FACTOR_TURBO : 1);
    const avance = (velocidad * JuegoRutaNocturna.PIXELES_POR_KMH * dt) / 1000;
    this.#recorrido += avance;
    this.#distanciaKm += (velocidad * dt) / 3_600_000;
    this.#invulnerableMs = Math.max(0, this.#invulnerableMs - dt);

    // Aparece tráfico: cada vez más seguido mientras más rápido se va.
    this.#hastaProximoAuto -= dt;
    if (this.#hastaProximoAuto <= 0) {
      this.#agregarAuto();
      const ritmo = (this.#velocidadBase - JuegoRutaNocturna.VELOCIDAD_INICIAL) /
        (JuegoRutaNocturna.VELOCIDAD_MAXIMA - JuegoRutaNocturna.VELOCIDAD_INICIAL);
      this.#hastaProximoAuto = 900 - 550 * ritmo; // de 0.9 s a 0.35 s entre autos
    }

    for (const auto of [...this.#trafico]) {
      auto.avanzar(avance);
      if (!this.invulnerable && auto.chocaCon(this.#jugador)) {
        this.#quitar(auto);
        this.#chocar();
        if (!this.enCurso) return;
      } else if (auto.paso) {
        this.#quitar(auto);
        this.#esquivar();
      }
    }
    this.#vista?.dibujar(this);
  }

  // Pone un auto en ese carril, entrando por la derecha (lo usan #agregarAuto y las pruebas).
  agregarAutoEn(carril: number, x?: number): AutoTrafico {
    const auto = new AutoTrafico(carril, Math.floor(this.#aleatorio() * 4), x);
    this.#trafico.push(auto);
    return auto;
  }

  // Un auto en un carril al azar. Para que siempre haya salida, no aparece en el carril
  // del auto anterior si este todavía va entrando.
  #agregarAuto(): void {
    let carril = Math.floor(this.#aleatorio() * Carretera.CARRILES);
    const anterior = this.#trafico.at(-1);
    if (anterior && anterior.carril === carril && anterior.x > Carretera.LARGO - Carretera.LARGO_AUTO * 2) {
      carril = (carril + 1 + Math.floor(this.#aleatorio() * (Carretera.CARRILES - 1))) % Carretera.CARRILES;
    }
    this.agregarAutoEn(carril);
  }

  #quitar(auto: AutoTrafico): void {
    this.#trafico.splice(this.#trafico.indexOf(auto), 1);
  }

  #esquivar(): void {
    this.#esquivados++;
    this.#puntaje += JuegoRutaNocturna.PUNTOS_POR_AUTO * (this.#turbo ? 2 : 1);
    this.emitir('CAR_DODGED', { score: this.#puntaje, speed: this.velocidad }, this.partida.humano.id);
  }

  #chocar(): void {
    this.#vidas--;
    this.#invulnerableMs = JuegoRutaNocturna.INVULNERABLE_MS;
    this.emitir(
      'CRASHED',
      { livesLeft: this.#vidas, score: this.#puntaje, speed: this.velocidad },
      this.partida.humano.id,
    );
    if (this.#vidas <= 0) {
      this.#detenerReloj();
      this.#turbo = false;
      this.terminar('LOSS');
      this.#vista?.dibujar(this);
      this.#vista?.mostrarFinal(this.#puntaje, this.#esquivados, this.#distanciaKm);
    }
  }

  #bucle(instante: number): void {
    if (this.#ultimoInstante !== null) this.avanzar(instante - this.#ultimoInstante);
    this.#ultimoInstante = instante;
    // Mientras no arranca, se sigue dibujando para que la animación del carril sea suave.
    if (!this.#arranco) this.#vista?.dibujar(this);
    if (this.enCurso) this.#cuadro = requestAnimationFrame((t) => this.#bucle(t));
  }

  #detenerReloj(): void {
    if (this.#cuadro !== null) cancelAnimationFrame(this.#cuadro);
    this.#cuadro = null;
  }
}
