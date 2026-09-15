import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@morpho/ui";
import { createQueryClient } from "@/app/queryClient";
import { SettingsPage } from "./SettingsPage";
import { mockBackend } from "@/services/mocks/backend";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { THEME_STORAGE_KEY, useThemeStore } from "@/stores/themeStore";
import { useLanguageStore } from "@/stores/languageStore";

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

describe("SettingsPage 外观主题 card (ADR-022 skin picker)", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    useThemeStore.setState({ theme: "lamplit-study" });
  });

  it("renders both skin options as a named radiogroup with the default selected", async () => {
    renderPage();

    const group = screen.getByRole("radiogroup", { name: "外观主题" });
    const lamplit = within(group).getByTestId("theme-option-lamplit-study");
    const bio = within(group).getByTestId("theme-option-bio-luminal");

    expect(lamplit).toHaveAttribute("role", "radio");
    expect(within(lamplit).getByText("深夜研究室")).toBeInTheDocument();
    expect(within(lamplit).getByText("石墨黄铜·安静书房")).toBeInTheDocument();
    expect(within(bio).getByText("生物荧光")).toBeInTheDocument();
    expect(within(bio).getByText("深海暗场·荧光青紫")).toBeInTheDocument();

    expect(lamplit).toHaveAttribute("aria-checked", "true");
    expect(bio).toHaveAttribute("aria-checked", "false");
    // Roving tabindex: only the selected option is tabbable.
    expect(lamplit).toHaveAttribute("tabindex", "0");
    expect(bio).toHaveAttribute("tabindex", "-1");
  });

  it("applies 生物荧光 instantly — dataset.theme, localStorage and selected state", async () => {
    const user = userEvent.setup();
    renderPage();

    const bio = screen.getByTestId("theme-option-bio-luminal");
    await user.click(bio);

    expect(bio).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("theme-option-lamplit-study")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("bio-luminal");
  });

  it("reflects a persisted 生物荧光 preference in the selected state", () => {
    useThemeStore.setState({ theme: "bio-luminal" });
    renderPage();

    expect(screen.getByTestId("theme-option-bio-luminal")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("theme-option-lamplit-study")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("is keyboard operable: arrow keys move the selection with focus", async () => {
    const user = userEvent.setup();
    renderPage();

    const lamplit = screen.getByTestId("theme-option-lamplit-study");
    lamplit.focus();
    await user.keyboard("{ArrowRight}");

    const bio = screen.getByTestId("theme-option-bio-luminal");
    expect(bio).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("bio-luminal");
    // Selection follows focus: the newly selected option owns the roving tab stop.
    expect(bio).toHaveFocus();
    expect(lamplit).toHaveAttribute("tabindex", "-1");
    expect(bio).toHaveAttribute("tabindex", "0");
  });
});

describe("SettingsPage 界面语言 control (ADR-023 language switcher)", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "lamplit-study" });
    useLanguageStore.setState({ language: "zh-CN" });
  });

  it("renders the language row as a named radiogroup with 简体中文 selected", async () => {
    renderPage();

    const group = screen.getByRole("radiogroup", { name: "界面语言" });
    const zh = within(group).getByRole("radio", { name: "简体中文" });
    const en = within(group).getByRole("radio", { name: "English" });

    expect(zh).toHaveAttribute("aria-checked", "true");
    expect(en).toHaveAttribute("aria-checked", "false");
    // Roving tabindex: only the selected segment is tabbable.
    expect(zh).toHaveAttribute("tabindex", "0");
    expect(en).toHaveAttribute("tabindex", "-1");
  });

  it("applies English instantly — store, <html lang>, localStorage and re-render", async () => {
    const user = userEvent.setup();
    renderPage();

    const group = screen.getByRole("radiogroup", { name: "界面语言" });
    await user.click(within(group).getByRole("radio", { name: "English" }));

    const en = within(group).getByRole("radio", { name: "English" });
    expect(en).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "简体中文" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // Instant apply: instance language, <html lang> and the persisted key.
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    // The row label itself re-renders through the "settings" namespace.
    expect(screen.getByText("Language")).toBeInTheDocument();
  });

  it("switches back to 简体中文 and the row label follows", async () => {
    const user = userEvent.setup();
    renderPage();

    // Option labels are locale-invariant self-names; the group's accessible
    // name itself is translated (界面语言 ↔ Interface language), so the
    // radios are queried directly.
    await user.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByText("Language")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "简体中文" }));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.getByText("语言")).toBeInTheDocument();
  });
});
