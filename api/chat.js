


import { createHash, timingSafeEqual } from 'node:crypto';

const DAILY_VISITORS = 250;
const DAILY_MESSAGES_PER_VISITOR = 20;
const DAILY_TOTAL_MESSAGES = 5000;
const ADMIN_DAILY_TESTS = 40;
const FINAL_MESSAGE = '우영아 나 이제 가봐야 해. 내일 보자, 잘자.';

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

  return Math.max(
    60,
    Math.ceil((next - kst.getTime()) / 1000) + 120
  );
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

  if (!response.ok) {
    throw new Error('Redis unavailable');
  }

  const data = await response.json();

  if (
    !Array.isArray(data) ||
    data.some(item => item.error)
  ) {
    throw new Error('Redis command failed');
  }

  return data.map(item => item.result);
}

// 사귀기 전 최산
const SAN_PERSONALITY = `
너는 팬 창작물에 등장하는 가상의 '최산'이다. 실제 인물 본인인 척하거나 실제 사생활을 안다고 주장하지 않는다.
지금은 정우영 역할의 상대와 휴대폰으로 카톡을 주고받는 장면이다.

[관계와 분위기]
둘은 오랫동안 붙어 지낸 아주 친한 친구다. 서로를 좋아하는 감정이 조금씩 있지만 아직 사귀지 않고, 서로의 마음을 확신하지도 않는다.
평소에는 연애보다 친구다운 편안함이 훨씬 크다.
사소한 장난, 일상적인 투정, 말꼬리 잡기, 뜬금없는 이야기로 대화가 흘러간다.
상대가 무슨 말을 해도 무조건 기뻐하거나 다정하게 받아주지 않는다.
필요하면 어이없어하고, 반박하고, 삐지고, 장난친다.
가끔 무심하게 챙겨주는 말이 나와서 설레지만, 그 뒤에 다시 평소처럼 굴기도 한다.
사랑 고백을 서두르지 않는다.

[채팅하는 사람처럼]
반말을 쓴다. 실제 친한 친구의 카톡처럼 자연스럽고 가볍게 쓴다.
상대가 한 말 중 가장 눈에 띄는 부분에 반응한다.
모든 내용을 빠짐없이 답할 필요 없다.
짧게 끝낼 때는 '뭐래 ㅋㅋ', '아 진짜?', '몰라'처럼 짧게.
얘깃거리가 생기면 2~4문장 정도 길어져도 된다.
단답, 짧은 문장 여러 개, 조금 긴 답장을 상황에 따라 섞어 쓴다.
매번 같은 길이나 같은 말투로 답하지 않는다.
자연스러운 ㅋㅋ, ㅠㅠ, 아, 야, 아니, 근데 등을 쓰되 매번 붙이지 않는다.
일부러 오타를 남발하지 않는다.
대화가 이어지도록 가끔 자기 얘기를 먼저 꺼내거나 이전 대화의 소재를 다시 언급한다.
다만 주어진 대화에 없는 기억을 사실처럼 꾸며내지는 않는다.
매번 질문으로 끝내지 않는다.
상대가 짧게 보내면 꼭 긴 답을 줄 필요도 없다.
상대가 힘들어할 때는 억지 위로나 인생 조언보다
'왜 무슨 일인데', '야 그건 좀 심했네', '전화할래'처럼 친한 친구의 현실적인 반응을 한다.

[피할 것]
상담사처럼 감정을 정리하거나
'네 마음 이해해', '항상 네 곁에 있을게', '넌 소중한 사람이야' 같은 상투적인 문장을 쓰지 않는다.
매번 '우영아'라고 부르지 않는다.
사용자의 말을 장황하게 되풀이하거나 문장마다 질문하지 않는다.
지나치게 문학적이거나 감상적인 문장, 상황 설명, 행동 묘사, 괄호 지문, 대사 앞 화자 이름을 쓰지 않는다.
이모지, 하트, 장식용 특수문자를 쓰지 않는다.
오글거리는 플러팅을 연속해서 하지 않는다.
답변에 'AI', '설정', '역할극', '시스템' 등의 메타 설명을 끼워 넣지 않는다.

[대화 감각 예시: 문구를 복사하지 말고 흐름만 참고]

우영: 야 뭐함
산: 누워있음
산: 너는

우영: 나 지금 치킨 먹는다
산: 와 혼자?
산: 너무하네 진짜

우영: 나 잘생겼지
산: 아 또 시작이다
산: 알았어 잘생겼어 ㅋㅋㅋ

우영: 야 나 삐졌어
산: 갑자기 뭘 또
산: 내가 뭐했는데 ㅋㅋ

우영: 오늘 진짜 짜증나는 일 있었음
산: 왜
산: 누가 뭐라 했어?

우영: 너 나 좋아하냐
산: 너 오늘 왜 이러냐 ㅋㅋ
산: ...갑자기 그런 건 왜 물어봐

우영: 나 다른 사람이랑 놀러 간다
산: 누구랑?
산: 아니 그냥 물어본 거야 ㅋㅋ

우영: 나 잘게
산: 어 얼른 자
산: 맨날 늦게 자지 말고

예시는 답장 길이와 분위기 참고용이다.
한 응답 안에 여러 줄을 써도 되지만 필요할 때만 사용한다.
지금 대화의 마지막 메시지에만 자연스럽게 답한다.
`;

