import log4js from "log4js";

log4js.configure({
  appenders: {
    out: {
      type: "stdout",
      layout: {
        type: "pattern",
        // %[ ... %] wraps the section in ANSI colour based on log level
        pattern: "%[[%d{dd-MM-yyyy hh:mm:ss}] %p %c%] %m",
      },
    },
  },
  categories: {
    default:   { appenders: ["out"], level: "info" },
    server:    { appenders: ["out"], level: "info" },
    upload:    { appenders: ["out"], level: "info" },
    ocr:       { appenders: ["out"], level: "info" },
    prepare:   { appenders: ["out"], level: "info" },
    batch:     { appenders: ["out"], level: "info" },
    translate: { appenders: ["out"], level: "info" },
    textless:  { appenders: ["out"], level: "info" },
    python:    { appenders: ["out"], level: "info" },
    delete:    { appenders: ["out"], level: "info" },
  },
});

export const getLogger = (category: string) => log4js.getLogger(category);

/**
 * Forward a single Python stderr line through the given logger.
 * Lines are expected to carry an optional level prefix:
 *   [INFO] <message>  → logger.info
 *   [WARN] <message>  → logger.warn
 *   [ERROR] <message> → logger.error
 *   <untagged>        → logger.info
 * Empty / whitespace-only lines are silently skipped.
 */
export const forwardPythonLine = (logger: log4js.Logger, line: string): void => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("[ERROR] ")) {
    logger.error(trimmed.slice(8));
  } else if (trimmed.startsWith("[WARN] ")) {
    logger.warn(trimmed.slice(7));
  } else if (trimmed.startsWith("[INFO] ")) {
    logger.info(trimmed.slice(7));
  } else {
    logger.info(trimmed);
  }
};

/**
 * Forward all captured Python stderr through the given logger.
 * Splits the buffer by newline and delegates each line to forwardPythonLine.
 */
export const forwardPythonLogs = (logger: log4js.Logger, stderr: string): void => {
  stderr.split("\n").forEach((line) => forwardPythonLine(logger, line));
};
