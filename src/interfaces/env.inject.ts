export interface EnvInject {
    readFileSync?(
        path: string,
        encoding: 'utf-8'
    ): string;

    process?: {
        env: NodeJS.ProcessEnv;
    };
}