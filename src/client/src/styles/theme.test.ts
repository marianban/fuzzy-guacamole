import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const clientSourceDirectory = path.resolve(import.meta.dirname, '..');

async function findCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findCssFiles(entryPath)
        : Promise.resolve(entry.name.endsWith('.css') ? [entryPath] : []);
    })
  );

  return files.flat();
}

describe('typography theme', () => {
  test('given_client_styles_when_defining_font_sizes_then_12px_is_the_minimum', async () => {
    const cssFiles = await findCssFiles(clientSourceDirectory);
    const violations: string[] = [];

    for (const cssFile of cssFiles) {
      const css = await readFile(cssFile, 'utf8');

      for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        if (Number(match[1]) < 12) {
          violations.push(
            `${path.relative(clientSourceDirectory, cssFile)} uses ${match[1]}px font size`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
