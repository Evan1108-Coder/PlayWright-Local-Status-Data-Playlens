/**
 * Legacy adapter — kept for backward compatibility with existing imports.
 * All functionality has moved to aiAdapter.ts.
 */
import {
  createAIAdapter,
  hasAIApiKey,
  AIUnavailableError,
  type AIMessage,
  type AIContextSource,
  type AIAdapterOptions,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIAdapter,
  type MessageRole,
} from "./aiAdapter";

export type MiniMaxRole = MessageRole;
export type MiniMaxMessage = AIMessage;
export type MiniMaxContextSource = AIContextSource;
export type MiniMaxAdapterOptions = AIAdapterOptions;
export type MiniMaxCompletionRequest = AICompletionRequest;
export type MiniMaxCompletionResponse = AICompletionResponse;
export type MiniMaxAdapter = AIAdapter;

export const MiniMaxUnavailableError = AIUnavailableError;

export function createMiniMaxAdapter(options: MiniMaxAdapterOptions = {}): MiniMaxAdapter {
  return createAIAdapter(options);
}

export const minimaxAdapter = createAIAdapter();

export function hasMiniMaxApiKey(): boolean {
  return hasAIApiKey();
}
