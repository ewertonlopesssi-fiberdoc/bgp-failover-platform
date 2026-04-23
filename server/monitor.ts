/**
 * BGP Failover Monitor - Fase 2: NQA icmpjitter automático
 *
 * Este daemon conecta via SSH no Ne8000 a cada 30 segundos e:
 * - Lê o status dos peers BGP (display bgp peer)
 * - Gerencia testes NQA icmpjitter automaticamente por destino monitorado
 *   - Cria testes NQA quando destinos são adicionados
 *   - Remove testes NQA quando destinos são removidos
 *   - Lê resultados NQA (latência, jitter, perda) a cada ciclo
 * - Atualiza o status das operadoras no banco de dados
 * - Registra métricas de latência/jitter no banco
 *
 * NOTA: O Ne8000 usa shell interativo e two-stage commit.
 * - Prompts: <NOME> (user-view), [~NOME] (system-view), [*NOME] (uncommitted)
 * - Comandos NQA ficam dentro de system-view com commit obrigatório
 * - start/stop do teste fica dentro do sub-modo nqa test-instance
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

interface NqaResult {
  adminName: string;
  testName: string;
  latencyMs: number | null;   // Avg RTT
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  jitterMs: number | null;    // Average of Jitter
  packetLoss: number;         // Packet Loss Ratio %
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
let legacyCleanupDone = false; // Limpeza de testes NQA antigos (v1/v2) já realizada

// Cache de testes NQA ativos (destId -> nqaTestName)
// Formato: bgpmon_<destId>
const NQA_ADMIN = "bgpmon";

// ─── Execução de comandos via shell interativo do Ne8000 ──────────────────────
/**
 * Abre um shell interativo no Ne8000 e executa múltiplos comandos.
 * Suporta prompts de user-view (<NOME>), system-view ([~NOME]) e uncommitted ([*NOME]).
 */
