
'use strict';

const $ = id => document.getElementById(id);

const directions = [
  { code: 'N', number: 1, label: '北' },
  { code: 'E', number: 2, label: '東' },
  { code: 'S', number: 3, label: '南' },
  { code: 'W', number: 4, label: '西' }
];

let magnetometer = null;
let heading = null;
let latest = null;
let samples = [];
let collecting = false;
let collected = [];
let lockedDirection = null;
let headingHistory = [];
let collectionHeadingHistory = [];

function status(id, message, kind = '') {
  $(id).textContent = message;
  $(id).className = 'status ' + kind;
}

function directionFor(deg) {
  const idx = Math.round(deg / 90) % 4;
  const center = idx * 90;

  const delta = Math.abs(
    ((deg - center + 540) % 360) - 180
  );

  return delta <= 20 ? directions[idx] : null;
}

function currentDirection() {
  if (
    heading === null ||
    Date.now() - heading.time > 2000
  ) {
    return null;
  }

  return directionFor(heading.deg);
}

function updateHeading(deg) {
  if (!Number.isFinite(deg)) return;

  deg = ((deg % 360) + 360) % 360;

  heading = {
    deg,
    time: Date.now()
  };

  headingHistory.push({
    deg,
    time: Date.now()
  });

  if (collecting) {
    collectionHeadingHistory.push({
      deg,
      time: Date.now()
    });
  }

  headingHistory = headingHistory.filter(
    x => Date.now() - x.time < 1200
  );

  const d = currentDirection();

  $('heading').textContent = d
    ? d.label + '方（' + d.code + '）'
    : '方向邊界／未對準';

  $('degrees').textContent =
    deg.toFixed(1) + '°';

  $('needle').style.transform =
    'rotate(' + deg + 'deg)';

  updateId();
}

function updateId() {
  const point = $('point').value.trim();
  const d = currentDirection();

  $('recordId').textContent =
    /^\d+$/.test(point) && d
      ? point + '-' + d.number
      : '--';
}

$('point').addEventListener('input', updateId);

function onOrientation(e) {
  let deg = null;

  // Safari 特定的羅盤方位欄位
  if (Number.isFinite(e.webkitCompassHeading)) {
    deg = e.webkitCompassHeading;
  }

  // 部分 Android Chromium 的絕對方向資料
  else if (
    e.absolute === true &&
    Number.isFinite(e.alpha)
  ) {
    deg = (360 - e.alpha) % 360;
  }

  if (deg !== null) {
    updateHeading(deg);
  }
}

function startOrientation() {
  window.addEventListener(
    'deviceorientationabsolute',
    onOrientation
  );

  window.addEventListener(
    'deviceorientation',
    onOrientation
  );
}

$('startSensors').addEventListener(
  'click',
  async () => {
    if (!window.isSecureContext) {
      status(
        'sensorStatus',
        '必須使用 HTTPS 網站',
        'bad'
      );
      return;
    }

    if (!('Magnetometer' in window)) {
      status(
        'sensorStatus',
        '此瀏覽器未提供 Magnetometer API。' +
        '手機有磁力計也不代表網頁能讀取。',
        'bad'
      );
      return;
    }

    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission ===
          'function'
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== 'granted') {
          throw new Error('方向感測器權限未核准');
        }
      }

      startOrientation();

      if (magnetometer) {
        magnetometer.stop();
      }

      magnetometer = new Magnetometer({
        frequency: 10
      });

      magnetometer.addEventListener(
        'reading',
        () => {
          const x = magnetometer.x;
          const y = magnetometer.y;
          const z = magnetometer.z;

          if (
            ![x, y, z].every(Number.isFinite)
          ) {
            return;
          }

          latest = {
            x,
            y,
            z,
            time: Date.now()
          };

          if (!collecting) {
            $('collect').disabled = false;
          }

          $('x').textContent = x.toFixed(2);
          $('y').textContent = y.toFixed(2);
          $('z').textContent = z.toFixed(2);

          if (collecting) {
            samples.push({ ...latest });
          }

          const d = currentDirection();

          status(
            'sensorStatus',
            d
              ? '磁力計運作中，方向：' + d.label
              : '磁力計運作中，但尚無可靠的北方角度；' +
                '請檢查瀏覽器羅盤支援',
            d ? 'good' : ''
          );
        }
      );

      magnetometer.addEventListener(
        'error',
        e => {
          status(
            'sensorStatus',
            '磁力計錯誤：' +
            (e.error?.name || 'Unknown') +
            ' ' +
            (e.error?.message || ''),
            'bad'
          );

          $('collect').disabled = true;
        }
      );

      magnetometer.start();

      $('collect').disabled = true;

      status(
        'sensorStatus',
        '等待磁力計讀數及羅盤方向…'
      );

    } catch (e) {
      status(
        'sensorStatus',
        '啟動失敗：' +
        e.name + ' ' + e.message,
        'bad'
      );

      $('collect').disabled = true;
    }
  }
);

function wait(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}
