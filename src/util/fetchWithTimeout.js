// fetch() never times out on its own; every outbound call here must, because
// a subtitle request is waiting on the other side.

export function fetchWithTimeout(url, { timeoutMs = 10_000, ...init } = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
