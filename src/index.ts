import { createApp } from './app.ts';

const app = createApp({ env: process.env });
const port = Number(app.locals.port) || 8787;
app.listen(port, () => {
  console.log(`OfflineRich card is running at http://localhost:${port}`);
});
