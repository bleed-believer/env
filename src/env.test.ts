import { describe, it, before, after } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EnvFake } from './env.fake.js';
import { Env } from './env.js';

const ENV_PATH = '/project/.env';

describe('Env class', () => {
    describe('Reading from the file', () => {
        it('Read variables from the file when it exists', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost\nAPP_PORT=8080' });
            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST', required: true },
                port: { rawName: 'APP_PORT', required: true }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('port'), '8080');
            t.assert.ok(fake.readPaths.length > 0);
            t.assert.ok(fake.readPaths.every(x => x === ENV_PATH));
        });

        it('The file takes precedence over process.env', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file' },
                { APP_HOST: 'from-process' }
            );

            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST', required: true }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-file');
        });

        it('An empty value in the file still takes precedence over process.env', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=' },
                { APP_HOST: 'from-process' }
            );

            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST' }
            }, fake);

            t.assert.strictEqual(env.get('host'), '');
        });

        it('Parse the dotenv syntax (comments, blank lines and quotes)', (t: it.TestContext) => {
            const fake = new EnvFake({
                [ENV_PATH]: [
                    '# Database settings',
                    '',
                    'DB_HOST=localhost',
                    'DB_USER="admin user"',
                    `DB_PASS='s3cr3t#123'`
                ].join('\n')
            });

            const env = new Env(ENV_PATH, {
                host: { rawName: 'DB_HOST', required: true },
                user: { rawName: 'DB_USER', required: true },
                pass: { rawName: 'DB_PASS', required: true }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('user'), 'admin user');
            t.assert.strictEqual(env.get('pass'), 's3cr3t#123');
        });

        it('Look up the variable by its "rawName", not by its key', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'port=1111\nAPP_PORT=2222' });
            const env = new Env(ENV_PATH, {
                port: { rawName: 'APP_PORT', required: true }
            }, fake);

            t.assert.strictEqual(env.get('port'), '2222');
        });

        it('Only read the file located at the given path', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file' },
                { APP_HOST: 'from-process' }
            );

            const env = new Env('/another/.env', {
                host: { rawName: 'APP_HOST', required: true }
            }, fake);

            t.assert.strictEqual(env.path, '/another/.env');
            t.assert.strictEqual(env.get('host'), 'from-process');
            t.assert.ok(fake.readPaths.every(x => x === '/another/.env'));
        });
    });

    describe('Fallback to process.env', () => {
        it('Read from process.env when the file does not exist', (t: it.TestContext) => {
            const fake = new EnvFake({}, {
                APP_HOST: 'localhost',
                APP_PORT: '8080'
            });

            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST', required: true },
                port: { rawName: 'APP_PORT', required: true }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('port'), '8080');

            // The file must be attempted before falling back
            t.assert.ok(fake.readPaths.length > 0);
            t.assert.ok(fake.readPaths.every(x => x === ENV_PATH));
        });

        it('Read from process.env the variables missing in an existing file', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file' },
                { APP_HOST: 'from-process', APP_PORT: '8080' }
            );

            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST', required: true },
                port: { rawName: 'APP_PORT', required: true }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-file');
            t.assert.strictEqual(env.get('port'), '8080');
        });

        it('Return undefined for an optional variable missing in both sources', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost' });
            const env = new Env(ENV_PATH, {
                port: { rawName: 'APP_PORT' }
            }, fake);

            t.assert.strictEqual(env.get('port'), undefined);
        });

        it('Throw for a required variable missing in both sources', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=localhost' },
                { APP_PORT: '8080' }
            );

            const env = new Env(ENV_PATH, {
                secret: { rawName: 'APP_SECRET', required: true }
            }, fake);

            t.assert.throws(() => env.get('secret'), {
                message: `The environment variable "APP_SECRET" is required, but isn't set`
            });
        });

        it('Do not fall back when the file fails for a reason other than not existing', (t: it.TestContext) => {
            const error = Object.assign(
                new Error(`EACCES: permission denied, open '${ENV_PATH}'`),
                { code: 'EACCES' }
            );

            const fake = new EnvFake(
                { [ENV_PATH]: error },
                { APP_HOST: 'from-process' }
            );

            const env = new Env(ENV_PATH, {
                host: { rawName: 'APP_HOST', required: true }
            }, fake);

            t.assert.throws(() => env.get('host'), error);
        });
    });

    describe('Callbacks', () => {
        it('Transform a value read from the file', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_PORT=8080' },
                { APP_PORT: '3000' }
            );

            const env = new Env(ENV_PATH, {
                port: { rawName: 'APP_PORT', required: true, callback: v => parseInt(v, 10) }
            }, fake);

            t.assert.strictEqual(env.get('port'), 8080);
        });

        it('Transform a value read from process.env', (t: it.TestContext) => {
            const fake = new EnvFake({}, { APP_DEBUG: 'true' });
            const env = new Env(ENV_PATH, {
                debug: { rawName: 'APP_DEBUG', required: true, callback: v => v === 'true' }
            }, fake);

            t.assert.strictEqual(env.get('debug'), true);
        });

        it('Pass undefined to the callback of a missing optional variable', (t: it.TestContext) => {
            const fake = new EnvFake();
            const env = new Env(ENV_PATH, {
                port: { rawName: 'APP_PORT', callback: v => parseInt(v ?? '3000', 10) }
            }, fake);

            t.assert.strictEqual(env.get('port'), 3000);
        });

        it('Do not execute the callback when a required variable is missing', (t: it.TestContext) => {
            let calls = 0;
            const fake = new EnvFake();
            const env = new Env(ENV_PATH, {
                port: {
                    rawName: 'APP_PORT',
                    required: true,
                    callback: v => {
                        calls++;
                        return parseInt(v, 10);
                    }
                }
            }, fake);

            t.assert.throws(() => env.get('port'), /APP_PORT/);
            t.assert.strictEqual(calls, 0);
        });
    });

    describe('Default dependencies (real file system and process.env)', () => {
        const FILE_VAR = 'BLEED_BELIEVER_ENV_TEST';
        let dir: string;
        let path: string;

        before(async () => {
            dir = await mkdtemp(join(tmpdir(), 'bleed-believer-env-'));
            path = join(dir, '.env');
            await writeFile(path, `${FILE_VAR}=from-file`, 'utf-8');
            process.env[FILE_VAR] = 'from-process';
        });

        after(async () => {
            delete process.env[FILE_VAR];
            await rm(dir, { recursive: true, force: true });
        });

        it('Read from a real file when it exists', (t: it.TestContext) => {
            const env = new Env(path, {
                value: { rawName: FILE_VAR, required: true }
            });

            t.assert.strictEqual(env.get('value'), 'from-file');
        });

        it('Read from the real process.env when the file does not exist', (t: it.TestContext) => {
            const env = new Env(join(dir, 'missing.env'), {
                value: { rawName: FILE_VAR, required: true }
            });

            t.assert.strictEqual(env.get('value'), 'from-process');
        });

        it('Throw the real error when the path is not a readable file', (t: it.TestContext) => {
            const env = new Env(dir, {
                value: { rawName: FILE_VAR, required: true }
            });

            t.assert.throws(() => env.get('value'), { code: 'EISDIR' });
        });
    });
});
