import type { EnvVariable } from './env.variable.js';

/**
 * The value returned by `Env.get` for the given variable: the callback's return
 * type if it has one, otherwise `string` when required or `string | undefined`.
 * When the callback is declared but may be absent (e.g. the variable is typed as
 * `EnvVariable` instead of being inferred), the value can't be known: `unknown`.
 */
export type EnvValue<V extends EnvVariable> =
    V extends { callback: (v: never) => infer R }
    ?   R
    :   'callback' extends keyof V
        ?   unknown
        :   V['required'] extends true ? string : string | undefined;
