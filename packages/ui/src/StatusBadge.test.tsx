import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConnectionStatus } from "@slacker/core";
import { StatusBadge } from "./StatusBadge.js";

describe("StatusBadge — status → label/color mapping", () => {
  it.each<[ConnectionStatus, string, string]>([
    ["connecting", "연결 중…", "bg-status-connecting"],
    ["open", "연결됨", "bg-status-open"],
    ["closed", "연결 끊김", "bg-status-closed"],
  ])("renders the %s status with its label and color classes", (status, label, colorClass) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByText(label);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass(colorClass, `text-${colorClass.replace("bg-", "")}-fg`);
  });
});
