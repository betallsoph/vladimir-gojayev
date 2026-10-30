const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function getVNNow() {
  const timestamp = Date.now();
  const shifted = new Date(timestamp + VN_OFFSET_MS);
  const dateStr =
    shifted.getUTCFullYear() +
    '-' +
    pad2(shifted.getUTCMonth() + 1) +
    '-' +
    pad2(shifted.getUTCDate());
  const timeStr = pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes());
  return { dateStr, timeStr, timestamp };
}

export function getVNTomorrow() {
  const shifted = new Date(Date.now() + VN_OFFSET_MS + 24 * 60 * 60 * 1000);
  return (
    shifted.getUTCFullYear() +
    '-' +
    pad2(shifted.getUTCMonth() + 1) +
    '-' +
    pad2(shifted.getUTCDate())
  );
}

export function parseAndValidateDate(input) {
  if (input == null) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const normalized = year + '-' + pad2(month) + '-' + pad2(day);
  if (normalized < getVNNow().dateStr) return null;
  return normalized;
}

export function parseAndValidateTime(input) {
  if (input == null) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;

  return pad2(hours) + ':' + pad2(minutes);
}

export function formatDateForDisplay(yyyyMmDd) {
  if (yyyyMmDd == null) return '';
  const match = String(yyyyMmDd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return match[3] + '/' + match[2] + '/' + match[1];
}
