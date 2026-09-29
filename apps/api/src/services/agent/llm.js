// Provider-neutral LLM client with tool calling (Anthropic Messages API or any
// OpenAI-compatible Chat Completions API). Configured entirely by env vars:
//   LLM_PROVIDER=anthropic|openai|none, LLM_API_KEY, LLM_MODEL, LLM_BASE_URL
// No SDK dependency; uses Node's fetch. Keys are never logged.

const env = require('../../config/env');

const DEFAULT_MODELS = { anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o-mini' };

const isConfigured = (cfg = env.llm) => ['anthropic', 'openai'].includes(cfg.provider) && Boolean(cfg.apiKey);

const describe = (cfg = env.llm) => (isConfigured(cfg)
  ? { engine: 'llm', provider: cfg.provider, model: cfg.model || DEFAULT_MODELS[cfg.provider] }
  : { engine: 'deterministic', provider: 'none', model: null });

const post = async (url, headers, body, timeoutMs) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM request failed with HTTP ${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 300);
    throw err;
  }
  return res.json();
};

class AnthropicConversation {
  constructor(cfg, { system, user, tools }) {
    this.cfg = cfg;
    this.system = system;
    this.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input }));
    this.messages = [{ role: 'user', content: user }];
  }

  async next() {
    const base = (this.cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const data = await post(`${base}/v1/messages`, { 'x-api-key': this.cfg.apiKey, 'anthropic-version': '2023-06-01' }, {
      model: this.cfg.model || DEFAULT_MODELS.anthropic,
      max_tokens: 2500,
      system: this.system,
      messages: this.messages,
      tools: this.tools
    }, this.cfg.timeoutMs);
    this.messages.push({ role: 'assistant', content: data.content });
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const toolCalls = (data.content || []).filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));
    return { text, toolCalls };
  }

  addToolResults(results) {
    this.messages.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: Boolean(r.isError) })) });
  }

  addUser(text) {
    this.messages.push({ role: 'user', content: text });
  }
}

class OpenAIConversation {
  constructor(cfg, { system, user, tools }) {
    this.cfg = cfg;
    this.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input } }));
    this.messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  async next() {
    const base = (this.cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const data = await post(`${base}/chat/completions`, { authorization: `Bearer ${this.cfg.apiKey}` }, {
      model: this.cfg.model || DEFAULT_MODELS.openai,
      messages: this.messages,
      tools: this.tools,
      temperature: 0.1
    }, this.cfg.timeoutMs);
    const msg = data.choices?.[0]?.message || {};
    this.messages.push(msg);
    const toolCalls = (msg.tool_calls || []).map((c) => {
      let input = {};
      try { input = JSON.parse(c.function?.arguments || '{}'); } catch { input = { __malformed: true }; }
      return { id: c.id, name: c.function?.name, input };
    });
    return { text: msg.content || '', toolCalls };
  }

  addToolResults(results) {
    for (const r of results) this.messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }

  addUser(text) {
    this.messages.push({ role: 'user', content: text });
  }
}

const startConversation = (cfg, init) => (cfg.provider === 'anthropic' ? new AnthropicConversation(cfg, init) : new OpenAIConversation(cfg, init));

/** Extract the first top-level JSON object from model text. */
const extractJson = (text) => {
  const s = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
};

module.exports = { isConfigured, describe, startConversation, extractJson, DEFAULT_MODELS };
