import { access, readFile } from 'node:fs/promises';

export async function loadPresetJsonFile(filePath: string): Promise<unknown> {
  let content: string;
  try {
    await access(filePath);
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to read preset file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Preset file ${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
