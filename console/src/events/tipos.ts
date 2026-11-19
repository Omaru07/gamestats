// Forma de un evento, idéntica a la que recibe GameStats (docs/SPEC.md §3).
// En "data" solo van textos, números o listas de textos: es lo único que lee Scala
// (Parser.scala descarta booleanos, objetos y listas de números sin avisar).
export type ValorDato = string | number | readonly string[];
export type DatosEvento = Record<string, ValorDato>;

export interface Evento {
  eventId: string;
  timestamp: string; // ISO-8601 en UTC, p. ej. 2026-11-18T19:40:00.123Z
  gameId: string;
  gameVersion: string;
  matchId: string;
  playerId?: string;
  type: string;
  data: DatosEvento;
}

// Quien recibe los eventos que produce un juego (el despachador, o uno falso en las pruebas).
export interface ReceptorEventos {
  publicar(evento: Evento): void;
}
