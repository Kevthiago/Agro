/** Mensagem genérica para qualquer falha inesperada. */
export const GENERIC = "Algo deu errado. Tente de novo.";

/** Erro com mensagem escrita para a família (pode aparecer na tela como está). */
export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/** Texto para mostrar na tela: só mensagens nossas; o resto vira a mensagem genérica. */
export function friendlyMessage(error: unknown): string {
  return error instanceof AdminError ? error.message : GENERIC;
}
