import { beforeEach, describe, expect, it } from "vitest";
import {
  addEntry,
  buildJson,
  buildMarkdown,
  listEntries,
  todayIso,
} from "./journal";

const DATE = "2026-09-12";

beforeEach(() => {
  localStorage.clear();
});

describe("journal service", () => {
  it("todayIso returns a local YYYY-MM-DD date", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("addEntry persists and listEntries reads back in order", () => {
    const first = addEntry(DATE, "user", "把产品与技术合并成一份唯一 PRD。");
    const second = addEntry(DATE, "morpho", "已合并到 docs/PRD.md。");
    expect(first.author).toBe("user");
    expect(first.time).toMatch(/^\d{2}:\d{2}$/);
    expect(second.id).not.toBe(first.id);
    expect(listEntries(DATE).map((e) => e.content)).toEqual([
      "把产品与技术合并成一份唯一 PRD。",
      "已合并到 docs/PRD.md。",
    ]);
  });

  it("entries are isolated per date key", () => {
    addEntry(DATE, "user", "a");
    expect(listEntries("2026-09-11")).toEqual([]);
  });

  it("empty content is rejected", () => {
    expect(() => addEntry(DATE, "user", "   ")).toThrow();
  });

  it("buildMarkdown renders date header and per-entry lines", () => {
    addEntry(DATE, "user", "第一条");
    const md = buildMarkdown(DATE, listEntries(DATE));
    expect(md).toContain(`# Morpho 对话日志 ${DATE}`);
    expect(md).toContain("用户");
    expect(md).toContain("第一条");
    expect(md).toContain("private/conversations");
  });

  it("buildJson is valid JSON with date and entries", () => {
    addEntry(DATE, "morpho", "回复");
    const parsed = JSON.parse(buildJson(DATE, listEntries(DATE))) as {
      date: string;
      entries: unknown[];
    };
    expect(parsed.date).toBe(DATE);
    expect(parsed.entries).toHaveLength(1);
  });
});
