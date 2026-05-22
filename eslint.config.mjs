import nextPlugin from 'eslint-config-next';

const config = [
  ...nextPlugin,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'public/**',
    ],
  },
  {
    // The React 19 plugin flags fetch-on-mount and read-localStorage-on-mount
    // patterns. They're legitimate "sync external system on mount" cases for
    // this codebase; downgrade to warn so they don't fail CI.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
