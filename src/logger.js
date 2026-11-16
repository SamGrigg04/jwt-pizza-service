const config = require("./config");
const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

function log(level, type, logData) {
  const event = {
    streams: [
      {
        stream: { component: config.logging.source, type: type, level: level },
        values: [[(Date.now() * 1000000).toString(), sanitize(logData)]],
      },
    ],
  };
  sendLogToGrafana(event);
}

function sanitize(logData) {
  let s = JSON.stringify(logData);
  s = s.replace(/"password":\s*"[^"]*"/g, '"password":"*****"');
  s = s.replace(/password\s*=\s*'[^']*'/g, "password='*****'");
  s = s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "*****");
  s = s.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "*****");
  return s;
}

function statusToLogLevel(statusCode) {
  if (statusCode >= 500) {
    return "error";
  }
  if (statusCode >= 400) {
    return "warn";
  }
  return "info";
}

function httpLogger(req, res, next) {
  const send = res.send;
  res.send = (resBody) => {
    let loggedBody = resBody;
    try {
      loggedBody = JSON.parse(resBody);
    } catch {
      // not JSON, log it as-is
    }
    const logData = {
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      has_auth_header: !!req.headers.authorization,
      user: req.user?.id,
      request_body: req.body,
      response_body: loggedBody,
    };
    log(statusToLogLevel(res.statusCode), "http", logData);
    res.send = send;
    return res.send(resBody);
  };
  requestContext.run({ req }, next);
}

function dbLogger(sql) {
  const req = requestContext.getStore()?.req;
  log("info", "db", { user: req?.user?.id, sql });
}

function factoryLogger(user, requestBody, responseBody, ok) {
  log( ok ? "info" : "error", "factory", {user: user?.id, requestBody, responseBody});
}

function unhandledErrorLogger(err) {
  log(statusToLogLevel(err.statusCode ?? 500), "unhandledError", {message: err.message, stack: err.stack, status_code: err.statusCode } )
}

function sendLogToGrafana(event) {
  if (process.env.NODE_ENV === "test") return;
  const body = JSON.stringify(event);
  fetch(`${config.logging.endpointUrl}`, {
    method: "post",
    body: body,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
    },
  })
    .then((res) => {
      if (!res.ok) {
        res.text().then((text) => {
          console.error(
            `Failed to push logs data to Grafana: ${text}\n${body}`,
          );
        });
      }
    })
    .catch((error) => {
      console.error("Error pushing logs:", error);
    });
}

module.exports = { log, httpLogger, dbLogger, factoryLogger, unhandledErrorLogger };
