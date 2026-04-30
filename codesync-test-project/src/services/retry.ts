export async function retry<T>(
  task: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
    }
  }
}

export async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    task()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
