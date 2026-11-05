export function splitInlineValues(argv: string[]): string[] {
  return argv.flatMap((arg) => {
    const equals = arg.indexOf("=");
    return arg.startsWith("--") && equals > 0 ? [arg.slice(0, equals), arg.slice(equals + 1)] : [arg];
  });
}

export const wantsHelp = (argv: string[]): boolean => argv.includes("--help") || argv.includes("-h");

export function handleNoArgs(command: string, usage: string, argv: string[]): "run" | "done" {
  if (wantsHelp(argv)) {
    console.log(usage);
    return "done";
  }
  if (argv.length > 0) {
    console.error(`${command}: unknown argument ${argv[0] ?? ""}. Run "npm run ${command} -- --help" for usage.`);
    process.exit(1);
  }
  return "run";
}
