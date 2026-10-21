import { createApp } from './app.ts';

const app = createApp({ env: process.env });
const port = Number(app.locals.port) || 8787;
const links = (app.locals.links as string[] | undefined) ?? [`http://127.0.0.1:${port}`];
app.listen(port, '0.0.0.0', () => {
  for (const link of links) console.log(`GG Card is open at ${link}`);
});
