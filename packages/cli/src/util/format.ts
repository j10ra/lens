/** Print data as JSON (--json flag) or formatted markdown to stdout */
export function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else if (typeof data === "string") {
    process.stdout.write(`${data}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  }
}

export function error(msg: string): void {
  process.stderr.write(`Error: ${msg}\n`);
}
