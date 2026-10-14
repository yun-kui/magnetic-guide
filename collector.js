
'use strict';

$('collect').addEventListener(
  'click',
  async () => {
    if (collecting) return;

    const point = $('point').value.trim();

    if (!/^\d+$/.test(point)) {
      status(
        'collectStatus',
        '請輸入定位點編號，例如 21。',
        'bad'
      );
      return;
    }

    const direction = currentDirection();

    if (!direction) {
      status(
        'collectStatus',
        '無法確認北、東、南、西。' +
        '請對準方向後再試。',
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
        '磁力計沒有提供最新讀數。',
        'bad'
      );
      return;
    }

    const recent = headingHistory.filter(
      item => Date.now() - item.time < 1000
    );

    if (
      recent.length < 2 ||
      recent.some(
        item =>
          directionFor(item.deg)?.code !==
          direction.code
      )
    ) {
      status(
        'collectStatus',
        '方向尚未穩定，請固定手機。',
        'bad'
      );
      return;
    }

    lockedDirection = direction;

    samples = [];
    collected = [];
    collectionHeadingHistory = [];
    collecting = true;

    $('collect').disabled = true;
    $('upload').disabled = true;
    $('preview').innerHTML = '';

    for (let i = 3; i >= 1; i--) {
      status(
        'collectStatus',
        '正在採集…剩餘 ' + i + ' 秒'
      );

      await wait(1000);
    }

    collecting = false;

    const directionStable =
      collectionHeadingHistory.length >= 3 &&
      collectionHeadingHistory.every(
        item =>
          directionFor(item.deg)?.code ===
          lockedDirection.code
      ) &&
      currentDirection()?.code ===
        lockedDirection.code;

    if (!directionStable) {
      status(
        'collectStatus',
        '採集期間方向不穩定或方向讀數中斷，' +
        '本次資料已取消。',
        'bad'
      );

      $('collect').disabled = false;
      return;
    }

    if (samples.length < 10) {
      status(
        'collectStatus',
        '3 秒內只取得 ' +
        samples.length +
        ' 筆有效磁場數值，' +
        '未達 10 筆，請重試。',
        'bad'
      );

      $('collect').disabled = false;
      return;
    }

    // 從實際採集到的讀數中均勻挑出 10 筆
    const selected = Array.from(
      { length: 10 },
      (_, index) => {
        const position = Math.floor(
          index * (samples.length - 1) / 9
        );

        return samples[position];
      }
    );

    collected = selected.map(item => {
      const magnitude = Math.hypot(
        item.x,
        item.y,
        item.z
      );

      return {
        id:
          point + '-' +
          lockedDirection.number,

        direction:
          lockedDirection.code,

        mag_x:
          Number(item.x.toFixed(4)),

        mag_y:
          Number(item.y.toFixed(4)),

        mag_z:
          Number(item.z.toFixed(4)),

        magnitude:
          Number(magnitude.toFixed(4)),

        timestamp:
          new Date(item.time).toISOString()
      };
    });

    // 顯示預覽表格
    for (const record of collected) {
      const tr = document.createElement('tr');

      const fields = [
        'id',
        'direction',
        'mag_x',
        'mag_y',
        'mag_z',
        'magnitude'
      ];

      for (const field of fields) {
        const td = document.createElement('td');
        td.textContent = record[field];
        tr.appendChild(td);
      }

      $('preview').appendChild(tr);
    }

    status(
      'collectStatus',
      '已取得 10 筆真實磁場數據。' +
      '資料 ID：' +
      collected[0].id +
      '，可以上傳。',
      'good'
    );

    $('upload').disabled = false;
    $('collect').disabled = false;
  }
);

$('upload').addEventListener(
  'click',
  async () => {
    const url =
      window.GEOMAG_CONFIG?.API_URL || '';

    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url)
    ) {
      status(
        'collectStatus',
        '請先在 config.js 設定 Apps Script 網址。',
        'bad'
      );
      return;
    }

    if (collected.length !== 10) {
      status(
        'collectStatus',
        '目前沒有完整的 10 筆資料。',
        'bad'
      );
      return;
    }

    $('upload').disabled = true;

    status(
      'collectStatus',
      '正在上傳 10 筆資料…'
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
          '伺服器未確認寫入成功'
        );
      }

      status(
        'collectStatus',
        '上傳成功！已寫入 Google 試算表 10 筆。',
        'good'
      );

      collected = [];

    } catch (error) {
      status(
        'collectStatus',
        '無法確認上傳結果：' +
        error.message +
        '。請先檢查 Google 試算表，' +
        '避免重複上傳。',
        'bad'
      );

    } finally {
      $('upload').disabled =
        collected.length !== 10;
    }
  }
);
