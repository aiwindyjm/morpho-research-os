export type JournalAuthor = "user" | "morpho";

export interface JournalEntry {
  id: string;
  /** HH:mm(本地时间)。 */
  time: string;
  author: JournalAuthor;
  content: string;
}
