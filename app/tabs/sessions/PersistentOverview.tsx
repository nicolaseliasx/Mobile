import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/app/components/ui";
import {
  getCodexServerStatus,
  getPersistentSessions,
  type CodexProfileStatus,
  type CodexServerStatus,
  type PersistentSessionInfo,
} from "@/app/main-axios";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import type { SSHHost } from "@/types";

function ProfileCard({ name, profile }: { name: string; profile?: CodexProfileStatus }) {
  const remaining = profile?.remainingPercent;
  const running = (profile?.activeSessions.length ?? 0) > 0;
  const state = profile?.state === "unknown" || !profile
    ? "Indisponível"
    : profile.state === "limited" ? "Limite atingido" : "Em ordem";
  return (
    <View className="mb-2 rounded-lg border border-border bg-muted/20 p-3">
      <View className="flex-row justify-between">
        <Text weight="bold" className="text-sm text-foreground">{name}</Text>
        <Text className="text-xs text-muted-foreground">{state}</Text>
      </View>
      <Text className="mt-1 text-lg text-foreground">
        {remaining == null ? "—" : `${Math.round(remaining)}% restante`}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {running ? `Ativo: ${profile?.activeSessions.join(", ")}` : "Nenhuma sessão Codex ativa"}
      </Text>
      {profile?.windows.map((window) => (
        <Text key={window.name} className="text-xs text-muted-foreground">
          {window.name === "primary" ? "Janela curta" : "Janela longa"}: {Math.round(window.remainingPercent)}%
          {window.resetsAt ? ` · renova ${new Date(window.resetsAt * 1000).toLocaleString()}` : ""}
        </Text>
      ))}
    </View>
  );
}

export function PersistentOverview({ hosts, refreshKey, onOpen }: {
  hosts: SSHHost[];
  refreshKey: number;
  onOpen?: () => void;
}) {
  const { addSession, navigateToSessions, sessions, setActiveSession } = useTerminalSessions();
  const [persistent, setPersistent] = useState<PersistentSessionInfo[]>([]);
  const [status, setStatus] = useState<CodexServerStatus | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setPersistent(await getPersistentSessions());
      setSessionsError(false);
    } catch {
      setSessionsError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [refresh, refreshKey]);

  const targetHost = hosts.find((host) => /devhub/i.test(host.name))
    ?? hosts.find((host) => persistent.some((session) => session.hostId === host.id));
  const targetHostId = targetHost?.id;
  useEffect(() => {
    if (targetHostId == null) return;
    let active = true;
    const update = async () => {
      try {
        const next = await getCodexServerStatus(Number(targetHostId));
        if (active) { setStatus(next); setStatusError(false); }
      } catch {
        if (active) { setStatus(null); setStatusError(true); }
      }
    };
    void update();
    const timer = setInterval(() => { void update(); }, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [targetHostId, refreshKey]);

  const openSession = (record: PersistentSessionInfo) => {
    const host = hosts.find((item) => item.id === record.hostId);
    if (!host) return;
    const existing = sessions.find((item) => item.persistentSessionId === record.id);
    if (existing) setActiveSession(existing.id);
    else addSession(host, "terminal", { persistentSessionId: record.id });
    navigateToSessions();
    onOpen?.();
  };

  return (
    <View className="px-4 pb-3 pt-3">
      <Text weight="bold" className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Servidor e Codex</Text>
      {targetHost ? (
        <>
          <ProfileCard name="Codex" profile={status?.profiles.codex} />
          <ProfileCard name="Codex2" profile={status?.profiles.codex2} />
          {statusError && <Text className="mb-2 text-xs text-muted-foreground">Não foi possível consultar o status. Puxe para atualizar.</Text>}
        </>
      ) : <Text className="mb-3 text-xs text-muted-foreground">Cadastre o devhub como host SSH para ver o status.</Text>}

      <Text weight="bold" className="mb-2 mt-2 text-xs uppercase tracking-widest text-muted-foreground">Sessões persistentes</Text>
      {sessionsError && <Text className="mb-2 text-xs text-muted-foreground">Não foi possível carregar as sessões. Puxe para atualizar.</Text>}
      {!sessionsError && persistent.length === 0 && <Text className="mb-2 text-xs text-muted-foreground">Nenhuma sessão persistente ativa.</Text>}
      {persistent.map((record) => {
        const host = hosts.find((item) => item.id === record.hostId);
        return (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            disabled={!host}
            onPress={() => openSession(record)}
            className="mb-2 rounded-lg border border-border bg-muted/20 p-3 active:bg-muted/40"
          >
            <Text weight="bold" className="text-sm text-foreground">{record.displayName}</Text>
            <Text className="text-xs text-muted-foreground">
              {host?.name ?? "Host indisponível"} · {record.tmuxSessionName} · {record.managementState === "discovered" ? "Descoberta" : "Persistente"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
