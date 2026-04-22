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
            'no-unused-vars':  ['warn', { argsIgnorePattern: '^_' }],
            'no-console':       'off',
            'semi':            ['error', 'always'],
            'eqeqeq':          ['error', 'always'],
            'no-var':           'error',
            'prefer-const':    'warn',
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
    },
    {
        ignores: ['node_modules/**', 'public/**'],
    },
];
