import argparse
import json
import re
import subprocess
import sys


STEP_RE = re.compile(r"^started step (\d+)")
STATE_RE = re.compile(r"^Current state is (.*)")
ACTION_RE = re.compile(r"^The chosen action is (.*)")
TIME_RE = re.compile(r"^The time of the plan so far: (.*)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a domain command and record step data as JSONL."
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write JSONL step data (e.g., ui/steps.jsonl).",
    )
    parser.add_argument(
        "--no-echo",
        action="store_true",
        help="Do not echo the child process output to stdout.",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to run (use -- before the command).",
    )
    args = parser.parse_args()
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("Missing command. Use -- before the command to run.")
    return args


def main() -> int:
    args = parse_args()
    current = None

    def flush_current(output_file):
        nonlocal current
        if current:
            output_file.write(json.dumps(current) + "\n")
            output_file.flush()
            current = None

    with open(args.output, "w", encoding="utf-8") as output_file:
        process = subprocess.Popen(
            args.command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        assert process.stdout is not None
        for line in process.stdout:
            if not args.no_echo:
                sys.stdout.write(line)
                sys.stdout.flush()

            match = STEP_RE.match(line)
            if match:
                flush_current(output_file)
                current = {
                    "step": int(match.group(1)),
                    "state": None,
                    "action": None,
                    "time": None,
                }
                continue

            if current is None:
                continue

            match = STATE_RE.match(line)
            if match:
                current["state"] = match.group(1)
                continue

            match = ACTION_RE.match(line)
            if match:
                current["action"] = match.group(1)
                continue

            match = TIME_RE.match(line)
            if match:
                current["time"] = match.group(1)
                flush_current(output_file)
                continue

        flush_current(output_file)
        return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
