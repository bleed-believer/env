export interface EnvOptions {
    /**
     * When `true`, the file is read and parsed only once (on the first `get`),
     * including the case where the file doesn't exist. `process.env` is always
     * read live, and read errors other than `ENOENT` are never cached.
     * @default false
     */
    cacheable?: boolean;
    variables: {
        [K: string]: { rawName: string; } & (
            {
                required?: false;
                callback?: (v?: string) => unknown;
            } |
            {
                required: true;
                callback?: (v: string) => unknown;
            }
        );
    };
}