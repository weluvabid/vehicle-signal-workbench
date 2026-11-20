import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const fixtureRoot = join(process.cwd(), 'tests/fixtures');

async function findExpectedFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findExpectedFiles(path)));
    else if (entry.name === 'expected.json') files.push(path);
  }

  return files;
}

test('CSV regression fixture corpus has complete and valid scenario metadata', async () => {
  const expectedFiles = await findExpectedFiles(fixtureRoot);
  assert.equal(expectedFiles.length, 21, '18 scenarios plus the three timestamp-encoding variants');

  for (const expectedPath of expectedFiles) {
    const metadata = JSON.parse(await readFile(expectedPath, 'utf8')) as {
      schemaVersion?: number;
      import?: { status?: string; timestampColumn?: string; timestampEncoding?: string };
      assertions?: string[];
      variants?: string[];
    };
    const scenarioDirectory = relative(fixtureRoot, dirname(expectedPath));
    assert.equal(metadata.schemaVersion, 1, `${scenarioDirectory}: supported schema version`);
    assert.ok(
      (metadata.assertions?.length ?? 0) > 0 || (metadata.variants?.length ?? 0) > 0,
      `${scenarioDirectory}: scenario must describe assertions or variants`,
    );

    if (metadata.variants) {
      assert.deepEqual([...metadata.variants].sort(), [
        'iso-8601',
        'unix-milliseconds',
        'unix-seconds',
      ]);
      continue;
    }

    assert.ok(
      ['accepted', 'rejected'].includes(metadata.import?.status ?? ''),
      `${scenarioDirectory}: import status`,
    );
    assert.equal(
      metadata.import?.timestampColumn,
      'Timestamp',
      `${scenarioDirectory}: timestamp column`,
    );
    assert.ok(metadata.import?.timestampEncoding, `${scenarioDirectory}: timestamp encoding`);

    for (const filename of ['reference.csv', 'comparison.csv']) {
      const filePath = join(fixtureRoot, scenarioDirectory, filename);
      const fileStats = await stat(filePath);
      assert.ok(
        fileStats.isFile() && fileStats.size > 0,
        `${scenarioDirectory}: ${filename} exists and is non-empty`,
      );
    }
  }
});
