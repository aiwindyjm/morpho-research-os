import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Alert,
  Badge,
  Card,
  Chip,
  Progress,
  SegmentedControl,
  Skeleton,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "./display";

describe("display primitives", () => {
  it("Badge renders text content", () => {
    render(<Badge variant="success">COMPLETED</Badge>);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });

  it("Card renders children on a groupable surface", () => {
    render(
      <Card>
        <p>卡片内容</p>
      </Card>,
    );
    expect(screen.getByText("卡片内容")).toBeInTheDocument();
  });

  it("Table renders semantic headers and cells", () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>任务</TH>
            <TH>状态</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>检索来源</TD>
            <TD>RUNNING</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("columnheader", { name: "任务" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "检索来源" })).toBeInTheDocument();
  });

  it("Progress exposes an accessible value", () => {
    render(<Progress value={40} label="任务完成度" />);
    const bar = screen.getByRole("progressbar", { name: "任务完成度" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
  });

  it("Progress animates on the compositor: determinate scales, indeterminate slides", () => {
    render(
      <>
        <Progress value={40} max={200} label="任务完成度" />
        <Progress label="检索中" />
      </>,
    );
    const determinate = screen
      .getByRole("progressbar", { name: "任务完成度" })
      .querySelector('[data-testid="progress-fill"]');
    expect(determinate).toHaveClass("origin-left");
    expect(determinate).toHaveClass("transition-transform");
    expect(determinate).toHaveStyle({ transform: "scaleX(0.2)" });

    // An indeterminate bar must never sit static at full width (that reads
    // as done); it slides through the track instead.
    const indeterminate = screen
      .getByRole("progressbar", { name: "检索中" })
      .querySelector('[data-testid="progress-fill"]');
    expect(indeterminate).toHaveClass(
      "animate-[morpho-progress-slide_1.4s_ease-in-out_infinite]",
    );
  });

  it("Tabs give press feedback with scale(0.98)", () => {
    render(
      <Tabs
        label="详情视图"
        items={[{ id: "overview", label: "概览", content: <p>概览内容</p> }]}
      />,
    );
    expect(screen.getByRole("tab", { name: "概览" })).toHaveClass(
      "active:scale-[0.98]",
    );
  });

  it("Skeleton is hidden from assistive tech", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("Alert errors use role=alert; info uses role=status", () => {
    render(<Alert variant="error" title="加载失败" />);
    render(<Alert title="提示" />);
    expect(screen.getByRole("alert")).toHaveTextContent("加载失败");
    expect(screen.getByRole("status")).toHaveTextContent("提示");
  });

  it("Tabs support Arrow key navigation and aria wiring", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="详情视图"
        items={[
          { id: "overview", label: "概览", content: <p>概览内容</p> },
          { id: "evidence", label: "证据", content: <p>证据内容</p> },
        ]}
      />,
    );
    const firstTab = screen.getByRole("tab", { name: "概览" });
    expect(firstTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("概览内容");

    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    const secondTab = screen.getByRole("tab", { name: "证据" });
    expect(secondTab).toHaveFocus();
    expect(secondTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("证据内容");
  });

  it("Badge dot renders a decorative variant-colored status dot", () => {
    render(<Badge variant="success" dot>已保存</Badge>);
    const dot = screen.getByText("已保存").querySelector("span");
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("size-dot");
    expect(dot).toHaveClass("rounded-full");
    expect(dot).toHaveClass("bg-success");
  });

  it("Badge dot color follows the semantic variant and defaults to absent", () => {
    render(
      <>
        <Badge variant="warning" dot>进行中</Badge>
        <Badge variant="neutral" dot>草稿</Badge>
        <Badge>普通</Badge>
      </>,
    );
    expect(screen.getByText("进行中").querySelector("span")).toHaveClass("bg-warning");
    // Neutral reuses the dot-muted contract (text-secondary ink), not a
    // fifth color.
    expect(screen.getByText("草稿").querySelector("span")).toHaveClass("bg-text-secondary");
    expect(screen.getByText("普通").querySelectorAll("span")).toHaveLength(0);
  });
});

describe("Chip primitive", () => {
  it("renders as a toggle-style button that fires onClick and announces selection", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Chip selected={false} onClick={onClick}>全部节点</Chip>);
    const chip = screen.getByRole("button", { name: "全部节点" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("selected face reproduces the chip-selected contract with tokens only", () => {
    render(
      <>
        <Chip selected>论文</Chip>
        <Chip selected={false}>企业</Chip>
      </>,
    );
    const selected = screen.getByRole("button", { name: "论文" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveClass("text-accent");
    expect(selected).toHaveClass("border-accent/55");
    expect(selected).toHaveClass("bg-accent-soft");
    const idle = screen.getByRole("button", { name: "企业" });
    expect(idle).toHaveClass("text-text-muted");
    expect(idle).toHaveClass("border-border");
    expect(idle).toHaveClass("hover:text-text-secondary");
  });

  it("blocks interaction when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip disabled onClick={onClick}>
        自定义
      </Chip>,
    );
    await user.click(screen.getByRole("button", { name: "自定义" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("SegmentedControl primitive", () => {
  const depthOptions = [
    { value: "快速", label: "快速" },
    { value: "标准", label: "标准" },
    { value: "深入", label: "深入" },
  ];

  it("exposes radiogroup semantics with aria-checked and a roving tabindex", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="研究深度"
        value="标准"
        onChange={onChange}
        options={depthOptions}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "研究深度" })).toBeInTheDocument();
    const selected = screen.getByRole("radio", { name: "标准" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass("bg-accent");
    expect(selected).toHaveClass("text-text-on-brand");
    const idle = screen.getByRole("radio", { name: "快速" });
    expect(idle).toHaveAttribute("aria-checked", "false");
    expect(idle).toHaveClass("bg-surface");
    expect(idle).toHaveClass("text-text-secondary");
    // Only the selected segment is tabbable; arrows take over from there.
    expect(selected).toHaveAttribute("tabindex", "0");
    expect(idle).toHaveAttribute("tabindex", "-1");
    await user.click(idle);
    expect(onChange).toHaveBeenCalledWith("快速");
  });

  it("moves selection and focus with wrapping Arrow/Home/End keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="研究深度"
        value="快速"
        onChange={onChange}
        options={depthOptions}
      />,
    );
    screen.getByRole("radio", { name: "快速" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("标准");
    expect(screen.getByRole("radio", { name: "标准" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("深入");
    // Wraps forward to the first segment.
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("快速");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("深入");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("快速");
    // Wraps backward to the last segment.
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("深入");
  });
});
