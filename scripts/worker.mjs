// Run independently of the web server. Pending jobs and leases live in the database.
const origin = process.env.APP_URL;
const secret = process.env.WORKER_SECRET;
if (!origin || !secret)
  throw new Error(
    'Set APP_URL and WORKER_SECRET before starting the transcription worker.',
  );
const url = new URL('/api/jobs', origin);
if (
  url.protocol !== 'https:' &&
  !['localhost', '127.0.0.1'].includes(url.hostname)
)
  throw new Error('The worker requires HTTPS except on localhost.');
let running = true;
process.on('SIGINT', () => {
  running = false;
});
process.on('SIGTERM', () => {
  running = false;
});
while (running) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(150000),
    });
    if (!response.ok)
      console.error(`Worker request failed: ${response.status}`);
    else {
      const result = await response.json();
      if (result.taskId)
        console.log(
          `Task ${result.taskId}: ${result.success ? 'transcribed' : 'retry scheduled or failed'}`,
        );
    }
  } catch (error) {
    console.error('Worker could not reach the application:', error.message);
  }
  if (running) await new Promise((resolve) => setTimeout(resolve, 5000));
}
