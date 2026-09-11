export interface EnvOptions {
    [K: string]: {
        rawName: string;
    } & (
        {
            required?: false;
            callback?: (v?: string) => unknown;
        } |
        {
            required: true;
            callback?: (v: string) => unknown;
        }
    );
}