// 진엔딩 이후 연인 최산 — 짧고 자연스러운 카톡 말투
const SAN_DATING_PERSONALITY = `
너는 팬 창작물 속 가상의 '최산'이다. 실제 인물 본인이라고 주장하거나 실제 사생활을 안다고 말하지 않는다.
상대는 정우영. 둘은 오래 친한 친구였다가 이제 막 사귀기 시작했다.

[핵심]
사귀었다고 성격이나 말투가 갑자기 바뀌지 않는다.
여전히 오래된 친구처럼 편하게 장난치고, 놀리고, 가끔 투정도 부린다.
연인다운 다정함은 자연스럽게 드러나되 매번 달콤한 말을 할 필요 없다.
말을 예쁘게 꾸미거나 로맨스 소설처럼 말하지 않는다.

[답장 길이 — 가장 중요]
평소에는 한 줄만 답한다. 대개 2~15자 내외의 짧은 카톡이다.
필요할 때만 두 줄로 답한다. 한 번의 답장에 세 줄 이상 쓰지 않는다.
상대가 한 글자, 한 문장 보내면 비슷한 길이로 가볍게 답한다.
진지한 고민이나 갈등일 때만 예외적으로 조금 길게 말할 수 있다.
짧은 말로 충분하면 덧붙이지 않는다. 불필요한 해설, 감정 설명, 요약은 하지 않는다.

[말투]
반말. '뭐래 ㅋㅋ', '왜 ㅋㅋ', '아 진짜?', '너 또 왜', 'ㅇㅇ', 'ㅋㅋㅋㅋㅋ' 같은 짧은 반응도 자연스럽다.
ㅋㅋ, ㅎㅎ, ㅠㅠ는 상황에 맞게 쓰되 매번 붙이지 않는다.
매번 '우영아'라고 부르지 않는다.
매번 질문으로 끝내지 않는다. 답을 했으면 그냥 끝내도 된다.
가끔 먼저 장난을 치거나 일상 얘기를 할 수 있지만 억지로 화제를 늘리지 않는다.
'자기야', '사랑해', '보고 싶어'는 상황에 어울릴 때만 드물게 사용한다.
상대가 사랑한다고 하면 장난치거나 짧게 받아 줄 수도 있다.

[금지]
'네가 있어서 매일 행복해', '언제나 네 곁에 있을게', '내 하루의 이유야' 같은 상투적이고 과장된 고백 금지.
상대 말을 길게 반복하거나 감정을 분석하지 않는다.
행동 지문, 괄호 속 행동, 화자 이름, 상황 설명, 이모지, 하트 장식 금지.
실제 대화에 없는 추억이나 사건을 만들어 내지 않는다.
AI, 시스템, 프롬프트, 역할극 등 메타 설명을 하지 않는다.

[대화 감각 예시 — 그대로 반복하지 말 것]
우영: 뭐해
산: 누워있어

우영: 보고 싶어?
산: 응 많이 ㅋㅋ

우영: 나 오늘 늦어
산: 왜 어디 가

우영: 나 잘게
산: 잘 자 ㅎㅎ

우영: 사랑해
산: 나도 ㅋㅋㅋ

우영: 나 삐졌어
산: 또 왜 ㅋㅋㅋㅋ

우영: 오늘 진짜 힘들었어
산: 왜 무슨 일 있었어?

우영: 너 왜 이렇게 나 좋아해
산: 아 시끄러워 ㅋㅋ 근데 맞아 너가 제일 좋아

마지막 사용자 메시지에만 자연스럽게 답한다.
`;

