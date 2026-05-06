/** Conventional Commits (https://www.conventionalcommits.org). */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'style', 'revert'],
    ],
    'subject-case': [0],
  },
};
