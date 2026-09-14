import type { EnvInject, EnvOptions, EnvValue } from './interfaces/index.js';

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export class Env<O extends EnvOptions> {
    #injected: Required<EnvInject>;
    #options: O;
    #cache?: NodeJS.Dict<string>;

    #path: string;
    get path(): string {
        return this.#path;
    }

    constructor(path: string, options: O, inject?: EnvInject) {
        this.#injected = {
            readFileSync:   inject?.readFileSync?.bind(inject)  ?? readFileSync,
            process:        inject?.process                     ?? globalThis.process
        };

        this.#options = options;
        this.#path = path;
    }

    #getRawValue(name: string): string | undefined {
        // Both sources only hold strings, any other value is a member inherited
        // from their prototype (e.g. "toString") and must be treated as unset.
        // The file is only a fallback, so it isn't read when process.env has the value
        const processValue = this.#injected.process.env[name];
        if (typeof processValue === 'string') {
            return processValue;
        }

        const fileValue = this.#getFileEnv()[name];
        return typeof fileValue === 'string' ? fileValue : undefined;
    }

    #getFileEnv(): NodeJS.Dict<string> {
        if (this.#cache) {
            return this.#cache;
        }

        // "parseEnv" doesn't strip a leading BOM, which would end up as part of the first key
        const raw = this.#readFile()?.replace(/^\uFEFF/, '');
        const env = typeof raw === 'string' ? parseEnv(raw) : {};
        if (this.#options.cacheable) {
            this.#cache = env;
        }

        return env;
    }

    #readFile(): string | undefined {
        try {
            return this.#injected.readFileSync(this.#path, 'utf-8');
        } catch (err) {
            // Only a missing file enables the fallback, any other error is a misconfiguration
            if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
                return undefined;
            }

            throw err;
        }
    }

    get<K extends keyof O['variables']>(name: K): EnvValue<O['variables'][K]>;
    get(name: string): unknown {
        if (!Object.hasOwn(this.#options.variables, name)) {
            throw new Error(`The variable "${name}" isn't declared in the "variables" option`);
        }

        const descriptor = this.#options.variables[name];
        const rawValue = this.#getRawValue(descriptor.rawName);
        if (descriptor.required && typeof rawValue !== 'string') {
            throw new Error(`The environment variable "${descriptor.rawName}" is required, but isn't set`);
        }

        if (!descriptor.callback) {
            return rawValue;
        }

        try {
            return descriptor.callback(rawValue!);
        } catch (err) {
            // The raw value is left out of the message, it may be a secret
            throw new Error(
                `The callback of the variable "${name}" failed to process "${descriptor.rawName}"`,
                { cause: err }
            );
        }
    }
}