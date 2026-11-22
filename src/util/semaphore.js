// Limits how many async tasks run at once. "high" priority tasks jump the
// queue: the episode someone is waiting for must not sit behind a background
// pre-translation of the next episode.

export function createSemaphore(limit) {
  let active = 0;
  const high = [];
  const low = [];

  const drain = () => {
    while (active < limit && (high.length || low.length)) {
      const { task, resolve, reject } = high.length ? high.shift() : low.shift();
      active++;
      task().then(resolve, reject).finally(() => {
        active--;
        drain();
      });
    }
  };

  return (task, { priority = 'low' } = {}) =>
    new Promise((resolve, reject) => {
      (priority === 'high' ? high : low).push({ task, resolve, reject });
      drain();
    });
}
