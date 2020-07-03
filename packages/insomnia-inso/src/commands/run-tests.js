// @flow

import { generate, runTestsCli } from 'insomnia-testing';
import type { GlobalOptions } from '../util';
import { loadDb } from '../db';
import { getEnvironmentFromIdentifier, getTestSuiteFromIdentifier } from '../db/prompts';
import type { UnitTest, UnitTestSuite } from '../db/types';

export const TestReporterEnum = {
  dot: 'dot',
  list: 'list',
  spec: 'spec',
  min: 'min',
  progress: 'progress',
};

export type RunTestsOptions = GlobalOptions & {
  env?: string,
  reporter: $Keys<typeof TestReporterEnum>,
  bail?: boolean,
  keepFile?: boolean,
};

function validateOptions({ reporter }: RunTestsOptions): boolean {
  if (reporter && !TestReporterEnum[reporter]) {
    const reporterTypes = Object.keys(TestReporterEnum).join(', ');
    console.log(`Reporter "${reporter}" not unrecognized. Options are [${reporterTypes}].`);
    return false;
  }

  return true;
}

const createTestSuite = (dbSuite: UnitTestSuite, dbTests: Array<UnitTest>) => ({
  name: dbSuite.name,
  tests: dbTests.map(({ name, code, requestId }) => ({ name, code, requestId })),
});

export async function runInsomniaTests(
  identifier?: string,
  options: RunTestsOptions,
): Promise<boolean> {
  if (!validateOptions(options)) {
    return false;
  }

  const { reporter, bail, keepFile, appDataDir, workingDir, env } = options;

  const db = await loadDb({ workingDir, appDataDir });

  // Find suite
  const suite = await getTestSuiteFromIdentifier(db, identifier);

  if (!suite) {
    console.log('No test suite identified.');
    return false;
  }

  // Find tests in suite
  const tests = db.UnitTest.filter(t => t.parentId === suite._id);

  if (!tests.length) {
    console.log(`Test suite "${suite.name}" contains no tests.`);
    return false;
  }

  // Find environment
  const workspaceId = suite.parentId;
  const environment = await getEnvironmentFromIdentifier(db, workspaceId, env);

  if (!environment) {
    console.log('No environment found.');
    return false;
  }

  const testFileContents = await generate([createTestSuite(suite, tests)]);

  const { getSendRequestCallbackMemDb } = require('insomnia-send-request');
  const sendRequest = await getSendRequestCallbackMemDb(environment._id, db);
  return await runTestsCli(testFileContents, { reporter, bail, keepFile, sendRequest });
}