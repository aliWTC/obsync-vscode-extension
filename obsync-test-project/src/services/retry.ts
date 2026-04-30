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
