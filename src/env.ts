import type { EnvInject, EnvOptions } from './interfaces/index.js';

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
        const env = this.#getFileEnv();
        return env[name] ?? this.#injected.process.env[name];
    }

    #getFileEnv(): NodeJS.Dict<string> {
        if (this.#cache) {
            return this.#cache;
        }

        const raw = this.#readFile();
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

    get<K extends keyof O['variables']>(name: K): O['variables'][K]['callback'] extends (v: string) => unknown
    ?   ReturnType<O['variables'][K]['callback']>
    :   (
        O['variables'][K]['required'] extends true
        ?   string
        :   string | undefined
    );

    get(name: string): unknown {
        const descriptor = this.#options.variables[name];
        const rawValue = this.#getRawValue(descriptor.rawName);
        if (descriptor.required && typeof rawValue !== 'string') {
            throw new Error(`The environment variable "${descriptor.rawName}" is required, but isn't set`);
        }

        return descriptor.callback
        ?   descriptor.callback(rawValue!)
        :   rawValue;
    }
}