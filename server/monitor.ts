/**
 * BGP Failover Monitor - Fase 1: Monitoramento Passivo (somente leitura)
 *
 * Este daemon conecta via SSH no Ne8000 a cada 30 segundos e:
 * - Lê o status dos peers BGP (display bgp peer)
 * - Testa ICMP ping para cada destino monitorado via interface da operadora
 * - Atualiza o status das operadoras no banco de dados
 * - Registra métricas de latência
 *
 * NÃO executa nenhuma alteração de configuração no Ne8000.
 *
 * NOTA: O Ne8000 usa shell interativo — não suporta exec direto via SSH.
 * Usamos conn.shell() com screen-length 0 para desabilitar paginação.
 */
import { Client } from "ssh2";
import * as db from "./db";
// ─── Tipos ────────────────────────────────────────────────────────────────────
interface BgpPeerStatus {
  peerIp: string;
  asNumber: string;
  state: "Established" | "Active" | "Idle" | "Connect" | "OpenSent" | "OpenConfirm" | string;
  uptime: string;
}
interface PingResult {
  host: string;
  latencyMs: number | null;
  packetLoss: number;
  success: boolean;
}
interface SshConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
}
// ─── Estado do daemon ─────────────────────────────────────────────────────────
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRunAt: Date | null = null;
let lastError: string | null = null;
let consecutiveFailures = 0;
// ─── Execução de comandos via shell interativo do Ne8000 ──────────────────────
/**
 * Abre um shell interativo no Ne8000 e executa múltiplos comandos.
 * O Ne8000 não suporta exec direto — requer shell interativo.
 * Usa "screen-length 0 temporary" para desabilitar paginação (---- More ----).
 */
function execSshShell(config: SshConfig & { commands: string[]; timeoutMs?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = "";
    let promptName = "";
    // Contagem de prompts: 1=inicial, 2=pós-screen-length, 3+=pós-comando
    let promptCount = 0;
    let commandIndex = 0;
    const timeoutMs = config.timeoutMs || 30000;

    const globalTimeout = setTimeout(() => {
      conn.end();
      // Se já temos output com dados BGP, retornar o que temos
      if (output.length > 100) {
        resolve(output);
      } else {
        reject(new Error(`SSH shell timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    conn.on("ready", () => {
      conn.shell({ term: "vt100", cols: 220, rows: 50 }, (err, stream) => {
        if (err) {
          clearTimeout(globalTimeout);
          conn.end();
          return reject(err);
        }

        stream.on("data", (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;

          // Detectar o nome do prompt na primeira ocorrência
          if (!promptName) {
            const promptMatch = output.match(/<([A-Z0-9][^>]{2,50})>/);
            if (promptMatch) {
              promptName = promptMatch[1];
              promptCount = 1;
              // Primeiro: desabilitar paginação
              stream.write("screen-length 0 temporary\n");
            }
            return;
          }

          // Contar novas ocorrências do prompt no chunk atual
          const chunkPrompts = (chunk.match(new RegExp(`<${promptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "g")) || []).length;
          if (chunkPrompts > 0) {
            promptCount += chunkPrompts;
            // promptCount=2: pós-screen-length → enviar próximo comando
            // promptCount=3+: pós-comando
            if (promptCount === 2) {
              // Pós screen-length: enviar primeiro comando
              if (commandIndex < config.commands.length) {
                const cmd = config.commands[commandIndex];
                commandIndex++;
                stream.write(cmd + "\n");
              } else {
                clearTimeout(globalTimeout);
                conn.end();
                resolve(output);
              }
            } else if (promptCount >= 3) {
              // Pós-comando: verificar se há mais comandos
              if (commandIndex < config.commands.length) {
                const cmd = config.commands[commandIndex];
                commandIndex++;
                stream.write(cmd + "\n");
              } else {
                // Todos os comandos executados — fechar
                clearTimeout(globalTimeout);
                conn.end();
                resolve(output);
              }
            }
          }
        });

        stream.on("close", () => {
          clearTimeout(globalTimeout);
          if (output.length > 0) {
            resolve(output);
          } else {
            reject(new Error("SSH shell closed without output"));
          }
        });

        stream.on("error", (err: Error) => {
          clearTimeout(globalTimeout);
          reject(err);
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(globalTimeout);
      reject(err);
    });

    const connectOptions: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 15000,
      // Algoritmos compatíveis com Huawei Ne8000
      algorithms: {
        kex: [
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
        ],
        cipher: [
          "aes128-ctr", "aes192-ctr", "aes256-ctr",
          "aes128-cbc", "aes256-cbc", "3des-cbc",
        ],
        serverHostKey: [
          "ssh-rsa", "ssh-dss", "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
        ],
        hmac: ["hmac-sha2-256", "hmac-sha1", "hmac-md5"],
      },
    };

    if (config.password) {
      connectOptions.password = config.password;
    } else if (config.privateKeyPath) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("fs");
        connectOptions.privateKey = fs.readFileSync(config.privateKeyPath);
      } catch (e) {
        return reject(new Error(`Não foi possível ler a chave SSH: ${config.privateKeyPath}`));
      }
    }

    conn.connect(connectOptions);
  });
}

