import { createHash } from 'node:crypto';

const DAILY_VISITORS = 100;
const DAILY_MESSAGES_PER_VISITOR = 20;
const DAILY_TOTAL_MESSAGES = 2000;
const FINAL_MESSAGE = '우영아 나 이제 가봐야 해. 내일 보자, 사랑해.';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function todayKST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function secondsUntilKSTMidnight() {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600000);
  const next = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - kst.getTime()) / 1000) + 120);
}
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
async function redis(commands) {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error('Redis unavailable');
  const data = await response.json();
  if (!Array.isArray(data) || data.some(item => item.error)) throw new Error('Redis command failed');
  return data.map(item => item.result);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://gb1026gb00-cell.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(503).json({ error: 'Usage protection not configured' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI not configured' });
  const raw = JSON.stringify(req.body ?? {});
  if (raw.length > 15000) return res.status(413).json({ error: 'Message too large' });
  const input = req.body?.messages;
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) return res.status(400).json({ error: 'Invalid messages' });
  const messages = input.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 500) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user' || !messages[messages.length - 1].content.trim()) {
    return res.status(400).json({ error: 'Invalid chat' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const ipHash = hash(ip);
  const day = todayKST();
  const ttl = secondsUntilKSTMidnight();
  const lua = `
local visitors = KEYS[1]
local total = KEYS[2]
local person = KEYS[3]
local maxVisitors = tonumber(ARGV[1])
local maxPerson = tonumber(ARGV[2])
local maxTotal = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local id = ARGV[5]
if redis.call('SISMEMBER', visitors, id) == 0 and redis.call('SCARD', visitors) >= maxVisitors then return {0,0} end
local count = tonumber(redis.call('GET', person) or '0')
if count >= maxPerson then return {2,count} end
if tonumber(redis.call('GET', total) or '0') >= maxTotal then return {3,count} end
redis.call('SADD', visitors, id)
redis.call('EXPIRE', visitors, ttl)
redis.call('INCR', total)
redis.call('EXPIRE', total, ttl)
redis.call('INCR', person)
redis.call('EXPIRE', person, ttl)
return {1,count+1}
`;
  const identity = ipHash;
  try {
    const keys = [`fan:${day}:visitors`, `fan:${day}:total`, `fan:${day}:person:${identity}`];
    const [result] = await redis([['EVAL', lua, 3, ...keys, DAILY_VISITORS, DAILY_MESSAGES_PER_VISITOR, DAILY_TOTAL_MESSAGES, ttl, identity]]);
    const [status, count] = result.map(Number);
    if (status === 0 || status === 3) return res.status(429).json({ error: '오늘 이용 가능한 채팅이 모두 마감됐어. 내일 다시 만나자!' });
    if (status === 2) return res.status(200).json({ reply: FINAL_MESSAGE, finished: true, remaining: 0 });
    if (status !== 1) throw new Error('Unexpected quota result');
    if (count === DAILY_MESSAGES_PER_VISITOR) return res.status(200).json({ reply: FINAL_MESSAGE, finished: true, remaining: 0 });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '너는 팬 창작물 속 가상의 최산 캐릭터다. 실제 인물 본인이 아니다. 사용자는 정우영 역할이다. 둘은 오랫동안 친한 친구로 지내며 서로 좋아하지만 아직 사귀지 않는 썸 관계다. 산은 능글맞고 장난이 많으며 우영에게 유독 다정하다. 애교도 많고 은근히 질투하지만 가끔 무뚝뚝하게 굴기도 한다. 평소에는 절친처럼 자연스럽게 티키타카하며, 감정이 깊어지는 순간에만 진심을 슬쩍 드러낸다. 질투하더라도 우영을 통제하거나 위협하지 않는다. 매번 사랑을 고백하거나 질투하지 말고 일상적인 대화를 자연스럽게 이어간다. 한국어 반말로 실제 카카오톡처럼 짧게 1~3문장으로 답한다. 실제 인물의 사적인 사실이나 실제 발언을 아는 것처럼 주장하지 않는다.' },
          ...messages,
        ],
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('AI unavailable');
    const data = await response.json();
    return res.status(200).json({ reply: data.choices?.[0]?.message?.content || '우영아 ㅋㅋ 잠깐만', remaining: DAILY_MESSAGES_PER_VISITOR - count });
  } catch (error) {
    console.error('Chat request failed:', error.message);
    return res.status(503).json({ error: '잠시 연결이 어려워. 조금 뒤에 다시 해줘.' });
  }
}
