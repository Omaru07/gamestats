// Traducción de JuegoSnake.java a la consola web.
// Se conserva: tablero de 20, paso cada 150 ms, +10 por comida, direccionPendiente,
// generarComida (nunca encima de la serpiente) y las mismas colisiones.
// Cambios:
//  - Sin singleton: cada partida es un objeto nuevo (varias culebritas a la vez).
//  - La partida arranca con la primera flecha, porque con varias en pantalla solo
//    la que tiene el foco recibe el teclado.
//  - Se decide si come mirando la casilla SIGUIENTE de la cabeza (en Java se comía un
//    paso tarde, al revisar la cabeza antes de moverla).
//  - verificarColisiones dice contra qué chocó (pared o sí misma) para el evento PLAYER_DIED.
//  - En vez de un Stat al final, emite FOOD_EATEN y PLAYER_DIED (no cada movimiento,
//    para no saturar a GameStats).
import { Juego } from '../../core/Juego.ts';
import type { Partida } from '../../core/Partida.ts';
import type { DatosEvento, ReceptorEventos } from '../../events/tipos.ts';
import { type Direccion, mismoPunto, type Punto, Serpiente } from './Serpiente.ts';
import { VistaSnake } from './VistaSnake.ts';

export type CausaMuerte = 'wall' | 'self';

export interface AccionesSnake {
  alCambiarDireccion(direccion: Direccion): void;
}

export interface VistaJuegoSnake {
  dibujar(juego: JuegoSnake): void;
  mostrarFinal(puntaje: number, longitud: number, causa: CausaMuerte): void;
  destruir(): void;
}

export interface OpcionesSnake {
  aleatorio?: () => number; // Math.random por defecto; en las pruebas, uno fijo
  crearVista?: (contenedor: HTMLElement, acciones: AccionesSnake) => VistaJuegoSnake;
  usarReloj?: boolean; // false en las pruebas: se avanza llamando a paso()
}

export class JuegoSnake extends Juego {
  static readonly TAMANO_TABLERO = 20;
  static readonly VELOCIDAD_INICIAL = 150; // ms por paso, como el Timer de Java
  static readonly PUNTOS_POR_COMIDA = 10;

  readonly #serpiente: Serpiente;
  readonly #aleatorio: () => number;
  readonly #crearVista: (contenedor: HTMLElement, acciones: AccionesSnake) => VistaJuegoSnake;
  readonly #usarReloj: boolean;
  #comida: Punto;
  #puntaje = 0;
  #direccionPendiente: Direccion | null = null;
  #arranco = false;
  #reloj: ReturnType<typeof setInterval> | null = null;
  #vista: VistaJuegoSnake | null = null;

  constructor(partida: Partida, receptor: ReceptorEventos, opciones: OpcionesSnake = {}) {
    super(partida, receptor);
    this.#aleatorio = opciones.aleatorio ?? Math.random;
    this.#crearVista = opciones.crearVista ?? ((c, a) => new VistaSnake(c, a));
    this.#usarReloj = opciones.usarReloj ?? true;
    const centro = Math.floor(JuegoSnake.TAMANO_TABLERO / 2);
    this.#serpiente = new Serpiente(centro, centro);
    this.#comida = this.#generarComida();
  }

  get serpiente(): Serpiente {
    return this.#serpiente;
  }

  get comida(): Punto {
    return this.#comida;
  }

  get puntaje(): number {
    return this.#puntaje;
  }

  get arranco(): boolean {
    return this.#arranco;
  }

  protected datosDeInicio(): DatosEvento {
    return { gridSize: JuegoSnake.TAMANO_TABLERO };
  }

  protected montar(contenedor: HTMLElement): void {
    this.#vista = this.#crearVista(contenedor, {
      alCambiarDireccion: (d) => this.cambiarDireccion(d),
    });
    this.#vista.dibujar(this);
    if (this.#usarReloj) {
      this.#reloj = setInterval(() => this.paso(), JuegoSnake.VELOCIDAD_INICIAL);
    }
  }

  protected desmontar(): void {
    this.#detenerReloj();
    this.#vista?.destruir();
    this.#vista = null;
  }

  // cambiarDireccion de Java: solo un cambio por paso y nunca hacia atrás.
  cambiarDireccion(direccion: Direccion): void {
    if (!this.enCurso) return;
    this.#arranco = true;
    if (this.#direccionPendiente !== null) return;
    const actual = this.#serpiente.direccion;
    const opuestas =
      (actual === 'ARRIBA' && direccion === 'ABAJO') ||
      (actual === 'ABAJO' && direccion === 'ARRIBA') ||
      (actual === 'IZQUIERDA' && direccion === 'DERECHA') ||
      (actual === 'DERECHA' && direccion === 'IZQUIERDA');
    if (!opuestas) this.#direccionPendiente = direccion;
  }

  // actualizarJuego de Java: un paso del reloj.
  paso(): void {
    if (!this.enCurso || !this.#arranco) return;

    if (this.#direccionPendiente !== null) {
      this.#serpiente.cambiarDireccion(this.#direccionPendiente);
      this.#direccionPendiente = null;
    }

    const comio = mismoPunto(this.#serpiente.siguienteCabeza(), this.#comida);
    this.#serpiente.mover(comio);

    const causa = this.#verificarColisiones();
    if (causa) {
      this.#finalizar(causa);
      return;
    }

    if (comio) {
      this.#puntaje += JuegoSnake.PUNTOS_POR_COMIDA;
      this.emitir(
        'FOOD_EATEN',
        { score: this.#puntaje, length: this.#serpiente.longitud },
        this.partida.humano.id,
      );
      this.#comida = this.#generarComida();
    }
    this.#vista?.dibujar(this);
  }

  #verificarColisiones(): CausaMuerte | null {
    const { x, y } = this.#serpiente.cabeza;
    const n = JuegoSnake.TAMANO_TABLERO;
    if (x < 0 || x >= n || y < 0 || y >= n) return 'wall';
    if (this.#serpiente.chocoConsigo()) return 'self';
    return null;
  }

  // Igual que en Java: una casilla al azar que no esté ocupada por la serpiente.
  #generarComida(): Punto {
    const n = JuegoSnake.TAMANO_TABLERO;
    for (let intento = 0; intento < 1000; intento++) {
      const comida = { x: Math.floor(this.#aleatorio() * n), y: Math.floor(this.#aleatorio() * n) };
      if (!this.#serpiente.ocupa(comida)) return comida;
    }
    // Casi imposible: si el azar falla 1000 veces, la primera casilla libre.
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (!this.#serpiente.ocupa({ x, y })) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  #finalizar(causa: CausaMuerte): void {
    this.#detenerReloj();
    const longitud = this.#serpiente.longitud;
    this.emitir('PLAYER_DIED', { cause: causa, score: this.#puntaje, length: longitud }, this.partida.humano.id);
    this.terminar('LOSS'); // en la culebrita siempre se termina chocando
    this.#vista?.dibujar(this);
    this.#vista?.mostrarFinal(this.#puntaje, longitud, causa);
  }

  #detenerReloj(): void {
    if (this.#reloj) clearInterval(this.#reloj);
    this.#reloj = null;
  }
}
