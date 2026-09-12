import type { JournalAuthor, JournalEntry } from "@/types/journal";

/**
 * 对话日志本地存储(spec §7)。仅 localStorage、按本地日期分组、显式下载;
 * 不进入研究 Vault,不发任何网络请求(DO_NOT_BREAK #11/#12)。
 */

const KEY_PREFIX = "morpho.journal.";

function storageKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

function readEntries(date: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(date: string, entries: JournalEntry[]): void {
  localStorage.setItem(storageKey(date), JSON.stringify(entries));
}

export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function listEntries(date: string): JournalEntry[] {
  return readEntries(date);
}

export function addEntry(
  date: string,
  author: JournalAuthor,
  content: string,
): JournalEntry {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("journal entry content must not be empty");
  const now = new Date();
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    time: `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`,
    author,
    content: trimmed,
  };
  writeEntries(date, [...readEntries(date), entry]);
  return entry;
}

export function buildMarkdown(date: string, entries: JournalEntry[]): string {
  const lines = [`# Morpho 对话日志 ${date}`, ""];
  for (const entry of entries) {
    const who = entry.author === "user" ? "用户" : "Morpho";
    lines.push(`- **${entry.time} · ${who}** ${entry.content}`);
  }
  lines.push("", "> 下载后可手动放入 private/conversations/(该目录已被 Git 忽略)。", "");
  return lines.join("\n");
}

export function buildJson(date: string, entries: JournalEntry[]): string {
  return JSON.stringify({ date, entries }, null, 2);
}

function download(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(date: string): void {
  download(`morpho-journal-${date}.md`, buildMarkdown(date, listEntries(date)), "text/markdown");
}

export function downloadJson(date: string): void {
  download(`morpho-journal-${date}.json`, buildJson(date, listEntries(date)), "application/json");
}
