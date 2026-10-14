
'use strict';

$('collect').addEventListener('click', async () => {
  if (collecting) return;

  const point = $('point').value.trim();

  if (!/^\d+$/.test(point)) {
    status(
      'collectStatus',
      '請先輸入數字定位點，例如 21',
      'bad'
    );
    return;
  }

  const d = currentDirection();

  if (!d) {
    status(
      'collectStatus',
      '無法確認北、東、南、西。' +
      '請將手機對準方向，並確認瀏覽器提供絕對羅盤角度。',
      'bad'
    );
    return;
  }

  if (
    !latest ||
    Date.now() - latest.time > 1500
  ) {
    status(
      'collectStatus',
      '尚未收到新鮮磁力計數值',
      'bad'
    );
    return;
  }

  const recent = headingHistory.filter(
    x => Date.now() - x.time < 1000
  );

  if (
    recent.length < 2 ||
    recent.some(
      x => directionFor(x.deg)?.code !== d.code
    )
  ) {
    status(
      'collectStatus',
      '方向尚未穩定，請固定手機後再試',
      'bad'
    );
    return;
  }

  lockedDirection = d;
  samples = [];
  collected = [];
  collectionHeadingHistory = [];
  collecting = true;

  $('collect').disabled = true;
  $('upload').disabled = true;
  $('preview').innerHTML = '';

  for (
    let second = 3;
    second >= 1;
    second--
  ) {
    status(
      'collectStatus',
      '採集中…剩餘 ' + second + ' 秒'
    );

    await wait(1000);
  }

  collecting = false;

  const stable = collectionHeadingHistory;

  const orientationValid =
    stable.length >= 3 &&
    stable.every(
      x =>
        directionFor(x.deg)?.code ===
        lockedDirection.code
    );

  if (
    !orientationValid ||
    !currentDirection() ||
    currentDirection().code !==
      lockedDirection.code
  ) {
    status(
      'collectStatus',
      '採集期間方向不穩定或羅盤讀數中斷，' +
      '已取消本次採集',
      'bad'
    );

    $('collect').disabled = false;
    return;
  }

  if (samples.length < 10) {
    status(
      'collectStatus',
      '3 秒內只收到 ' +
      samples.length +
      ' 筆有效讀數，未達 10 筆，請重試',
      'bad'
    );

    $('collect').disabled = false;
    return;
  }

  // 從實際收到的讀數中平均分布選取 10 筆
  const selected = Array.from(
    { length: 10 },
    (_, i) =>
      samples[
        Math.floor(
          i * (samples.length - 1) / 9
        )
      ]
  );

  collected = selected.map(s => ({
    id:
      point + '-' +
      lockedDirection.number,

    direction:
      lockedDirection.code,

    mag_x:
      Number(s.x.toFixed(4)),

    mag_y:
      Number(s.y.toFixed(4)),

    mag_z:
      Number(s.z.toFixed(4)),

    magnitude:
      Number(
        Math.hypot(s.x, s.y, s.z)
          .toFixed(4)
      ),

    timestamp:
      new Date(s.time).toISOString()
  }));

  for (const r of collected) {
    const tr = document.createElement('tr');

    for (
      const k of [
        'id',
        'direction',
        'mag_x',
        'mag_y',
        'mag_z',
        'magnitude'
      ]
    ) {
      const td = document.createElement('td');
      td.textContent = r[k];
      tr.appendChild(td);
    }

    $('preview').appendChild(tr);
  }

  status(
    'collectStatus',
    '成功取得 10 筆真實磁場讀數，ID：' +
    collected[0].id +
    '。請確認後上傳。',
    'good'
  );

  $('upload').disabled = false;
  $('collect').disabled = false;
});

$('upload').addEventListener('click', async () => {
  const url =
    window.GEOMAG_CONFIG?.API_URL || '';

  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url)
  ) {
    status(
      'collectStatus',
      '請填入有效的 Apps Script /exec 網址',
      'bad'
    );
    return;
  }

  if (collected.length !== 10) {
    status(
      'collectStatus',
      '沒有可上傳的 10 筆資料',
      'bad'
    );
    return;
  }

  $('upload').disabled = true;

  status(
    'collectStatus',
    '正在上傳 10 筆…'
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':
          'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'batch_insert',
        records: collected
      }),
      redirect: 'follow'
    });

    const result = await response.json();

    if (
      !response.ok ||
      result.status !== 'success' ||
      result.inserted !== 10
    ) {
      throw new Error(
        result.message ||
        '伺服器未確認寫入 10 筆'
      );
    }

    status(
      'collectStatus',
      'Google 試算表確認成功寫入 10 筆！',
      'good'
    );

    collected = [];

  } catch (e) {
    status(
      'collectStatus',
      '無法確認上傳成功：' +
      e.message +
      '。請先檢查試算表是否已新增 10 筆，' +
      '避免重複上傳。',
      'bad'
    );
  } finally {
    $('upload').disabled =
      collected.length !== 10;
  }
});
