// Envío concurrente de eventos a GameStats (Go, POST /events).
//
// Estrategia: UNA COLA POR PARTIDA, con un solo envío en vuelo por cola, y todas las
// colas trabajando en paralelo.
//  - Dentro de una partida el orden importa: Go rechaza eventos que llegan antes de
//    MATCH_STARTED o después de MATCH_FINISHED. Por eso cada cola envía en orden y
//    espera la respuesta antes de mandar el siguiente.
//  - Entre partidas no hay orden que respetar: cada cola trabaja por su cuenta, así que
//    una partida con la red lenta no frena a las demás.
//  - El juego solo encola (publicar no espera nada) y sigue jugando.
//
// Respuestas de Go:
//  202                  -> enviado; sigue el próximo.
//  400 "eventId repetido" -> también enviado: un intento anterior sí llegó y solo se
//                          perdió la respuesta.
//  400 otro motivo      -> el evento es inválido; se registra y se descarta (reintentar
//                          no sirve: Go ya marcó su eventId como usado).
//  red caída, 5xx, otro -> se reintenta el MISMO evento con espera creciente
//                          (0.5 s, 1 s, 2 s... hasta 10 s), sin perder el orden.
import type { Evento, ReceptorEventos } from './tipos.ts';

export interface Respuesta {
  status: number;
  texto: string;
}

export type Transporte = (url: string, cuerpo: string) => Promise<Respuesta>;

export const transporteFetch: Transporte = async (url, cuerpo) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo,
  });
  return { status: r.status, texto: await r.text() };
};

export interface EstadoEnvio {
  enviados: number;
  pendientes: number;
  descartados: number;
  reintentos: number;
  ultimoError: string | null;
}

export interface OpcionesDespachador {
  url?: string;
  transporte?: Transporte;
  esperar?: (ms: number) => Promise<void>;
  esperaInicialMs?: number;
  esperaMaximaMs?: number;
  registrar?: (mensaje: string) => void;
}

type Oyente = (matchId: string, estado: EstadoEnvio) => void;
type Resultado = 'enviado' | 'descartado' | 'reintentar';

// La cola de UNA partida.
class ColaPartida {
  readonly eventos: Evento[] = [];
  trabajo: Promise<void> | null = null;
  readonly estado: EstadoEnvio = {
    enviados: 0,
    pendientes: 0,
    descartados: 0,
    reintentos: 0,
    ultimoError: null,
  };
}

export class DespachadorEventos implements ReceptorEventos {
  readonly #colas = new Map<string, ColaPartida>();
  readonly #oyentes = new Set<Oyente>();
  readonly #url: string;
  readonly #transporte: Transporte;
  readonly #esperar: (ms: number) => Promise<void>;
  readonly #esperaInicialMs: number;
  readonly #esperaMaximaMs: number;
  readonly #registrar: (mensaje: string) => void;

  constructor(opciones: OpcionesDespachador = {}) {
    this.#url = opciones.url ?? '/api/ingest/events';
    this.#transporte = opciones.transporte ?? transporteFetch;
    this.#esperar = opciones.esperar ?? ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    this.#esperaInicialMs = opciones.esperaInicialMs ?? 500;
    this.#esperaMaximaMs = opciones.esperaMaximaMs ?? 10_000;
    this.#registrar = opciones.registrar ?? ((m) => console.warn(m));
  }

  // Encola y regresa de inmediato: el juego nunca espera a la red.
  publicar(evento: Evento): void {
    let cola = this.#colas.get(evento.matchId);
    if (!cola) {
      cola = new ColaPartida();
      this.#colas.set(evento.matchId, cola);
    }
    cola.eventos.push(evento);
    cola.estado.pendientes++;
    this.#avisar(evento.matchId, cola);
    if (!cola.trabajo) {
      const c = cola;
      c.trabajo = this.#trabajar(evento.matchId, c).finally(() => {
        c.trabajo = null;
      });
    }
  }

  estado(matchId: string): EstadoEnvio {
    const cola = this.#colas.get(matchId);
    return cola ? { ...cola.estado } : this.#vacio();
  }

  totales(): EstadoEnvio {
    const t = this.#vacio();
    for (const { estado } of this.#colas.values()) {
      t.enviados += estado.enviados;
      t.pendientes += estado.pendientes;
      t.descartados += estado.descartados;
      t.reintentos += estado.reintentos;
      t.ultimoError = estado.ultimoError ?? t.ultimoError;
    }
    return t;
  }

  suscribir(oyente: Oyente): () => void {
    this.#oyentes.add(oyente);
    return () => this.#oyentes.delete(oyente);
  }

  // Espera a que todas las colas terminen (útil en las pruebas).
  async esperarTodo(): Promise<void> {
    for (;;) {
      const trabajos = [...this.#colas.values()].flatMap((c) => (c.trabajo ? [c.trabajo] : []));
      if (trabajos.length === 0) return;
      await Promise.all(trabajos);
    }
  }

  // Al cerrar la pestaña no hay tiempo de esperar respuestas: sendBeacon le pide al
  // navegador que entregue el evento aunque la página ya se esté cerrando.
  enviarAlCerrar(eventos: readonly Evento[]): void {
    for (const e of eventos) {
      const cuerpo = new Blob([JSON.stringify(e)], { type: 'application/json' });
      navigator.sendBeacon(this.#url, cuerpo);
    }
  }

  // El "worker" de una partida: envía en orden hasta vaciar su cola.
  async #trabajar(matchId: string, cola: ColaPartida): Promise<void> {
    let intento = 0;
    while (cola.eventos.length > 0) {
      const evento = cola.eventos[0];
      const resultado = await this.#enviarUno(evento, cola);
      if (resultado === 'reintentar') {
        intento++;
        cola.estado.reintentos++;
        this.#avisar(matchId, cola);
        const espera = Math.min(this.#esperaInicialMs * 2 ** (intento - 1), this.#esperaMaximaMs);
        await this.#esperar(espera);
        continue;
      }
      intento = 0;
      cola.eventos.shift();
      cola.estado.pendientes--;
      if (resultado === 'enviado') cola.estado.enviados++;
      else cola.estado.descartados++;
      this.#avisar(matchId, cola);
    }
  }

  async #enviarUno(evento: Evento, cola: ColaPartida): Promise<Resultado> {
    let respuesta: Respuesta;
    try {
      respuesta = await this.#transporte(this.#url, JSON.stringify(evento));
    } catch (error) {
      cola.estado.ultimoError = `sin conexión con GameStats: ${String(error)}`;
      return 'reintentar';
    }
    if (respuesta.status === 202) return 'enviado';
    if (respuesta.status === 400) {
      if (/repetido/i.test(respuesta.texto)) return 'enviado';
      cola.estado.ultimoError = respuesta.texto;
      this.#registrar(`GameStats rechazó ${evento.type} de ${evento.matchId}: ${respuesta.texto}`);
      return 'descartado';
    }
    cola.estado.ultimoError = `GameStats respondió ${respuesta.status}`;
    return 'reintentar';
  }

  #avisar(matchId: string, cola: ColaPartida): void {
    for (const oyente of this.#oyentes) oyente(matchId, { ...cola.estado });
  }

  #vacio(): EstadoEnvio {
    return { enviados: 0, pendientes: 0, descartados: 0, reintentos: 0, ultimoError: null };
  }
}
