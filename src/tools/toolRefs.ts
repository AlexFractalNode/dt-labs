/**
 * Textbook chapters and notebook-cell numbers (zero-based) per tool, shown on the home cards and in the help drawer
 * (Spec §4: learning goals).
 */
import type { ToolId } from './scenarios'

export const TOOL_REFS: Record<ToolId, { chapter: string; code: string }> = {
  splits: { chapter: '3–5, 8.4', code: '99–128' },
  complexity: { chapter: '9–11', code: '62, 75–82, 170–212' },
  forest: { chapter: '12–13', code: '213–270' },
}
