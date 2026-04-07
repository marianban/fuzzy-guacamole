import path from 'node:path';

const generationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveGenerationArtifactPath(
  basePath: string,
  generationId: string,
  ...segments: string[]
): string {
  assertValidGenerationId(generationId);
  return path.join(basePath, generationId, ...segments);
}

function assertValidGenerationId(generationId: string): void {
  if (
    !generationIdPattern.test(generationId) ||
    path.basename(generationId) !== generationId
  ) {
    throw new Error(`Invalid generation id "${generationId}" for filesystem operation.`);
  }
}
