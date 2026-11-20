// Traducción de la lógica del tablero de JuegoConecta4.java (proyecto anterior de Omar).
// Igual que en Java: matriz de 6 filas x 7 columnas, la fila 0 es la de ARRIBA.
// Ese mismo orden es el que espera la IA en Prolog (aTexto), así que no hay que voltear nada.

export const VACIO = 0;
export const JUGADOR = 1;
export const COMPUTADORA = 2;
export type Ficha = typeof JUGADOR | typeof COMPUTADORA;
type Celda = typeof VACIO | Ficha;
export type Posicion = readonly [fila: number, columna: number];

// Las 4 direcciones de verificarGanador en Java: horizontal, vertical y las dos diagonales.
const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [-1, 1],
  [-1, -1],
];

export class TableroConecta4 {
  static readonly FILAS = 6;
  static readonly COLUMNAS = 7;

  readonly #tablero: Celda[][];

  constructor() {
    this.#tablero = Array.from({ length: TableroConecta4.FILAS }, () =>
      Array<Celda>(TableroConecta4.COLUMNAS).fill(VACIO),
    );
  }

  celda(fila: number, columna: number): Celda {
    return this.#tablero[fila][columna];
  }

  columnaValida(columna: number): boolean {
    return (
      Number.isInteger(columna) &&
      columna >= 0 &&
      columna < TableroConecta4.COLUMNAS &&
      this.buscarFilaDisponible(columna) !== -1
    );
  }

  // Igual que en Java: la primera fila vacía desde abajo, o -1 si la columna está llena.
  buscarFilaDisponible(columna: number): number {
    for (let fila = TableroConecta4.FILAS - 1; fila >= 0; fila--) {
      if (this.#tablero[fila][columna] === VACIO) return fila;
    }
    return -1;
  }

  // Suelta la ficha y devuelve la fila donde cayó, o -1 si no se pudo.
  colocarFicha(columna: number, ficha: Ficha): number {
    if (columna < 0 || columna >= TableroConecta4.COLUMNAS) return -1;
    const fila = this.buscarFilaDisponible(columna);
    if (fila !== -1) this.#tablero[fila][columna] = ficha;
    return fila;
  }

  verificarGanador(fila: number, columna: number, ficha: Ficha): boolean {
    return this.lineaGanadora(fila, columna, ficha) !== null;
  }

  // Como verificarGanador, pero devuelve las casillas del 4 en línea (para resaltarlas).
  lineaGanadora(fila: number, columna: number, ficha: Ficha): Posicion[] | null {
    for (const [df, dc] of DIRECCIONES) {
      const linea: Posicion[] = [
        ...this.#recorrer(fila, columna, -df, -dc, ficha).reverse(),
        [fila, columna],
        ...this.#recorrer(fila, columna, df, dc, ficha),
      ];
      if (linea.length >= 4) return linea;
    }
    return null;
  }

  tableroLleno(): boolean {
    return this.#tablero[0].every((c) => c !== VACIO);
  }

  // 42 caracteres, fila de arriba primero: "." vacía, "R" jugador (rojo), "Y" computadora (amarillo).
  aTexto(): string {
    const letra = { [VACIO]: '.', [JUGADOR]: 'R', [COMPUTADORA]: 'Y' } as const;
    return this.#tablero.map((fila) => fila.map((c) => letra[c]).join('')).join('');
  }

  // contarDireccion de Java, pero guardando las posiciones en vez de solo contarlas.
  #recorrer(fila: number, columna: number, df: number, dc: number, ficha: Ficha): Posicion[] {
    const posiciones: Posicion[] = [];
    let f = fila + df;
    let c = columna + dc;
    while (
      f >= 0 &&
      f < TableroConecta4.FILAS &&
      c >= 0 &&
      c < TableroConecta4.COLUMNAS &&
      this.#tablero[f][c] === ficha
    ) {
      posiciones.push([f, c]);
      f += df;
      c += dc;
    }
    return posiciones;
  }
}
