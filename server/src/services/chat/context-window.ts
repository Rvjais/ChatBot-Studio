import { estimateTokens } from '../../utils/text.js';
import type { ChatTurn } from '../ai/ai-provider.interface.js';

export const MAX_HISTORY_MESSAGES = 40;
const SAFETY_MARGIN_TOKENS = 1024;

/**
 * Sliding-window history: keeps the most recent turns that fit the model's context window
 * after reserving room for the system prompt, reference data and the response. Consecutive
 * same-role turns are merged and the window always starts with a user turn (required by
 * Anthropic and Gemini).
 */
export function fitHistory(history: ChatTurn[], current: ChatTurn, opts: { contextWindow: number; systemTokens: number; maxOutputTokens: number }): ChatTurn[] {
  const budget = Math.max(
    estimateTokens(current.content) + 1,
    opts.contextWindow - opts.systemTokens - opts.maxOutputTokens - SAFETY_MARGIN_TOKENS,
  );
  let used = estimateTokens(current.content);
  const kept: ChatTurn[] = [];
  for (let i = history.length - 1; i >= 0 && kept.length < MAX_HISTORY_MESSAGES; i--) {
    const turn = history[i]!;
    const cost = estimateTokens(turn.content) + 4;
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(turn);
  }

  const merged: ChatTurn[] = [];
  for (const turn of [...kept, current]) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else merged.push({ ...turn });
  }
  while (merged.length && merged[0]!.role !== 'user') merged.shift();
  return merged;
}
