import { useEffect, useRef, useState } from "preact/hooks";
import { publishSite, type PublishClient } from "@/admin/publish";

interface Props {
  client: PublishClient;
}

type Phase = "idle" | "busy" | "cooldown";

/** Igual ao limite do servidor: uma publicação a cada 60 s. */
const COOLDOWN_MS = 60_000;

const LABELS: Record<Phase, string> = {
  idle: "Publicar alterações",
  busy: "Publicando…",
  cooldown: "Aguarde um minuto para publicar de novo.",
};

/**
 * Botão "Publicar alterações". Usa aria-disabled (e não disabled) para o foco
 * continuar no botão enquanto publica; cliques fora do estado "idle" são ignorados.
 */
export default function PublishButton({ client }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  // trava síncrona: dois cliques seguidos não disparam duas publicações
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function publish() {
    if (running.current) return;
    running.current = true;
    setPhase("busy");
    setStatus("");
    setAlert("");
    const result = await publishSite(client);
    if (result.ok) {
      setStatus("Publicado. O site atualiza em 1 a 2 minutos.");
      setPhase("cooldown");
      timer.current = setTimeout(() => {
        running.current = false;
        setPhase("idle");
      }, COOLDOWN_MS);
    } else {
      setAlert(result.message);
      running.current = false;
      setPhase("idle");
    }
  }

  return (
    <div class="admin-publicar-caixa">
      <button
        type="button"
        class="admin-botao admin-botao-publicar"
        aria-disabled={phase !== "idle"}
        aria-describedby="publicar-ajuda"
        onClick={() => void publish()}
      >
        {LABELS[phase]}
      </button>
      <p id="publicar-ajuda" class="admin-publicar-ajuda">
        As mudanças só aparecem no site depois de publicar.
      </p>
      <p role="status" class="admin-aviso">
        {status}
      </p>
      <p role="alert" class="admin-erro">
        {alert}
      </p>
    </div>
  );
}