function execSshShell(config: SshConfig & { commands: string[]; timeoutMs?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = "";
    // Regex que detecta qualquer prompt do Ne8000 (user-view, system-view, sub-views)
    const PROMPT_REGEX = /[<\[][~*]?[A-Z0-9][A-Z0-9\-_]{2,50}[^\n]*[>\]]/;
    let lastPromptPos = 0;
    let promptCount = 0;
    let commandIndex = 0;
    const timeoutMs = config.timeoutMs || 30000;

    const globalTimeout = setTimeout(() => {
      conn.end();
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

          // Contar novas ocorrências de prompt desde a última posição
          const newPart = output.slice(lastPromptPos);
          const matches = newPart.match(new RegExp(PROMPT_REGEX.source, "g")) || [];

          if (matches.length > 0) {
            promptCount += matches.length;
            lastPromptPos = output.length;

            if (promptCount === 1) {
              // Primeiro prompt: desabilitar paginação
              stream.write("screen-length 0 temporary\n");
            } else if (promptCount === 2) {
              // Pós screen-length: enviar primeiro comando
              if (commandIndex < config.commands.length) {
                const cmd = config.commands[commandIndex++];
                setTimeout(() => stream.write(cmd + "\n"), 150);
              } else {
                clearTimeout(globalTimeout);
                conn.end();
                resolve(output);
              }
            } else {
              // Pós-comando: próximo comando ou finalizar
              if (commandIndex < config.commands.length) {
                const cmd = config.commands[commandIndex++];
                setTimeout(() => stream.write(cmd + "\n"), 150);
              } else {
                clearTimeout(globalTimeout);
                setTimeout(() => { conn.end(); resolve(output); }, 300);
              }
            }
          }
        });

        stream.on("close", () => {
          clearTimeout(globalTimeout);
          if (output.length > 0) resolve(output);
          else reject(new Error("SSH shell closed without output"));
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
      algorithms: {
        kex: [
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
        ],
        cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr", "aes128-cbc", "aes256-cbc", "3des-cbc"],
        serverHostKey: ["ssh-rsa", "ssh-dss", "ecdsa-sha2-nistp256"],
        hmac: ["hmac-sha2-256", "hmac-sha1", "hmac-md5"],
      },
    };

    if (config.password) {
      connectOptions.password = config.password;
    } else if (config.privateKeyPath) {
      try {
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
    // Formato Ne8000: "  10.11.79.85   4   61568   14572597   117656   0   0841h32m   Established   1060666"
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

/**
 * Faz parse do output de "display nqa results" e extrai métricas de todos os testes.
 * Suporta NQA icmp e icmpjitter do Ne8000:
 *   NQA entry(bgpmon, aloo) :testflag is active ,testtype is icmp
 *     1 . Test 1 result   The test is finished
 *      Min/Max/Avg/Sum RTT:3/5/4/400
 *      Packet Loss Ratio:0 %
 *   (icmpjitter também inclui Average of Jitter)
 */
function parseNqaResults(output: string): NqaResult[] {
  const results: NqaResult[] = [];

  // Dividir por entradas NQA
  const entryRegex = /NQA entry\(([^,]+),\s*([^)]+)\)\s*:testflag is (\w+)/g;
  let entryMatch;

  while ((entryMatch = entryRegex.exec(output)) !== null) {
    const adminName = entryMatch[1].trim();
    const testName = entryMatch[2].trim();

    // Extrair o bloco desta entrada (até a próxima entrada ou fim)
    const blockStart = entryMatch.index;
    const nextEntry = output.indexOf("NQA entry(", blockStart + 1);
    const block = nextEntry > 0 ? output.slice(blockStart, nextEntry) : output.slice(blockStart);

    // Suporta dois formatos de output NQA do Ne8000:
    // 1. test-type icmp: "Min/Max/Average Completion Time: 3/4/3" e "Lost packet ratio: 0 %"
    // 2. test-type icmpjitter: "Min/Max/Avg/Sum RTT: 3/4/3/17" e "Packet Loss Ratio: 0 %"
    const icmpRttMatch = block.match(/Min\/Max\/Average Completion Time:\s*(\d+)\/(\d+)\/(\d+)/);
    const icmpjitterRttMatch = block.match(/Min\/Max\/Avg\/Sum RTT:\s*(\d+)\/(\d+)\/(\d+)\/\d+/);
    const rttMatch = icmpRttMatch || icmpjitterRttMatch;
    const jitterMatch = block.match(/Average of Jitter:\s*([\d.]+)/);
    // "Lost packet ratio: 0 %" (icmp) ou "Packet Loss Ratio: 0 %" (icmpjitter)
    const lossMatch = block.match(/(?:Lost packet ratio|Packet Loss Ratio):\s*(\d+)\s*%/);
    const completionMatch = block.match(/Completion:\s*(\w+)/);

    const minRtt = rttMatch ? parseInt(rttMatch[1]) : null;
    const maxRtt = rttMatch ? parseInt(rttMatch[2]) : null;
    const avgRtt = rttMatch ? parseInt(rttMatch[3]) : null;
    const jitter = jitterMatch ? parseFloat(jitterMatch[1]) : null;
    const packetLoss = lossMatch ? parseInt(lossMatch[1]) : 100;
    const completed = completionMatch ? completionMatch[1] === "success" : false;

    results.push({
      adminName,
      testName,
      latencyMs: avgRtt,
      minLatencyMs: minRtt,
      maxLatencyMs: maxRtt,
      jitterMs: jitter,
      packetLoss,
      success: completed && avgRtt !== null && avgRtt > 0,
    });
  }

  return results;
}

// ─── Gestão de testes NQA ─────────────────────────────────────────────────────

/**
 * Gera o nome do teste NQA a partir do ID do destino e nome da operadora.
 * Ne8000 não aceita hífens — usa apenas letras, números e underscores.
 * Formato: d<destId>_<operatorSlug>
 */
function nqaTestName(destId: number, operatorName: string): string {
  const slug = operatorName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  // IDs negativos (fallback) usam 'f' + valor absoluto para evitar hífen
  // v3 = tipo icmp (substituiu icmpjitter da v1/v2)
  const idStr = destId < 0 ? `f${Math.abs(destId)}` : `d${destId}`;
  return `v3${idStr}${slug}`;
}

/**
 * Cria um teste NQA icmpjitter no Ne8000 para um destino.
 * Usa system-view com two-stage commit.
 */
async function createNqaTest(
  sshConfig: SshConfig,
  destId: number,
  operatorName: string,
  destHost: string,
  sourceIp: string
): Promise<void> {
  const testName = nqaTestName(destId, operatorName);
  console.log(`[NQA] Criando teste ${NQA_ADMIN}/${testName} → ${destHost} (src: ${sourceIp})`);

  await execSshShell({
    ...sshConfig,
    commands: [
      "system-view",
      `nqa test-instance ${NQA_ADMIN} ${testName}`,
      "test-type icmp",
      `destination-address ipv4 ${destHost}`,
      `source-address ipv4 ${sourceIp}`,
      "frequency 30",
      "probe-count 5",
      "start now",
      "commit",
      "quit",
      "commit",
      "quit",
    ],
    timeoutMs: 30000,
  });

  console.log(`[NQA] Teste ${testName} criado com sucesso`);
}

/**
 * Remove um teste NQA do Ne8000.
 */
async function removeNqaTest(
  sshConfig: SshConfig,
  destId: number,
  operatorName: string
): Promise<void> {
  const testName = nqaTestName(destId, operatorName);
  console.log(`[NQA] Removendo teste ${NQA_ADMIN}/${testName}`);

  try {
    await execSshShell({
      ...sshConfig,
      commands: [
        "system-view",
        `nqa test-instance ${NQA_ADMIN} ${testName}`,
        "stop",
        "quit",
        `undo nqa test-instance ${NQA_ADMIN} ${testName}`,
        "commit",
        "quit",
      ],
      timeoutMs: 20000,
    });
    console.log(`[NQA] Teste ${testName} removido`);
  } catch (err: any) {
    console.warn(`[NQA] Aviso ao remover teste ${testName}: ${err.message}`);
  }
}

/**
 * Remove um teste NQA pelo nome completo (adminName + testName).
 * Usado para limpeza de testes legados.
 */
async function removeNqaTestByName(
  sshConfig: SshConfig,
  adminName: string,
  testName: string
): Promise<void> {
  console.log(`[NQA] Removendo teste legado ${adminName}/${testName}`);
  try {
    await execSshShell({
      ...sshConfig,
      commands: [
        "system-view",
        `nqa test-instance ${adminName} ${testName}`,
        "stop",
        "quit",
        `undo nqa test-instance ${adminName} ${testName}`,
        "commit",
        "quit",
      ],
      timeoutMs: 20000,
    });
    console.log(`[NQA] Teste legado ${adminName}/${testName} removido`);
  } catch (err: any) {
    console.warn(`[NQA] Aviso ao remover teste legado ${adminName}/${testName}: ${err.message}`);
  }
}

/**
 * Remove todos os testes NQA que não seguem o padrão atual (prefixo v3).
 * Executa apenas uma vez na inicialização do monitor.
 */
async function cleanupLegacyNqaTests(sshConfig: SshConfig): Promise<void> {
  console.log("[NQA] Iniciando limpeza de testes NQA legados (v1/v2)...");
  try {
    const existingTests = await listExistingNqaTests(sshConfig);
    const legacyTests = existingTests.filter(t => {
      const testName = t.split("/")[1] || "";
      return !testName.startsWith("v3");
    });
    if (legacyTests.length === 0) {
      console.log("[NQA] Nenhum teste legado encontrado");
      return;
    }
    console.log(`[NQA] Encontrados ${legacyTests.length} testes legados: ${legacyTests.join(", ")}`);
    for (const fullName of legacyTests) {
      const [adminName, testName] = fullName.split("/");
      await removeNqaTestByName(sshConfig, adminName, testName);
    }
    console.log("[NQA] Limpeza de testes legados concluída");
  } catch (err: any) {
    console.warn(`[NQA] Aviso durante limpeza de testes legados: ${err.message}`);
  }
}

/**
 * Lê todos os resultados NQA do Ne8000.
 */
async function readNqaResults(sshConfig: SshConfig): Promise<NqaResult[]> {
  const output = await execSshShell({
    ...sshConfig,
    commands: ["display nqa results"],
    timeoutMs: 20000,
  });
  // Debug: logar output bruto NQA
  console.log("[NQA DEBUG RAW]", JSON.stringify(output.substring(0, 3000)));
  return parseNqaResults(output);
}

/**
 * Verifica quais testes NQA existem atualmente no Ne8000.
 * Retorna lista de nomes de teste no formato "adminName/testName".
 */
async function listExistingNqaTests(sshConfig: SshConfig): Promise<string[]> {
  // Usar display nqa test-instance all para listar testes configurados (inclui testes que ainda nao rodaram)
  const output = await execSshShell({
    ...sshConfig,
    commands: ["display nqa results"],
    timeoutMs: 20000,
  });
  console.log(`[NQA] Testes configurados (raw): ${output.slice(0, 3000).replace(/\n/g, "|")}`);
  const tests: string[] = [];
  // Formato: NQA entry(adminName, testName)
  const entryRegex = /NQA entry\(([^,]+),\s*([^)]+)\)/g;
  let match;
  while ((match = entryRegex.exec(output)) !== null) {
    tests.push(`${match[1].trim()}/${match[2].trim()}`);
  }
  // Formato alternativo: "Admin: bgpmon  Test: v2f1aloo"
  const altRegex = /Admin:\s*(\S+)\s+Test:\s*(\S+)/g;
  while ((match = altRegex.exec(output)) !== null) {
    const full = `${match[1].trim()}/${match[2].trim()}`;
    if (!tests.includes(full)) tests.push(full);
  }
  return tests;
}

// ─── Parsing BGP ─────────────────────────────────────────────────────────────

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
    // Limpeza única de testes NQA legados (v1/v2) na primeira execução
    if (!legacyCleanupDone) {
      legacyCleanupDone = true;
      await cleanupLegacyNqaTests(sshConfig);
    }

    // 1. Ler status dos peers BGP
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
        const established = bgpPeers.filter(p => p.state === "Established").length;
        console.log(`[Monitor] Peers Established: ${established}/${bgpPeers.length}`);
      }
    } catch (err: any) {
      console.error(`[Monitor] Erro ao ler BGP peers: ${err.message}`);
    }

    // 2. Sincronizar testes NQA com os destinos cadastrados
    // Verificar quais testes NQA existem no Ne8000
    let existingNqaTests: string[] = [];
    try {
      existingNqaTests = await listExistingNqaTests(sshConfig);
      console.log(`[Monitor] Testes NQA existentes: ${existingNqaTests.length}`);
    } catch (err: any) {
      console.warn(`[Monitor] Aviso ao listar testes NQA: ${err.message}`);
    }

    // Para cada operadora, garantir que os testes NQA existam
    for (const operator of operatorsList) {
      const destList = await db.listDestinations(operator.id);

      if (destList.length === 0) {
        // Sem destinos cadastrados → usar peer BGP como destino NQA fallback
        const fallbackId = -(operator.id);
        const testName = nqaTestName(fallbackId, operator.name);
        const fullName = `${NQA_ADMIN}/${testName}`;
        if (!existingNqaTests.includes(fullName)) {
          try {
            console.log(`[NQA] Sem destinos para ${operator.name} — usando peer BGP ${operator.peerIp} como fallback`);
            await createNqaTest(sshConfig, fallbackId, operator.name, operator.peerIp, operator.sourceIp);
          } catch (err: any) {
            console.error(`[NQA] Erro ao criar teste fallback para ${operator.name}: ${err.message}`);
          }
        }
      } else {
        // Remover teste fallback se existir (agora tem destinos reais)
        const fallbackId = -(operator.id);
        const fallbackTestName = nqaTestName(fallbackId, operator.name);
        const fallbackFullName = `${NQA_ADMIN}/${fallbackTestName}`;
        if (existingNqaTests.includes(fallbackFullName)) {
          try {
            console.log(`[NQA] Removendo teste fallback de ${operator.name} (agora tem destinos reais)`);
            await removeNqaTest(sshConfig, fallbackId, operator.name);
          } catch (err: any) {
            console.warn(`[NQA] Aviso ao remover fallback de ${operator.name}: ${err.message}`);
          }
        }
        for (const dest of destList) {
          const testName = nqaTestName(dest.id, operator.name);
          const fullName = `${NQA_ADMIN}/${testName}`;
          if (!existingNqaTests.includes(fullName)) {
            // Teste não existe — criar
            try {
              await createNqaTest(sshConfig, dest.id, operator.name, dest.host, operator.sourceIp);
            } catch (err: any) {
              console.error(`[NQA] Erro ao criar teste para ${dest.host}: ${err.message}`);
            }
          }
        }
      }
    }

    // 3. Ler resultados NQA de todos os testes
    let nqaResults: NqaResult[] = [];
    try {
      const nqaRaw = await execSshShell({ ...sshConfig, commands: ["display nqa results"], timeoutMs: 20000 });
      console.log(`[Monitor] NQA raw output (primeiros 5000 chars): ${nqaRaw.slice(0, 5000).replace(/\n/g, '|')}`);
      nqaResults = parseNqaResults(nqaRaw);
      console.log(`[Monitor] Resultados NQA lidos: ${nqaResults.length}`);
    } catch (err: any) {
      console.warn(`[Monitor] Aviso ao ler resultados NQA: ${err.message}`);
    }

    // 4. Para cada operadora, atualizar status e métricas
    for (const operator of operatorsList) {
      try {
        // Verificar status BGP
        const peer = bgpPeers.find(p => p.peerIp === operator.peerIp);
        let newStatus: "up" | "down" | "degraded" | "unknown" = "unknown";

        if (peer) {
          if (peer.state === "Established") {
            newStatus = "up";
            console.log(`[Monitor] ${operator.name}: BGP Established (uptime: ${peer.uptime})`);
          } else {
            newStatus = "down";
            console.log(`[Monitor] ${operator.name}: BGP peer ${operator.peerIp} está ${peer.state}`);
          }
        } else if (bgpPeers.length > 0) {
          newStatus = "down";
          console.log(`[Monitor] ${operator.name}: peer ${operator.peerIp} não encontrado na tabela BGP`);
        }

        // Processar métricas NQA dos destinos desta operadora
        const destList = await db.listDestinations(operator.id);
        let nqaSuccessCount = 0;
        let nqaFailCount = 0;

        if (destList.length === 0) {
          // Sem destinos reais — verificar teste fallback (peer BGP)
          const fallbackId = -(operator.id);
          const fallbackTestName = nqaTestName(fallbackId, operator.name);
          const fallbackResult = nqaResults.find(
            r => r.adminName === NQA_ADMIN && r.testName === fallbackTestName
          );
          if (fallbackResult) {
            const latency = fallbackResult.latencyMs ?? 9999;
            const jitter = fallbackResult.jitterMs ?? 0;
            const loss = fallbackResult.packetLoss;
            await db.addLatencyMetric({
              operatorId: operator.id,
              destinationId: 0,
              latencyMs: latency,
              packetLoss: loss,
              jitterMs: Math.round(jitter),
            });
            if (fallbackResult.success) {
              nqaSuccessCount++;
              console.log(
                `[Monitor] ${operator.name} → ${operator.peerIp} (peer/fallback): ` +
                `RTT=${latency}ms, jitter=${jitter.toFixed(1)}ms, perda=${loss}%`
              );
            } else {
              nqaFailCount++;
              console.log(
                `[Monitor] ${operator.name} → ${operator.peerIp} (peer/fallback): NQA FALHOU (perda=${loss}%)`
              );
            }
          } else {
            console.log(`[Monitor] ${operator.name} → ${operator.peerIp} (peer/fallback): aguardando resultado NQA`);
          }
          // Status final com fallback: BGP determina up/down
          // NQA com peer BGP é apenas métrica — peer pode não responder a ICMP
          // Só marca degraded se NQA tiver destinos reais configurados
          // Com fallback (sem destinos), BGP Established = up
          // (não altera newStatus para degraded neste caso)
        } else {
          for (const dest of destList) {
            const testName = nqaTestName(dest.id, operator.name);
            const nqaResult = nqaResults.find(
              r => r.adminName === NQA_ADMIN && r.testName === testName
            );
            if (nqaResult) {
              const latency = nqaResult.latencyMs ?? 9999;
              const jitter = nqaResult.jitterMs ?? 0;
              const loss = nqaResult.packetLoss;
              await db.addLatencyMetric({
                operatorId: operator.id,
                destinationId: dest.id,
                latencyMs: latency,
                packetLoss: loss,
                jitterMs: Math.round(jitter),
              });
              if (nqaResult.success) {
                nqaSuccessCount++;
                console.log(
                  `[Monitor] ${operator.name} → ${dest.host}: ` +
                  `RTT=${latency}ms, jitter=${jitter.toFixed(1)}ms, perda=${loss}%`
                );
              } else {
                nqaFailCount++;
                console.log(
                  `[Monitor] ${operator.name} → ${dest.host}: NQA FALHOU (perda=${loss}%)`
                );
              }
            } else {
              console.log(`[Monitor] ${operator.name} → ${dest.host}: aguardando resultado NQA`);
            }
          }
          // Status final: BGP determina up/down, NQA pode indicar degraded
          if (newStatus === "up" && destList.length > 0 && nqaResults.length > 0) {
            if (nqaFailCount === destList.length && nqaSuccessCount === 0) {
              newStatus = "degraded";
            }
          }
        }

        // Atualizar status no banco
        if (newStatus !== operator.status) {
          await db.updateOperator(operator.id, { status: newStatus });
          console.log(`[Monitor] Operadora ${operator.name}: status alterado ${operator.status} → ${newStatus}`);
          await db.addAuditLog({
            type: newStatus === "down" ? "alert" : newStatus === "up" ? "recovery" : "info",
            severity: newStatus === "down" ? "critical" : newStatus === "degraded" ? "warning" : "info",
            title: `Operadora ${operator.name}: ${newStatus.toUpperCase()}`,
            description: `Status alterado de ${operator.status} para ${newStatus}. Peer BGP: ${peer?.state || "não encontrado"}. NQA: ${nqaSuccessCount}/${destList.length} destinos OK`,
          });
        } else {
          await db.updateOperator(operator.id, { status: newStatus });
        }
      } catch (opErr: any) {
        console.error(`[Monitor] Erro ao monitorar operadora ${operator.name}: ${opErr.message}`);
      }
    }

    consecutiveFailures = 0;
    lastError = null;
    console.log(`[Monitor] Ciclo concluído em ${Date.now() - lastRunAt!.getTime()}ms`);
  } catch (err: any) {
    consecutiveFailures++;
    lastError = err.message;
    console.error(`[Monitor] Erro no ciclo (falha #${consecutiveFailures}): ${err.message}`);
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
  console.log(`[Monitor] Iniciando daemon Fase 2 com NQA (intervalo: ${intervalSeconds}s)`);
  setTimeout(() => runMonitorCycle(), 5000);
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

/**
 * Remove um teste NQA quando um destino é deletado do painel.
 * Chamado pelo router de destinations ao deletar um destino.
 */
export async function onDestinationDeleted(
  destId: number,
  operatorName: string,
  sshConfig: SshConfig
): Promise<void> {
  try {
    await removeNqaTest(sshConfig, destId, operatorName);
  } catch (err: any) {
    console.warn(`[NQA] Aviso ao remover teste NQA para destino ${destId}: ${err.message}`);
  }
}
