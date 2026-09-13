import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button primitive", () => {
  it("renders as a pressable button with a text label", () => {
    render(<Button>保存</Button>);
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("is disabled and announces busy state while loading", () => {
    render(<Button loading>保存</Button>);
    const button = screen.getByRole("button", { name: /保存/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        删除
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("receives keyboard focus and triggers onClick with Enter/Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>下一步</Button>);
    await user.tab();
    expect(screen.getByRole("button", { name: "下一步" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("collapses disabled to the shared muted face instead of opacity dimming", () => {
    // A 0.5-opacity primary button composites its ink and brass fill to the
    // same color (1:1). The shared face is text-muted on surface-raised
    // (4.67:1), identical for every variant.
    render(
      <>
        <Button disabled variant="primary">
          主要
        </Button>
        <Button disabled variant="ghost">
          次要
        </Button>
      </>,
    );
    for (const name of ["主要", "次要"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveClass("disabled:text-text-muted");
      expect(button).toHaveClass("disabled:bg-surface-raised");
      expect(button.className).not.toContain("disabled:opacity");
    }
  });

  it("keeps hover lift and press scale behind enabled: so disabled buttons never move", () => {
    render(<Button>抬升</Button>);
    const button = screen.getByRole("button", { name: "抬升" });
    expect(button).toHaveClass("enabled:hover:-translate-y-0.5");
    expect(button).toHaveClass("enabled:hover:shadow-panel");
    expect(button).toHaveClass("enabled:active:translate-y-0");
    expect(button).toHaveClass("enabled:active:scale-[0.98]");
  });

  it("ghost hover answers with the warm tint ladder, not a darkening fill", () => {
    render(<Button variant="ghost">幽灵</Button>);
    const button = screen.getByRole("button", { name: "幽灵" });
    expect(button).toHaveClass("enabled:hover:bg-overlay-hover");
    expect(button).toHaveClass("enabled:hover:text-text-primary");
  });
});
