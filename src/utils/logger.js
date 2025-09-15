const { randomUUID } = require('crypto');

function requestLogger() {
  return (req, res, next) => {
    const id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', id);
    req.id = id;
    const start = Date.now();

    res.on('finish', () => {
      const ms = Date.now() - start;
      const log = {
        level: 'info',
        msg: 'http',
        id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
      };
      
    });

    next();
  };
}

module.exports = { requestLogger };

