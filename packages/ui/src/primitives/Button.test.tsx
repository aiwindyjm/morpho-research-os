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
});