// ─── Parsing do output do Ne8000 ─────────────────────────────────────────────
function parseBgpPeers(output: string): BgpPeerStatus[] {
  const peers: BgpPeerStatus[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // Formato Huawei Ne8000 completo (9 colunas):
    // "  10.11.79.85   4   61568   14572597   117656   0   0841h32m   Established   1060666"
    // Colunas: Peer V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv
    const match = line.match(
      /^\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\S+)\s+(Established|Active|Idle|Connect|OpenSent|OpenConfirm|Clearing|Deleted)/
    );
    if (match) {
      peers.push({
        peerIp: match[1],
        asNumber: match[2],
        uptime: match[3],
        state: match[4],
      });
    }
  }
  return peers;
}

function parsePingResult(output: string, host: string): PingResult {
  // Formato Huawei ping: "Round trip  min/avg/max = 1/2/3 ms"
  const latencyMatch = output.match(/min\/avg\/max\s*=\s*[\d.]+\/([\d.]+)\/[\d.]+\s*ms/i);
  // Formato alternativo: "Average = Xms"
  const altMatch = output.match(/[Aa]verage\s*=\s*([\d.]+)\s*ms/);
  // Packet loss: "X% packet loss" ou "X packets transmitted, Y received"
  const lossMatch = output.match(/(\d+)%\s*packet\s*loss/i);
  const txRxMatch = output.match(/(\d+)\s+packets?\s+transmitted.*?(\d+)\s+received/i);

  let latencyMs: number | null = null;
  let packetLoss = 100;

  if (latencyMatch) latencyMs = parseFloat(latencyMatch[1]);
  else if (altMatch) latencyMs = parseFloat(altMatch[1]);

  if (lossMatch) packetLoss = parseInt(lossMatch[1]);
  else if (txRxMatch) {
    const tx = parseInt(txRxMatch[1]);
    const rx = parseInt(txRxMatch[2]);
    packetLoss = tx > 0 ? Math.round(((tx - rx) / tx) * 100) : 100;
  } else if (latencyMs !== null) {
    // Se temos latência, provavelmente não houve perda total
    packetLoss = 0;
  }

  return {
    host,
    latencyMs,
    packetLoss,
    success: latencyMs !== null && packetLoss < 100,
  };
}

