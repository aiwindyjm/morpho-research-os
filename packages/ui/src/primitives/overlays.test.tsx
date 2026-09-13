import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog, ToastProvider, Tooltip, useToast } from "./overlays";

describe("Dialog primitive", () => {
  function DialogHarness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button onClick={() => setOpen(true)}>打开对话框</button>
        <Dialog
          open={open}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          title="创建项目"
          description="为新的研究主题建立隔离工作区"
        >
          <button onClick={() => setOpen(false)}>确认</button>
          <button>取消</button>
        </Dialog>
      </div>
    );
  }

  it("moves focus into the dialog, traps Tab, closes on Escape, restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "打开对话框" }));

    const dialog = screen.getByRole("dialog", { name: "创建项目" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Scrim consumes the semantic token utility, not bg-black/60.
    expect(screen.getByTestId("dialog-overlay")).toHaveClass("bg-scrim");
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();

    // Tab from the last focusable wraps back to the first.
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "打开对话框" }),
    ).toHaveFocus();
  });
});

describe("Toast primitive", () => {
  function ToastHarness() {
    const { showToast } = useToast();
    return (
      <button
        onClick={() =>
          showToast({ title: "已保存", detail: "决定已记录", variant: "success" })
        }
      >
        显示通知
      </button>
    );
  }

  it(
    "announces toasts through a live region",
    async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );
      await user.click(screen.getByRole("button", { name: "显示通知" }));
      const region = screen.getByTestId("toast-region");
      expect(region).toHaveAttribute("aria-live", "polite");
      expect(screen.getByText("已保存")).toBeInTheDocument();
      await waitFor(
        () => expect(screen.queryByText("已保存")).not.toBeInTheDocument(),
        { timeout: 6000 },
      );
    },
    8000,
  );
});

describe("Tooltip primitive", () => {
  it("appears on hover and keyboard focus with describedby wiring", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="暂停当前任务">
        <button>暂停</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "暂停" });
    await user.hover(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("暂停当前任务");
    await user.unhover(trigger);
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("wires aria-describedby on the trigger to the tooltip id", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="导出日志">
        <button>导出</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "导出" });
    expect(trigger).not.toHaveAttribute("aria-describedby");

    await user.hover(trigger);
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveTextContent("导出日志");

    await user.unhover(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("preserves an existing aria-describedby on the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="格式说明">
        <button aria-describedby="hint-1">格式</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "格式" });
    await user.hover(trigger);
    const described = trigger.getAttribute("aria-describedby") ?? "";
    const ids = described.split(" ");
    expect(ids).toContain("hint-1");
    expect(ids).toContain(screen.getByRole("tooltip").id);
  });
});
