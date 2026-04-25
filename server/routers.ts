import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as jose from "jose";
import { createHash } from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { onDestinationDeleted } from "./monitor";
import { addLoopbackIp, removeLoopbackIp, listLoopbackIps } from "./linuxMonitor";

const JWT_SECRET = process.env.JWT_SECRET || "bgp-failover-secret-key";
const LOCAL_AUTH_COOKIE = "bgp_local_auth";

// Cache de cooldown de alertas de latência por portId (em memória)
const latencyAlertCooldown = new Map<number, number>();

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "bgp-salt-2024").digest("hex");
}

async function signLocalJwt(userId: number, role: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new jose.SignJWT({ userId, role, type: "local" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);
}

async function verifyLocalJwt(token: string): Promise<{ userId: number; role: string } | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    if (payload.type !== "local") return null;
    return { userId: payload.userId as number, role: payload.role as string };
  } catch {
    return null;
  }
}

// Middleware to check local auth from cookie
const localAuthProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const cookieHeader = ctx.req.headers.cookie as string | undefined;
  if (!cookieHeader) throw new TRPCError({ code: "UNAUTHORIZED" });
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => c.trim().split("=").map(decodeURIComponent))
  );
  const token = cookies[LOCAL_AUTH_COOKIE];
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyLocalJwt(token);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
  const user = await db.getLocalUserById(payload.userId);
  if (!user || !user.active) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, localUser: user } });
});

