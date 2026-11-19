import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Carrega o .env da raiz do monorepo antes de qualquer módulo ler process.env.
 * Deve ser o primeiro import de main.ts (os decorators do Nest são avaliados
 * no momento do import, antes do corpo de main.ts executar).
 */
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../.env'),
]) {
  dotenv.config({ path: candidate });
}
