import { defineAgent, defineDynamic } from 'eve';
import type { DynamicModelResult } from 'eve/models';

export function jarvisDefinition(resolve: () => DynamicModelResult) {
  return defineAgent({
    model: defineDynamic(resolve),
    defaultTools: false,
    limits: {
      sessionTimeoutMs: 30 * 60 * 1000,
      sessionUsage: ({ total }) => total.inputTokens >= 50_000 || total.outputTokens >= 8_000 || (total.costUsd ?? 0) >= 1,
    },
  });
}
