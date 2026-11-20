export function modelConfig(env: NodeJS.ProcessEnv = process.env) {
  const model = env.JARVIS_MODEL?.trim();
  if (!model || !/^[a-z0-9-]+\/[a-zA-Z0-9._:-]+$/.test(model)) {
    throw new Error('JARVIS_MODEL deve conter provedor/modelo.');
  }
  if (!env.AI_GATEWAY_API_KEY?.trim()) throw new Error('AI_GATEWAY_API_KEY ausente.');
  return model;
}
