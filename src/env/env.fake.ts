import type { EnvInject } from './interfaces/index.js';

export class EnvFake implements EnvInject {
    #readPaths: string[] = [];
    get readPaths(): string[] {
        return [ ...this.#readPaths ];
    }

    #process: { env: NodeJS.ProcessEnv };
    get process(): { env: NodeJS.ProcessEnv } {
        return this.#process;
    }

    #files: Map<string, string | Error>;

    /**
     * @param files Contents by path. An `Error` value is thrown when that path is read.
     * @param env The fake `process.env`.
     */
    constructor(files: Record<string, string | Error> = {}, env: NodeJS.ProcessEnv = {}) {
        this.#files = new Map(Object.entries(files));
        this.#process = { env };
    }

    readFileSync(path: string, _: 'utf-8'): string {
        this.#readPaths.push(path);
        const content = this.#files.get(path);
        if (content instanceof Error) {
            throw content;
        } else if (typeof content !== 'string') {
            throw Object.assign(
                new Error(`ENOENT: no such file or directory, open '${path}'`),
                { code: 'ENOENT' }
            );
        }

        return content;
    }
}
