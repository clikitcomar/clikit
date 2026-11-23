function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return zonedAsUtc - date.getTime();
}

function localMidnightToUtc(year: number, month: number, day: number, timeZone: string) {
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const firstOffset = getTimeZoneOffsetMilliseconds(new Date(localMidnightAsUtc), timeZone);
  const firstGuess = new Date(localMidnightAsUtc - firstOffset);
  const correctedOffset = getTimeZoneOffsetMilliseconds(firstGuess, timeZone);
  return new Date(localMidnightAsUtc - correctedOffset);
}

export function getSalesDayWindow(now: Date, timeZone: string) {
  const { year, month, day } = getDateParts(now, timeZone);
  const nextLocalDate = new Date(Date.UTC(year, month - 1, day + 1));
  const start = localMidnightToUtc(year, month, day, timeZone);
  const end = localMidnightToUtc(
    nextLocalDate.getUTCFullYear(),
    nextLocalDate.getUTCMonth() + 1,
    nextLocalDate.getUTCDate(),
    timeZone,
  );

  return {
    dateKey: [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-"),
    start,
    end,
  };
}
