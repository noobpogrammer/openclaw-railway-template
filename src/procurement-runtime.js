// The procurement plugin returns before_prompt_build.toolsAllow. Codex app-server
// rejects that policy; OpenClaw's built-in runtime enforces it and supports the
// existing OpenAI OAuth profile through its Codex-auth transport.
export function ensureProcurementModelRuntime(config) {
  let changed = false;
  const pin = (entry) => {
    if (entry.agentRuntime?.id === 'openclaw') return;
    entry.agentRuntime = { ...entry.agentRuntime, id: 'openclaw' };
    changed = true;
  };
  config.agents ||= {};
  config.agents.defaults ||= {};
  const scopes = [config.agents.defaults, ...Object.values(config.agents.entries || {})];
  for (const scope of scopes) {
    scope.models ||= {};
    scope.models['openai/*'] ||= {};
    for (const [ref, entry] of Object.entries(scope.models)) {
      if (ref.startsWith('openai/')) pin(entry);
    }
  }
  // Exact provider model policy takes precedence over the agent wildcard.
  const provider = config.models?.providers?.openai;
  if (provider) {
    pin(provider);
    for (const model of provider.models || []) pin(model);
  }
  return changed;
}
