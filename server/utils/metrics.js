/**
 * In-process counters and latency summaries for /api/metrics. They reset on
 * restart, which is fine for a single-node reader; for a fleet, scrape every
 * replica and aggregate in Prometheus.
 */
const counters = new Map();
const timings = new Map();

export function incMetric(name, delta = 1) {
  counters.set(name, (counters.get(name) ?? 0) + delta);
}

export function observeMetric(name, ms) {
  const entry = timings.get(name) ?? { count: 0, sum: 0, max: 0 };
  entry.count += 1;
  entry.sum += ms;
  if (ms > entry.max) entry.max = ms;
  timings.set(name, entry);
}

export function snapshotMetrics() {
  return {
    counters: Object.fromEntries(counters),
    timings: Object.fromEntries(timings),
  };
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function renderPrometheus(dbStats, queue) {
  const lines = [];
  const push = (name, help, type, value, labels) => {
    if (!lines.some((line) => line.startsWith('# HELP ' + name))) {
      lines.push('# HELP ' + name + ' ' + help);
      lines.push('# TYPE ' + name + ' ' + type);
    }
    const labelText = labels
      ? '{' + Object.entries(labels).map(([k, v]) => k + '="' + escapeLabel(v) + '"').join(',') + '}'
      : '';
    lines.push(name + labelText + ' ' + value);
  };

  push('feedwire_up', 'Server is serving requests', 'gauge', 1);
  push('feedwire_items_total', 'Stories stored', 'gauge', dbStats.items ?? 0);
  push('feedwire_feeds_total', 'Feeds stored', 'gauge', dbStats.feeds ?? 0);
  push('feedwire_feeds_failing', 'Feeds whose last fetch failed', 'gauge', dbStats.failingFeeds ?? 0);
  push('feedwire_embeddings_pending', 'Stories waiting for an embedding', 'gauge', dbStats.embeddingPending ?? 0);
  push('feedwire_content_pending', 'Stories waiting for body embedding', 'gauge', dbStats.contentPending ?? 0);
  push('feedwire_queue_ready', 'Jobs waiting to run', 'gauge', queue.ready ?? 0);
  push('feedwire_queue_processing', 'Jobs currently running', 'gauge', queue.processing ?? 0);
  push('feedwire_queue_delayed', 'Jobs waiting to retry', 'gauge', queue.delayed ?? 0);
  push('feedwire_queue_dead', 'Jobs that exhausted their retries', 'gauge', queue.dead ?? 0);

  for (const [name, value] of Object.entries(counters)) {
    push('feedwire_events_total', 'Application events', 'counter', value, { event: name });
  }
  for (const [name, entry] of Object.entries(timings)) {
    push('feedwire_latency_ms_sum', 'Total latency in milliseconds', 'counter', entry.sum, { op: name });
    push('feedwire_latency_ms_count', 'Number of timed operations', 'counter', entry.count, { op: name });
  }
  return lines.join('\n') + '\n';
}
