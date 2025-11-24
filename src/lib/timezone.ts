import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export const BAGHDAD_TIMEZONE = 'Asia/Baghdad';

/**
 * Format a date/time in Baghdad timezone
 */
export const formatBaghdadTime = (date: Date | string, formatStr: string = 'MMM dd, yyyy HH:mm') => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, BAGHDAD_TIMEZONE, formatStr);
};

/**
 * Convert UTC date to Baghdad timezone
 */
export const toBaghdadTime = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, BAGHDAD_TIMEZONE);
};

/**
 * Get current time in Baghdad
 */
export const getBaghdadNow = () => {
  return toZonedTime(new Date(), BAGHDAD_TIMEZONE);
};

/**
 * Format match date and time for display
 */
export const formatMatchDateTime = (utcDate: string) => {
  const date = new Date(utcDate);
  return {
    date: formatBaghdadTime(date, 'MMM dd, yyyy'),
    time: formatBaghdadTime(date, 'HH:mm'),
    full: formatBaghdadTime(date, 'MMM dd, yyyy HH:mm'),
  };
};
