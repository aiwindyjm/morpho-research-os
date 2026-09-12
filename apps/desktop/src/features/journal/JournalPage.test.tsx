import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalPage } from "./JournalPage";
import { addEntry, todayIso } from "@/services/journal";

beforeEach(() => {
  localStorage.clear();
});

function renderPage() {
  return render(<JournalPage />);
}

describe("JournalPage", () => {
  it("shows today, record count and local-only badge", () => {
    renderPage();
    expect(screen.getByText(todayIso())).toBeInTheDocument();
    expect(screen.getByText("0 条记录")).toBeInTheDocument();
    expect(screen.getByText("仅本机")).toBeInTheDocument();
  });

  it("adds an entry through the form and updates the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("日志内容"), "先做概览页");
    await user.click(screen.getByRole("button", { name: "保存记录" }));
    await waitFor(() => {
      expect(screen.getByText("1 条记录")).toBeInTheDocument();
    });
    expect(screen.getByText("先做概览页")).toBeInTheDocument();
    expect(screen.getByText("用户")).toBeInTheDocument();
  });

  it("renders pre-existing entries from storage", () => {
    addEntry(todayIso(), "morpho", "已生成计划");
    renderPage();
    expect(screen.getByText("已生成计划")).toBeInTheDocument();
    expect(screen.getByText("Morpho")).toBeInTheDocument();
  });

  it("downloads markdown with explicit button", async () => {
    const user = userEvent.setup();
    addEntry(todayIso(), "user", "导出我");
    // jsdom 25 does not implement Blob URL APIs; stub them so the service's
    // download path can run. Anchor-click spy mechanics stay as specified.
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = vi.fn(() => "blob:stub");
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      renderPage();
      await user.click(screen.getByRole("button", { name: "下载今日 Markdown" }));
      expect(clickSpy).toHaveBeenCalled();
      const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
      expect(anchor.download).toBe(`morpho-journal-${todayIso()}.md`);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
  });
});
