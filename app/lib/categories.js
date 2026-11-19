const CATEGORY_STYLES = {
  technology: {
    dot: 'bg-[var(--cat-technology)]',
    badge:
      'border-transparent bg-[var(--cat-technology)]/12 text-[var(--cat-technology)]',
    active:
      'border-[var(--cat-technology)] bg-[var(--cat-technology)]/12 text-[var(--cat-technology)]',
  },
  security: {
    dot: 'bg-[var(--cat-security)]',
    badge:
      'border-transparent bg-[var(--cat-security)]/12 text-[var(--cat-security)]',
    active:
      'border-[var(--cat-security)] bg-[var(--cat-security)]/12 text-[var(--cat-security)]',
  },
  science: {
    dot: 'bg-[var(--cat-science)]',
    badge: 'border-transparent bg-[var(--cat-science)]/12 text-[var(--cat-science)]',
    active:
      'border-[var(--cat-science)] bg-[var(--cat-science)]/12 text-[var(--cat-science)]',
  },
  business: {
    dot: 'bg-[var(--cat-business)]',
    badge:
      'border-transparent bg-[var(--cat-business)]/12 text-[var(--cat-business)]',
    active:
      'border-[var(--cat-business)] bg-[var(--cat-business)]/12 text-[var(--cat-business)]',
  },
  world: {
    dot: 'bg-[var(--cat-world)]',
    badge: 'border-transparent bg-[var(--cat-world)]/12 text-[var(--cat-world)]',
    active:
      'border-[var(--cat-world)] bg-[var(--cat-world)]/12 text-[var(--cat-world)]',
  },
  culture: {
    dot: 'bg-[var(--cat-culture)]',
    badge: 'border-transparent bg-[var(--cat-culture)]/12 text-[var(--cat-culture)]',
    active:
      'border-[var(--cat-culture)] bg-[var(--cat-culture)]/12 text-[var(--cat-culture)]',
  },
  health: {
    dot: 'bg-[var(--cat-health)]',
    badge: 'border-transparent bg-[var(--cat-health)]/12 text-[var(--cat-health)]',
    active:
      'border-[var(--cat-health)] bg-[var(--cat-health)]/12 text-[var(--cat-health)]',
  },
  design: {
    dot: 'bg-[var(--cat-design)]',
    badge: 'border-transparent bg-[var(--cat-design)]/12 text-[var(--cat-design)]',
    active:
      'border-[var(--cat-design)] bg-[var(--cat-design)]/12 text-[var(--cat-design)]',
  },
  gaming: {
    dot: 'bg-[var(--cat-gaming)]',
    badge: 'border-transparent bg-[var(--cat-gaming)]/12 text-[var(--cat-gaming)]',
    active:
      'border-[var(--cat-gaming)] bg-[var(--cat-gaming)]/12 text-[var(--cat-gaming)]',
  },
  other: {
    dot: 'bg-[var(--cat-other)]',
    badge: 'border-transparent bg-[var(--cat-other)]/12 text-[var(--cat-other)]',
    active: 'border-[var(--cat-other)] bg-[var(--cat-other)]/12 text-[var(--cat-other)]',
  },
};

const FALLBACK = {
  dot: 'bg-muted-foreground',
  badge: 'border-transparent bg-muted text-muted-foreground',
  active: 'border-border bg-accent text-foreground',
};

export function categoryDot(id) {
  return (CATEGORY_STYLES[id] ?? FALLBACK).dot;
}

export function categoryBadge(id) {
  return (CATEGORY_STYLES[id] ?? FALLBACK).badge;
}

export function categoryActive(id) {
  return id ? (CATEGORY_STYLES[id] ?? FALLBACK).active : '';
}
