import type { EnvVariable } from './env.variable.js';

/**
 * The value returned by `Env.get` for the given variable: the callback's return
 * type if it has one, otherwise `string` when required or `string | undefined`.
 */
export type EnvValue<V extends EnvVariable> =
    V['callback'] extends (v: string) => infer R
    ?   R
    :   V['required'] extends true ? string : string | undefined;
