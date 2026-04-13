#!/usr/bin/env python3
"""
Memory CLI — provides add / search / get-all / delete operations over Mem0.

Called by the TypeScript layer as a subprocess:
  python -m memory.cli add    --content "..."   [--agent-id "..."] [--user-id "..."]
  python -m memory.cli search --query "..."     [--agent-id "..."] [--user-id "..."] [--limit N]
  python -m memory.cli get-all                  [--agent-id "..."] [--user-id "..."]
  python -m memory.cli delete --memory-id "..."

All results are written as JSON to stdout.
Diagnostic messages and errors are written to stderr.
"""

import argparse
import json
import sys


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="memory.cli",
        description="Mem0 memory CLI for the comic translator",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── add ──────────────────────────────────────────────────────────────────
    add_p = sub.add_parser("add", help="Store a new memory")
    add_p.add_argument("--content", required=True, help="Text to remember")
    add_p.add_argument("--agent-id", default="comic_translator", dest="agent_id")
    add_p.add_argument("--user-id", default=None, dest="user_id")

    # ── search ───────────────────────────────────────────────────────────────
    search_p = sub.add_parser("search", help="Search for relevant memories")
    search_p.add_argument("--query", required=True)
    search_p.add_argument("--agent-id", default="comic_translator", dest="agent_id")
    search_p.add_argument("--user-id", default=None, dest="user_id")
    search_p.add_argument("--limit", type=int, default=5)

    # ── get-all ──────────────────────────────────────────────────────────────
    get_all_p = sub.add_parser("get-all", help="Retrieve all stored memories")
    get_all_p.add_argument("--agent-id", default="comic_translator", dest="agent_id")
    get_all_p.add_argument("--user-id", default=None, dest="user_id")

    # ── delete ───────────────────────────────────────────────────────────────
    delete_p = sub.add_parser("delete", help="Delete a memory by ID")
    delete_p.add_argument("--memory-id", required=True, dest="memory_id")

    return parser


def _shared_kwargs(args: argparse.Namespace) -> dict:
    """Build the common keyword arguments for Mem0 calls."""
    kwargs: dict = {"agent_id": args.agent_id}
    if getattr(args, "user_id", None):
        kwargs["user_id"] = args.user_id
    return kwargs


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    try:
        from memory.service import get_memory
    except ImportError as exc:
        print(
            f"[ERROR] Missing dependency: {exc}. Run `bun run memory:bootstrap` first.",
            file=sys.stderr,
        )
        sys.exit(2)

    mem = get_memory()

    if args.command == "add":
        result = mem.add(args.content, **_shared_kwargs(args))
        print(json.dumps(result, ensure_ascii=False, default=str))

    elif args.command == "search":
        kwargs = _shared_kwargs(args)
        kwargs["limit"] = args.limit
        result = mem.search(args.query, **kwargs)
        print(json.dumps(result, ensure_ascii=False, default=str))

    elif args.command == "get-all":
        result = mem.get_all(**_shared_kwargs(args))
        print(json.dumps(result, ensure_ascii=False, default=str))

    elif args.command == "delete":
        mem.delete(args.memory_id)
        print(json.dumps({"deleted": True, "memory_id": args.memory_id}))


if __name__ == "__main__":
    main()
