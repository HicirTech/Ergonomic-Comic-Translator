"""Colorized logging for the textless pipeline."""

import logging
import colorama


ROOT_TAG = "textless"


class _Formatter(logging.Formatter):
    def formatMessage(self, record: logging.LogRecord) -> str:
        if record.levelno >= logging.ERROR:
            self._style._fmt = f"{colorama.Fore.RED}%(levelname)s:{colorama.Fore.RESET} [%(name)s] %(message)s"
        elif record.levelno >= logging.WARN:
            self._style._fmt = f"{colorama.Fore.YELLOW}%(levelname)s:{colorama.Fore.RESET} [%(name)s] %(message)s"
        else:
            self._style._fmt = "[%(name)s] %(message)s"
        return super().formatMessage(record)


class _Filter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not record.name.startswith(ROOT_TAG):
            return False
        record.name = record.name.removeprefix(ROOT_TAG + ".")
        return super().filter(record)


_root = logging.getLogger(ROOT_TAG)


def init_logging() -> None:
    """Initialize logging with colorized formatter and namespace filter."""
    logging.basicConfig(level=logging.INFO)
    for handler in logging.root.handlers:
        handler.setFormatter(_Formatter())
        handler.addFilter(_Filter())


def get_logger(name: str) -> logging.Logger:
    """Get a child logger under the textless namespace."""
    return _root.getChild(name)
