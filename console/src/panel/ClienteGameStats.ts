// Consultas de LECTURA a GameStats, a través del proxy (/api/ingest -> Go, /api/stats -> Scala).
// La consola no calcula estadísticas: todo lo que muestra el panel viene de aquí.

export type ValorEstadistica = number | string;
export type Estadisticas = Record<string, ValorEstadistica>;

export interface ResumenJuego extends Estadisticas {
  gameId: string;
}

// GET /api/stats/stats (Scala): lo general y el resumen de cada juego, por separado.
export interface Panorama {
  general: Estadisticas;
  games: ResumenJuego[];
}

// GET /api/ingest/instances (Go): partidas por juego y estado, en vivo.
export interface InstanciasJuego {
  gameId: string;
  total: number;
  active: number;
  complete: number;
  sent: number;
  failed: number;
}

export interface Instancias {
  total: number;
  games: InstanciasJuego[];
}

// GET /api/ingest/matches (Go): cada partida con su estado y cuántos eventos lleva.
export interface PartidaEnGo {
  matchId: string;
  gameId: string;
  status: 'ACTIVE' | 'COMPLETE' | 'SENT' | 'FAILED';
  eventCount: number;
  players: string[];
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class ClienteGameStats {
  readonly #fetch: Fetch;
  readonly #base: string;

  constructor(fetchFn: Fetch = (url) => fetch(url), base = '/api') {
    this.#fetch = fetchFn;
    this.#base = base;
  }

  panorama(): Promise<Panorama> {
    return this.#get<Panorama>('/stats/stats');
  }

  instancias(): Promise<Instancias> {
    return this.#get<Instancias>('/ingest/instances');
  }

  partidas(): Promise<PartidaEnGo[]> {
    return this.#get<PartidaEnGo[]>('/ingest/matches');
  }

  async #get<T>(ruta: string): Promise<T> {
    const r = await this.#fetch(`${this.#base}${ruta}`);
    if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
    return (await r.json()) as T;
  }
}