// ─── Ciclo de monitoramento ───────────────────────────────────────────────────
async function runMonitorCycle() {
  if (isRunning) {
    console.log("[Monitor] Ciclo anterior ainda em execução, pulando...");
    return;
  }
  isRunning = true;
  lastRunAt = new Date();
  try {
    const config = await db.getNe8000Config();
    if (!config || !config.host) {
      console.log("[Monitor] Ne8000 não configurado, aguardando...");
      isRunning = false;
      return;
    }
    const operatorsList = await db.listOperators();
    if (operatorsList.length === 0) {
      console.log("[Monitor] Nenhuma operadora configurada, aguardando...");
      isRunning = false;
      return;
    }
    const sshConfig: SshConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password || undefined,
      privateKeyPath: config.sshKeyPath || undefined,
    };
    console.log(`[Monitor] Iniciando ciclo — ${operatorsList.length} operadora(s)`);

    // 1. Ler status dos peers BGP via shell interativo
    let bgpPeers: BgpPeerStatus[] = [];
    try {
      const bgpOutput = await execSshShell({
        ...sshConfig,
        commands: ["display bgp peer"],
        timeoutMs: 30000,
      });
      bgpPeers = parseBgpPeers(bgpOutput);
      console.log(`[Monitor] BGP peers encontrados: ${bgpPeers.length}`);
      if (bgpPeers.length > 0) {
        console.log(`[Monitor] Peers: ${bgpPeers.slice(0, 5).map(p => `${p.peerIp}=${p.state}`).join(", ")}...`);
      }
    } catch (err: any) {
      console.error(`[Monitor] Erro ao ler BGP peers: ${err.message}`);
      // Não aborta — continua com ping
    }

    // 2. Para cada operadora, verificar status BGP e fazer ping nos destinos
    for (const operator of operatorsList) {
      try {
        // Verificar status BGP do peer desta operadora
        const peer = bgpPeers.find(p => p.peerIp === operator.peerIp);
        let newStatus: "up" | "down" | "degraded" | "unknown" = "unknown";

        if (peer) {
          if (peer.state === "Established") {
            newStatus = "up";
            console.log(`[Monitor] Operadora ${operator.name}: BGP peer ${operator.peerIp} está Established`);
          } else {
            newStatus = "down";
            console.log(`[Monitor] Operadora ${operator.name}: BGP peer ${operator.peerIp} está ${peer.state}`);
          }
        } else if (bgpPeers.length > 0) {
          // Temos dados BGP mas o peer não foi encontrado
          newStatus = "down";
          console.log(`[Monitor] Operadora ${operator.name}: peer ${operator.peerIp} não encontrado na tabela BGP`);
        }

        // 3. Ping nos destinos monitorados desta operadora
        const destList = await db.listDestinations(operator.id);
        let successCount = 0;
        let failCount = 0;

        if (destList.length > 0) {
          // Executar todos os pings em uma única sessão SSH
          const pingCommands = destList.map(dest => `ping -a ${operator.sourceIp} -c 5 ${dest.host}`);
          let pingOutputAll = "";
          try {
            pingOutputAll = await execSshShell({
              ...sshConfig,
              commands: pingCommands,
              timeoutMs: 60000,
            });
          } catch (pingSessionErr: any) {
            console.error(`[Monitor] Erro na sessão de ping para ${operator.name}: ${pingSessionErr.message}`);
          }

          for (const dest of destList) {
            try {
              // Extrair output do ping para este destino específico
              const pingRegex = new RegExp(
                `ping -a ${operator.sourceIp.replace(/\./g, "\\.")} -c 5 ${dest.host.replace(/\./g, "\\.")}([\\s\\S]*?)(?=<[^>]+>|$)`,
                "i"
              );
              const pingMatch = pingOutputAll.match(pingRegex);
              const pingOutput = pingMatch ? pingMatch[1] : "";
              const result = parsePingResult(pingOutput, dest.host);

              if (result.success && result.latencyMs !== null) {
                successCount++;
                await db.addLatencyMetric({
                  operatorId: operator.id,
                  destinationId: dest.id,
                  latencyMs: result.latencyMs,
                  packetLoss: result.packetLoss,
                  jitterMs: 0,
                });
                console.log(`[Monitor] ${operator.name} → ${dest.host}: ${result.latencyMs}ms, perda ${result.packetLoss}%`);
              } else {
                failCount++;
                console.log(`[Monitor] ${operator.name} → ${dest.host}: FALHOU (perda ${result.packetLoss}%)`);
                await db.addLatencyMetric({
                  operatorId: operator.id,
                  destinationId: dest.id,
                  latencyMs: 9999,
                  packetLoss: result.packetLoss,
                  jitterMs: 0,
                });
              }
            } catch (destErr: any) {
              failCount++;
              console.error(`[Monitor] Erro no ping ${operator.name} → ${dest.host}: ${destErr.message}`);
            }
          }
        }

        // Fase 1: Status baseado APENAS no BGP (ping é apenas métrica de latência)
        // Se BGP está Established → up, independente do ping
        // O ping pode falhar por bloqueio de ICMP, mas BGP ainda está ativo
        // Em fases futuras, o ping poderá influenciar o status de degraded
        if (newStatus === "unknown" && destList.length > 0) {
          // Sem dados BGP mas com pings: usar resultado dos pings
          if (failCount === destList.length) {
            newStatus = "down";
          } else if (failCount > 0) {
            newStatus = "degraded";
          } else if (successCount > 0) {
            newStatus = "up";
          }
        }
        // Se BGP está up/down, manter o status do BGP independente do ping

        // Atualizar status da operadora no banco
        if (newStatus !== operator.status) {
          await db.updateOperator(operator.id, { status: newStatus });
          console.log(`[Monitor] Operadora ${operator.name}: status alterado ${operator.status} → ${newStatus}`);
          // Registrar no log de auditoria
          await db.addAuditLog({
            type: newStatus === "down" ? "alert" : newStatus === "up" ? "recovery" : "info",
            severity: newStatus === "down" ? "critical" : newStatus === "degraded" ? "warning" : "info",
            title: `Operadora ${operator.name}: ${newStatus.toUpperCase()}`,
            description: `Status alterado de ${operator.status} para ${newStatus}. Peer BGP: ${peer?.state || "não encontrado"}`,
          });
        } else {
          // Atualizar mesmo sem mudança de status (para atualizar updatedAt)
          await db.updateOperator(operator.id, { status: newStatus });
        }
      } catch (opErr: any) {
        console.error(`[Monitor] Erro ao monitorar operadora ${operator.name}: ${opErr.message}`);
      }
    }

    consecutiveFailures = 0;
    lastError = null;
    console.log(`[Monitor] Ciclo concluído em ${Date.now() - lastRunAt.getTime()}ms`);
  } catch (err: any) {
    consecutiveFailures++;
    lastError = err.message;
    console.error(`[Monitor] Erro no ciclo de monitoramento (falha #${consecutiveFailures}): ${err.message}`);
  } finally {
    isRunning = false;
  }
}

// ─── API pública do daemon ────────────────────────────────────────────────────
export function startMonitor(intervalSeconds = 30) {
  if (monitorInterval) {
    console.log("[Monitor] Daemon já está rodando");
    return;
  }
  console.log(`[Monitor] Iniciando daemon (intervalo: ${intervalSeconds}s)`);
  // Executar imediatamente na primeira vez (após 5s para o servidor inicializar)
  setTimeout(() => runMonitorCycle(), 5000);
  // Depois executar no intervalo configurado
  monitorInterval = setInterval(() => runMonitorCycle(), intervalSeconds * 1000);
}

export function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[Monitor] Daemon parado");
  }
}

export function getMonitorStatus() {
  return {
    running: monitorInterval !== null,
    isExecuting: isRunning,
    lastRunAt,
    lastError,
    consecutiveFailures,
  };
}
