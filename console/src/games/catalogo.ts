// Los juegos que ofrece la consola. Agregar uno = una llamada más a registrar().
import { RegistroJuegos } from '../core/RegistroJuegos.ts';
import { JuegoConecta4 } from './conecta4/JuegoConecta4.ts';
import { JuegoRutaNocturna } from './rutanocturna/JuegoRutaNocturna.ts';
import { JuegoSnake } from './snake/JuegoSnake.ts';

export function crearCatalogo(): RegistroJuegos {
  const registro = new RegistroJuegos();
  registro.registrar({
    gameId: 'connect4',
    nombre: 'Conecta 4',
    descripcion: 'Contra la computadora. La IA decide con minimax en Prolog.',
    contraComputadora: true,
    crear: (partida, receptor) => new JuegoConecta4(partida, receptor),
  });
  registro.registrar({
    gameId: 'snake',
    nombre: 'Culebrita',
    descripcion: 'Come y crece sin chocar con la pared ni contigo.',
    contraComputadora: false,
    crear: (partida, receptor) => new JuegoSnake(partida, receptor),
  });
  registro.registrar({
    gameId: 'nightdrive',
    nombre: 'Ruta Nocturna',
    descripcion: 'Maneja de noche y esquiva el tráfico que viene de frente.',
    contraComputadora: false,
    crear: (partida, receptor) => new JuegoRutaNocturna(partida, receptor),
  });
  return registro;
}
