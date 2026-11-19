// Habla con la IA en Prolog (prolog-ai, POST /move) a través del proxy /api/ai.
// Reemplaza a elegirColumnaBOT() de Java, que jugaba al azar cuando no podía ganar ni tapar.

export interface DecisionIA {
  column: number;
  score: number;
  nodesExplored: number;
  depth: number;
  reason: string; // "win", "block" o "minimax"
  thinkMs: number; // medido aquí: cuánto tardó la respuesta
}

// Cualquier cosa que sepa elegir una jugada (la IA real, o una falsa en las pruebas).
export interface ProveedorJugadas {
  pedirJugada(tablero: string, ficha: 'R' | 'Y', profundidad: number): Promise<DecisionIA>;
}

export class ClienteIAConecta4 implements ProveedorJugadas {
  readonly #url: string;

  constructor(url = '/api/ai/move') {
    this.#url = url;
  }

  async pedirJugada(tablero: string, ficha: 'R' | 'Y', profundidad: number): Promise<DecisionIA> {
    const inicio = performance.now();
    const r = await fetch(this.#url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: tablero, player: ficha, depth: profundidad }),
    });
    if (!r.ok) throw new Error(`la IA respondió ${r.status}: ${await r.text()}`);
    const d = await r.json();
    for (const campo of ['column', 'score', 'nodesExplored', 'depth']) {
      if (typeof d[campo] !== 'number') throw new Error(`respuesta de la IA sin ${campo}`);
    }
    return {
      column: d.column,
      score: d.score,
      nodesExplored: d.nodesExplored,
      depth: d.depth,
      reason: String(d.reason),
      thinkMs: Math.round(performance.now() - inicio),
    };
  }
}
