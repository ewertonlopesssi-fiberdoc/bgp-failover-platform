import * as db from "./db";

/**
 * Envia uma mensagem via Telegram Bot API.
 * Retorna true em caso de sucesso, false se não configurado ou erro.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  try {
    const config = await db.getTelegramConfig();
    if (!config || !config.enabled || !config.botToken || !config.chatId) {
      return false;
    }
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: "Markdown" }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error(`[Telegram] Erro ao enviar mensagem: ${data.description}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[Telegram] Exceção ao enviar mensagem: ${err.message}`);
    return false;
  }
}

/**
 * Formata e envia alerta de mudança de status de operadora.
 */
export async function notifyOperatorStatusChange(
  operatorName: string,
  oldStatus: string,
  newStatus: string,
  details?: string
): Promise<void> {
  const config = await db.getTelegramConfig().catch(() => null);
  if (!config || !config.enabled) return;

  const isDown = newStatus === "down";
  const isDegraded = newStatus === "degraded";
  const isRecovery = newStatus === "up" && (oldStatus === "down" || oldStatus === "degraded");

  if (isDown && !config.notifyBgpDown) return;
  if (isDegraded && !config.notifyHighLatency) return;
  if (isRecovery && !config.notifyRecovery) return;
  if (!isDown && !isDegraded && !isRecovery) return;

  const emoji = isDown ? "🔴" : isDegraded ? "🟡" : "🟢";
  const statusLabel = isDown ? "OFFLINE" : isDegraded ? "DEGRADADO" : "RECUPERADO";
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" });

  let msg = `${emoji} *Operadora ${statusLabel}*\n\n`;
  msg += `📡 *Operadora:* ${operatorName}\n`;
  msg += `📊 *Status:* ${oldStatus.toUpperCase()} → ${newStatus.toUpperCase()}\n`;
  if (details) msg += `📝 *Detalhes:* ${details}\n`;
  msg += `🕐 *Horário:* ${now}`;

  await sendTelegramMessage(msg);
}

/**
 * Envia alerta de latência ou perda de pacotes acima do limiar.
 */
export async function notifyThresholdAlert(
  operatorName: string,
  destName: string,
  latencyMs: number,
  packetLoss: number,
  latencyThreshold: number,
  packetLossThreshold: number
): Promise<void> {
  const config = await db.getTelegramConfig().catch(() => null);
  if (!config || !config.enabled || !config.notifyHighLatency) return;

  const latencyAlert = latencyMs > latencyThreshold;
  const lossAlert = packetLoss > packetLossThreshold;
  if (!latencyAlert && !lossAlert) return;

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" });
  let msg = `⚠️ *Alerta de Qualidade de Enlace*\n\n`;
  msg += `📡 *Operadora:* ${operatorName}\n`;
  msg += `🎯 *Destino:* ${destName}\n`;

  if (latencyAlert) {
    msg += `📶 *Latência:* ${latencyMs}ms (limite: ${latencyThreshold}ms)\n`;
  }
  if (lossAlert) {
    msg += `📉 *Perda de Pacotes:* ${packetLoss.toFixed(1)}% (limite: ${packetLossThreshold}%)\n`;
  }
  msg += `🕐 *Horário:* ${now}`;

  await sendTelegramMessage(msg);
}
