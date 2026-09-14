export interface EnvInject {
    readFileSync?(
        path: string,
        encoding: 'utf-8'
    ): string;

    // Not "NodeJS.ProcessEnv", so the published declarations don't depend on "@types/node"
    process?: {
        env: Record<string, string | undefined>;
    };
}