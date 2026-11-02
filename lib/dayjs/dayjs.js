/**
 * Central Day.js instance with all plugins loaded.
 * Import THIS file everywhere — never `import 'dayjs'` directly,
 * otherwise plugins won't be applied.
 */
import dayjs from 'dayjs';

// ----- Plugins (note the .js extension — required for ESM) -----
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import isToday from 'dayjs/plugin/isToday.js';
import isYesterday from 'dayjs/plugin/isYesterday.js';
import isTomorrow from 'dayjs/plugin/isTomorrow.js';
import duration from 'dayjs/plugin/duration.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import weekYear from 'dayjs/plugin/weekYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import arraySupport from 'dayjs/plugin/arraySupport.js';
import objectSupport from 'dayjs/plugin/objectSupport.js';
import minMax from 'dayjs/plugin/minMax.js';
import toArray from 'dayjs/plugin/toArray.js';
import toObject from 'dayjs/plugin/toObject.js';
import updateLocale from 'dayjs/plugin/updateLocale.js';

// ----- Locales (import only what you use) -----
import 'dayjs/locale/en.js';
import 'dayjs/locale/ar.js';

// ----- Extend -----
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(isToday);
dayjs.extend(isYesterday);
dayjs.extend(isTomorrow);
dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);
dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);
dayjs.extend(advancedFormat);
dayjs.extend(localizedFormat);
dayjs.extend(arraySupport);
dayjs.extend(objectSupport);
dayjs.extend(minMax);
dayjs.extend(toArray);
dayjs.extend(toObject);
dayjs.extend(updateLocale);

// ----- Constants -----
export const UTC_TIMEZONE = 'UTC';
export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || UTC_TIMEZONE;
export const DEFAULT_LOCALE = process.env.DAYJS_LOCALE || 'en';

// Common timezones as frozen constants (avoids typos)
export const TIMEZONES = Object.freeze({
  UTC: 'UTC',
  SAUDI: 'Asia/Riyadh',
  MAKKAH: 'Asia/Riyadh',
  DUBAI: 'Asia/Dubai',
  CAIRO: 'Africa/Cairo',
  LONDON: 'Europe/London',
  PARIS: 'Europe/Paris',
  NEW_YORK: 'America/New_York',
  LOS_ANGELES: 'America/Los_Angeles',
  TOKYO: 'Asia/Tokyo',
});

// ----- Locale -----
dayjs.locale(DEFAULT_LOCALE);

// ----- Optional: customize English relative time -----
dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s ago',
    s: 'a few seconds',
    m: 'a minute',
    mm: '%d minutes',
    h: 'an hour',
    hh: '%d hours',
    d: 'a day',
    dd: '%d days',
    M: 'a month',
    MM: '%d months',
    y: 'a year',
    yy: '%d years',
  },
});

export default dayjs;