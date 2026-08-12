// ECOS(한국은행 경제통계시스템) 데이터를 서버 쪽에서 대신 조회해서
// API 키가 브라우저(클라이언트) 코드에 노출되지 않도록 하는 프록시 함수.

const ECOS_BASE = 'https://ecos.bok.or.kr/api/StatisticSearch';

function todayParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { y, m, d };
}

function daysAgo(n) {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function fetchSeries(key, statCode, cycle, start, end, itemCode) {
  const url = `${ECOS_BASE}/${key}/json/kr/1/20/${statCode}/${cycle}/${start}/${end}/${itemCode}`;
  const res = await fetch(url);
  const data = await res.json();
  const rows = data?.StatisticSearch?.row;
  if (!rows || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  return {
    time: last.TIME,
    value: Number(last.DATA_VALUE),
    unit: last.UNIT_NAME?.trim(),
    prevValue: prev ? Number(prev.DATA_VALUE) : null,
  };
}

exports.handler = async () => {
  const key = process.env.ECOS_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ECOS_API_KEY가 설정되지 않았습니다.' }),
    };
  }

  const { y, m } = todayParts();
  const dayStart = daysAgo(14);
  const dayEnd = daysAgo(0);

  try {
    const [baseRate, fx, kospi, kosdaq] = await Promise.all([
      fetchSeries(key, '722Y001', 'M', `${y - 1}01`, `${y}${m}`, '0101000'),
      fetchSeries(key, '731Y001', 'D', dayStart, dayEnd, '0000001'),
      fetchSeries(key, '802Y001', 'D', dayStart, dayEnd, '0001000'),
      fetchSeries(key, '802Y001', 'D', dayStart, dayEnd, '0089000'),
    ]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800', // 30분 캐시
      },
      body: JSON.stringify({ baseRate, fx, kospi, kosdaq, fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: '데이터를 가져오지 못했습니다.', detail: String(err) }),
    };
  }
};
