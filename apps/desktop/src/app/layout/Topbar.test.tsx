import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { Topbar } from "./Topbar";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { PROJECT_B_ID } from "@/services/mocks/fixtures-a";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";

beforeEach(() => {
  useWorkspaceStore.setState({ activeProjectId: PROJECT_B_ID });
});

function renderTopbar() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Topbar />
    </QueryClientProvider>,
  );
}

describe("Topbar", () => {
  it("shows breadcrumb with the active project name", async () => {
    renderTopbar();
    expect(await screen.findByTestId("topbar")).toHaveTextContent("Morpho");
    expect(await screen.findByText("脑机接口康复应用")).toBeInTheDocument();
  });

  it("shows saved state, help and avatar", () => {
    renderTopbar();
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "帮助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本地用户" })).toBeInTheDocument();
  });
});
