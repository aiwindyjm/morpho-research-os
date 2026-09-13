import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox, Field, Input, Select, Textarea } from "./inputs";

describe("form primitives", () => {
  it("Field wires label, hint, and error to the control", () => {
    render(
      <Field label="研究主题" hint="一句话描述" error="主题不能为空" required>
        {(props) => <Input {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText(/研究主题/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("-error"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("主题不能为空");
  });

  it("Input supports typing and receives focus", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="主题" />);
    await user.type(screen.getByLabelText("主题"), "大语言模型");
    expect(screen.getByLabelText("主题")).toHaveValue("大语言模型");
  });

  it("Textarea accepts multi-line text", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="说明" />);
    await user.type(screen.getByLabelText("说明"), "line1{Enter}line2");
    expect(screen.getByLabelText("说明")).toHaveValue("line1\nline2");
  });

  it("Select changes value by keyboard", async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="目的">
        <option value="learning">learning</option>
        <option value="research">research</option>
      </Select>,
    );
    const select = screen.getByLabelText("目的");
    await user.selectOptions(select, "research");
    expect(select).toHaveValue("research");
  });

  it("Checkbox toggles via its label", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="包含论文" />);
    const checkbox = screen.getByRole("checkbox", { name: "包含论文" });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("form fields focus with the celadon ring at a 2px offset", () => {
    // Spec §5: the focus-visible ring is bronze globally, but form fields
    // take the celadon variant (accent-alt, 5.84:1 — above the 3:1 floor).
    render(<Input aria-label="主题" />);
    const input = screen.getByLabelText("主题");
    expect(input).toHaveClass("focus-visible:outline-accent-alt");
    expect(input).toHaveClass("focus-visible:outline-2");
    expect(input).toHaveClass("focus-visible:outline-offset-2");
    expect(input.className).not.toContain("outline-accent ");
  });

  it("disabled fields mute the ink instead of opacity dimming", () => {
    render(<Input aria-label="主题" disabled />);
    const input = screen.getByLabelText("主题");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("disabled:text-text-muted");
    expect(input.className).not.toContain("disabled:opacity");
  });

  it("hover warms fields up the surface ladder and never darkens them", () => {
    render(<Input aria-label="主题" />);
    expect(screen.getByLabelText("主题")).toHaveClass(
      "enabled:hover:bg-surface-raised",
    );
  });

  it("a disabled checkbox mutes its label ink", () => {
    render(<Checkbox label="包含论文" disabled />);
    const checkbox = screen.getByRole("checkbox", { name: "包含论文" });
    expect(checkbox).toBeDisabled();
    expect(checkbox.nextElementSibling).toHaveClass("text-text-muted");
  });
});
