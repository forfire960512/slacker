import type { ConnectionStatus } from "@slacker/core";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "연결 중…",
  open: "연결됨",
  closed: "연결 끊김",
};

const COLORS: Record<ConnectionStatus, string> = {
  connecting: "bg-status-connecting text-status-connecting-fg",
  open: "bg-status-open text-status-open-fg",
  closed: "bg-status-closed text-status-closed-fg",
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