const adminProcedure = localAuthProcedure.use(async ({ ctx, next }) => {
  if ((ctx as any).localUser?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Local Auth ──────────────────────────────────────────────────────────
  localAuth: router({
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Auto-create admin on first login
        const count = await db.countLocalUsers();
        if (count === 0) {
          await db.createLocalUser({
            username: "admin",
            passwordHash: hashPassword("admin123"),
            name: "Administrador",
            role: "admin",
            active: true,
          });
        }
        const user = await db.getLocalUserByUsername(input.username);
        if (!user || !user.active) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });
        const hash = hashPassword(input.password);
        if (hash !== user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas" });
        const token = await signLocalJwt(user.id, user.role);
        await db.updateLocalUserLastSignedIn(user.id);
        await db.addAuditLog({ type: "auth", severity: "info", title: `Login: ${user.username}`, userId: user.id });
        const isSecure = ctx.req.protocol === "https" || (ctx.req.headers["x-forwarded-proto"] as string) === "https";
        ctx.res.cookie(LOCAL_AUTH_COOKIE, token, {
          httpOnly: true, secure: isSecure, sameSite: isSecure ? "none" : "lax",
          maxAge: 86400000, path: "/", // 24 horas em milissegundos
        });
        return { success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(LOCAL_AUTH_COOKIE, { path: "/" });
      return { success: true };
    }),

    me: publicProcedure.query(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie as string | undefined;
      if (!cookieHeader) return null;
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c) => c.trim().split("=").map(decodeURIComponent))
      );
      const token = cookies[LOCAL_AUTH_COOKIE];
      if (!token) return null;
      const payload = await verifyLocalJwt(token);
      if (!payload) return null;
      const user = await db.getLocalUserById(payload.userId);
      if (!user || !user.active) return null;
      return { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email };
    }),
  }),

  // ─── Users Management ────────────────────────────────────────────────────
  users: router({
    list: localAuthProcedure.query(async () => db.listLocalUsers()),

    create: adminProcedure
      .input(z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(["admin", "viewer"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getLocalUserByUsername(input.username);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Usuário já existe" });
        await db.createLocalUser({ ...input, passwordHash: hashPassword(input.password), active: true });
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Usuário criado: ${input.username}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(["admin", "viewer"]).optional(),
        active: z.boolean().optional(),
        password: z.string().min(6).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, password, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };
        if (password) data.passwordHash = hashPassword(password);
        await db.updateLocalUser(id, data as any);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Usuário atualizado: ID ${id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if ((ctx as any).localUser?.id === input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Não pode excluir a si mesmo" });
        await db.deleteLocalUser(input.id);
        await db.addAuditLog({ type: "config_change", severity: "warning", title: `Usuário excluído: ID ${input.id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),
  }),

  // ─── Ne8000 Config ────────────────────────────────────────────────────────
  ne8000: router({
    get: localAuthProcedure.query(async () => {
      const config = await db.getNe8000Config();
      if (!config) return null;
      return { ...config, password: config.password ? "••••••••" : null };
    }),

    save: adminProcedure
      .input(z.object({
        host: z.string().min(1),
        port: z.number().default(22),
        username: z.string().min(1),
        sshKeyPath: z.string().optional(),
        password: z.string().optional(),
        asNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.saveNe8000Config(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: "Configuração Ne8000 atualizada", userId: (ctx as any).localUser?.id });
        return { success: true };
      }),
  }),

  // ─── Operators ────────────────────────────────────────────────────────────
  operators: router({
    list: localAuthProcedure.query(async () => db.listOperators()),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        interface: z.string().min(1),
        sourceIp: z.string().min(1),
        peerIp: z.string().min(1),
        asNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createOperator(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Operadora criada: ${input.name}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        interface: z.string().optional(),
        sourceIp: z.string().optional(),
        peerIp: z.string().optional(),
        asNumber: z.string().optional(),
        active: z.boolean().optional(),
        status: z.enum(["up", "down", "degraded", "unknown"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateOperator(id, data as any);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteOperator(input.id);
        await db.addAuditLog({ type: "config_change", severity: "warning", title: `Operadora excluída: ID ${input.id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),
  }),

  // ─── Destinations ─────────────────────────────────────────────────────────
  destinations: router({
    list: localAuthProcedure
      .input(z.object({ operatorId: z.number().optional() }))
      .query(async ({ input }) => db.listDestinations(input.operatorId)),

    create: adminProcedure
      .input(z.object({ operatorId: z.number(), name: z.string().min(1), host: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.createDestination(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Destino adicionado: ${input.host}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({ id: z.number(), operatorId: z.number().optional(), name: z.string().min(1).optional(), host: z.string().min(1).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDestination(id, data);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Destino editado: ID ${id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Buscar destino e operadora antes de deletar (para remover NQA)
        const allDests = await db.listDestinations();
        const dest = allDests.find(d => d.id === input.id);
        let operatorName = "";
        if (dest) {
          const ops = await db.listOperators();
          const op = ops.find(o => o.id === dest.operatorId);
          operatorName = op?.name || "";
          // Remover teste NQA do Ne8000 (se configurado)
          const ne8Config = await db.getNe8000Config();
          if (ne8Config && ne8Config.host && operatorName) {
            onDestinationDeleted(input.id, operatorName, {
              host: ne8Config.host,
              port: ne8Config.port || 22,
              username: ne8Config.username,
              password: ne8Config.password || undefined,
            }).catch(err => console.warn("[NQA] Aviso ao remover teste:", err.message));
          }
        }
        await db.deleteDestination(input.id);
        await db.addAuditLog({ type: "config_change", severity: "warning", title: `Destino removido: ID ${input.id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),
  }),
  // ─── Telegram Configg ──────────────────────────────────────────────────────
  telegram: router({
    get: localAuthProcedure.query(async () => {
      const config = await db.getTelegramConfig();
      if (!config) return null;
      return { ...config, botToken: config.botToken ? "••••••••" : null };
    }),

    save: adminProcedure
      .input(z.object({
        botToken: z.string().optional(),
        chatId: z.string().optional(),
        enabled: z.boolean(),
        notifyFailover: z.boolean(),
        notifyRecovery: z.boolean(),
        notifyHighLatency: z.boolean(),
        notifyBgpDown: z.boolean(),
        latencyThreshold: z.number().min(1).max(10000).default(50),
        packetLossThreshold: z.number().min(0).max(100).default(5),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.saveTelegramConfig(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: "Configuração Telegram atualizada", userId: (ctx as any).localUser?.id });
         return { success: true };
      }),
    sendTest: adminProcedure.mutation(async () => {
      const config = await db.getTelegramConfig();
      if (!config || !config.botToken || !config.chatId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bot Token e Chat ID precisam estar configurados antes de testar.' });
      }
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
      const text = `✅ *Teste de Notificação*\n\nBGP Failover Platform\nEste é um teste de envio do bot Telegram.\n\n🕐 ${now}\n🖥️ Servidor: BGP Failover Web`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'Markdown' }),
      });
      const data = await res.json() as { ok: boolean; description?: string };
      if (!data.ok) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Telegram API retornou erro: ${data.description}` });
      }
      return { success: true };
    }),
  }),
  // ─── Dedicated Clients ────────────────────────────────────────────────────
  clients: router({
    list: localAuthProcedure.query(async () => {
      const clients = await db.listDedicatedClients();
      const result = await Promise.all(clients.map(async (client) => {
        const destinations = await db.listClientDestinations(client.id);
        const failoverState = await db.getClientFailoverState(client.id);
        return { ...client, destinations, failoverState };
      }));
      return result;
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        prefix: z.string().min(1),
        description: z.string().optional(),
        failoverEnabled: z.boolean().default(true),
        latencyThreshold: z.number().default(100),
        packetLossThreshold: z.number().default(5),
        prependCount: z.number().default(3),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createDedicatedClient(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Cliente dedicado criado: ${input.name}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        prefix: z.string().optional(),
        description: z.string().optional(),
        failoverEnabled: z.boolean().optional(),
        latencyThreshold: z.number().optional(),
        packetLossThreshold: z.number().optional(),
        prependCount: z.number().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDedicatedClient(id, data as any);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Cliente atualizado: ID ${id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const client = await db.getDedicatedClientById(input.id);
        await db.deleteDedicatedClient(input.id);
        await db.addAuditLog({ type: "config_change", severity: "warning", title: `Cliente excluído: ${client?.name || input.id}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    addDestination: adminProcedure
      .input(z.object({ clientId: z.number(), name: z.string().min(1), host: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await db.createClientDestination(input);
        await db.addAuditLog({ type: "config_change", severity: "info", title: `Destino adicionado ao cliente ${input.clientId}: ${input.host}`, userId: (ctx as any).localUser?.id });
        return { success: true };
      }),

    removeDestination: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteClientDestination(input.id);
        return { success: true };
      }),
  }),

  // ─── Latency Metrics ──────────────────────────────────────────────────────
  latency: router({
    list: localAuthProcedure
      .input(z.object({
        operatorId: z.number().optional(),
        destinationId: z.number().optional(),
        hours: z.number().default(24),
      }))
      .query(async ({ input }) => db.getLatencyMetrics(input.operatorId, input.destinationId, input.hours)),

    addSimulated: adminProcedure
      .input(z.object({
        operatorId: z.number(),
        destinationId: z.number(),
        latencyMs: z.number(),
        packetLoss: z.number().default(0),
        jitterMs: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        await db.addLatencyMetric(input);
        return { success: true };
      }),
    reset: adminProcedure
      .input(z.object({
        operatorId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const deleted = await db.clearLatencyMetrics(input.operatorId);
        return { success: true, deleted };
      }),
  }),

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  audit: router({
    list: localAuthProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input }) => db.listAuditLogs(input.limit)),
  }),

  // ─── Service Control ──────────────────────────────────────────────────────
  service: router({
    status: localAuthProcedure.query(async () => {
      const { getMonitorStatus } = await import("./monitor");
      const monitorStatus = getMonitorStatus();
      return {
        status: monitorStatus.running ? "running" as const : "stopped" as const,
        uptime: Math.floor(process.uptime()),
        version: "2.0.0",
        apiHealthy: true,
        dbConnected: true,
        timestamp: new Date(),
        monitor: {
          active: monitorStatus.running,
          isExecuting: monitorStatus.isExecuting,
          lastRunAt: monitorStatus.lastRunAt,
          lastError: monitorStatus.lastError,
          consecutiveFailures: monitorStatus.consecutiveFailures,
        },
      };
    }),
    action: adminProcedure
      .input(z.object({ action: z.enum(["start", "stop", "restart"]) }))
      .mutation(async ({ input, ctx }) => {
        const { startMonitor, stopMonitor } = await import("./monitor");
        if (input.action === "start") {
          startMonitor(30);
        } else if (input.action === "stop") {
          stopMonitor();
        } else if (input.action === "restart") {
          stopMonitor();
          setTimeout(() => startMonitor(30), 1000);
        }
        await db.addAuditLog({
          type: "service",
          severity: input.action === "stop" ? "warning" : "info",
          title: `Serviço: ${input.action}`,
          description: `Ação de serviço executada: ${input.action}`,
          userId: (ctx as any).localUser?.id,
        });
        return { success: true, action: input.action, message: `Ação '${input.action}' registrada com sucesso` };
      }),
  }),

  // ─── Dashboard Overview ───────────────────────────────────────────────────
  dashboard: router({
    overview: localAuthProcedure.query(async () => {
      const [operatorsList, clientsList, recentLogs] = await Promise.all([
        db.listOperators(),
        db.listDedicatedClients(),
        db.listAuditLogs(10),
      ]);
      const operatorsUp = operatorsList.filter((o) => o.status === "up").length;
      const operatorsDown = operatorsList.filter((o) => o.status === "down").length;
      const activeClients = clientsList.filter((c) => c.active).length;
      return {
        service: { status: "running", uptime: Math.floor(process.uptime()) },
        operators: { total: operatorsList.length, up: operatorsUp, down: operatorsDown, list: operatorsList },
        clients: { total: clientsList.length, active: activeClients },
        recentEvents: recentLogs,
      };
    }),
  }),

  // ─── Linux Probes (Monitor Direto Debian)) ─────────────────────────────────────────────────────────────────────────────────
  linuxProbes: router({
    list: localAuthProcedure.query(async () => {
      const probes = await db.listLinuxProbes();
      const loopbacks = await listLoopbackIps();
      return probes.map((p) => ({
        ...p,
        loopbackActive: loopbacks.some((l) => l.startsWith(p.sourceIp)),
      }));
    }),
    add: adminProcedure
      .input(z.object({
        operatorId: z.number(),
        name: z.string().min(1).max(100),
        sourceIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, "IP inválido"),
      }))
      .mutation(async ({ input }) => {
        const probe = await db.addLinuxProbe({ operatorId: input.operatorId, name: input.name, sourceIp: input.sourceIp });
        // Automatically add loopback IP
        const loResult = await addLoopbackIp(input.sourceIp);
        await db.addAuditLog({
          type: "config_change",
          severity: "info",
          title: `Monitor Linux: probe adicionada`,
          description: `${input.name} (${input.sourceIp}) — ${loResult.message}`,
        });
        return { probe, loopback: loResult };
      }),
    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Get probe info before deleting
        const probes = await db.listLinuxProbes();
        const probe = probes.find((p) => p.id === input.id);
        if (!probe) throw new TRPCError({ code: "NOT_FOUND" });
        await db.removeLinuxProbe(input.id);
        // Remove loopback IP
        const loResult = await removeLoopbackIp(probe.sourceIp);
        await db.addAuditLog({
          type: "config_change",
          severity: "warning",
          title: `Monitor Linux: probe removida`,
          description: `${probe.name} (${probe.sourceIp}) — ${loResult.message}`,
        });
        return { success: true, loopback: loResult };
      }),
    toggle: adminProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.toggleLinuxProbe(input.id, input.active);
        return { success: true };
      }),
    loopbacks: localAuthProcedure.query(async () => {
      return listLoopbackIps();
    }),
  }),

  // ─── Linux Metrics ──────────────────────────────────────────────────────────────────────────────────────
  linuxMetrics: router({
    list: localAuthProcedure
      .input(z.object({
        operatorId: z.number().optional(),
        probeId: z.number().optional(),
        destinationId: z.number().optional(),
        hours: z.number().default(6),
      }))
      .query(async ({ input }) => {
        return db.listLinuxMetrics(input);
      }),
    reset: adminProcedure
      .input(z.object({ probeId: z.number().optional() }))
      .mutation(async ({ input }) => {
        const deleted = await db.clearLinuxMetrics(input.probeId);
        return { success: true, deleted };
      }),
  }),
  // ─── Linux Destinations (destinos independentes por probe) ─────────────────
  linuxDestinations: router({
    list: localAuthProcedure
      .input(z.object({ probeId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.listLinuxDestinations(input.probeId);
      }),
    create: adminProcedure
      .input(z.object({
        probeId: z.number(),
        name: z.string().min(1).max(100),
        host: z.string().min(1).max(255),
        packetSize: z.number().int().min(1).max(65507).default(32),
        packetCount: z.number().int().min(1).max(100).default(5),
        frequency: z.number().int().min(5).max(86400).default(30),
        offlineAlert: z.enum(["never", "1", "2", "3", "5"]).default("never"),
        latencyThreshold: z.number().int().min(0).max(10000).default(0),
        lossThreshold: z.number().int().min(0).max(100).default(0),
        alertRepeatMinutes: z.number().int().min(1).max(60).default(5),
      }))
      .mutation(async ({ input }) => {
        const dest = await db.createLinuxDestination(input);
        await db.addAuditLog({
          type: "config_change",
          severity: "info",
          title: "Monitor Linux: destino adicionado",
          description: `${input.name} (${input.host}) para probe ID ${input.probeId}`,
        });
        return dest;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        host: z.string().min(1).max(255).optional(),
        packetSize: z.number().int().min(1).max(65507).optional(),
        packetCount: z.number().int().min(1).max(100).optional(),
        frequency: z.number().int().min(5).max(86400).optional(),
        offlineAlert: z.enum(["never", "1", "2", "3", "5"]).optional(),
        latencyThreshold: z.number().int().min(0).max(10000).optional(),
        lossThreshold: z.number().int().min(0).max(100).optional(),
        alertRepeatMinutes: z.number().int().min(1).max(60).optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateLinuxDestination(id, data);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteLinuxDestination(input.id);
        return { success: true };
      }),
    metrics: localAuthProcedure
      .input(z.object({
        destinationId: z.number().optional(),
        probeId: z.number().optional(),
        hours: z.number().default(6),
      }))
      .query(async ({ input }) => {
        return db.listLinuxDestMetrics(input);
      }),
    clearMetrics: adminProcedure
      .input(z.object({ destinationId: z.number().optional() }))
      .mutation(async ({ input }) => {
        await db.clearLinuxDestMetrics(input.destinationId);
        return { success: true };
      }),
  }),
  linuxIncidents: router({
    list: localAuthProcedure
      .input(z.object({
        probeId: z.number().optional(),
        destinationId: z.number().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }))
      .query(async ({ input }) => {
        return db.listLinuxIncidents(input);
      }),
  }),

  // ─── Traffic Analysis (LibreNMS proxy) ───────────────────────────────────────
  traffic: router({
    // Retorna dados em tempo real de todas as interfaces monitoradas
    getPorts: localAuthProcedure.query(async () => {
      const LIBRENMS_URL = process.env.LIBRENMS_URL || "http://45.237.165.251:8080";
      const LIBRENMS_TOKEN = process.env.LIBRENMS_TOKEN || "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";
      const MONITORED_PORT_IDS = [4, 5, 6, 39, 130, 77, 126, 90, 106, 102, 103, 104, 105, 107, 108, 112, 118, 99, 122, 91, 100, 115, 88, 117, 83];

      const res = await fetch(
        `${LIBRENMS_URL}/api/v0/ports?device_id=1&columns=port_id,ifName,ifAlias,ifSpeed,ifInOctets_rate,ifOutOctets_rate,ifOperStatus,ifAdminStatus`,
        { headers: { "X-Auth-Token": LIBRENMS_TOKEN } }
      );
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao consultar LibreNMS" });
      const data = await res.json() as { ports: any[] };
      return (data.ports || []).filter((p: any) => MONITORED_PORT_IDS.includes(Number(p.port_id)));
    }),

    // Retorna configurações de interfaces do banco
    getInterfaceConfigs: localAuthProcedure.query(async () => {
      return db.getAllInterfaceConfigs();
    }),

    // Salva/atualiza configuração de uma interface
    upsertInterfaceConfig: adminProcedure
      .input(z.object({
        portId: z.number(),
        ifName: z.string(),
        label: z.string().min(1).max(150),
        category: z.enum(["upstream", "dedicated"]),
        city: z.string().max(100).optional(),
        contractedBps: z.number().min(0).default(0),
        alertThreshold: z.number().min(1).max(100).default(80),
        alertEnabled: z.boolean().default(false),
        visible: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await db.upsertInterfaceConfig(input);
        return { ok: true };
      }),

    // Verifica saturação de todas as interfaces e envia alertas Telegram
    checkSaturation: localAuthProcedure.mutation(async () => {
      const LIBRENMS_URL = process.env.LIBRENMS_URL || "http://45.237.165.251:8080";
      const LIBRENMS_TOKEN = process.env.LIBRENMS_TOKEN || "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";

      const [configs, telegramCfg] = await Promise.all([
        db.getAllInterfaceConfigs(),
        db.getTelegramConfig(),
      ]);

      const alertConfigs = configs.filter(c => c.alertEnabled);
      if (!alertConfigs.length) return { checked: 0, alerts: 0 };

      const res = await fetch(
        `${LIBRENMS_URL}/api/v0/ports?device_id=1&columns=port_id,ifName,ifSpeed,ifInOctets_rate,ifOutOctets_rate,ifOperStatus`,
        { headers: { "X-Auth-Token": LIBRENMS_TOKEN } }
      );
      if (!res.ok) return { checked: 0, alerts: 0 };
      const data = await res.json() as { ports: any[] };
      const portMap = new Map((data.ports || []).map((p: any) => [Number(p.port_id), p]));

      let alertsSent = 0;
      const now = Date.now();
      const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos entre alertas repetidos

      for (const cfg of alertConfigs) {
        const port = portMap.get(cfg.portId);
        if (!port || port.ifOperStatus !== "up") continue;

        const inBps = (port.ifInOctets_rate || 0) * 8;
        const outBps = (port.ifOutOctets_rate || 0) * 8;
        const maxBps = Math.max(inBps, outBps);

        // Referência: plano contratado (se definido) ou velocidade do link
        const referenceBps = cfg.contractedBps > 0 ? cfg.contractedBps : (port.ifSpeed || 0);
        if (referenceBps <= 0) continue;

        const utilizationPct = (maxBps / referenceBps) * 100;
        if (utilizationPct < cfg.alertThreshold) continue;

        // Verificar cooldown
        const lastAlert = cfg.lastAlertAt ? new Date(cfg.lastAlertAt).getTime() : 0;
        if (now - lastAlert < ALERT_COOLDOWN_MS) continue;

        // Enviar alerta Telegram
        if (telegramCfg?.enabled && telegramCfg.botToken && telegramCfg.chatId) {
          const refLabel = cfg.contractedBps > 0 ? `plano ${formatBpsAlert(cfg.contractedBps)}` : `link ${formatBpsAlert(referenceBps)}`;
          const msg = `🔴 *ALERTA DE SATURAÇÃO*\n\n` +
            `Interface: *${cfg.label}* (${cfg.ifName})\n` +
            `Utilização: *${utilizationPct.toFixed(1)}%* do ${refLabel}\n` +
            `IN: ${formatBpsAlert(inBps)} | OUT: ${formatBpsAlert(outBps)}\n` +
            `Threshold: ${cfg.alertThreshold}%\n` +
            `Horário: ${new Date().toLocaleString("pt-BR")}`;
          try {
            await fetch(`https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: telegramCfg.chatId, text: msg, parse_mode: "Markdown" }),
            });
            await db.updateInterfaceAlertTime(cfg.portId);
            alertsSent++;
          } catch { /* ignore */ }
        }
      }

      return { checked: alertConfigs.length, alerts: alertsSent };
    }),

    // Retorna dados históricos de uma porta específica via RRD
    getHistory: localAuthProcedure
      .input(z.object({
        portId: z.number(),
        period: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("1h"),
      }))
      .query(async ({ input }) => {
        const LIBRENMS_URL = process.env.LIBRENMS_URL || "http://45.237.165.251:8080";
        const LIBRENMS_TOKEN = process.env.LIBRENMS_TOKEN || "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";

        const periodSeconds: Record<string, number> = {
          "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800, "30d": 2592000,
        };
        const now = Math.floor(Date.now() / 1000);
        const from = now - periodSeconds[input.period];

        // Buscar dados da porta atual
        const portRes = await fetch(
          `${LIBRENMS_URL}/api/v0/ports/${input.portId}`,
          { headers: { "X-Auth-Token": LIBRENMS_TOKEN } }
        );
        if (!portRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao consultar porta" });
        const portData = await portRes.json() as { port: any };
        const port = Array.isArray(portData.port) ? portData.port[0] : portData.port;

        // Ler dados históricos diretamente do RRD via execução local
        // Como o servidor do app roda no mesmo servidor do LibreNMS, podemos ler diretamente
        const { execSync } = await import("child_process");
        const rrdPath = `/opt/librenms/rrd/45.237.164.7/port-id${input.portId}.rrd`;
        let historyPoints: { ts: number; inBps: number; outBps: number }[] = [];

        try {
          const output = execSync(
            `rrdtool fetch ${rrdPath} AVERAGE --start ${from} --end ${now} --resolution 60 2>/dev/null`,
            { encoding: "utf8", timeout: 5000 }
          );
          const lines = output.trim().split("\n").slice(1); // pular header
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) continue;
            const ts = parseInt(parts[0].replace(":", ""));
            // rrdtool pode usar vírgula como separador decimal (locale pt_BR/europeu)
            const inOctets = parseFloat(parts[1].replace(",", "."));
            const outOctets = parseFloat(parts[2].replace(",", "."));
            if (isNaN(ts) || isNaN(inOctets) || isNaN(outOctets)) continue;
            historyPoints.push({ ts, inBps: inOctets * 8, outBps: outOctets * 8 });
          }
        } catch {
          // RRD não disponível ou sem dados ainda
        }

        return {
          port,
          history: historyPoints,
        };
      }),

    // Executa ping para todos os clientes com clientIp configurado e salva latência
    pingClients: localAuthProcedure.mutation(async () => {
      const [configs, telegramCfg] = await Promise.all([
        db.getAllInterfaceConfigs(),
        db.getTelegramConfig(),
      ]);
      const targets = configs.filter((c) => c.clientIp);
      const { execSync } = await import("child_process");
      const results: { portId: number; ip: string; latencyMs: number | null; status: string }[] = [];

      // Threshold de latência alta: usa latencyThreshold do telegram_config (padrão 50ms)
      const LATENCY_THRESHOLD_MS = telegramCfg?.latencyThreshold ?? 50;
      const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min entre alertas repetidos por cliente
      // Cache de último alerta de latência por portId (em memória, suficiente para cooldown)
      const now = Date.now();

      for (const cfg of targets) {
        const ip = cfg.clientIp!;
        let latencyMs: number | null = null;
        let status: "ok" | "timeout" | "error" = "ok";

        try {
          const output = execSync(`ping -c 3 -W 1 -q ${ip} 2>/dev/null`, { encoding: "utf8", timeout: 6000 });
          const match = output.match(/rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\//);
          if (match) {
            latencyMs = parseFloat(match[1]);
            status = "ok";
          } else {
            status = "timeout";
          }
        } catch {
          status = "error";
        }

        await db.saveLatency(cfg.portId, latencyMs, status);
        results.push({ portId: cfg.portId, ip, latencyMs, status });

        // Alerta Telegram: latência alta ou sem resposta
        if (telegramCfg?.enabled && telegramCfg.botToken && telegramCfg.chatId) {
          const lastAlert = latencyAlertCooldown.get(cfg.portId) ?? 0;
          if (now - lastAlert >= ALERT_COOLDOWN_MS) {
            let alertMsg: string | null = null;
            if (status === "timeout" || status === "error") {
              alertMsg = `⚠️ *CLIENTE SEM RESPOSTA*\n\n` +
                `Cliente: *${cfg.label}*${cfg.city ? ` (${cfg.city})` : ""}\n` +
                `IP: \`${ip}\`\n` +
                `Status: sem resposta ao ping\n` +
                `Horário: ${new Date().toLocaleString("pt-BR")}`;
            } else if (latencyMs !== null && latencyMs > LATENCY_THRESHOLD_MS) {
              alertMsg = `🟡 *LATÊNCIA ALTA*\n\n` +
                `Cliente: *${cfg.label}*${cfg.city ? ` (${cfg.city})` : ""}\n` +
                `IP: \`${ip}\`\n` +
                `Latência: *${latencyMs.toFixed(1)} ms* (threshold: ${LATENCY_THRESHOLD_MS} ms)\n` +
                `Horário: ${new Date().toLocaleString("pt-BR")}`;
            }
            if (alertMsg) {
              try {
                await fetch(`https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: telegramCfg.chatId, text: alertMsg, parse_mode: "Markdown" }),
                });
                latencyAlertCooldown.set(cfg.portId, now);
              } catch { /* ignore */ }
            }
          }
        }
      }

      return { pinged: targets.length, results };
    }),

    // Retorna latências atuais de todos os clientes (cache em memória)
    getLatencies: localAuthProcedure.query(async () => {
      return db.getLatencies();
    }),

    // Retorna histórico RTT de uma interface por período
    getLatencyHistory: localAuthProcedure
      .input(z.object({
        portId: z.number(),
        period: z.enum(["1h", "6h", "24h", "7d"]).default("1h"),
      }))
      .query(async ({ input }) => {
        const periodMs: Record<string, number> = {
          "1h": 60 * 60 * 1000,
          "6h": 6 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
        };
        const rows = await db.getLatencyHistory(input.portId, periodMs[input.period]);
        return rows.map((r) => ({
          latencyMs: r.latencyMs,
          status: r.status,
          time: r.measuredAt.getTime(),
        }));
      }),
  }),

  network: router({
    // List all nodes
    listNodes: localAuthProcedure.query(async () => {
      return db.listNetworkNodes();
    }),

    // Create a node
    createNode: localAuthProcedure
      .input(z.object({
        name: z.string().min(1),
        city: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        nodeType: z.enum(["router", "switch", "olt", "server", "pop"]).default("switch"),
        mgmtIp: z.string().optional(),
        deviceId: z.number().optional(),
        active: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await db.createNetworkNode(input);
        return { success: true };
      }),

    // Update a node
    updateNode: localAuthProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        city: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        nodeType: z.enum(["router", "switch", "olt", "server", "pop"]).optional(),
        mgmtIp: z.string().optional(),
        deviceId: z.number().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateNetworkNode(id, data);
        return { success: true };
      }),

    // Delete a node (also deletes associated links)
    deleteNode: localAuthProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteNetworkNode(input.id);
        return { success: true };
      }),

    // List all links
    listLinks: localAuthProcedure.query(async () => {
      return db.listNetworkLinks();
    }),

    // Create a link
    createLink: localAuthProcedure
      .input(z.object({
        fromNodeId: z.number(),
        fromPortId: z.number().optional(),
        fromPortName: z.string().optional(),
        toNodeId: z.number(),
        toPortId: z.number().optional(),
        toPortName: z.string().optional(),
        linkType: z.enum(["fiber", "radio", "copper", "vpn"]).default("fiber"),
        capacityBps: z.number().optional(),
        active: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await db.createNetworkLink(input);
        return { success: true };
      }),

    // Update a link
    updateLink: localAuthProcedure
      .input(z.object({
        id: z.number(),
        fromPortId: z.number().optional(),
        fromPortName: z.string().optional(),
        toPortId: z.number().optional(),
        toPortName: z.string().optional(),
        linkType: z.enum(["fiber", "radio", "copper", "vpn"]).optional(),
        capacityBps: z.number().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateNetworkLink(id, data);
        return { success: true };
      }),

    // Delete a link
    deleteLink: localAuthProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteNetworkLink(input.id);
        return { success: true };
      }),

    // Get LibreNMS devices for import
    // Get ports for a specific device from LibreNMS
    getDevicePorts: localAuthProcedure
      .input(z.object({ deviceId: z.number() }))
      .query(async ({ input }) => {
        const LIBRENMS_URL = "http://45.237.165.251:8080";
        const LIBRENMS_TOKEN = "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";
        try {
          const resp = await fetch(
            `${LIBRENMS_URL}/api/v0/devices/${input.deviceId}/ports?columns=port_id,ifName,ifAlias,ifSpeed,ifOperStatus,ifAdminStatus`,
            { headers: { "X-Auth-Token": LIBRENMS_TOKEN } }
          );
          const data = await resp.json() as { ports?: Array<{ port_id: number; ifName: string; ifAlias?: string; ifSpeed?: number; ifOperStatus?: string }> };
          return (data.ports || []).map((p) => ({
            portId: Number(p.port_id),
            ifName: p.ifName,
            ifAlias: p.ifAlias || "",
            ifSpeed: p.ifSpeed || 0,
            status: p.ifOperStatus || "unknown",
          }));
        } catch {
          return [];
        }
      }),
    getLibreNMSDevices: localAuthProcedure.query(async () => {
      const LIBRENMS_URL = "http://45.237.165.251:8080";
      const LIBRENMS_TOKEN = "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";
      try {
        const resp = await fetch(`${LIBRENMS_URL}/api/v0/devices`, {
          headers: { "X-Auth-Token": LIBRENMS_TOKEN },
        });
        const data = await resp.json() as { devices?: Array<{ device_id: number; hostname: string; sysName: string; location: string; ip: string; status: number }> };
        return (data.devices || []).map((d) => ({
          deviceId: d.device_id,
          name: d.sysName || d.hostname,
          mgmtIp: d.ip,
          location: d.location || "",
          online: d.status === 1,
        }));
      } catch {
        return [];
      }
    }),

    // Get live traffic for a port (used by link lines on the map)
    getLinkTraffic: localAuthProcedure
      .input(z.object({ portId: z.number() }))
      .query(async ({ input }) => {
        const LIBRENMS_URL = "http://45.237.165.251:8080";
        const LIBRENMS_TOKEN = "e18e2d9e97c107123d3bf6c5a5a24e49c671acffba6d8cada3fedb4f96597bdb";
        try {
          const resp = await fetch(
            `${LIBRENMS_URL}/api/v0/port/${input.portId}`,
            { headers: { "X-Auth-Token": LIBRENMS_TOKEN } }
          );
          const data = await resp.json() as { port?: { ifInOctets_rate?: number; ifOutOctets_rate?: number; ifSpeed?: number; ifOperStatus?: string } };
          const port = data.port;
          if (!port) return null;
          const inBps = (port.ifInOctets_rate || 0) * 8;
          const outBps = (port.ifOutOctets_rate || 0) * 8;
          const speed = port.ifSpeed || 0;
          return {
            inBps,
            outBps,
            speed,
            utilPct: speed > 0 ? Math.round(Math.max(inBps, outBps) / speed * 100) : 0,
            status: port.ifOperStatus || "unknown",
          };
        } catch {
          return null;
        }
      }),
  }),
});
export type AppRouter = typeof appRouter;

// Helper para formatar bps em alertas Telegram
function formatBpsAlert(bps: number): string {
  if (!bps || bps <= 0) return "0 bps";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}
