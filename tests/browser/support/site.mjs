// The web every check visits: Chrome maps all host names to this local
// server (browser.mjs), so "www.shop.test" or "larkspur.example" is a page
// that names itself. Nothing leaves the machine.
import { createServer } from 'node:http';

/** Starts the test site; `url(host, path)` gives an address on it. */
export async function startSite() {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    const name = `${request.headers.host ?? ''}${request.url ?? ''}`.replace(/[<>&]/g, '');
    response.end(`<!doctype html><title>${name}</title><h1>${name}</h1>`);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    url: (host, path = '/') => `http://${host}:${port}${path}`,
    close: () => new Promise((done) => server.close(done)),
  };
}
