// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { requireTestEnvVar } from './test-env.js';

describe('test env helpers', () => {
  test('given_missing_env_var_when_reading_required_value_then_error_is_thrown', () => {
    const previous = process.env.FG_TEST_REQUIRED_ENV;
    delete process.env.FG_TEST_REQUIRED_ENV;

    try {
      expect(() => requireTestEnvVar('FG_TEST_REQUIRED_ENV')).toThrow(
        'FG_TEST_REQUIRED_ENV environment variable is required for tests'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.FG_TEST_REQUIRED_ENV;
      } else {
        process.env.FG_TEST_REQUIRED_ENV = previous;
      }
    }
  });

  test('given_env_var_present_when_reading_required_value_then_value_is_returned', () => {
    const previous = process.env.FG_TEST_REQUIRED_ENV;
    process.env.FG_TEST_REQUIRED_ENV = 'http://127.0.0.1:1234';

    try {
      expect(requireTestEnvVar('FG_TEST_REQUIRED_ENV')).toBe('http://127.0.0.1:1234');
    } finally {
      if (previous === undefined) {
        delete process.env.FG_TEST_REQUIRED_ENV;
      } else {
        process.env.FG_TEST_REQUIRED_ENV = previous;
      }
    }
  });

  test('given_blank_env_var_when_reading_required_value_then_error_is_thrown', () => {
    const previous = process.env.FG_TEST_REQUIRED_ENV;
    process.env.FG_TEST_REQUIRED_ENV = '   ';

    try {
      expect(() => requireTestEnvVar('FG_TEST_REQUIRED_ENV')).toThrow(
        'FG_TEST_REQUIRED_ENV environment variable is required for tests'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.FG_TEST_REQUIRED_ENV;
      } else {
        process.env.FG_TEST_REQUIRED_ENV = previous;
      }
    }
  });
});
