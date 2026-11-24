export function timeAgo(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.round((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** "15m" / "1h" / "6h" / "12h" / "1d" for a polling interval in minutes. */
export function intervalLabel(minutes) {
  const value = Number(minutes);
  if (!value) return 'paused';
  if (value < 60) return `${value}m`;
  if (value < 1440) return `${Math.round(value / 60)}h`;
  return `${Math.round(value / 1440)}d`;
}

/**
 * A short, human label for a session's user agent, e.g. "Chrome on Windows".
 * Deliberately coarse: the point is to help a reader recognise a device they
 * no longer use, not to fingerprint it.
 */
export function deviceLabel(userAgent) {
  const ua = String(userAgent ?? '');
  if (!ua) return 'Unknown device';

  const browser =
    /Edg\//i.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/i.test(ua)
        ? 'Opera'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/i.test(ua)
            ? 'Chrome'
            : /Safari\//i.test(ua)
              ? 'Safari'
              : 'Browser';

  const platform =
    /iPhone|iPod/i.test(ua)
      ? 'iPhone'
      : /iPad/i.test(ua)
        ? 'iPad'
        : /Android/i.test(ua)
          ? 'Android'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Macintosh|Mac OS X/i.test(ua)
              ? 'macOS'
              : /Linux/i.test(ua)
                ? 'Linux'
                : '';

  return platform ? `${browser} on ${platform}` : browser;
}
