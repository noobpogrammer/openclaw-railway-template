import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureProcurementModelRuntime } from './procurement-runtime.js';

test('preserves selected model, OAuth and security policies while using a compatible runtime', () => {
  const config = { agents: {defaults: {model: {primary:'openai/gpt-6-astra'}, models: {'openai/gpt-6-astra':{alias:'Main',agentRuntime:{id:'codex'}}}}},
    auth:{profiles:{subscription:{provider:'openai',mode:'oauth'}}}, tools:{codeMode:false}, plugins:{entries:{'procurement-tools':{enabled:true}}}};
  const original = structuredClone(config);
  assert.equal(ensureProcurementModelRuntime(config), true);
  assert.equal(config.agents.defaults.models['openai/gpt-6-astra'].agentRuntime.id,'openclaw');
  assert.equal(config.agents.defaults.models['openai/*'].agentRuntime.id,'openclaw');
  for (const key of ['auth','tools','plugins']) assert.deepEqual(config[key],original[key]);
  assert.deepEqual(config.agents.defaults.model, original.agents.defaults.model);
  assert.equal(config.agents.defaults.models['openai/gpt-6-astra'].alias,'Main');
  assert.equal(ensureProcurementModelRuntime(config),false);
});

test('overrides exact runtime policies without changing other providers', () => {
  const config={agents:{entries:{buyer:{models:{'openai/gpt-6.1-sol':{agentRuntime:{id:'codex'}},'deepseek/deepseek-v4-pro':{agentRuntime:{id:'auto'}}}}}},
    models:{providers:{openai:{baseUrl:'https://api.openai.com/v1',agentRuntime:{id:'codex'},models:[{id:'gpt-6-astra',agentRuntime:{id:'codex'}}]}}}};
  ensureProcurementModelRuntime(config);
  assert.equal(config.agents.entries.buyer.models['openai/gpt-6.1-sol'].agentRuntime.id,'openclaw');
  assert.equal(config.models.providers.openai.models[0].agentRuntime.id,'openclaw');
  assert.equal(config.models.providers.openai.agentRuntime.id,'openclaw');
  assert.equal(config.agents.entries.buyer.models['deepseek/deepseek-v4-pro'].agentRuntime.id,'auto');
});
