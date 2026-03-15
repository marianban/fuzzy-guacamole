export function requireTestEnvVar(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `${name} environment variable is required for tests. Configure it in .env for the test runner.`
    );
  }
  return value;
}