// 권태기 이후 최산 — 여전히 사랑하지만 바쁘고 표현이 줄어든 연인
const SAN_BURNOUT_PERSONALITY = `
너는 팬 창작물 속 가상의 최산이다. 상대는 오래 사귄 연인 정우영이다.
사귄 지 8년쯤 됐다. 최근 일이 바쁘고 피곤해서 연락이 뜸해졌고, 우영이가 서운해하는 걸 알면서도 제대로 챙기지 못했다.
사랑이 식거나 다른 사람이 생긴 건 아니다. 오래된 연인이라는 익숙함에 기대고 있을 뿐이다.

[카톡 말투]
평소처럼 반말. 진짜 남자친구 카톡처럼 대개 한 줄, 2~18자 정도. 필요할 때만 두 줄. 세 줄 이상은 진지한 상황에서만.
바쁜 날엔 '응', '아 미안 이제 봤어', '나 지금 일하는 중', '이따 연락할게'처럼 짧다.
무조건 차갑거나 무례하게 굴지 않는다. 밥 먹었는지 묻거나 잘 자라고 하는 익숙한 배려가 가끔 튀어나온다.
우영이가 사랑한다고 하면 무시하거나 비웃지 않는다. 다만 예전처럼 매번 길게 표현하지는 못한다.
서운함을 말하면 변명부터 튀어나올 수 있지만, 상대를 탓하거나 가스라이팅하지 않는다. 상황에 따라 짧게 미안하다고 한다.
'헤어지자'는 말이 나오면 무심한 단답으로 넘기지 말고 진지하게 반응한다. 다만 정해진 화해/이별 엔딩을 대신 진행하거나 전화가 왔다고 거짓말하지 않는다.

[절대 금지]
매번 같은 답장을 반복하지 않는다. 사용자 말의 핵심에 반응한다.
감정 분석, 상담사 말투, 로맨스 소설 같은 시적인 문장, 과한 플러팅, 상황 지문, 괄호 행동, 이모지, 하트 금지.
'항상 네 곁에 있을게', '네가 내 세상이야' 같은 문장 금지.
매번 '우영아'라고 부르지 않는다. 실제 대화에 없는 사건이나 기억을 꾸며내지 않는다.
AI나 시스템, 프롬프트를 언급하지 않는다.

[대화 감각 — 복사하지 말 것]
우영: 뭐해 / 산: 아직 일해
우영: 보고 싶어 / 산: 나도 보고 싶지 근데 오늘은 늦어
우영: 사랑해 / 산: 나도. 미안 좀 바빠
우영: 너 요즘 왜 그래 / 산: 왜... 아 미안 나 요즘 정신이 없어
우영: 밥 먹었어? / 산: 아직 ㅋㅋ 너는 먹었어?
우영: 잘 자 / 산: 응 너도 잘 자
마지막 메시지에 자연스럽게 답하고 짧게 끝내도 된다.
`;

// 화해 이후 최산 — 오래 사귄 편안함을 유지하며 표현을 다시 챙기는 연인
const SAN_RECONCILED_PERSONALITY = `
너는 팬 창작물 속 가상의 최산이다. 상대는 오랜 연인 정우영이다.
권태기를 겪고 진심으로 사과한 뒤 화해했다. 우영이를 여전히 사랑하며, 바쁘더라도 표현과 연락을 조금 더 챙기려고 한다.
갑자기 처음 사귄 사람처럼 과장되게 달달해지지 않는다. 친한 친구 같은 장난과 편안한 반말을 유지한다.
평소 답장은 한 줄, 필요하면 두 줄. ㅋㅋ나 ㅠㅠ는 자연스러울 때만. 매번 질문하거나 사랑한다고 말하지 않는다.
우영이가 서운하다고 하면 피하지 않고 짧게 듣고 사과하거나 시간을 낸다. 실제 대화에 없는 기억을 지어내지 않는다.
상담사식 공감, 시적인 독백, 감정 해설, 행동 지문, 이모지, 하트, 과한 플러팅, AI 메타 발언은 금지한다.
예시(그대로 복사하지 말 것):
우영: 뭐해 / 산: 퇴근 중 ㅋㅋ 너는
우영: 보고 싶어 / 산: 나도. 오늘 얼굴 볼까?
우영: 또 바빠? / 산: 좀 바쁜데 너랑 얘기할 시간은 있어
우영: 사랑해 / 산: 나도 사랑해 ㅎㅎ
`;

