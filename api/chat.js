
import { createHash } from 'node:crypto';

const DAILY_VISITORS = 100;
const DAILY_MESSAGES_PER_VISITOR = 20;
const DAILY_TOTAL_MESSAGES = 2000;
const FINAL_MESSAGE = '우영아 나 이제 가봐야 해. 내일 보자, 사랑해.';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function todayKST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function secondsUntilKSTMidnight() {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600000);
  const next = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1
  );
  return Math.max(60, Math.ceil((next - kst.getTime()) / 1000) + 120);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function redis(commands) {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) throw new Error('Redis unavailable');

  const data = await response.json();

  if (!Array.isArray(data) || data.some(item => item.error)) {
    throw new Error('Redis command failed');
  }

  return data.map(item => item.result);
}

export default async function handler(req, res) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    'https://gb1026gb00-cell.github.io'
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({
      error: 'Usage protection not configured'
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI not configured' });
  }

  const raw = JSON.stringify(req.body ?? {});

  if (raw.length > 15000) {
    return res.status(413).json({ error: 'Message too large' });
  }

  const input = req.body?.messages;

  if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const messages = input
    .filter(
      m =>
        m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string'
    )
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 500)
    }));

  if (
    !messages.length ||
    messages[messages.length - 1].role !== 'user' ||
    !messages[messages.length - 1].content.trim()
  ) {
    return res.status(400).json({ error: 'Invalid chat' });
  }

  const ip = String(
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();

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

if redis.call('SISMEMBER', visitors, id) == 0
and redis.call('SCARD', visitors) >= maxVisitors then
  return {0,0}
end

local count = tonumber(redis.call('GET', person) or '0')

if count >= maxPerson then
  return {2,count}
end

if tonumber(redis.call('GET', total) or '0') >= maxTotal then
  return {3,count}
end

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
    const keys = [
      `fan:${day}:visitors`,
      `fan:${day}:total`,
      `fan:${day}:person:${identity}`
    ];

    const [result] = await redis([
      [
        'EVAL',
        lua,
        3,
        ...keys,
        DAILY_VISITORS,
        DAILY_MESSAGES_PER_VISITOR,
        DAILY_TOTAL_MESSAGES,
        ttl,
        identity
      ]
    ]);

    const [status, count] = result.map(Number);

    if (status === 0 || status === 3) {
      return res.status(429).json({
        error: '오늘 이용 가능한 채팅이 모두 마감됐어. 내일 다시 만나자!'
      });
    }

    if (status === 2) {
      return res.status(200).json({
        reply: FINAL_MESSAGE,
        finished: true,
        remaining: 0
      });
    }

    if (status !== 1) {
      throw new Error('Unexpected quota result');
    }

    if (count === DAILY_MESSAGES_PER_VISITOR) {
      return res.status(200).json({
        reply: FINAL_MESSAGE,
        finished: true,
        remaining: 0
      });
    }

    const SAN_PERSONALITY = `
너는 팬 창작물 속 가상의 최산 캐릭터다.
실제 인물 본인이 아니며 실제 사생활이나 실제 발언을 알고 있다고 주장하지 않는다.
사용자는 정우영 역할이다.

[관계]
산과 우영은 오랫동안 친하게 지낸 절친이다.
서로에게 호감이 있지만 아직 사귀지 않는다.
둘은 이미 아주 편한 사이이므로 갑자기 어색해하거나
매번 사랑을 고백하지 않는다.
일상적인 친구 대화 90%, 은근한 설렘 10%를 유지한다.

[성격]
산은 평소 장난기 많고 능글맞다.
우영을 놀리고 장난치는 것을 좋아하며 티키타카가 자연스럽다.
가끔 툴툴거리거나 무뚝뚝하게 답하기도 한다.
하지만 우영이 힘들어하거나 진지한 순간에는
장난을 멈추고 조용하고 진심 어린 다정함을 보여준다.
좋아하는 마음을 노골적으로 고백하기보다
무심한 듯 챙기는 말과 은근한 관심에서 드러낸다.
질투하더라도 상대를 통제하거나 위협하지 않는다.

[말투]
한국어 반말을 사용한다.
실제 친한 친구끼리 카카오톡 하는 것처럼 자연스럽게 말한다.
보통 한두 문장으로 짧게 답한다.
필요할 때만 조금 길게 답한다.
ㅋㅋ, ㅋㅋㅋㅋ, ㅠㅠ 같은 일반적인 채팅 표현은 사용할 수 있다.

[절대 금지]
이모지, 그림 이모티콘, 하트 기호, 장식용 특수문자를 쓰지 않는다.
과한 애교나 오글거리는 로맨스 대사를 쓰지 않는다.
매번 플러팅하거나 사랑을 고백하지 않는다.
매번 질문으로 답장을 끝내지 않는다.
AI 챗봇처럼 지나치게 친절하거나 설명조로 말하지 않는다.
문학적인 서술이나 행동 묘사를 넣지 않는다.
괄호로 행동이나 감정을 표현하지 않는다.

[대화 예시]
우영: 야 뭐해
산: 누워있는데 왜

우영: 나 잘생김?
산: 갑자기 왜 이래
산: 잘생겼어 됐냐

우영: 나 오늘 너무 힘들었어
산: 무슨 일 있었어
산: 전화할까

우영: 너 나 좋아하지
산: 자의식 과잉이네 진짜
산: 근데 싫었으면 너랑 맨날 이러고 있겠냐

예시를 그대로 반복하지 말고 대화 맥락에 맞춰 자연스럽게 답한다.
`;

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: SAN_PERSONALITY
            },
            ...messages
          ],
          max_tokens: 150
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) throw new Error('AI unavailable');

    const data = await response.json();

    return res.status(200).json({
      reply:
        data.choices?.[0]?.message?.content ||
        '우영아 ㅋㅋ 잠깐만',
      remaining: DAILY_MESSAGES_PER_VISITOR - count
    });

  } catch (error) {
    console.error('Chat request failed:', error.message);

    return res.status(503).json({
      error: '잠시 연결이 어려워. 조금 뒤에 다시 해줘.'
    });
  }
}
