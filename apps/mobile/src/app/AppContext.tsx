import { createContext, useContext } from 'react';
import type { AppController } from './useAppController';

export const AppContext = createContext<AppController | null>(null);

/** Acesso ao estado do app a partir de qualquer tela. */
export function useApp(): AppController {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp deve ser usado dentro de <AppContext.Provider>.');
  return value;
}