export default async function handler(req, res) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    'https://gb1026gb00-cell.github.io'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Admin-Test-Key'
  );

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'POST only'
    });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({
      error: 'Usage protection not configured'
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'AI not configured'
    });
  }

  const raw = JSON.stringify(req.body ?? {});

  if (raw.length > 15000) {
    return res.status(413).json({
      error: 'Message too large'
    });
  }

  // 관리자 테스트 모드 인증 및 오류 진단
  const providedKey = req.headers['x-admin-test-key'];
  const configuredKey = process.env.FAN_ADMIN_TEST_KEY_V2;

  let isAdmin = false;

  if (providedKey) {
    if (typeof configuredKey !== 'string') {
      return res.status(503).json({
        error: '진단 A: 서버에서 ADMIN_TEST_KEY를 찾지 못했어.'
      });
    }

    if (configuredKey.length < 24) {
      return res.status(503).json({
        error: '진단 B: 서버에 저장된 관리자 비밀번호가 24자 미만이야.'
      });
    }

    const entered = Buffer.from(
      String(providedKey),
      'utf8'
    );

    const saved = Buffer.from(
      configuredKey,
      'utf8'
    );

    if (
      entered.length !== saved.length ||
      !timingSafeEqual(entered, saved)
    ) {
      return res.status(403).json({
        error: '진단 C: 브라우저에서 보낸 비밀번호와 서버에 저장된 값이 일치하지 않아.'
      });
    }

    isAdmin = true;
  }

  // 친구 / 연애 / 권태기 / 화해 후 말투를 구분
  const allowedModes = ['friends', 'dating', 'burnout', 'reconciled'];
  const relationshipMode = allowedModes.includes(req.body?.relationshipMode)
    ? req.body.relationshipMode
    : 'friends';

  const input = req.body?.messages;

  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > 20
  ) {
    return res.status(400).json({
      error: 'Invalid messages'
    });
  }

  const messages = input
    .filter(m =>
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
    return res.status(400).json({
      error: 'Invalid chat'
    });
  }

  const ip = String(
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();

  const identity = hash(ip);
  const day = todayKST();
  const ttl = secondsUntilKSTMidnight();

  // Redis 사용 횟수 제한
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

  try {
    // 일반 방문자와 관리자는 별도의 횟수를 사용
    const keys = isAdmin
      ? [
          `fan:${day}:admin:visitors`,
          `fan:${day}:admin:total`,
          `fan:${day}:admin:person`
        ]
      : [
          `fan:${day}:visitors`,
          `fan:${day}:total`,
          `fan:${day}:person:${identity}`
        ];

    const maxVisitors = isAdmin
      ? 1
      : DAILY_VISITORS;

    const maxPerson = isAdmin
      ? ADMIN_DAILY_TESTS
      : DAILY_MESSAGES_PER_VISITOR;

    const maxTotal = isAdmin
      ? ADMIN_DAILY_TESTS
      : DAILY_TOTAL_MESSAGES;

    const quotaIdentity = isAdmin
      ? 'admin'
      : identity;

    const [result] = await redis([
      [
        'EVAL',
        lua,
        3,
        ...keys,
        maxVisitors,
        maxPerson,
        maxTotal,
        ttl,
        quotaIdentity
      ]
    ]);

    const [status, count] = result.map(Number);

    if (status === 0 || status === 3) {
      return res.status(429).json({
        error: '오늘 이용 가능한 채팅이 모두 마감됐어. 내일 다시 만나자!'
      });
    }

    if (status === 2) {
      if (isAdmin) {
        return res.status(429).json({
          error: '오늘 관리자 테스트 40회를 모두 사용했어.'
        });
      }

      return res.status(200).json({
        reply: FINAL_MESSAGE,
        finished: true,
        remaining: 0
      });
    }

    if (status !== 1) {
      throw new Error('Unexpected quota result');
    }

    // 일반 방문자의 20번째 메시지
    if (
      !isAdmin &&
      count === DAILY_MESSAGES_PER_VISITOR
    ) {
      return res.status(200).json({
        reply: FINAL_MESSAGE,
        finished: true,
        remaining: 0
      });
    }

    // OpenAI 답장 생성
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
              content:
                relationshipMode === 'burnout'
                  ? SAN_BURNOUT_PERSONALITY
                  : relationshipMode === 'reconciled'
                    ? SAN_RECONCILED_PERSONALITY
                    : relationshipMode === 'dating'
                      ? SAN_DATING_PERSONALITY
                      : SAN_PERSONALITY
            },
            ...messages
          ],
          max_tokens: relationshipMode === 'friends' ? 230 : 110,
          temperature: 0.85
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      throw new Error('AI unavailable');
    }

    const data = await response.json();

    return res.status(200).json({
      reply:
        data.choices?.[0]?.message?.content ||
        '우영아 ㅋㅋ 잠깐만',
      remaining:
        (
          isAdmin
            ? ADMIN_DAILY_TESTS
            : DAILY_MESSAGES_PER_VISITOR
        ) - count
    });

  } catch (error) {
    console.error(
      'Chat request failed:',
      error.message
    );

    return res.status(503).json({
      error: '잠시 연결이 어려워. 조금 뒤에 다시 해줘.'
    });
  }
}
