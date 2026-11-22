// Structured one-line logs plus a small in-memory ring, so /status can show
// what happened recently without opening Railway's log viewer.

const MAX_EVENTS = 80;
const events = [];

export function logEvent(kind, data = {}) {
  const event = { at: new Date().toISOString(), kind, ...data };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  console.log(JSON.stringify(event));
}

/** Newest first. */
export const recentEvents = () => [...events].reverse();
