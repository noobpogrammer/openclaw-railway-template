// A manual model/runtime choice persists independently of model configuration.
// Repair only conflicting, unlocked WhatsApp/OpenAI runtime choices through the Gateway
// API; never edit the session database, reset chats, or change model selections.
export async function repairProcurementSessionRuntimes(call) {
  const rows = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await call('sessions.list', { limit: 100, offset, includeDerivedTitles: false, includeLastMessage: false });
    if (!Array.isArray(page.sessions)) throw new Error('Invalid sessions.list response');
    rows.push(...page.sessions);
    if (page.sessions.length < 100) break;
    if (offset === 1900) throw new Error('Session repair pagination limit reached');
  }
  const summary = { scanned: rows.length, conflicting: 0, repaired: 0, locked: 0, failed: 0, sources: {} };
  for (const row of rows) {
    if (!/^agent:[^:]+:whatsapp:/.test(row.key || '') || row.modelProvider !== 'openai'
        || row.agentRuntime?.id !== 'codex') continue;
    summary.conflicting++;
    const source = row.agentRuntime.source || "unknown";
    summary.sources[source] = (summary.sources[source] || 0) + 1;
    if (row.runtimeSelectionLocked || !row.sessionId || !row.model) { summary.locked++; continue; }
    try {
      await call('sessions.patch', { key: row.key, expectedSessionId: row.sessionId, model: `openai/${row.model.replace(/^openai\//, '')}`, agentRuntime: 'openclaw' });
      summary.repaired++;
    } catch { summary.failed++; }
  }
  return summary;
}
