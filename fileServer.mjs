import { promises as fs } from 'fs';
import path from 'path';

async function serveFile(request, response) {
  function statusCodeResponse(code, value, type) {
      response.writeHead(code, { 'Content-Type': `${type}` });
      response.write(value);
      response.end();
  }

  const { url } = request;
  const filePath = '.' + url;

  try {
    let fileContent = await fs.readFile(filePath, 'utf-8');
    let contentType = getContentType(filePath);

    statusCodeResponse(200, fileContent, contentType)

  } catch (error) {
    console.error(error);

    if (error.code === 'ENOENT') {
      statusCodeResponse(404, "404 Not Found", "text/plain")
    } else {
      statusCodeResponse(500, "Internal Server Error", "text/plain")
    }
  }
}

function getContentType(filePath) {
  let extname = path.extname(filePath);
  switch (extname) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'text/javascript';
    default:
      return 'text/plain';
  }
}

export { serveFile };