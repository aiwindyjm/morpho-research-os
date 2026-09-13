import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { SettingsPage } from "./SettingsPage";
import { mockBackend } from "@/services/mocks/backend";

/**
 * Real desktop wiring (batch 1): the connection card reads core.info and
 * the provider-key card round-trips secrets.listProviders /
 * secrets.setProviderKey — all through the mock transport (the behavioral
 * reference for the Rust commands). Key material in these tests is fake
 * and constructed at runtime, never a literal provider-key format.
 */

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Fake key material built at runtime; never a literal credential. */
function fakeApiKey(): string {
  return Array.from({ length: 14 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
}

beforeEach(() => {
  mockBackend.reset();
});

describe("SettingsPage desktop wiring", () => {
  it("shows the core connection status with capability versions", async () => {
    renderPage();

    expect(await screen.findByTestId("core-status-badge")).toHaveTextContent("在线");
    const grid = await screen.findByTestId("core-info-grid");
    await waitFor(() => {
      expect(within(grid).getByText("0.0.1-mock")).toBeInTheDocument();
    });
    // Test env stays on the mock transport; the transport row names it.
    expect(screen.getByTestId("core-transport")).toHaveTextContent(/mock/);
  });

  it("renders providers from secrets.listProviders with keychain presence", async () => {
    renderPage();

    const rows = await screen.findAllByTestId("provider-key-row");
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => within(row).getByTestId("provider-key-status").textContent),
    ).toEqual(["未配置密钥", "未配置密钥"]);
    expect(within(rows[0]).getByText("glm")).toBeInTheDocument();
  });

  it("stores a provider key via secrets.setProviderKey and refreshes presence", async () => {
    const user = userEvent.setup();
    renderPage();

    const rows = await screen.findAllByTestId("provider-key-row");
    const glmRow = rows[0];
    const key = fakeApiKey();

    await user.type(within(glmRow).getByLabelText("glm API Key"), key);
    await user.click(within(glmRow).getByRole("button", { name: "保存密钥" }));

    const toastRegion = await screen.findByTestId("toast-region");
    await waitFor(() => {
      expect(within(toastRegion).getByText("密钥已保存")).toBeInTheDocument();
    });
    // The controlled input is cleared after the submit action.
    await waitFor(() => {
      expect(within(glmRow).getByLabelText("glm API Key")).toHaveValue("");
    });
    // The keychain presence flips through the listProviders refetch.
    await waitFor(() => {
      expect(
        within(glmRow).getByTestId("provider-key-status"),
      ).toHaveTextContent("密钥已配置");
    });
  });

  it("shows the mandatory error state when provider listing fails", async () => {
    mockBackend.armFault({
      command: "secrets.listProviders",
      // Non-retryable: the error renders immediately instead of after the
      // query-client backoff, keeping the test inside its time budget.
      payload: { code: "DATABASE_ERROR", user_message: "本地服务暂时不可用。", retryable: false },
    });
    const user = userEvent.setup();
    renderPage();

    const errorBox = await screen.findByTestId("page-error");
    expect(within(errorBox).getByText("本地服务暂时不可用。")).toBeInTheDocument();

    // Retry recovers once the injected fault is consumed.
    await user.click(within(errorBox).getByRole("button", { name: "重试" }));
    expect(await screen.findAllByTestId("provider-key-row")).toHaveLength(2);
  });

  it("reports a failed key save through the error toast and never leaks the value", async () => {
    const user = userEvent.setup();
    renderPage();

    const rows = await screen.findAllByTestId("provider-key-row");
    const glmRow = rows[0];
    const key = fakeApiKey();
    mockBackend.armFault({
      command: "secrets.setProviderKey",
      payload: { code: "PROVIDER_AUTH_FAILED", user_message: "系统钥匙串拒绝写入。", retryable: false },
    });

    await user.type(within(glmRow).getByLabelText("glm API Key"), key);
    await user.click(within(glmRow).getByRole("button", { name: "保存密钥" }));

    const toastRegion = await screen.findByTestId("toast-region-error");
    await waitFor(() => {
      expect(within(toastRegion).getByText("密钥保存失败")).toBeInTheDocument();
    });
    // The key value is dropped from the form even when saving fails.
    await waitFor(() => {
      expect(within(glmRow).getByLabelText("glm API Key")).toHaveValue("");
    });
    expect(document.body.textContent ?? "").not.toContain(key);
  });
});
