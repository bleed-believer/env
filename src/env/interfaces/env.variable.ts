export interface EnvOptionalVariable {
    rawName: string;
    required?: false;
    callback?: (v: string | undefined) => unknown;
}

export interface EnvRequiredVariable {
    rawName: string;
    required: true;
    callback?: (v: string) => unknown;
}

export type EnvVariable = EnvOptionalVariable | EnvRequiredVariable;

/**
 * Use it with `satisfies` to declare the variables apart from the `Env`
 * constructor without widening `required: true` into `boolean`.
 */
export type EnvVariables = Record<string, EnvVariable>;
