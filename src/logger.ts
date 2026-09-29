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
    delete:    { appenders: ["out"], level: "info" },
  },
});

export const getLogger = (category: string) => log4js.getLogger(category);
