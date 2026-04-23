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
});
export type AppRouter = typeof appRouter;
