import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageMenu, SkinMenu } from "./TopbarQuickMenus";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { useLanguageStore } from "@/stores/languageStore";
import { THEME_STORAGE_KEY, useThemeStore } from "@/stores/themeStore";

/**
 * I3 topbar quick menus: an explicit language switcher (10 languages, native
 * self-names) and a discoverable skin switcher, both Popover-based in the
 * topbar's top-right cluster. A11y follows the ProjectSwitcher convention —
 * the Popover primitive owns non-modal dialog semantics (Escape/outside
 * click close, focus stays on the trigger) and the option list is a listbox
 * (role=option + aria-selected + Check on the active row). Selecting applies
 * instantly through the language/theme stores, closes the panel (the
 * primitive is uncontrolled, so selection remounts it) and returns focus to
 * the trigger — the menu-button pattern.
 */

/** Locale-invariant self-names, in menu order (mirrors LANGUAGES). */
const NATIVE_NAMES = [
  "简体中文",
  "繁體中文",
  "English",
  "日本語",
  "한국어",
  "Deutsch",
  "Français",
  "Español",
  "Português (Brasil)",
  "Русский",
];

beforeEach(() => {
  localStorage.clear();
  useLanguageStore.setState({ language: "zh-CN" });
  useThemeStore.setState({ theme: "lamplit-study" });
  document.documentElement.lang = "zh-CN";
  delete document.documentElement.dataset.theme;
});

describe("Topbar language quick menu", () => {
  it("opens and lists all ten languages by native name with the active one checked", async () => {
    const user = userEvent.setup();
    render(<LanguageMenu />);

    await user.click(screen.getByTestId("topbar-language-menu"));

    const list = screen.getByRole("listbox", { name: "界面语言" });
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(10);
    for (const native of NATIVE_NAMES) {
      expect(within(list).getByRole("option", { name: native })).toBeInTheDocument();
    }
    expect(within(list).getByRole("option", { name: "简体中文" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(list).getByRole("option", { name: "English" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches to English: store, <html lang>, persistence, trigger face and re-render", async () => {
    const user = userEvent.setup();
    render(<LanguageMenu />);

    await user.click(screen.getByTestId("topbar-language-menu"));
    await user.click(screen.getByRole("option", { name: "English" }));

    // Instant apply through the language store.
    expect(useLanguageStore.getState().language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    // Selection closes the panel and returns focus to the trigger.
    expect(screen.queryByTestId("popover-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("topbar-language-menu")).toHaveFocus();
    // The compact trigger face follows the current language…
    expect(screen.getByTestId("topbar-language-menu")).toHaveTextContent("EN");
    // …and the whole menu re-rendered through t() (zh label → en label).
    expect(screen.getByTestId("topbar-language-menu")).toHaveAttribute(
      "aria-label",
      "Switch interface language",
    );

    // Reopening shows the new selection checked.
    await user.click(screen.getByTestId("topbar-language-menu"));
    expect(screen.getByRole("option", { name: "English" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "简体中文" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches back to 简体中文 and restores the compact face", async () => {
    const user = userEvent.setup();
    useLanguageStore.setState({ language: "en" });
    render(<LanguageMenu />);

    await user.click(screen.getByTestId("topbar-language-menu"));
    await user.click(screen.getByRole("option", { name: "简体中文" }));

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.getByTestId("topbar-language-menu")).toHaveTextContent("中文");
    expect(screen.queryByTestId("popover-panel")).not.toBeInTheDocument();
  });

  it("Escape closes the panel without changing the language", async () => {
    const user = userEvent.setup();
    render(<LanguageMenu />);

    await user.click(screen.getByTestId("topbar-language-menu"));
    expect(screen.getByTestId("popover-panel")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("popover-panel")).not.toBeInTheDocument();
    expect(useLanguageStore.getState().language).toBe("zh-CN");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});

describe("Topbar skin quick menu", () => {
  it("opens and lists both skins with the active one checked", async () => {
    const user = userEvent.setup();
    render(<SkinMenu />);

    await user.click(screen.getByTestId("topbar-skin-menu"));

    const list = screen.getByRole("listbox", { name: "外观主题" });
    expect(within(list).getByRole("option", { name: "深夜研究室" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(list).getByRole("option", { name: "生物荧光" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("switches to 生物荧光 instantly — dataset.theme, persistence, panel closes", async () => {
    const user = userEvent.setup();
    render(<SkinMenu />);

    await user.click(screen.getByTestId("topbar-skin-menu"));
    await user.click(screen.getByRole("option", { name: "生物荧光" }));

    expect(document.documentElement.dataset.theme).toBe("bio-luminal");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("bio-luminal");
    expect(useThemeStore.getState().theme).toBe("bio-luminal");
    expect(screen.queryByTestId("popover-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("topbar-skin-menu")).toHaveFocus();

    // Reopening shows the new skin checked.
    await user.click(screen.getByTestId("topbar-skin-menu"));
    expect(screen.getByRole("option", { name: "生物荧光" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the three-dot preview swatch per option (each skin's fixed palette)", async () => {
    const user = userEvent.setup();
    render(<SkinMenu />);

    await user.click(screen.getByTestId("topbar-skin-menu"));
    const list = screen.getByRole("listbox", { name: "外观主题" });
    for (const option of within(list).getAllByRole("option")) {
      const dots = option.querySelectorAll("span[style]");
      expect(dots.length).toBeGreaterThanOrEqual(3);
    }
  });
});
