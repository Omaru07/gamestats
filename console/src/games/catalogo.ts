// Los juegos que ofrece la consola. Agregar uno = una llamada más a registrar().
import { RegistroJuegos } from '../core/RegistroJuegos.ts';
import { JuegoConecta4 } from './conecta4/JuegoConecta4.ts';

export function crearCatalogo(): RegistroJuegos {
  const registro = new RegistroJuegos();
  registro.registrar({
    gameId: 'connect4',
    nombre: 'Conecta 4',
    descripcion: 'Contra la computadora. La IA decide con minimax en Prolog.',
    contraComputadora: true,
    crear: (partida, receptor) => new JuegoConecta4(partida, receptor),
  });
  return registro;
}
