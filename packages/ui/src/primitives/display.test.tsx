import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Alert,
  Badge,
  Card,
  Progress,
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
});
