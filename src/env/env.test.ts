import type { EnvRequiredVariable, EnvVariables, EnvOptions } from './interfaces/index.js';

import { describe, it, before, after } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EnvFake } from './env.fake.js';
import { Env } from './env.js';

const ENV_PATH = '/project/.env';

// "true" only when both types are identical ("unknown" and "any" included)
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

describe('Env class', () => {
    describe('Reading from the file', () => {
        it('Read variables from the file when it exists', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost\nAPP_PORT=8080' });
            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true },
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('port'), '8080');
            t.assert.ok(fake.readPaths.length > 0);
            t.assert.ok(fake.readPaths.every(x => x === ENV_PATH));
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
                variables: {
                    host: { rawName: 'DB_HOST', required: true },
                    user: { rawName: 'DB_USER', required: true },
                    pass: { rawName: 'DB_PASS', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('user'), 'admin user');
            t.assert.strictEqual(env.get('pass'), 's3cr3t#123');
        });

        it('Look up the variable by its "rawName", not by its key', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'port=1111\nAPP_PORT=2222' });
            const env = new Env(ENV_PATH, {
                variables: {
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('port'), '2222');
        });

        it('Ignore the byte order mark at the start of the file', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: '\uFEFFAPP_HOST=from-file\nAPP_PORT=8080' });
            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true },
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-file');
            t.assert.strictEqual(env.get('port'), '8080');
        });

        it('Only read the file located at the given path', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=from-file' });
            const env = new Env('/another/.env', {
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            }, fake);

            t.assert.strictEqual(env.path, '/another/.env');
            t.assert.strictEqual(env.get('host'), undefined);
            t.assert.ok(fake.readPaths.length > 0);
            t.assert.ok(fake.readPaths.every(x => x === '/another/.env'));
        });
    });

    describe('Precedence of process.env', () => {
        it('process.env takes precedence over the file', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file' },
                { APP_HOST: 'from-process' }
            );

            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-process');
        });

        it('An empty value in process.env still takes precedence over the file', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file' },
                { APP_HOST: '' }
            );

            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), '');
        });

        it('Do not read the file when process.env has the value', (t: it.TestContext) => {
            const error = Object.assign(
                new Error(`EACCES: permission denied, open '${ENV_PATH}'`),
                { code: 'EACCES' }
            );

            const fake = new EnvFake({ [ENV_PATH]: error }, { APP_HOST: 'from-process' });
            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-process');
            t.assert.strictEqual(fake.readPaths.length, 0);
        });

        it('Read from process.env when the file does not exist', (t: it.TestContext) => {
            const fake = new EnvFake({}, {
                APP_HOST: 'localhost',
                APP_PORT: '8080'
            });

            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true },
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('port'), '8080');
        });

        it('Read from the file the variables missing in process.env', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=from-file\nAPP_PORT=8080' },
                { APP_HOST: 'from-process' }
            );

            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true },
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), 'from-process');
            t.assert.strictEqual(env.get('port'), '8080');
        });

        it('Return undefined for an optional variable missing in both sources', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost' });
            const env = new Env(ENV_PATH, {
                variables: {
                    port: { rawName: 'APP_PORT' }
                }
            }, fake);

            t.assert.strictEqual(env.get('port'), undefined);
        });

        it('Throw for a required variable missing in both sources', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'APP_HOST=localhost' },
                { APP_PORT: '8080' }
            );

            const env = new Env(ENV_PATH, {
                variables: {
                    secret: { rawName: 'APP_SECRET', required: true }
                }
            }, fake);

            t.assert.throws(() => env.get('secret'), {
                message: `The environment variable "APP_SECRET" is required, but isn't set`
            });
        });

        it('Throw when the file fails for a reason other than not existing', (t: it.TestContext) => {
            const error = Object.assign(
                new Error(`EACCES: permission denied, open '${ENV_PATH}'`),
                { code: 'EACCES' }
            );

            const fake = new EnvFake({ [ENV_PATH]: error });
            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            }, fake);

            t.assert.throws(() => env.get('host'), error);
        });
    });

    describe('Callbacks', () => {
        it('Transform a value read from the file', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_PORT=8080' });
            const env = new Env(ENV_PATH, {
                variables: {
                    port: { rawName: 'APP_PORT', required: true, callback: v => parseInt(v, 10) }
                }
            }, fake);

            t.assert.strictEqual(env.get('port'), 8080);
        });

        it('Transform a value read from process.env', (t: it.TestContext) => {
            const fake = new EnvFake({}, { APP_DEBUG: 'true' });
            const env = new Env(ENV_PATH, {
                variables: {
                    debug: { rawName: 'APP_DEBUG', required: true, callback: v => v === 'true' }
                }
            }, fake);

            t.assert.strictEqual(env.get('debug'), true);
        });

        it('Pass undefined to the callback of a missing optional variable', (t: it.TestContext) => {
            const fake = new EnvFake();
            const env = new Env(ENV_PATH, {
                variables: {
                    port: { rawName: 'APP_PORT', callback: v => parseInt(v ?? '3000', 10) }
                }
            }, fake);

            t.assert.strictEqual(env.get('port'), 3000);
        });

        it('Do not execute the callback when a required variable is missing', (t: it.TestContext) => {
            let calls = 0;
            const fake = new EnvFake();
            const env = new Env(ENV_PATH, {
                variables: {
                    port: {
                        rawName: 'APP_PORT',
                        required: true,
                        callback: v => {
                            calls++;
                            return parseInt(v, 10);
                        }
                    }
                }
            }, fake);

            t.assert.throws(() => env.get('port'), /APP_PORT/);
            t.assert.strictEqual(calls, 0);
        });

        it('Wrap the error thrown by a callback, naming the variable', (t: it.TestContext) => {
            const error = new Error('Invalid port');
            const fake = new EnvFake({}, { APP_PORT: 's3cr3t' });
            const env = new Env(ENV_PATH, {
                variables: {
                    port: {
                        rawName: 'APP_PORT',
                        required: true,
                        callback: (): number => { throw error; }
                    }
                }
            }, fake);

            t.assert.throws(() => env.get('port'), (err: Error) => {
                t.assert.strictEqual(err.message, `The callback of the variable "port" failed to process "APP_PORT"`);
                t.assert.strictEqual(err.cause, error);
                t.assert.ok(!err.message.includes('s3cr3t'));
                return true;
            });
        });
    });

    describe('Inherited and undeclared names', () => {
        it('Do not take members inherited from Object.prototype as values of process.env', (t: it.TestContext) => {
            const fake = new EnvFake(
                { [ENV_PATH]: 'constructor=from-file' },
                { APP_HOST: 'localhost' }
            );

            const env = new Env(ENV_PATH, {
                variables: {
                    ctor: { rawName: 'constructor', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('ctor'), 'from-file');
        });

        it('Do not take members inherited from Object.prototype as values of either source', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost' });
            const env = new Env(ENV_PATH, {
                variables: {
                    str: { rawName: 'toString' },
                    ctor: { rawName: 'constructor', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('str'), undefined);
            t.assert.throws(() => env.get('ctor'), {
                message: `The environment variable "constructor" is required, but isn't set`
            });
        });

        it('Throw a descriptive error for a variable not declared in the options', (t: it.TestContext) => {
            // Annotating the options widens the keys to "string", so any name compiles
            const options: EnvOptions = {
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            };

            const env = new Env(ENV_PATH, options, new EnvFake());
            t.assert.throws(() => env.get('port'), {
                message: `The variable "port" isn't declared in the "variables" option`
            });

            t.assert.throws(() => env.get('toString'), {
                message: `The variable "toString" isn't declared in the "variables" option`
            });
        });
    });

    describe('Return types (checked by the compiler)', () => {
        it('Infer the type of each value from literal options', (t: it.TestContext) => {
            const fake = new EnvFake({}, { A: 'a', C: '8080', D: 'abc' });
            const env = new Env(ENV_PATH, {
                variables: {
                    a: { rawName: 'A', required: true },
                    b: { rawName: 'B' },
                    c: { rawName: 'C', required: true, callback: v => parseInt(v, 10) },
                    d: { rawName: 'D', callback: v => v?.length }
                }
            }, fake);

            const a = env.get('a');
            const b = env.get('b');
            const c = env.get('c');
            const d = env.get('d');
            true satisfies Equals<typeof a, string>;
            true satisfies Equals<typeof b, string | undefined>;
            true satisfies Equals<typeof c, number>;
            true satisfies Equals<typeof d, number | undefined>;

            t.assert.strictEqual(a, 'a');
            t.assert.strictEqual(b, undefined);
            t.assert.strictEqual(c, 8080);
            t.assert.strictEqual(d, 3);
        });

        it('Resolve to unknown when the options are typed as "EnvOptions"', (t: it.TestContext) => {
            const options: EnvOptions = {
                variables: {
                    port: { rawName: 'APP_PORT', callback: v => parseInt(v ?? '3000', 10) }
                }
            };

            const env = new Env(ENV_PATH, options, new EnvFake());
            const port = env.get('port');
            true satisfies Equals<typeof port, unknown>;
            t.assert.strictEqual(port, 3000);
        });

        it('Resolve to unknown when a variable is typed as "EnvRequiredVariable"', (t: it.TestContext) => {
            const port: EnvRequiredVariable = { rawName: 'APP_PORT', required: true, callback: v => parseInt(v, 10) };
            const env = new Env(ENV_PATH, { variables: { port } }, new EnvFake({}, { APP_PORT: '8080' }));

            const value = env.get('port');
            true satisfies Equals<typeof value, unknown>;
            t.assert.strictEqual(value, 8080);
        });
    });

    describe('File cache', () => {
        it('Read the file on every call when "cacheable" is not set', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost' });
            const env = new Env(ENV_PATH, {
                variables: {
                    host: { rawName: 'APP_HOST', required: true }
                }
            }, fake);

            env.get('host');
            env.get('host');
            t.assert.strictEqual(fake.readPaths.length, 2);
        });

        it('Read the file only once, and lazily, when "cacheable" is true', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_HOST=localhost\nAPP_PORT=8080' });
            const env = new Env(ENV_PATH, {
                cacheable: true,
                variables: {
                    host: { rawName: 'APP_HOST', required: true },
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(fake.readPaths.length, 0);
            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(env.get('port'), '8080');
            t.assert.strictEqual(env.get('host'), 'localhost');
            t.assert.strictEqual(fake.readPaths.length, 1);
        });

        it('Cache the absence of the file when "cacheable" is true', (t: it.TestContext) => {
            const fake = new EnvFake();
            const env = new Env(ENV_PATH, {
                cacheable: true,
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            }, fake);

            t.assert.strictEqual(env.get('host'), undefined);
            t.assert.strictEqual(env.get('host'), undefined);
            t.assert.strictEqual(fake.readPaths.length, 1);
        });

        it('Keep reading process.env live when "cacheable" is true', (t: it.TestContext) => {
            const fake = new EnvFake({ [ENV_PATH]: 'APP_PORT=3000' });
            const env = new Env(ENV_PATH, {
                cacheable: true,
                variables: {
                    port: { rawName: 'APP_PORT', required: true }
                }
            }, fake);

            t.assert.strictEqual(env.get('port'), '3000');
            fake.process.env.APP_PORT = '8080';
            t.assert.strictEqual(env.get('port'), '8080');
        });

        it('Do not cache read errors other than ENOENT', (t: it.TestContext) => {
            const error = Object.assign(
                new Error(`EACCES: permission denied, open '${ENV_PATH}'`),
                { code: 'EACCES' }
            );

            const fake = new EnvFake({ [ENV_PATH]: error });
            const env = new Env(ENV_PATH, {
                cacheable: true,
                variables: {
                    host: { rawName: 'APP_HOST' }
                }
            }, fake);

            t.assert.throws(() => env.get('host'), error);
            t.assert.throws(() => env.get('host'), error);
            t.assert.strictEqual(fake.readPaths.length, 2);
        });
    });

    describe('Default dependencies (real file system and process.env)', () => {
        const PROCESS_VAR = 'BLEED_BELIEVER_ENV_TEST_PROCESS';
        const FILE_VAR = 'BLEED_BELIEVER_ENV_TEST';
        let dir: string;
        let path: string;

        before(async () => {
            dir = await mkdtemp(join(tmpdir(), 'bleed-believer-env-'));
            path = join(dir, '.env');
            await writeFile(path, `${FILE_VAR}=from-file\n${PROCESS_VAR}=from-file`, 'utf-8');
            process.env[PROCESS_VAR] = 'from-process';
        });

        after(async () => {
            delete process.env[PROCESS_VAR];
            await rm(dir, { recursive: true, force: true });
        });

        it('Read from a real file what the real process.env lacks', (t: it.TestContext) => {
            const env = new Env(path, {
                variables: {
                    value: { rawName: FILE_VAR, required: true }
                }
            });

            t.assert.strictEqual(env.get('value'), 'from-file');
        });

        it('The real process.env takes precedence over a real file', (t: it.TestContext) => {
            const env = new Env(path, {
                variables: {
                    value: { rawName: PROCESS_VAR, required: true }
                }
            });

            t.assert.strictEqual(env.get('value'), 'from-process');
        });

        it('Read from the real process.env when the file does not exist', (t: it.TestContext) => {
            const env = new Env(join(dir, 'missing.env'), {
                variables: {
                    value: { rawName: PROCESS_VAR, required: true }
                }
            });

            t.assert.strictEqual(env.get('value'), 'from-process');
        });

        it('Throw the real error when the path is not a readable file', (t: it.TestContext) => {
            const env = new Env(dir, {
                variables: {
                    value: { rawName: FILE_VAR, required: true }
                }
            });

            t.assert.throws(() => env.get('value'), { code: 'EISDIR' });
        });

        it('Ignore later changes in a real file only when "cacheable" is true', async (t: it.TestContext) => {
            const cachePath = join(dir, 'cache.env');
            await writeFile(cachePath, `${FILE_VAR}=first`, 'utf-8');

            const variables = { value: { rawName: FILE_VAR, required: true } } satisfies EnvVariables;
            const cached = new Env(cachePath, { cacheable: true, variables });
            const live = new Env(cachePath, { variables });
            t.assert.strictEqual(cached.get('value'), 'first');
            t.assert.strictEqual(live.get('value'), 'first');

            await writeFile(cachePath, `${FILE_VAR}=second`, 'utf-8');
            t.assert.strictEqual(cached.get('value'), 'first');
            t.assert.strictEqual(live.get('value'), 'second');
        });
    });
});
