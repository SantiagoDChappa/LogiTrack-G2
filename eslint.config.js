const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType:  'commonjs',
            globals: {
                require:    'readonly',
                module:     'readonly',
                exports:    'readonly',
                __dirname:  'readonly',
                __filename: 'readonly',
                process:    'readonly',
                console:    'readonly',
            },
        },
        rules: {
            // ── Calidad ──────────────────────────────────────────────────────
            'no-unused-vars':            ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console':                ['warn', { allow: ['warn', 'error'] }],
            'semi':                      ['error', 'always'],
            'eqeqeq':                    ['error', 'always'],
            'no-var':                    'error',
            'prefer-const':              'error',
            'no-duplicate-imports':      'error',
            'no-return-await':           'warn',
            // ── Seguridad ────────────────────────────────────────────────────
            'no-eval':                   'error',
            'no-implied-eval':           'error',
            'no-new-func':               'error',
            'no-script-url':             'error',
            // ── Async / errores ──────────────────────────────────────────────
            'no-async-promise-executor': 'error',
            'require-await':             'warn',
            // ── Estilo ───────────────────────────────────────────────────────
            'curly':                     ['error', 'all'],
            'no-lonely-if':              'error',
        },
    },
    {
        files: ['Test/**/*.test.js'],
        languageOptions: {
            globals: {
                jest:        'readonly',
                describe:    'readonly',
                test:        'readonly',
                it:          'readonly',
                expect:      'readonly',
                beforeAll:   'readonly',
                beforeEach:  'readonly',
                afterAll:    'readonly',
                afterEach:   'readonly',
            },
        },
        rules: {
            'no-console':    'off',
            'require-await': 'off',
        },
    },
    {
        ignores: ['node_modules/**', 'public/**', 'client/**', 'ml/**'],
    },
];
